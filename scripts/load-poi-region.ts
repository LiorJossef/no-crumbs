/**
 * The load half of the POI ingest (docs/10-poi-index.md §7 step 3).
 *
 * It is TypeScript for exactly one reason: `poi_index.name_norm` must be written by the SAME
 * `normalise()` the resolver calls on the query (`10` §4). Reimplementing NFKD + combining-mark
 * stripping in Python or SQL gives two implementations that will drift, and the drift is silent —
 * no error, just a coverage drop that reads as bad data. `unaccent()` is not IMMUTABLE, so a
 * generated column is not available either (`0001`, `0010`).
 *
 * It does no network and no database work: it reads the extract CSV that
 * `scripts/ingest-overture-extract.py` wrote, validates every row against `0010`'s CHECKs and the
 * region bbox, and writes a COPY-ready CSV plus a manifest. `scripts/ingest-poi-region.sh` runs the
 * one transaction. Splitting it this way means the process that normalises needs no database
 * driver, and the repo needs no `pg` dependency for an offline script.
 *
 * Run (Node >= 22.6 strips the types natively; no build step):
 *   node scripts/load-poi-region.ts tlv --in <dir>/tlv-extract.csv --out <dir>/tlv-copy.csv
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { NORM_VERSION, normalise } from '../src/domain/places/normalise.ts';
import config from './poi-ingest.config.json' with { type: 'json' };

/** The COPY column list, in order. Must match the `copy poi_index (...)` in ingest-poi-region.sh. */
const COPY_COLUMNS = [
  'source_dataset',
  'dataset_place_id',
  'region_id',
  'name',
  'name_norm',
  'provider_category',
  'address_line',
  'locality',
  'lat',
  'lng',
  'dataset_confidence',
] as const;

/** The extract CSV's header, as `ingest-overture-extract.py` writes it. Asserted, not assumed. */
const EXTRACT_COLUMNS = [
  'dataset_place_id',
  'name',
  'provider_category',
  'address_line',
  'locality',
  'lat',
  'lng',
  'dataset_confidence',
] as const;

/** `0010`: `dataset_confidence real not null default 0.5 check (between 0 and 1)`. */
const CONFIDENCE_FALLBACK = 0.5;
const NAME_MAX = 300;
const NAME_NORM_MAX = 1000;

function die(message: string): never {
  process.stderr.write(`FAIL ${message}\n`);
  process.exit(1);
}

/**
 * RFC 4180 parse, one pass, returning `null` for an unquoted empty field and `''` for a quoted one.
 * The distinction is the difference between NULL and the empty string in a Postgres CSV COPY, and
 * DuckDB's writer uses exactly that convention.
 */
function parseCsv(text: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [];
  let field = '';
  let quoted = false;
  let inQuotes = false;
  let i = 0;
  const endField = (): void => {
    row.push(quoted ? field : field === '' ? null : field);
    field = '';
    quoted = false;
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      endField();
      rows.push(row);
      row = [];
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== '' || quoted || row.length > 0) {
    endField();
    rows.push(row);
  }
  return rows;
}

/** Postgres CSV output: quote everything non-null, double the quotes, leave NULL as a bare field. */
function csvField(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  return `"${value.replaceAll('"', '""')}"`;
}

function main(): void {
  const [regionId, ...rest] = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const at = rest.indexOf(name);
    return at === -1 ? undefined : rest[at + 1];
  };
  const inPath = flag('--in');
  const outPath = flag('--out');
  if (regionId === undefined || inPath === undefined || outPath === undefined) {
    die('usage: node scripts/load-poi-region.ts <region> --in <extract.csv> --out <copy.csv>');
  }
  const regions: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> =
    config.regions;
  const region = regions[regionId];
  if (region === undefined) {
    die(`unknown region '${regionId}'. Known: ${Object.keys(regions).sort().join(', ')}`);
  }

  const rows = parseCsv(readFileSync(inPath, 'utf8'));
  const header = rows.shift();
  if (header === undefined) die(`${inPath} is empty`);
  const headerNames = header.map((h) => h ?? '');
  if (headerNames.join(',') !== EXTRACT_COLUMNS.join(',')) {
    die(
      `${inPath} header is ${headerNames.join(',')}\n` +
        `      expected ${EXTRACT_COLUMNS.join(',')}\n` +
        '      Refusing to load: a reordered column list is a silent lat/lng swap.',
    );
  }

  const out: string[] = [];
  const seen = new Set<string>();
  let confidenceDefaulted = 0;
  let longestNameNorm = 0;
  for (const [index, row] of rows.entries()) {
    const line = index + 2; // 1-based, plus the header
    if (row.length !== EXTRACT_COLUMNS.length) {
      die(`${inPath}:${line} has ${row.length} fields, expected ${EXTRACT_COLUMNS.length}`);
    }
    // `noUncheckedIndexedAccess` types every element as possibly undefined even after the length
    // check above, and a `!` per field would defeat the point of the flag. One accessor instead.
    const field = (at: number): string | null => row[at] ?? null;
    const id = field(0);
    const name = field(1);
    const category = field(2);
    const address = field(3);
    const locality = field(4);
    const latText = field(5);
    const lngText = field(6);
    const confText = field(7);
    if (id === null || id.trim() === '') die(`${inPath}:${line} has no dataset_place_id`);
    if (seen.has(id)) {
      // The primary key is (source_dataset, dataset_place_id). A duplicate would abort the COPY
      // and take the whole region's load with it; caught here, with the id, not as a PK violation.
      die(`${inPath}:${line} duplicates dataset_place_id ${id}`);
    }
    seen.add(id);
    const trimmedName = (name ?? '').trim();
    if (trimmedName === '' || trimmedName.length > NAME_MAX) {
      die(`${inPath}:${line} name length ${trimmedName.length} violates 0010's 1..${NAME_MAX}`);
    }
    const nameNorm = normalise(trimmedName);
    if (nameNorm === '' || nameNorm.length > NAME_NORM_MAX) {
      // Not a theoretical branch: NFKD decomposes, so a legal CJK name grows (`10` §3), and a name
      // made only of punctuation normalises to the empty string, which the CHECK forbids.
      die(
        `${inPath}:${line} name_norm length ${nameNorm.length} violates 0010's 1..${NAME_NORM_MAX} ` +
          `for name ${JSON.stringify(trimmedName)}`,
      );
    }
    longestNameNorm = Math.max(longestNameNorm, nameNorm.length);
    const lat = Number(latText);
    const lng = Number(lngText);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      die(`${inPath}:${line} lat/lng not numeric: ${latText}, ${lngText}`);
    }
    if (
      lat < region.minLat ||
      lat > region.maxLat ||
      lng < region.minLng ||
      lng > region.maxLng
    ) {
      // Region assignment is by bbox containment AT INGEST (`10` §2). A row outside the bbox would
      // be unreachable by any region-scoped query, so it is a bug in the extract, not a row to keep.
      die(`${inPath}:${line} (${lat}, ${lng}) is outside region ${regionId}'s bbox`);
    }
    let confidence = confText === null ? Number.NaN : Number(confText);
    if (!Number.isFinite(confidence)) {
      confidence = CONFIDENCE_FALLBACK;
      confidenceDefaulted += 1;
    }
    if (confidence < 0 || confidence > 1) {
      die(`${inPath}:${line} dataset_confidence ${confidence} is outside 0..1`);
    }
    out.push(
      [
        csvField(config.sourceDataset),
        csvField(id),
        csvField(regionId),
        csvField(trimmedName),
        csvField(nameNorm),
        csvField(category),
        csvField(address),
        csvField(locality),
        csvField(lat),
        csvField(lng),
        csvField(confidence),
      ].join(','),
    );
  }

  writeFileSync(outPath, `${COPY_COLUMNS.join(',')}\n${out.join('\n')}\n`, 'utf8');
  const manifest = {
    region_id: regionId,
    overture_release: config.overtureRelease,
    source_dataset: config.sourceDataset,
    norm_version: NORM_VERSION,
    row_count: out.length,
    confidence_defaulted_to_0_5: confidenceDefaulted,
    longest_name_norm: longestNameNorm,
    copy_columns: COPY_COLUMNS,
    copy_csv: outPath,
    copy_csv_bytes: statSync(outPath).size,
  };
  writeFileSync(outPath.replace(/\.csv$/, '-manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  process.stdout.write(`${JSON.stringify(manifest, null, 1)}\n`);
}

main();

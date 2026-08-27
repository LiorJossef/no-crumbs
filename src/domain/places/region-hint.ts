/**
 * City hint → `RegionId`, the pure half. `06` §6.1 step 2 scopes the prefilter to a region before
 * anything is scored, and `ResolveQuery.cityHint` is free text off a caption — `'Tel Aviv'`,
 * `'תל אביב'`, `'Tel Aviv-Yafo'`, `'Shibuya'`. This file turns that string into a region id (or
 * into an honest "not one we hold"). The database half — which regions are actually loaded, and
 * which country each one is in — stays in the adapter, because it is a query, not a fact about
 * language.
 *
 * **A small explicit table, not a fuzzy system, and deliberately so.** Fuzzy city matching is how
 * `'Kfar Saba'` becomes `'tlv'` because they share a country and a few trigrams, and a wrong region
 * is worse than no region: it turns "we don't have that city" into "we searched and here is a
 * plausible café", which is exactly the confidently-wrong outcome `working-agreement.md` §4
 * forbids. Every key below is a decision someone made on purpose.
 *
 * ## Why each alias carries a coordinate instead of an in/out flag
 *
 * A region here is an **ingest bounding box**, not a metropolitan area, and the box moves. `0010`
 * seeded `tlv` at 32.03–32.12 lat / 34.74–34.86 lng — Tel Aviv-Yafo, Ramat Gan, Givatayim, Bnei
 * Brak, and not Herzliya, Ra'anana, Kfar Saba, Netanya, Holon or Petah Tikva. `0020` widens it to
 * 31.95–32.40 / 34.70–35.00, the Tel Aviv + Hasharon launch area, and every one of those towns
 * moves inside.
 *
 * So "is this town in a loaded extract?" is **not a fact about language and does not belong in this
 * file at all** — it is a point-in-bbox test against `poi_regions`, which is a row in the database.
 * Each alias therefore carries an approximate centre, and the adapter checks it against the bbox it
 * actually read. The table needs no edit when the extract widens, and it cannot go stale against a
 * migration it does not know about.
 *
 * The alternative — a hand-maintained `inExtent: boolean` — was written first and thrown away: it
 * is correct for exactly one bbox at a time, it fails silently in the dangerous direction (claiming
 * `regionsSearched: ['tlv']` for a Herzliya café and returning a confident Tel Aviv namesake), and
 * nothing in CI could have caught it drifting.
 *
 * **`point` is never a place coordinate.** These are hand-entered town and neighbourhood centres,
 * accurate to a kilometre or so, and they exist for one purpose: deciding whether a bounding box
 * contains a city. Nothing here may reach a `ResolvedPlace`, a pin, or `places.lat`/`lng` —
 * inventing a coordinate is precisely the failure this whole resolver exists to end.
 *
 * ## Hebrew and English both, because that is the launch area
 *
 * Keys are stored `normalise()`d, so a caption's `'תל אביב'`, `'Tel Aviv'`, `'tel aviv-yafo'` and
 * `'TELAVIV'` all land on the same entry. Hebrew survives `normalise()` intact (it keeps `\p{L}`
 * and the U+0590–U+05FF block explicitly); nikud are non-spacing marks and are stripped, which is
 * why `'תֵּל אָבִיב'` matches too. No transliteration engine: the two or three spellings each place
 * actually gets written are cheaper to enumerate than to generate.
 */

import type { LatLng, RegionId } from '../types';
import { normalise } from './normalise';
import { toCountryCode } from './country-code';

/**
 * What a hint resolved to. Three outcomes, not a nullable region id, because the caller logs them
 * differently and the UI eventually says different things:
 *
 *  - `city` — the hint names a town or neighbourhood we have a region for, plus the approximate
 *    point the adapter tests against that region's loaded bbox. A `city` hint is **not** a promise
 *    that the region is loaded or that it covers the point; both are the adapter's to check.
 *  - `country` — no usable city, but a country we can scope to. The adapter intersects this with
 *    `poi_regions.country_code`. Wider than `06` §6.1 step 2 intends, and honest about it: the
 *    regions actually searched are reported either way.
 *  - `unknown` — nothing to scope with. The adapter searches nothing; `regionsSearched: []`.
 *
 * A `city` hint deliberately **never falls through to the country rule**. If it did, a Herzliya
 * caption whose point falls outside every loaded bbox would come back as "somewhere in IL" and
 * get scored against Tel Aviv — the exact confidently-wrong outcome this file exists to prevent.
 */
export type RegionHint =
  | {
      readonly kind: 'city';
      readonly regionId: RegionId;
      readonly point: LatLng;
      /**
       * Where the city came from. `'hint'` is the extractor's own `cityHint` field; `'text'` is a
       * city name found inside the candidate string itself. Recorded rather than flattened because
       * the two deserve different trust in a log: a `'text'` scope is a guess made from prose, and
       * when it is wrong it is wrong in the interesting direction.
       */
      readonly via: 'hint' | 'text';
    }
  | { readonly kind: 'country'; readonly countryCode: string }
  | { readonly kind: 'unknown' };

interface AliasEntry {
  readonly regionId: RegionId;
  /** Approximate town/neighbourhood centre, for the bbox test only. Never a place coordinate. */
  readonly point: LatLng;
}

/** Terse constructor so the table below reads as data rather than as object literals. */
const at = (regionId: RegionId, lat: number, lng: number): AliasEntry => ({
  regionId,
  point: { lat, lng },
});

/**
 * Alias → region and approximate centre. Written with human-readable keys and normalised once at
 * module load, so the table stays readable and cannot drift from `normalise()`'s rules by being
 * hand-normalised wrong.
 *
 * Ambiguous names are **absent on purpose**: `'Soho'` is London, Manhattan and Hong Kong; `'Camden'`
 * is London and New Jersey. A name that needs a country to disambiguate does not belong in a table
 * keyed only on the name — it would silently win over the country rule.
 *
 * Coordinates are town/neighbourhood centres to three decimal places (~100 m), which is far more
 * precision than a point-in-bbox test needs and is written that way only because that is how the
 * sources quote them. **Read the header before copying one of these anywhere else.**
 */
const ALIASES: Readonly<Record<string, AliasEntry>> = Object.freeze({
  // ---- tlv --------------------------------------------------------------------------------
  // Tel Aviv proper and the inner ring: inside 0010's original bbox and inside 0020's.
  'Tel Aviv': at('tlv', 32.077, 34.774),
  'Tel Aviv-Yafo': at('tlv', 32.077, 34.774),
  'Tel Aviv Jaffa': at('tlv', 32.077, 34.774),
  TelAviv: at('tlv', 32.077, 34.774),
  TLV: at('tlv', 32.077, 34.774),
  'תל אביב': at('tlv', 32.077, 34.774),
  'תל אביב יפו': at('tlv', 32.077, 34.774),
  'תל־אביב': at('tlv', 32.077, 34.774),
  Jaffa: at('tlv', 32.053, 34.752),
  Yafo: at('tlv', 32.053, 34.752),
  יפו: at('tlv', 32.053, 34.752),
  'Ramat Gan': at('tlv', 32.07, 34.824),
  'רמת גן': at('tlv', 32.07, 34.824),
  Givatayim: at('tlv', 32.072, 34.812),
  Givataim: at('tlv', 32.072, 34.812),
  גבעתיים: at('tlv', 32.072, 34.812),
  'Bnei Brak': at('tlv', 32.081, 34.833),
  'בני ברק': at('tlv', 32.081, 34.833),

  // The Hasharon and the southern ring. Outside 0010's `tlv` bbox, inside 0020's launch area —
  // which is exactly why the decision is a bbox test and not a flag in this file.
  Herzliya: at('tlv', 32.166, 34.843),
  Hertzliya: at('tlv', 32.166, 34.843),
  הרצליה: at('tlv', 32.166, 34.843),
  'Herzliya Pituach': at('tlv', 32.163, 34.803),
  'Ramat Hasharon': at('tlv', 32.146, 34.839),
  'רמת השרון': at('tlv', 32.146, 34.839),
  'Hod Hasharon': at('tlv', 32.15, 34.888),
  'הוד השרון': at('tlv', 32.15, 34.888),
  Raanana: at('tlv', 32.184, 34.871),
  "Ra'anana": at('tlv', 32.184, 34.871),
  רעננה: at('tlv', 32.184, 34.871),
  'Kfar Saba': at('tlv', 32.175, 34.907),
  'Kfar Sava': at('tlv', 32.175, 34.907),
  'כפר סבא': at('tlv', 32.175, 34.907),
  Netanya: at('tlv', 32.328, 34.857),
  Natanya: at('tlv', 32.328, 34.857),
  נתניה: at('tlv', 32.328, 34.857),
  'Petah Tikva': at('tlv', 32.087, 34.887),
  'Petach Tikva': at('tlv', 32.087, 34.887),
  'פתח תקווה': at('tlv', 32.087, 34.887),
  Holon: at('tlv', 32.015, 34.779),
  חולון: at('tlv', 32.015, 34.779),
  'Bat Yam': at('tlv', 32.023, 34.75),
  'בת ים': at('tlv', 32.023, 34.75),
  'Rishon LeZion': at('tlv', 31.971, 34.789),
  'ראשון לציון': at('tlv', 31.971, 34.789),

  // ---- tyo: 35.58–35.80 / 139.60–139.90 ---------------------------------------------------
  Tokyo: at('tyo', 35.681, 139.767),
  Tokio: at('tyo', 35.681, 139.767),
  東京: at('tyo', 35.681, 139.767),
  東京都: at('tyo', 35.681, 139.767),
  טוקיו: at('tyo', 35.681, 139.767),
  Shibuya: at('tyo', 35.658, 139.701),
  Shinjuku: at('tyo', 35.69, 139.7),
  Ginza: at('tyo', 35.672, 139.765),
  Harajuku: at('tyo', 35.67, 139.702),
  Roppongi: at('tyo', 35.663, 139.731),
  Asakusa: at('tyo', 35.714, 139.797),
  Ueno: at('tyo', 35.714, 139.777),
  Ebisu: at('tyo', 35.647, 139.71),
  Nakameguro: at('tyo', 35.644, 139.699),
  'Naka-Meguro': at('tyo', 35.644, 139.699),
  Meguro: at('tyo', 35.634, 139.716),
  Shimokitazawa: at('tyo', 35.661, 139.668),
  Ikebukuro: at('tyo', 35.729, 139.711),
  Akihabara: at('tyo', 35.698, 139.773),

  // ---- ldn: 51.42–51.60 / -0.30–0.05 ------------------------------------------------------
  London: at('ldn', 51.507, -0.128),
  'Greater London': at('ldn', 51.507, -0.128),
  לונדון: at('ldn', 51.507, -0.128),
  Shoreditch: at('ldn', 51.526, -0.078),
  Hackney: at('ldn', 51.545, -0.055),
  Islington: at('ldn', 51.538, -0.1),
  Mayfair: at('ldn', 51.51, -0.147),
  'Notting Hill': at('ldn', 51.512, -0.205),
  'Covent Garden': at('ldn', 51.512, -0.123),
  'Camden Town': at('ldn', 51.539, -0.143),
  Dalston: at('ldn', 51.546, -0.075),
  Peckham: at('ldn', 51.474, -0.069),
  Brixton: at('ldn', 51.462, -0.115),
  Southwark: at('ldn', 51.503, -0.089),
  Marylebone: at('ldn', 51.52, -0.152),
});

/** The table, keyed by `normalise()`d alias. Built once; the literal above stays human-readable. */
const NORMALISED: ReadonlyMap<string, AliasEntry> = new Map(
  Object.entries(ALIASES).map(([alias, entry]) => [normalise(alias), entry] as const),
);

/**
 * Every alias key as written, for tests and for a future "cities we know about" surface. Not the
 * normalised form: the readable spelling is the thing a human wants to see.
 */
export const REGION_ALIASES: readonly string[] = Object.keys(ALIASES);

/**
 * The whole decision. City hint first, country only when there is no city match at all.
 *
 * `countryHint` goes through `toCountryCode()` because the extractor asks the model for a country
 * *name* — captions say "Israel", never "IL" (`country-code.ts`'s header, which is about the same
 * bug on the confirm seam).
 */
export function regionHintFor(
  cityHint: string | null | undefined,
  countryHint: string | null | undefined,
  text?: string | null | undefined,
): RegionHint {
  const key = normalise(cityHint);
  const entry = key === '' ? undefined : NORMALISED.get(key);

  if (entry !== undefined) {
    return { kind: 'city', regionId: entry.regionId, point: entry.point, via: 'hint' };
  }

  const fromText = cityInText(text);
  if (fromText !== undefined) {
    return { kind: 'city', regionId: fromText.regionId, point: fromText.point, via: 'text' };
  }

  const countryCode = toCountryCode(countryHint);
  if (countryCode !== null) {
    return { kind: 'country', countryCode };
  }

  return { kind: 'unknown' };
}

/** Longest alias in the table, in tokens — the widest window `cityInText()` has to try. */
const MAX_ALIAS_TOKENS = Math.max(
  ...[...NORMALISED.keys()].map((alias) => alias.split(' ').length),
);

/**
 * Scan a candidate string for a city we hold a region for. This is the TLV-12 fix, and TLV-12 is
 * the whole argument for it: the query was `'Belboy tel aviv'` with a null `cityHint`, so
 * `regionHintFor()` returned `unknown`, `regionsSearched` was `[]`, and **the database was never
 * queried at all**. Not a ranking loss and not a coverage gap — a venue that is sitting in the
 * index, never looked for. The extractor does not always split the city out of the name, and a
 * caption is under no obligation to help it.
 *
 * **Longest window first, so `'tel aviv'` is one alias rather than two misses.** Windows of
 * `MAX_ALIAS_TOKENS` tokens down to one are matched against the same normalised table the
 * `cityHint` path uses, so the two paths cannot disagree about what a city is called.
 *
 * **Two cities in one string is `undefined`, not a coin flip.** `'best coffee in tel aviv and
 * tokyo'` names two regions with equal warrant, and picking either would report
 * `regionsSearched: ['tlv']` for a query that said no such thing. Aliases of the *same* region are
 * not a conflict — `'jaffa tel aviv'` is one place twice — so the test is on the region id, not on
 * the match count. The first match wins the `point`, and any alias of a region is enough to decide
 * whether that region's bbox is the right one to search.
 *
 * ## The risk, and why it is worth taking
 *
 * A place can be named after a city — a `'Jaffa'` café in London — so this can scope to the wrong
 * region. That is a real cost and it is bounded: a wrong region returns rows that then have to
 * survive scoring against the query, so the usual outcome is `no_match`, which is exactly what the
 * unscoped query returned anyway. What it buys is every case where the city is only in the prose,
 * which today fails silently and completely. The `via: 'text'` marker keeps the two
 * distinguishable wherever it matters.
 *
 * A text match is a `city` hint of full standing, so it does **not** fall through to the country
 * rule when the region turns out not to cover the point — same reasoning as the header's, and for
 * the same reason: "somewhere in IL" scored against Tel Aviv is the confidently-wrong answer.
 */
function cityInText(text: string | null | undefined): AliasEntry | undefined {
  const tokens = normalise(text).split(' ').filter((token) => token !== '');
  if (tokens.length === 0) return undefined;

  let found: AliasEntry | undefined;
  for (let width = Math.min(MAX_ALIAS_TOKENS, tokens.length); width >= 1; width -= 1) {
    for (let start = 0; start + width <= tokens.length; start += 1) {
      const entry = NORMALISED.get(tokens.slice(start, start + width).join(' '));
      if (entry === undefined) continue;
      // A second region named in the same string is a genuine ambiguity: refuse both.
      if (found !== undefined && found.regionId !== entry.regionId) return undefined;
      found ??= entry;
    }
  }
  return found;
}

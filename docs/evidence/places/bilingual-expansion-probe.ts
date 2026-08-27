import { readFileSync } from 'node:fs';
import { rankPlaces } from '/Users/lioryossef/Projects/P-002/src/domain/places/score.ts';
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const CAT: Record<string,'cafe'|'bar'|'restaurant'|null> = {
  Kohi:'cafe','Trattoria Una':'restaurant','Cafe Europa':'cafe','Under the Tree':'cafe',
  Rustico:'restaurant', Gelalucci:'cafe',
};
const byQuery = new Map<string, any[]>();
for (const r of rows) { if (!byQuery.has(r.query)) byQuery.set(r.query, []); byQuery.get(r.query)!.push(r); }
for (const [q, rs] of byQuery) {
  const places = rs.map((r:any) => ({
    provider:'overture' as const, providerPlaceId:'x', sourceDataset:'overture-places' as const,
    regionId:'tlv', name:r.name, altNames:[], addressLine:r.address_line, locality:r.locality,
    countryCode:'IL', lat:r.lat, lng:r.lng, providerCategory:r.provider_category,
    datasetConfidence:r.dataset_confidence,
  }));
  const ranked = rankPlaces(
    { text:q, cityHint:'תל אביב', countryHint:'IL', categoryHint:CAT[q] ?? null,
      addressHint: rs[0].addr, near:null, maxResults:5 }, places);
  const t = ranked[0];
  console.log(`${q.padEnd(16)} rows=${String(rs.length).padStart(3)}  score=${(t?.score ?? 0).toFixed(3)}  top1=${t?.place.name ?? '—'} @ ${t?.place.addressLine ?? '—'}`);
}

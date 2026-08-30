/**
 * **The library shapes the camera has to hold**, as pure data — `current-state.md` §9.3.
 *
 * §9.3 has required the camera to be verified across **0 · 1 · 8-in-one-city ·
 * 20-across-two-cities · 20-across-four-cities** since 2026-08-27, and that criterion was never
 * discharged. Production then shipped two camera defects that any one of these shapes would have
 * caught, so this file is the criterion turned into something a test can hold, not a new idea.
 *
 * Two shapes are here that §9.3 does not name, and both earn their place:
 *
 *  - `FIVE_ISRAELI_AREAS` is the **owner's real production library** on 2026-08-30 — 7 places
 *    across Ra'anana, Herzliya, Tel Aviv-Yafo, Rishon LeZion and Jerusalem, the widest pair ~57 km
 *    apart. It is the shape that broke, and its numbers are the point: the union of those five
 *    areas fits a phone at just under `PIN_BAND_MIN`, which is why the owner saw area-count pills
 *    and no pins.
 *  - `TEL_AVIV_PLUS_TOKYO` is the shape that most obviously breaks a naive `fitBounds`. It is not
 *    a stress test; it is the honest version of what a single travel import does to a library.
 *
 * **Coordinates are real** (checked against the streets they name), and the localities are the
 * spellings the product actually stores — Hebrew, `Tel Aviv` alongside `תל אביב-יפו`, because
 * rows arrive from `google-places` and from `llm-guess` and those two never agree. The Hebrew is
 * load-bearing rather than decorative: RTL locality names have already caused defects here, and
 * `clusterLabel`'s plurality rule is what decides whether the header reads `3 places in
 * תל אביב-יפו` or `3 places in this area`.
 *
 * Deliberately **not** a `MapPlace`: these carry the four fields every camera rule reads (id,
 * lat, lng, locality) and nothing else, so a change to the page's row type cannot quietly change
 * what the camera is being tested against.
 */

export interface FixturePlace {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  /** As stored. `null` is a real state — an `llm_guess` row with no city — and it changes the
   *  clustering, because an unknown locality never joins beyond `nearKm`. */
  readonly locality: string | null;
  readonly countryCode: string | null;
}

export interface LibraryShape {
  /** Reads as the row of a report: `5 areas ~57 km apart (the owner's production library)`. */
  readonly name: string;
  /** Input order is `created_at desc` — `places[0]` is the most recent save, which is what
   *  `pickAnchorCluster` anchors on. Ordering here is therefore part of the fixture, not
   *  cosmetic. */
  readonly places: readonly FixturePlace[];
}

const il = (
  id: string,
  lat: number,
  lng: number,
  locality: string | null,
): FixturePlace => ({ id, lat, lng, locality, countryCode: 'IL' });

/* ------------------------------------------------------------------ Tel Aviv */

/** Central Tel Aviv, ~1–2 km apart, so they join on `nearKm` whatever their spellings say. */
const ROTHSCHILD = il('tlv-rothschild', 32.0684, 34.7745, 'תל אביב-יפו');
const DIZENGOFF = il('tlv-dizengoff', 32.079, 34.769, 'תל אביב-יפו');
const NEVE_TZEDEK = il('tlv-neve-tzedek', 32.0611, 34.7638, 'Tel Aviv');
const FLORENTIN = il('tlv-florentin', 32.0556, 34.7695, 'תל אביב-יפו');
const CARMEL_MARKET = il('tlv-carmel', 32.0688, 34.7683, 'תל אביב - יפו');
const PORT = il('tlv-port', 32.0975, 34.7743, 'תל אביב-יפו');
const JAFFA = il('tlv-jaffa', 32.0533, 34.7517, 'יפו');
const SARONA = il('tlv-sarona', 32.0716, 34.7869, null);

/* --------------------------------------------------- The rest of the country */

const RAANANA = il('raanana-cafe', 32.1848, 34.8713, 'רעננה');
const HERZLIYA = il('herzliya-marina', 32.1624, 34.8447, 'הרצליה');
const RISHON = il('rishon-bakery', 31.973, 34.8066, 'ראשון לציון');
const JERUSALEM = il('jerusalem-king-david', 31.7767, 35.2345, 'ירושלים');

/* --------------------------------------------------------------- Not Israel */

const london = (id: string, lat: number, lng: number): FixturePlace => ({
  id,
  lat,
  lng,
  locality: 'London',
  countryCode: 'GB',
});

const LONDON: readonly FixturePlace[] = [
  london('ldn-soho', 51.5137, -0.1341),
  london('ldn-shoreditch', 51.5265, -0.0784),
  london('ldn-borough', 51.5055, -0.0908),
  london('ldn-notting-hill', 51.5164, -0.2058),
  london('ldn-peckham', 51.4739, -0.0691),
  london('ldn-hampstead', 51.5559, -0.178),
  london('ldn-brixton', 51.4613, -0.1156),
  london('ldn-kings-cross', 51.5308, -0.1238),
  london('ldn-greenwich', 51.4816, -0.0076),
  london('ldn-marylebone', 51.5185, -0.1508),
  london('ldn-clerkenwell', 51.5227, -0.1055),
  london('ldn-battersea', 51.4791, -0.1637),
];

const PARIS: readonly FixturePlace[] = [
  { id: 'par-marais', lat: 48.8595, lng: 2.3622, locality: 'Paris', countryCode: 'FR' },
  { id: 'par-canal', lat: 48.8721, lng: 2.3663, locality: 'Paris', countryCode: 'FR' },
  { id: 'par-montmartre', lat: 48.8867, lng: 2.3431, locality: 'Paris', countryCode: 'FR' },
];

const TOKYO: readonly FixturePlace[] = [
  { id: 'tyo-shibuya', lat: 35.6595, lng: 139.7005, locality: '東京', countryCode: 'JP' },
  { id: 'tyo-nakameguro', lat: 35.6438, lng: 139.6989, locality: '東京', countryCode: 'JP' },
  { id: 'tyo-yanaka', lat: 35.7274, lng: 139.7671, locality: '東京', countryCode: 'JP' },
];

/* ------------------------------------------------------------------- Shapes */

/** Nothing saved. The only shape with no camera to derive at all. */
export const EMPTY: LibraryShape = { name: '0 places', places: [] };

/** One place. A zero-extent box, which is the case a zoom ceiling exists for. */
export const SINGLE: LibraryShape = { name: '1 place', places: [ROTHSCHILD] };

/** §9.3's `8-in-one-city`. Five spellings of Tel Aviv and one `null`, all inside 5 km. */
export const ONE_CITY: LibraryShape = {
  name: '8 places in one city',
  places: [ROTHSCHILD, DIZENGOFF, NEVE_TZEDEK, FLORENTIN, CARMEL_MARKET, PORT, JAFFA, SARONA],
};

/** §9.3's `20-across-two-cities` — the library as it was when "the map is the query" was written. */
export const TWO_CITIES: LibraryShape = {
  name: '20 places across two cities',
  places: [ROTHSCHILD, DIZENGOFF, NEVE_TZEDEK, FLORENTIN, CARMEL_MARKET, PORT, JAFFA, SARONA, ...LONDON],
};

/** §9.3's `20-across-four-cities`. */
export const FOUR_CITIES: LibraryShape = {
  name: '20 places across four cities',
  places: [
    ROTHSCHILD,
    DIZENGOFF,
    NEVE_TZEDEK,
    FLORENTIN,
    CARMEL_MARKET,
    PORT,
    JAFFA,
    SARONA,
    ...LONDON.slice(0, 6),
    ...PARIS,
    ...TOKYO,
  ],
};

/**
 * **The owner's production library on 2026-08-30**, and the shape that produced the defect: a
 * settled view spanning Israel, Jordan and Syria with no individual pin on it, under a header
 * that correctly read `3 places in תל אביב-יפו`.
 *
 * Ordered most-recent-first with a Tel Aviv row at the head, so `pickAnchorCluster` anchors on
 * the three-place Tel Aviv cluster — which is what makes the header and the camera disagree, and
 * is therefore the whole reproduction.
 */
export const FIVE_ISRAELI_AREAS: LibraryShape = {
  name: "7 places across 5 Israeli areas (the owner's production library)",
  places: [ROTHSCHILD, DIZENGOFF, NEVE_TZEDEK, RAANANA, HERZLIYA, RISHON, JERUSALEM],
};

/** A tight cluster plus one distant outlier — the shape a naive `fitBounds` answers with an ocean. */
export const TEL_AVIV_PLUS_TOKYO: LibraryShape = {
  name: '5 in Tel Aviv plus 1 in Tokyo',
  places: [ROTHSCHILD, DIZENGOFF, NEVE_TZEDEK, FLORENTIN, CARMEL_MARKET, TOKYO[0] as FixturePlace],
};

/** Every non-empty shape, for the rules that must hold across all of them. */
export const POPULATED_SHAPES: readonly LibraryShape[] = [
  SINGLE,
  ONE_CITY,
  TWO_CITIES,
  FOUR_CITIES,
  FIVE_ISRAELI_AREAS,
  TEL_AVIV_PLUS_TOKYO,
];

export const ALL_SHAPES: readonly LibraryShape[] = [EMPTY, ...POPULATED_SHAPES];

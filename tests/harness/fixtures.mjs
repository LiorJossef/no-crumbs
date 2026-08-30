/**
 * Fixture rows for the offline screenshot harness, shaped exactly as `saved_places` comes back
 * from `SAVED_PLACES_SELECT` in `src/app/map/_lib/get-spots.ts`.
 *
 * These are **not** a substitute for the seeded database. They exist because this checkout has no
 * `.env.local` and no Docker, so `/map`, `/import`, `/collections` and `/profile` 500 on
 * `createServerClient(undefined!, undefined!)` and cannot be looked at at all. Every screenshot
 * taken against these rows is stub-backed and must be labelled as such: it proves the *rendering*
 * of a screen at a given place count, and it proves nothing about a query, a policy or a join.
 *
 * ## The names are invented on purpose, and it is a rule rather than a preference
 *
 * These were real Tel Aviv venue names for about an hour on 2026-08-31, because real names give a
 * realistic spread of string lengths and that is what a list layout is judged on. The orchestrator
 * ruled that out and was right: **if a reader could mistake a fixture for a real saved place, the
 * screenshot is lying about something even when every pixel is honest.** A stub-backed picture of
 * `Miznon · Tel Aviv-Yafo` asserts that somebody saved Miznon. Nobody did.
 *
 * So every name is `<dish or venue kind> No. <n>` — a shape that keeps the length variety a layout
 * needs (13 to 31 characters here, which is the range that decides where a row truncates) while
 * being unmistakable as fixture data at a glance. The addresses say `Fixture St` for the same
 * reason. The *coordinates* are real Tel Aviv points, because a synthetic grid would hide exactly
 * the camera-fit behaviour a 30-place screenshot exists to show, and a coordinate asserts nothing
 * about a business.
 */

/** Real Tel Aviv coordinates, invented names. See the header for why that split. */
const SEED_PLACES = [
  { name: 'Sabich Counter No. 1', category: 'restaurant', lat: 32.0715, lng: 34.7681, locality: 'Tel Aviv-Yafo', provider: 'restaurant' },
  { name: 'Gelato Window No. 2', category: 'dessert', lat: 32.0562, lng: 34.7605, locality: 'Tel Aviv-Yafo', provider: 'ice_cream_shop' },
  { name: 'Filter Coffee Bar No. 3', category: 'cafe', lat: 32.0592, lng: 34.7719, locality: 'Tel Aviv-Yafo', provider: 'cafe' },
  { name: 'Wine Room No. 4', category: 'bar', lat: 32.0629, lng: 34.7745, locality: 'Tel Aviv-Yafo', provider: 'bar' },
  { name: 'Hummus Kitchen No. 5', category: 'restaurant', lat: 32.0725, lng: 34.7735, locality: 'Tel Aviv-Yafo', provider: 'restaurant' },
  { name: 'Sourdough Bakery No. 6', category: 'bakery', lat: 32.0668, lng: 34.7702, locality: 'Tel Aviv-Yafo', provider: 'bakery' },
  { name: 'Courtyard Bar No. 7', category: 'bar', lat: 32.0538, lng: 34.7530, locality: 'Yafo', provider: 'bar' },
  { name: 'Frozen Yoghurt Stand No. 8', category: 'dessert', lat: 32.0801, lng: 34.7801, locality: 'Tel Aviv-Yafo', provider: 'dessert_shop' },
  { name: 'Shakshuka House No. 9', category: 'restaurant', lat: 32.0483, lng: 34.7520, locality: 'Yafo', provider: 'restaurant' },
  { name: 'Roastery Cafe No. 10', category: 'cafe', lat: 32.0862, lng: 34.7752, locality: 'Tel Aviv-Yafo', provider: 'cafe' },
  { name: 'Levantine Dining Room No. 11', category: 'restaurant', lat: 32.0602, lng: 34.7688, locality: 'Tel Aviv-Yafo', provider: 'restaurant' },
  { name: 'Late Night Cocktail Bar No. 12', category: 'bar', lat: 32.0655, lng: 34.7712, locality: 'Tel Aviv-Yafo', provider: 'bar' },
];

const NOTES = [
  'The pita is the point. Go before 13:00 or queue.',
  null,
  'Sit outside. The inside is loud and the tables are tiny.',
  null,
  'Ask for the one that is not on the menu.',
];

const WHY_GO = [
  'A tiny counter doing one thing extremely well.',
  null,
  'Worth the walk for the courtyard alone.',
  null,
];

const TAG_SETS = [
  ['vegetarian', 'quick'],
  null,
  ['late night'],
  ['brunch', 'outdoor seating'],
  null,
];

const DISH_SETS = [
  ['ratatouille pita'],
  null,
  ['pistachio gelato'],
  null,
];

/** Deterministic pseudo-random in [0,1) from an integer, so a run is reproducible. */
function jitter(index, salt) {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * `count` saved-place rows in `SAVED_PLACES_SELECT` shape.
 *
 * Beyond `SEED_PLACES.length` the seeds repeat with a deterministic coordinate offset of up to
 * ~0.02 degrees (roughly 2 km) and a numbered suffix, which is how 30 and 300 stay legible as
 * "the same city, more of it" rather than 30 pins on 12 pixels.
 */
export function savedPlaceRows(count) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const seed = SEED_PLACES[i % SEED_PLACES.length];
    const cycle = Math.floor(i / SEED_PLACES.length);
    const lat = seed.lat + (cycle === 0 ? 0 : (jitter(i, 1) - 0.5) * 0.04);
    const lng = seed.lng + (cycle === 0 ? 0 : (jitter(i, 2) - 0.5) * 0.04);
    const id = `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const placeId = `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const savedAt = new Date(Date.UTC(2026, 7, 30, 12, 0, 0) - i * 3_600_000).toISOString();
    rows.push({
      id,
      place_id: placeId,
      created_at: savedAt,
      note: NOTES[i % NOTES.length],
      visit_state: i % 4 === 0 ? 'visited' : 'want_to_go',
      visited_at: i % 4 === 0 ? savedAt : null,
      extracted_reason: i % 3 === 0 ? 'fixture caption quote, not a real review' : null,
      display_name: null,
      category_override: null,
      source_url: `https://www.tiktok.com/@fixture/video/${7000000000000000000 + i}`,
      source_thumbnail_url: null,
      tags: TAG_SETS[i % TAG_SETS.length],
      why_go: WHY_GO[i % WHY_GO.length],
      dishes: DISH_SETS[i % DISH_SETS.length],
      place: {
        name: cycle === 0 ? seed.name : `${seed.name} ${cycle + 1}`,
        category: seed.category,
        provider_category: seed.provider,
        lat,
        lng,
        address_line: `${10 + (i % 80)} Fixture St`,
        locality: seed.locality,
        country_code: 'IL',
        source_dataset: 'google_places',
        resolution_score: 0.9,
      },
      saved_place_sources: [
        {
          added_at: savedAt,
          source: {
            platform: 'tiktok',
            canonical_url: `https://www.tiktok.com/@fixture/video/${7000000000000000000 + i}`,
            author_handle: `fixture_account_${i % 5}`,
            author_name: null,
            thumbnail_url: null,
          },
        },
      ],
    });
  }
  return rows;
}

export function profileRow() {
  return {
    id: DEMO_USER_ID,
    display_name: 'Demo',
    created_at: '2026-06-01T09:00:00.000Z',
  };
}

export function userRecord(email = 'demo@example.com') {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: DEMO_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: '2026-06-01T09:00:00.000Z',
    phone: '',
    confirmed_at: '2026-06-01T09:00:00.000Z',
    last_sign_in_at: new Date(now * 1000).toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-06-01T09:00:00.000Z',
    updated_at: new Date(now * 1000).toISOString(),
    is_anonymous: false,
  };
}

/** base64url without padding — what auth-js's `stringFromBase64URL` expects. */
function b64url(value) {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A structurally valid, deliberately unsigned JWT. The stub never verifies it and nothing else
 * ever sees it; auth-js only parses it to read `exp`, so the three-part shape is the requirement,
 * not the signature.
 */
export function fakeAccessToken(expiresAt) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: DEMO_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'demo@example.com',
      iss: 'stub',
      iat: Math.floor(Date.now() / 1000),
      exp: expiresAt,
      session_id: '11111111-0000-4000-8000-000000000001',
    }),
  );
  return `${header}.${payload}.${b64url('not-a-real-signature')}`;
}

/** The session payload @supabase/ssr stores in the auth cookie. */
export function sessionPayload(email = 'demo@example.com') {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  return {
    access_token: fakeAccessToken(expiresAt),
    token_type: 'bearer',
    expires_in: 60 * 60 * 24,
    expires_at: expiresAt,
    refresh_token: 'stub-refresh-token',
    user: userRecord(email),
  };
}

/**
 * The cookie @supabase/ssr will read the session back out of.
 *
 * The name is derived exactly as supabase-js derives it — `sb-${hostname.split('.')[0]}-auth-token`
 * (see `defaultStorageKey` in `@supabase/supabase-js/dist/index.mjs`) — so for a stub on
 * `http://127.0.0.1:<port>` the key is `sb-127-auth-token`. The value carries the `base64-` prefix
 * that `decodeChunkedCookieValue` in `@supabase/ssr/dist/main/cookies.js` understands, which
 * sidesteps every URL-encoding question a raw JSON cookie value would raise.
 */
export function authCookie(supabaseUrl, email = 'demo@example.com') {
  const hostname = new URL(supabaseUrl).hostname;
  const name = `sb-${hostname.split('.')[0]}-auth-token`;
  const value = `base64-${b64url(JSON.stringify(sessionPayload(email)))}`;
  return { name, value };
}

// ---------------------------------------------------------------------------
// Collections
//
// Established from the code, not guessed: `SUMMARY_SELECT`, `DETAIL_SELECT` and the two loose
// selects in `src/app/collections/_lib/get-collections.ts`, plus the `preview_collection_invite`
// row shape declared in `src/app/collections/join/[token]/page.tsx`. Reading the select and its
// hand-written row interface is what makes these fixtures a mirror rather than an invention —
// those interfaces exist precisely because `supabase gen types` output is not in this repo, and
// the file's own header says a drift between them fails loudly.
//
// The names follow the same rule as the places: invented, and unmistakably so.
// ---------------------------------------------------------------------------

export const DEMO_COLLECTION_ID = 'cccccccc-0000-4000-8000-000000000001';
export const DEMO_INVITE_TOKEN = 'fixture-invite-token-0001';
const OTHER_MEMBER_ID = '00000000-0000-4000-8000-000000000002';

/**
 * `collection_members` rows, shaped as the **superset** of the two selects that read this table:
 * `SUMMARY_SELECT` (the index) and `getCollectionMemberships`'s narrower one (the ＋ menu).
 *
 * One fixture serves both because PostgREST returns only the columns a select asks for and this
 * stub does not implement `select=` — so the extra keys are ignored by the caller that did not ask
 * for them. That is a fidelity gap, and it is the right one to accept: the alternative is keying
 * fixtures by query string, which would break the moment somebody reorders a select.
 */
export function collectionMemberRows(placeCount) {
  const places = savedPlaceRows(Math.min(placeCount, 6));
  return [
    {
      role: 'owner',
      collection: {
        id: DEMO_COLLECTION_ID,
        name: 'Weekend list',
        description: 'Places for the next few Saturdays.',
        updated_at: '2026-08-29T18:00:00.000Z',
        owner: { display_name: 'Demo' },
        items: places.map((place, index) => ({
          position: index,
          place_id: place.place_id,
          place: {
            category: place.place.category,
            provider_category: place.place.provider_category,
          },
        })),
        members: [{ user_id: DEMO_USER_ID }, { user_id: OTHER_MEMBER_ID }],
      },
    },
  ];
}

/** `collections` rows in `DETAIL_SELECT` shape — the `/collections/[id]` read. */
export function collectionDetailRows(placeCount) {
  const places = savedPlaceRows(Math.min(placeCount, 6));
  return [
    {
      id: DEMO_COLLECTION_ID,
      name: 'Weekend list',
      description: 'Places for the next few Saturdays.',
      owner_id: DEMO_USER_ID,
      members: [
        {
          user_id: DEMO_USER_ID,
          role: 'owner',
          joined_at: '2026-08-01T09:00:00.000Z',
          profile: { display_name: 'Demo' },
        },
        {
          user_id: OTHER_MEMBER_ID,
          role: 'editor',
          joined_at: '2026-08-14T09:00:00.000Z',
          profile: { display_name: 'Second Member' },
        },
      ],
      items: places.map((place, index) => ({
        id: `dddddddd-0000-4000-8000-${String(index).padStart(12, '0')}`,
        place_id: place.place_id,
        // Half the items carry a shared note, because the row renders differently with and without
        // one and a fixture where every row is identical tests one of the two layouts.
        note: index % 2 === 0 ? 'Added after the Saturday walk.' : null,
        position: index,
        added_by: index % 3 === 0 ? OTHER_MEMBER_ID : DEMO_USER_ID,
        created_at: `2026-08-${String(10 + index).padStart(2, '0')}T12:00:00.000Z`,
        place: {
          name: place.place.name,
          category: place.place.category,
          provider_category: place.place.provider_category,
          lat: place.place.lat,
          lng: place.place.lng,
          address_line: place.place.address_line,
          locality: place.place.locality,
        },
        adder: { display_name: index % 3 === 0 ? 'Second Member' : 'Demo' },
      })),
    },
  ];
}

/** `collection_invites` — owner-only by policy, so this is what the owner's share row reads. */
export function collectionInviteRows() {
  return [
    {
      token: DEMO_INVITE_TOKEN,
      role: 'editor',
      created_at: '2026-08-20T10:00:00.000Z',
      expires_at: null,
    },
  ];
}

/** One row of the `preview_collection_invite` RPC (migration `0024`) — five fields, no more. */
export function invitePreviewRows() {
  return [
    {
      collection_id: DEMO_COLLECTION_ID,
      collection_name: 'Weekend list',
      inviter_name: 'Demo',
      role: 'editor',
      already_member: false,
    },
  ];
}

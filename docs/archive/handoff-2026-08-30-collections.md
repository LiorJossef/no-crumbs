# Handoff — Collections, shared collections, and a backlog sweep

**Session: overnight 2026-08-29 → 2026-08-30. Branch: `feat/collections`, cut from `origin/main`.**
Owner was asleep; standing instruction was to take ownership, build Collections including shared
Collections, then keep advancing the product from `docs/product-backlog-2026-08-29.md` using
judgement rather than backlog order.

**Read `§1` and `§8` if you read nothing else.** §1 is what to look at first; §8 is what is risky.

---

## 1. Start here — what to open

```bash
npm run dev
```

Sign in as `demo@example.com` / `local-dev-preview-1234`, then:

1. **`/map` → tap any place → `In מסעדות טובות`.** That row is the new "Add to a collection"
   control. Tap it for the picker; toggling writes immediately.
2. **The bottom of the places list → `Collections`.** The only entry point, on both breakpoints.
3. **`/collections` → open `מסעדות טובות`.** It is the map with three London pins, the same sheet,
   the same rows. Tap the `3 places · You, דנה and 3 others` line for the share panel.
4. **`⋯ → Share`** shows the live invite link and the privacy block. Copy it, open it in a private
   window, and you get the signed-out join screen.

The collection, its members and its invites are **local test data** — see §7 for exactly what to
delete.

---

## 2. What I chose to work on, and why

Collections first, because you asked for it and because it was the only thing on the night's list
that was a *product capability* rather than a repair. Everything after it came from the backlog, and
I picked by "what is a user actually hurt by tonight", not by backlog order:

| Chosen | Why it beat the alternatives |
|---|---|
| Collections + sharing | The ask. Also the first thing in the product two people can both write to, which is why it got an independent security review rather than my own say-so |
| The import paste field | Three defects in the first thirty seconds of the flagship flow — Enter did nothing, Cancel ate the link, a real share-sheet paste was rejected |
| Error screens, pinch-zoom, `<title>` | The product had **no** error boundary of any kind, blocked pinch-zoom app-wide, and was shipping `P-002` as its user-facing name |
| Rename a saved place | A complete feature missing only its trigger: the column was granted and rendered and written by nothing |
| "Approximate location" | 21 of 31 saved places are the model's own coordinate guess, and the product said so during import and then forgot |
| `toCountryCode` | Found in passing, and it was writing **`DD` (East Germany)** into live rows |

**Deliberately not touched:** anything audio/transcription (your hard constraint — the branch
`feat/tiktok-media-acquisition` is untouched and pushed, see §7), anything hosted (Vercel, staging,
production, Supabase auth config), and anything that spends Gemini or Google Places quota. **Zero
external API calls were made all night.**

---

## 3. How Collections works

### The model, and the one decision everything follows from

**A collection item points at a `places` row, never at a `saved_places` row.**

`saved_places` is the per-user overlay: your note, your been-mark, your tags, the TikTok you saved it
from. Had a collection pointed at *that*, sharing would have meant handing a collaborator someone
else's private columns, and every `saved_places` policy would have had to move from
`user_id = auth.uid()` to a membership test — the "V-XL" item the backlog flags at §10 S3.

Pointing at the shared identity row instead means sharing opens **exactly one** new read
(`places_select_if_in_shared_collection`) and nothing about anybody's library becomes visible. The
concrete consequence, and it is a privacy decision rather than an implementation detail:
**`visit_state` does not travel.** Sharing "I want to go here" discloses *future* location intent,
which is a stronger disclosure than a past visit, and no collection surface shows it.

### Shape

| Table | What it is |
|---|---|
| `collections` | name, optional description, one owner |
| `collection_members` | `owner` / `editor` / `viewer`; exactly one owner, enforced by a partial unique index |
| `collection_items` | a `places` row, plus `added_by`, a **shared** note, and a `position` |
| `collection_invites` | a uuid token carrying a role, redeemable only through a `SECURITY DEFINER` function |

Roles: **owner** renames, deletes, shares, and changes who else is in. **editor** adds and removes
places and writes the shared note. **viewer** reads. An editor cannot invite — a `Share` button that
cannot share is worse than no button.

### Sharing, and why it is a link

Invite by link, not by email: there is no email infrastructure in this product (password reset does
not exist either), and a link needs no address book, no enumeration surface and no delivery. The
link is redeemable **only by a signed-in user**, so there is still no unauthenticated read path over
personal location data — the thing `backlog §10` says to hold hardest.

The owner has one live link at a time. Replacing it revokes the previous one, so "regenerate" and
"revoke" are the same gesture and a link you have forgotten about cannot still be live.

**Never auto-join.** A link in a group chat gets opened by accident, and joining is a membership
fact about someone else's collection. Signed out, you get a generic screen and a sign-in round trip
that brings you back to the same link.

### What is built

- `/collections` — yours and shared-with-you, create in place.
- `/collections/[id]` — **the map**, with the same sheet/panel language as `/map`, the collection's
  pins only. Search, add places (multi-select), a place's detail with the shared note, `Added by X`,
  `Save to your places`, `Remove from this collection`.
- `/collections/join/[token]` — signed in and signed out.
- On `/map`: `Add to a collection` in a place's detail, with an in-place picker that can also create
  a collection; and one `Collections` row at the bottom of the list on both breakpoints.

### What I deliberately did not build

| Cut | Why |
|---|---|
| Manual reordering | Drag over a canvas map, inside a sheet that owns vertical drag, with the map owning horizontal pan. `position` is written on append, so nothing is lost and it can ship later as a dedicated mode |
| Multi-select on `/map`'s list | A mode with an invisible off-state on the most-used surface, to save taps in a case the collection's own `Add places` already serves |
| Cover images | We hold none, and every substitute is invented. Each row draws the distinct categories actually in it, in the palette the pins already use |
| Descriptions | The column exists; no editor. A field almost nobody fills renders as blank space on every row |
| Add-to-collection after an import | The end of an import is the product's best moment; bolting a picker onto it trades the moment for a step |
| Voting, reactions, activity feed | Charter §4 bans gamification and this product has no social graph. Not "later" — no |
| A bottom tab bar | 56px off the map on every screen, a second navigation concept against "the map is the shell", and a collision with the sheet's peek stop, for one destination most sessions will not visit |

---

## 4. Backlog items fixed

All independently verified against the running app and the live local database before I touched
them — `docs/evidence/backlog-verification-2026-08-29.md` has the measurements.

| Backlog | What changed |
|---|---|
| §0 P0 | **`saved_places.source_url` has been dead since `0017`.** Confirmed by measurement: 7/7 saves before 2026-08-26 10:24 UTC populated, 24/24 after it null, no overlap. `save_place` restored. **The 24 existing rows are not backfilled** — that is a data write and belongs in its own migration |
| §2.1 | Enter and Go did nothing — the URL field was not in a `<form>` |
| §2.2 | `enterKeyHint="go"`, autocapitalise/autocorrect/spellcheck off |
| §2.5 | Cancel cleared the pasted link, sending you back to TikTok to copy it again |
| §2.7 | A real share-sheet paste (`caption … link … #hashtags`) was rejected as "not a TikTok link" |
| §2.3 | "Matching locations" never left `pending`. **Deleted the stage rather than faking it** — the probe route is one request with no boundary to report crossing, and inventing progress is the one thing this product must not do |
| §6.1 | **Rename a saved place.** Zero migrations; the column was granted and rendered and written by nothing |
| §6.3 | A guessed pin now says **"Approximate location"** instead of `Matched via llm-guess` at 11px. The `· 87% confidence` beside it is **gone** — `resolution_score` is a diagnostic, not a probability, and the review screen bans confidence numbers by rule |
| §5.1 | `created_at` was in the `ORDER BY` and nowhere else. The detail says `Saved on 28 August` |
| §5.6 | Place names now use `<bdi>` + `line-clamp`, so a Hebrew name is no longer clipped at its identifying start |
| §8.4 | `regionCode` was dead — 0 of 50 live rows carried a code, `toCountryCode` resolves all four real shapes |
| §8.7 | `max_tokens: 1024` — a real recorded 5-candidate Hebrew response needs 1,177–1,453 |
| §8.8 | Neither adapter read `stop_reason`; truncation, refusal and malformed output were one error |
| §8.9 | One bad candidate discarded the whole response |
| §12.6 | No `error.tsx` / `global-error.tsx` / `not-found.tsx` anywhere |
| §12.7 | `maximumScale: 1` blocked pinch-zoom app-wide (WCAG 1.4.4) |
| §12.20 | No security headers beyond Vercel's HSTS |
| §13.7 | The delete confirm autofocused the destructive button |
| §5.2 | **Not fixed — REFUTED.** The list controls are outside the scroller entirely; measured 1017px of mobile scroll with the search field fixed at y=72. The backlog's "40 rows up" story is false |

### Found in passing, not on the backlog

- **`toCountryCode('Germany')` returned `DD` — East Germany.** Also `Serbia`→`CS`, `Yemen`→`YD`,
  `Zimbabwe`→`RH`, `Vanuatu`→`NH`, `Curaçao`→`AN`, `Myanmar`→`BU`, Hebrew `וייטנאם`→`VD`. The
  function is live on the confirm seam, so those went into `places.country_code`, which the dedup
  guard reads as a positive statement. Fixed at the class, not by naming survivors.
- **`service_role` held TRUNCATE on `poi_regions` and `poi_index`** that no migration granted, from
  a `postgres`-owned `ALTER DEFAULT PRIVILEGES` entry `0008` never revokes. `0010` explicitly
  withheld TRUNCATE and wrote down why, and did not get it. TRUNCATE ignores RLS. Migration `0025`,
  plus `inventory.sql` check 9d so the next table to arrive with it is caught.
- **`/sign-in` ignored `?next=`**, so the invite round trip dumped people on the map.

---

## 5. Verification

- **1,409 unit tests pass** (was 1,334), `npm run verify` clean, `npm run build` clean.
- **`npm run db:test:0024`: 34 policy assertions pass.** Each control was sabotage-tested — the
  control removed, the assertion observed failing, the control restored — 13 of them.
- **`npm run db:inventory`: exit 0** on the local container, including the new check 9d.
- **`npm run db:test` still fails at `0008`** on a populated database. Pre-existing and documented:
  `0008` counts whole tables and needs an empty one. CI runs against an empty database and passes.
- **An independent security review attacked the collections RLS**
  (`docs/evidence/security/collections-rls-review-2026-08-29.md`): 13 separate routes to another
  user's `saved_places` row, all refused, with a working positive baseline in the same session so
  none of it passes by deny-all. `visit_state` is unreachable. **The reviewer did not exercise the
  veto.**
- **Used the product, not just the tests**: created a collection, added three real places through
  the picker and read the rows back out of Postgres; renamed a place to Hebrew, read it back, and
  restored it through the reset control; pasted real share-sheet text into the import field and
  watched it become a clean link; opened a place and read "Approximate location" off a real
  `llm-guess` row. Mobile (375×812) and desktop.

---

## 6. Where I overrode a specialist, and where one overrode me

Five specialists were used. Every one of them disagreed with me about something, and most of the
time they were right.

**They were right:**
- `supabase-database` refused three parts of my schema spec: the `collections` SELECT policy needs
  an `owner_id` arm (Postgres applies it to a `RETURNING` tuple before the trigger fires, so with my
  version **nobody could create a collection at all** — measured, not argued), `INSERT` must be
  column-level or the creator can supply their own `collection_invites.token`, and the revokes must
  name `service_role`.
- `nextjs-architect` used `retry()` where I said `reset()`, from the installed Next 16.3 docs, and
  proved the difference by making a route fail conditionally and recovering it. It also **refused**
  to add a root `loading.tsx`, because a streamed response has already sent its headers and would
  turn every 404 in the product into an HTTP 200.
- `qa-reliability` refuted two backlog items I was about to fix, and told me the honest fix for the
  import rail was the opposite of the ticket.

**I overrode them:**
- `ux-interaction` specced the signed-out join screen to name the collection and its inviter. That
  needs an `anon`-executable read of another user's content, and I am not opening the product's
  first unauthenticated read path overnight. Signed-out gets a generic screen.
- Both design specs wanted a display name to *fall back* to the email local-part. Prefilling a field
  someone confirms is consent; a silent fallback puts a fragment of their address in front of people
  who were never given it. The fallback is `A collaborator`.
- `ux-interaction` cut `Save to your places`. It is the loop that makes a shared collection worth
  anything, and it was one action and one button.

---

## 7. State of the tree, and the cleanup you may want

**Nothing is pushed. No PR is open. Nothing hosted was touched** — Vercel, staging, production and
Supabase auth config are all exactly as you left them, and the standing hold is intact.

- **The transcription work is untouched and safe.** `feat/tiktok-media-acquisition` is pushed to
  `origin` at `5254ebf`. `feat/collections` was cut from `origin/main` precisely so none of it is
  entangled. No file under `src/integrations/transcription/`, `src/integrations/media/` or
  `src/integrations/import/` was read or edited.
- **`docs/product-backlog-2026-08-29.md` and `scripts/rebuild-prod.sh` are still untracked**, as you
  left them. I did not commit either — the backlog is your working document and the script is the
  one-off you wanted to review before deleting.
- **Local database test data, already trimmed, and what is left is deliberate.** The specialists
  created seven throwaway accounts to drive the join flow end to end; **six are deleted**. One is
  kept on purpose so you wake up to a collection that is genuinely *shared* rather than one with a
  single member — `flow-mobile-…@example.com`, display name `דנה`, an editor on `מסעדות טובות`.
  `demo@example.com`'s own `display_name` was set to `מאיה` so the inviter line had something real
  to render.

  All three are one command each to remove when you have looked:

```sql
-- the demonstration collaborator
delete from auth.users where email like 'flow-mobile-%@example.com';

-- the test collection, its members, items and invites (cascades cleanly)
delete from public.collections where id = '78a030ea-abf6-44fc-91a9-62e848269659';

-- demo@example.com's display name, back to unset
update public.profiles set display_name = null
 where id = (select id from auth.users where email = 'demo@example.com');
```

  **All 31 real saved places are intact and untouched**, and nothing else in the database was
  changed. Dumps: `~/p-002-backups/local-pre-collections-20260828T200649Z.dump` (before any of
  tonight's work) and `local-pre-0026-*.dump` (before the membership migration).

---

## 8. Risky, incomplete, or needing your decision

### Fixed after the review, before handoff

The independent security review found **two authorisation holes**, same root cause. **Both are
fixed** — migration `0026`, commit `3ea5874`:

- **Removing a member does not remove them.** The owner deletes C's membership; C re-clicks the same
  invite link and is back in. `on conflict do nothing` only protects while a row exists to conflict
  with, and a removal deletes exactly that row.
- **A demoted editor can restore their own rights** by leaving and re-clicking the old editor link.

Neither leaked anything — they are authorisation failures, not disclosure, which is why the reviewer
did not veto. But "I removed them" silently not working is the wrong failure mode for a product
about where people go.

**Membership now ends rather than being deleted.** Redeeming a link has four rules: already in is a
no-op; a voluntary leaver comes back at the role they held when they left, with the invite's role
not consulted at all; someone the owner removed is refused; a stranger joins at the invite's role.
The `DELETE` grant on `collection_members` is gone, which is half the fix rather than tidiness —
with it, a removed member could delete their own tombstone and rejoin as a stranger. The owner gets
`collection_removed_members` and `restore_collection_membership` so a removal is not a dead end.

Proven, in both directions: the two attacks were reproduced by hand on the `0025` schema first
(their verbatim output is in `0026`'s header and the commit message), then re-run and refused.
Nine new policy assertions, 43 total. And verified through the running app — removed a member from
the share panel, read the tombstone out of Postgres, watched their re-click refused with `PT403`,
and put them back through the owner's restore path.

### Decisions that are yours

1. **An owner deleting their account destroys the collection for everyone in it.**
   `collections.owner_id` is `on delete cascade`, while `collection_items.added_by` is
   `on delete set null` specifically so a *collaborator's* erasure does not destroy other people's
   data. The security review's ruling: not defensible as an Art. 17 implementation, but **not
   blocking**, because account deletion is not built. Two consequences: backlog §11.8's "exactly
   three tables carry `user_id`" is now wrong by four references, and **ownership transfer must land
   before account deletion does** — today an owner cannot even leave their own collection.
2. **The product name.** `<title>` was `P-002`. It is now `Your saved places, on one map` —
   provisional, one line to change, and a test stops the codename coming back. The codename is still
   a visible label beside the mark in `src/app/page.tsx`.
3. **`EXTRACTOR_REFUSED`.** A model refusal and malformed output still share a code and therefore
   share user-facing copy. `domain/errors.ts` says the set is closed and a new code is a `07` §9
   decision, so it was not taken unilaterally.
4. **AI crawlers.** `robots.ts` is deny-by-default with two allows; it has no per-agent rules,
   because whether this product's public copy is training data is your call.
5. **`db-plan-enabled` on the hosted projects.** The reviewer could not test PostgREST over real
   HTTP. With that setting on, `EXPLAIN`'s `Rows Removed by Filter` becomes a browser-reachable
   count of other users' rows. Worth confirming it is off.

### Left alone on purpose

The `0021`/`0022`/`0023` local ledger gap (§12.16 — your call, and under the hosted hold), the
`source_url` backfill of 24 rows (its own migration), the Vercel env store (§12.1 — needs you), and
everything that spends quota.

---

## 9. What I would do next

1. **Open the PR and let CI speak.** `npm run verify` and `npm run build` are clean locally, and
   `db:inventory` is green, but CI is the authority and it has four jobs, not one.
2. **Then production** (§12.1 → 12.2 → 12.3). It has been 500ing for every signed-in user since
   2026-08-26 and `/healthz` still says `ok: true`. That is now the largest single gap between what
   this repo contains and what anybody can use, and it needs you for the env store.
3. **Rate-limit `/api/imports/probe`** before production comes back. One unconfirmed signup plus a
   loop of distinct URLs drains both the Gemini and the Google budgets for the day; `rateLimitedLocal`
   still has zero production call sites.
4. **The `no_places` screen** (§3.1 + §3.2). It is still the modal import outcome and still the
   weakest surface, and it is the highest-value thing left that costs no quota to build.

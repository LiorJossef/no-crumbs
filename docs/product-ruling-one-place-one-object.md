# One place, one object — the collections navigation and detail ruling

**Owner rulings, 2026-08-30.** Taken in one session, from one complaint: opening *Fugazi* from the
map gave the normal place detail; opening the same place through Collections → Tel Aviv → Fugazi
gave a different screen, reached through several nested back buttons, in what felt like a separate
application.

Reviewed as one navigation/detail problem rather than as three screenshots. Four rulings follow,
plus one question deliberately left open.

---

## R1 — The place is one object, whatever route reached it

A place presents the same detail experience from every entry point. Collection context may **add**
— "Remove from this collection", the shared note, "Added by …" — through the two slots
`PlaceDetail` already exposes (`primaryAction`, `footer`). It may not reorder, rename, or hide what
the canonical screen shows.

**This was never two components.** `CollectionPlaceDetail` already renders `PlaceDetail` with
`variant="hosted"`. It looked like a different screen because the call site starved it: `savedPlace`
was `null`, killing six controls at once, and the facts object was typed `SharedOnlyPlaceFacts`,
which pins every overlay key to `never`.

Those two choices are right for a place somebody else added that you do not have. They were being
applied to **your own place, in your own collection** — the route already knew better
(`CollectionPlace.savedByMe`) and did nothing with it.

## R2 — The TikTok source travels with the place

In a shared collection, every member sees the same core place information. The source of the
recommendation is part of it: link, thumbnail, canonical URL, and the author handle so attribution
travels with it.

**This reverses `0024_collections.sql`'s written position** that which post someone saved a place
from is their import history. The product is places from TikToks; a recommendation with its source
stripped is the unprovenanced claim Charter §6 forbids, and showing a creator's video without their
handle is worse, not better.

What travels, and what does not:

| Travels to every member | Stays with the viewer who owns the row |
|---|---|
| tags, why-go, dishes, the caption quote | the private note |
| source URL, thumbnail, canonical URL, author handle | been-here and visited-at |
| everything already on the shared `places` row | the category override |

**Been-here, visited-at and the private note do not cross, and this ruling does not reach them.**
"I want to go here" is a statement of future location intent disclosed to everyone a link was
forwarded to; `visited_at` is timestamped location history. There are two note fields precisely so
one can be private. `security-privacy` holds a veto here and it stands.

**Mechanism: a `SECURITY DEFINER` function, not an RLS policy.** `saved_places` carries a
table-wide `SELECT` grant (`0006:113`), so any row-level policy on it exposes *every* column of the
matched row — the note and the visit state included. Measured, not assumed: the columns came back.
The natural predicate (match on `place_id`) is worse still, leaking the overlay of users who are in
no collection at all. The function is keyed on the collection, joins through `collection_items.added_by`,
returns a fixed column list, and re-derives entitlement from `auth.uid()` rather than from its
argument.

**Adding a place to a shared collection is now a publication act.** The share panel currently
promises members will not see "your tags, or the links you saved places from". That becomes false,
and the copy moves in the same commit as the boundary — not after.

## R3 — Per-user rename is removed from the product

A place has one canonical name. If that name is wrong, we matched the wrong place or hold bad data;
that is a resolution / data-quality problem deserving a proper correction or re-match flow, not a
personal rename each user applies to their own copy.

**Why it existed.** Two reasons, neither of them a user need. Acceptance criterion A3 is annotated
in the specification itself as "the course's CRUD surface, M3/M4", and the cut-list rationale for
manual place editing reads "Minimum viable CRUD for M3/M4". It landed on `saved_places.display_name`
rather than `places.name` because no user may write a shared row — otherwise one user could poison
another's map, or plant a plausible fake place for someone else's import to dedup onto. The overlay
was a **consequence of the security model**, not a product decision.

**The removal reaches the database.** Revoking `display_name` from the update and insert column
grants is what makes "one canonical name" an invariant rather than a UI convention; deleting the
pencil alone leaves a rename writable with an anon key and a JWT. The column stays — dropping it is
irreversible and buys nothing once nothing reads or writes it.

**Cost: zero.** Production held 0 renames across 7 saved places, local 0 across 30, counted before
the decision. The feature shipped on 2026-08-30 and was never used by anyone.

**A3 is amended, not replaced.** The CRUD surface does not depend on rename specifically — it needs
a visible update verb on a user-owned entity, and three survive: category override, the private
note, and visit state. Plus delete, plus manual add.

**One consequence, accepted rather than solved:** a shared collection can show a bad canonical name
with no repair path for any member. The repair belongs to resolution.

## R4 — Collections is a scope on the map shell, not a route family

Both URLs are kept, so share links survive. Both layouts are deleted.

- **Layer 0** is the shell — map, sheet, bottom bar. It never carries a back control.
- **Layer 1** is exactly one pushed pane — place detail, add places, share. One back arrow, which
  dismisses it. **A pane may not push a pane.** At most one back-shaped control exists at any moment.
- Exits are the persistent tabs: **Map** clears the scope, **Collections** is the index.

Scope is stated in the sheet header rather than as a floating chip: `FLOATING_TOP_CHROME_PX = 0` on
that route is load-bearing, and a pill over the map's top band costs camera budget.

The owner's worst path — Places → Collections → Tel Aviv → Fugazi — ends two layers deep with one
back control on screen.

The duplicate drawer and the second map surface are **not** deferred as follow-up plumbing. They are
what makes the route feel like a separate application, which is the complaint itself. `PEEK_PX` is
the one value that must not move; it mirrors a CARTO/OSM attribution condition.

Full IA spec: `docs/ux-collections-as-scope.md`.

---

## Left open: what a shared category correction should be

`saved_places.category_override` **stays for now**, deliberately, and is out of scope for this work.

It is the same shape as rename — one user's opinion overlaid on a shared fact, originating in the
same A3 sentence, used zero times on every database we can legitimately read. It differs in that its
vocabulary is closed (three values plus `Automatic`, which writes NULL and keeps the place open to a
better derivation tomorrow), so it can carry no personal content.

**The evidence to decide it does not exist.** Nobody has ever measured whether the derived category
is right: the 44-case golden file carries `category_hint` as an *input* and has no expected-category
field, the recognition benchmark uses category only as a 0.18 scoring weight, and the live-usage log
has one row of human adjudication. What the local data does show is that the dominant failure is not
a wrong word but an uninformative one — `restaurant` on 65% of every candidate ever extracted here,
and 21 of 21 on the `llm_guess` path where no provider category exists to correct it. A per-row
override cannot fix a taxonomy with almost no discriminating power. Both real category bugs on
record were fixed in the mapping table, not by a user override.

Revisited separately, once there is evidence and a decision about what the proper **shared**
correction model should be. The cheap missing artefact: hand-label expected categories for the
candidates already cached in `extractions` and score `productCategoryFor` against them — no model
calls, no Places quota, no hosted database.

# ODbL sign-off — joining OSM `name:en` / `name:he` into `poi_index.alt_names`

> **Task `OSM-ODBL-1`. Ruling by `security-privacy`, 2026-08-27.** Answers the ingest half of
> [`06-map-and-places-decision.md`](../../06-map-and-places-decision.md) §11 Q2, which that section
> has deferred since 2026-08-18 and which `10-poi-index.md`'s `alt_names` column has been waiting
> for since migration `0010`.
>
> This is the project's compliance position, recorded with its reasoning and its sources. It is not
> legal advice and its author is not a lawyer. Every quotation below was **fetched on 2026-08-27**,
> not recalled; the raw captures are in [`raw/`](raw/). Where the answer rests on a judgement the
> owner must make rather than on a text that can be quoted, §8 says so and frames the choice.
>
> **Scope.** This file rules on the **bulk alias join** — a systematic extract of OSM POIs over the
> `tlv` bbox, joined onto Overture rows. It does **not** re-rule the **Nominatim query path**
> (individual geocoding results), which is analysed separately in
> [`odbl-06-q2-draft-answer.md`](odbl-06-q2-draft-answer.md) and still awaits the owner's own act.
> The two paths get different answers, and the reason they differ is the whole content of §2.

---

## 0. Verdict

**Permitted, but not free, and not recommended at the benefit it currently buys.**

**May we ingest OSM aliases into `poi_index.alt_names`? Yes — and only if we publish the joined
index.** The join makes `poi_index` a **Derivative Database** under ODbL 1.0 §4.4. From the moment
the app is deployed publicly, ODbL §4.4(a) + §4.6 require us to license that index under ODbL and
to offer anyone a free, machine-readable copy of it. That is affordable (≈2 days, §7) but it is a
**standing obligation, not a one-off task**, and the seven conditions in §6 are all merge-blocking.

**And it should not be done now.** Not for a licensing reason — for a measured one. The handoff's
own measurement is that the join lands **423 Hebrew-only rows with a Latin alias**, against
**6,699** Hebrew-named rows in the index. We would take on a permanent share-alike obligation over
our whole POI index to repair **4%** of the gap it is supposed to close. Two licence-free routes
(§5) attack the other 96%, and neither has an ODbL surface at all.

**Recommended order: (1) bilingual query expansion, (2) lazy per-miss alias caching, (3) the bulk
join only if 1 and 2 are measured and found wanting.**

**This is not a veto.** My data-exposure veto is not engaged: `poi_index` is unreadable by `anon`
and `authenticated` (§4, verified by attack), and OSM POI data is not personal data (§4). What is
engaged is a **licensing gate**, a **governance defect** (§3, the tripwire that was supposed to
catch this does not), and **one privacy condition** on how the extract is taken (§4, C6).

---

## 1. What I actually did

Review by attack, not by reading intent.

| # | Probe | Result |
|---|---|---|
| P1 | `select count(*) from poi_index` on `supabase_db_P-002` | **10,462** rows, **6,699** Hebrew-named (`name ~ '[֐-׿]'`), **0** with any `alt_names`, **1** distinct `source_dataset`. Reproduces the handoff's §4 figures independently |
| P2 | **Attack: bypass the ODbL tripwire.** `update poi_index set alt_names = array['PROBE-…'] where source_dataset='overture-places'` inside a transaction, then `rollback` | **UPDATE 1, no error.** See §3 — this is a real finding |
| P3 | **Attack: cross-role read.** `set local role anon; select count(*) from poi_index` | `ERROR: permission denied for table poi_index` |
| P4 | Same as P3 as `authenticated` | `ERROR: permission denied for table poi_index` |
| P5 | `information_schema.table_privileges` for `poi_index` / `poi_regions` | Grantees are exactly `postgres` and `service_role`. No browser role holds anything |
| P6 | One live Overpass query, 3 nodes, tiny bbox, `out meta` | Element keys include **`uid`** and **`user`** — OSM contributor identifiers. See §4 |
| P7 | Traced `alt_names` through the uncommitted resolver code | `place-resolver.ts` selects `alt_names`; `resolution-record.ts`'s `StoredResolvedPlaceSchema` carries `altNames`; `probe/route.ts` persists the whole record into `extractions.candidates` **and returns it to the browser**. `confirm/route.ts:216` writes `altNames: []` into `places`. See §6 C4 |
| P8 | RLS on `extractions` | `extractions_select_via_source_membership` — `authenticated` may read `candidates` for sources they imported or saved. Scoped correctly; no cross-user read |
| P9 | Audited committed OSM artefacts in `docs/evidence/places/` | `overpass-coverage*.json` hold 5 and 11 elements, **no `user`/`uid`** (no `out meta` was used). They do carry `contact:phone`, `contact:instagram`, `contact:linkedin` for a handful of venues. `results-osm.csv` / `raw-osm.json` are 44-case geocoder outputs. All insubstantial; see §4 |

No destructive statement was run. P2 was inside an explicit transaction and rolled back; `psql`
confirmed `ROLLBACK`, and P1's `0 rows with alt_names` was re-read after.

Live third-party calls this task: **9 documentation fetches + 1 Overpass query = 10**, at the
`agent-guardrails.md` §6 item 22 ceiling. No LLM calls.

---

## 2. Q1 — Derivative Database, Collective Database, or Produced Work?

### It is a **Derivative Database**. Not a Collective Database, not a Produced Work.

Four independent sources say so, and one of them describes our exact plan.

**(a) The extraction is Substantial.** VERIFIED — OSMF *Substantial - Guideline*, endorsed
2014-06-06 ([raw](raw/osmf-guideline-substantial-2026-08-27.txt)):

> "More that 100 Features only if the extraction is non-systematic and clearly based on your own
> qualitative criteria … **The systematic extraction of all eating places within an area** or at all
> castles within an area **would be considered to be systematic**."

and

> "Note also that we regard repeated small extractions as one big extraction!"

The proposed ingest is 2,742 named food-and-drink POIs over a bbox covering Tel Aviv, Herzliya,
Netanya, Kfar Saba and Petah Tikva — all eating places within an area, re-run on each Overture
release. That is the guideline's own worked example of *systematic*, at 27× the 100-feature line,
over an area three orders of magnitude larger than the "1,000 inhabitants" bound. There is no
reading on which this is insubstantial.

**This is exactly why the Geocoding Guideline does not save us here.** That guideline's safe
harbour is for *individual* geocoding results — "Individual Geocoding Results are insubstantial
database extracts" — and it is conditioned on the collection "not [being] a systematic attempt to
aggregate all or substantially all Primary Features of a given type … within a geographic area
city-sized or larger". A bbox sweep of every restaurant and café in a metropolitan area is the
condition's negation, stated almost word for word. **The Nominatim clearance in
`odbl-06-q2-draft-answer.md` does not extend to this path, and must not be cited as if it does.**

**(b) The Collective Database escape is closed by the OSMF's own example.** VERIFIED — OSMF
*Collective Database Guideline*, endorsed 2016-06-17
([raw](raw/osmf-guideline-collective-2026-08-27.txt)), final example:

> "You have a proprietary list of restaurants for a country. You would like to **complement your
> list with the corresponding data from OpenStreetMap** removing any duplicate objects in the
> process. The resulting, combined database **would not be covered by this guideline** and you
> would, if the dataset is publicly used, have to consider that **your proprietary data may be
> subject to the ODbL share-alike terms**."

That is a description of the alias join, with "restaurants" and "complement your list" both literal.
It also answers a question nobody asked yet: the contamination does not stop at the alias column —
the guideline warns that *our* data in the combined database is what becomes exposed.

The guideline's four permissive bullets were checked one at a time, not waved past. The nearest
one is "a non-OSM database replaces or **adds a property** of a primary feature, and uses either all
OSM data or no OSM data for that property … within the same regional cut". A name is a property, not
a primary feature ("'Primary feature' means data from a key value pair … **but not inclusive of
properties**"), and `alt_names` would be all-OSM within the `tlv` cut, so a good-faith argument
exists. **It is not good enough to rely on**: every bullet in that guideline is framed as non-OSM
data being added to OSM features, our case is the mirror image, and the OSMF wrote out the mirror
image separately and said no. Where a guideline's general rule and its own worked example point in
opposite directions, the worked example is the safer read for a project that will be published.

**(c) The Horizontal Layers guideline independently reaches the same place.** VERIFIED — endorsed
2014-06-06 ([raw](raw/osmf-guideline-horizontal-2026-08-27.txt)), under "Examples of where you **DO**
need to share your non-OpenStreetMap data":

> "You add restaurants in one area from non-OpenStreetMap data **based on comparison with
> OpenStreetMap data** in other layers."

Our join *is* a comparison — name similarity plus proximity — between an OSM restaurant layer and
an Overture restaurant layer, and the guideline's rule is that when one Feature Type draws on both,
share-alike applies to that Feature Type regardless of which layer or table the data physically
sits in.

**(d) The Trivial Transformations escape does not apply either.** VERIFIED — endorsed guideline
([raw](raw/osmf-guideline-trivial-2026-08-27.txt)):

> "Loading OpenStreetMap data into a database or transforming into other formats does not add any
> information that needs to be shared **provided that no other source of data is involved**."

Overture is another source of data. It is involved by construction; the join is the point.

**Why not a Produced Work.** VERIFIED — ODbL 1.0 §1.0: a Produced Work is "a work (such as an image,
audiovisual material, text, or sounds) resulting from using … the Contents (via a search or other
query)". VERIFIED — OSMF *Produced Work - Guideline*
([raw](raw/osmf-guideline-produced-2026-08-27.txt)):

> "If the published result of your project is **intended for the extraction of the original data,
> then it is a database and not a Produced Work**. … **however, if you publish a produced work, the
> underlying database has to be published as well** (or alternations to the original database as is
> the case of derived databases), according to section 4.6 of ODbL."

`poi_index` is a search index whose entire purpose is retrieving stored rows. It is a database. The
*rendered map and the place sheet* are Produced Works — and per the sentence above, publishing them
does not shelter the index; it triggers the obligation over it.

**One argument this repo has relied on, and it is wrong.** `06` §11 has held since 2026-08-18 that
"a mixed table plus a public API constitutes … only Produced Works", partly on the intuition that
running a web service is not distribution. VERIFIED — ODbL §1.0 defines "Convey" as excluding
"interaction with a user through a computer network". True, and irrelevant: **share-alike's trigger
is not Convey.** VERIFIED — §4.4(c):

> "**A Derivative Database is Publicly Used and so must comply with Section 4.4. if a Produced Work
> created from the Derivative Database is Publicly Used.**"

Serving the map to one signed-up stranger is Publicly Using a Produced Work created from the
derivative index, and that alone pulls in §4.4 and §4.6. The "we only run a service" position must
be retired, not narrowed.

---

## 3. Q2 — what share-alike actually requires, how far it reaches, and when it fires

### 3.1 The trigger is public deployment, not distribution

VERIFIED — ODbL §4.5(c): "Use of a Derivative Database **internally within an organisation is not to
the public** and therefore does not fall under the requirements of Section 4.4."

| State | Obligation |
|---|---|
| Local dev; a private instance only the owner reaches | **None.** §4.5(c). Building and measuring the join costs nothing legally |
| A demo shown from the owner's own screen | **None**, on the same clause — the Produced Work is not Publicly Used |
| A public URL anyone can sign into (today's Vercel deployment, once restored) | **Full §4.4 + §4.6.** Fires on the first public page load, not on a download |
| Publishing a dump | Additionally §4.2's notices |

So the join can be **built and measured** before anything is owed. Nothing is owed until it ships.
That is a genuinely useful sequencing fact, and it is the reason "not yet" is a coherent answer
rather than a dodge.

### 3.2 How far it reaches — column, table, or application database?

**Not the alias column.** ODbL has no concept of a column; §4.4(b) is explicit that "Extraction or
Re-utilisation of the whole or a Substantial part of the Contents **into a new database** is a
Derivative Database". The unit is the database.

**Yes to `poi_index`, every row of every joined region.** Under the Horizontal Layers rule, once the
"eating places" Feature Type inside the `tlv` regional cut draws on both OSM and Overture, the
share-alike condition applies to that Feature Type — the Overture rows, not only the OSM strings.
`poi_regions` travels with it as its metadata. Practically: **the whole table, as it stands after
the join.**

Publishing the Overture half is legally possible — VERIFIED, CDLA-Permissive-2.0 §2.1: "A Data
Recipient may share Data, with or without modifications, so long as the Data Recipient makes
available the text of this agreement with the shared Data." No anti-sublicensing clause, no
share-alike. Apache-2.0 permits sublicensing with the NOTICE preserved. So both texts simply travel
with the dump (condition C2). *ASSUMED, with reasoning*: that carrying the CDLA notice alongside an
ODbL dump is compatible with §4.4(a)'s "only under the terms of this License" — a notice condition
is not a restriction on the rights ODbL grants (§4.7(a)), and §4.4(d) only bars adding Contents
"incompatible with the rights granted". Not verified against any authority; flagged rather than
smoothed over.

**No to `places`, `saved_places`, `sources`, `imports`, `auth.users` — but only because of one line
of code, and only if we keep it.** Two things hold that boundary:

- VERIFIED by reading the diff — `src/app/api/imports/confirm/route.ts:216` writes `altNames: []`
  when it builds the `places` row. No OSM string reaches `places` today. **That line stops being an
  optimisation and becomes a licence boundary**, and it needs a test that fails if it changes.
- The Substantial Guideline's own insubstantial example is our `places` table almost verbatim: "an
  extract of all the locations of **restaurants you have visited for a personal map to share with
  friends**". A user-driven, confirmed-one-at-a-time collection is non-systematic by construction.

**This boundary is already leaking in the uncommitted branch, and it is cheap to close.** P7: the
full `StoredResolvedPlace` — `altNames` included — is written into `extractions.candidates` and
returned by `/api/imports/probe`. Once `alt_names` is populated, OSM strings are cached per user and
served to browsers. That does two unwanted things at once: it puts OSM Contents into a user-owned
table (weakening the clean "the ODbL boundary is `poi_index`" line), and it makes every review
screen a Produced Work carrying OSM Contents, so §4.3's notice attaches to a surface that has no
attribution today. The fix is to drop `altNames` from `StoredResolvedPlaceSchema` and from the
response — the scorer needs aliases inside the adapter, and nothing downstream reads them
(`confirm` already discards them). Condition C4.

### 3.3 What we would have to publish

VERIFIED — ODbL §4.6, "Access to Derivative Databases":

> "If You Publicly Use a Derivative Database or a Produced Work from a Derivative Database, You must
> also offer to recipients … a copy in a machine readable form of: a. The entire Derivative Database;
> **or** b. A file containing all of the alterations made to the Database or the method of making the
> alterations to the Database (such as an algorithm), including any additional Contents … The
> Derivative Database (under a.) or alteration file (under b.) must be available … **free of charge
> if distributed over the internet**."

Option (a) — dump the whole joined `poi_index` — is the honest and simpler route for us: ~10,462
rows of public data, a few MB of CSV, and it is the option that does not require arguing about what
"alterations to the Database" means for a database that was conflated rather than edited. Option (b)
is only producible at all if we record which alias came from which OSM object, which is condition C3
anyway.

Plus, VERIFIED — Attribution Guidelines, "Databases"
([raw](raw/osmf-attribution-guidelines-2026-08-27.txt)):

> "You must include attribution to OpenStreetMap and either the text of the ODbL or a link to it as
> part of the database … in a location (such as a relevant directory) where users would be likely to
> look for it, such as a **readme file**, or within the data or metadata."

---

## 4. Q5 — privacy, RLS and the grant surface

**"OSM data is public POI data, not personal data" is correct about the venues and wrong about the
metadata.** Three corrections, one of which is a real condition.

1. **The POI content is not personal data.** Venue names, categories and coordinates of commercial
   premises are business information, already published by OSM under an open licence. Nothing in the
   alias join creates a profile, a location history or an identifier of a natural person. A venue
   named after its proprietor ("Yossi's Falafel") does not change that — it is a trading name that
   OSM already publishes. **No DPIA-class question, no new lawful-basis question, and Q4 (location
   privacy) in `06` §11 is untouched:** this path adds no user position anywhere.

2. **The extract metadata IS personal data, and the default tooling emits it.** VERIFIED, measured
   (P6): an Overpass query with `out meta` returns `uid` and `user` on every element — pseudonymous
   OSM account identifiers tied to real people's edit histories. Ingesting those would put third-party
   personal data into our database with no lawful basis, no retention policy, no subject-access route
   and no product need. It would also be a rectification problem we cannot solve, since we have no
   relationship with those data subjects. **Minimum fix, condition C6: extract a fixed whitelist —
   `name`, `name:en`, `name:he`, `osm_type`, `osm_id`, lat/lng — and never `out meta`.** Excluding
   `contact:*`, `phone`, `email`, `operator`, `website` and `opening_hours` at the same time keeps
   us inside the MVP boundary's five fields and off the same ground the Nominatim sign-off's
   condition 4 covers (`extratags=1` measured returning opening hours, payment methods and a
   `check_date`).

3. **Already committed, low severity, worth a line.** P9: `docs/evidence/places/overpass-coverage*.json`
   carry `contact:phone`, `contact:instagram` and `contact:linkedin` for a handful of venues in a
   public repo. Business contact details already published by OSM; 5 and 11 elements, well inside the
   insubstantial line; no `user`/`uid`. **Acceptable at university scale, documented** — but the tag
   whitelist in C6 should apply to evidence captures too, and `docs/evidence/places/README.md` should
   carry a one-line ODbL credit for those files and for `results-osm.csv` / `raw-osm.json`, since
   committing them to a public repo is a public use of geocoding results.

**RLS and grants: nothing changes, and I verified that rather than assuming it.** `poi_index` and
`poi_regions` have RLS `ENABLE`d and `FORCE`d with no policy at all and every grant revoked from
browser roles (`0010` §5). P3/P4 confirm by attack: both `anon` and `authenticated` get
`permission denied for table poi_index`. P5 confirms the only grantees are `postgres` and
`service_role`. **An alias migration must not change any of that** — no policy, no grant, no
`SECURITY DEFINER` reader (condition C7). The alias join needs zero new authority: the loader
already runs as `service_role`.

**One second-order risk worth naming.** A populated `alt_names` makes `poi_index` newly *worth*
exposing — a bilingual autocomplete over it is the obvious next feature. If that is ever built it
must stay a server route, authenticated and rate-limited, exactly as `0010` Q2 already ruled; a
direct browser grant would be both a rate-limit hole and, with OSM aliases in the column, an
unattributed public use of OSM Contents.

---

## 5. Q4 — the alternatives, measured

The task named three. There are five, and the two best ones were not on the list.

| | Option | Licence position | What it actually buys | Verdict |
|---|---|---|---|---|
| **(a)** | Store a **derived boolean or hash** instead of the OSM string | **No better.** ODbL's Derivative Database is "any translation, adaptation, arrangement, modification, **or any other alteration**". Hashing is an alteration of a Substantial extract, not an escape from one; and §4.6(b) contemplates publishing "the method of making the alterations … (such as an algorithm)" precisely so that hashing cannot launder a derivative | **Strictly less.** A hash only matches an exactly-normalised query, which kills the trigram prefilter and the Jaro-Winkler scoring that `score.ts` runs — the fuzzy matching is most of the resolver's value | **Rejected.** Pays the full licence cost and throws away the product benefit |
| **(b)** | Use OSM aliases **at query time without persisting them** | Clean, under the Geocoding Guideline safe harbour the Nominatim adapter already relies on | Fixes the *candidate* side, not the *index* side. A Nominatim call returns OSM's own coordinates; the bridge to the Overture row is a proximity re-query. Real, and bounded by ≤1 rps / ≤200 per day | **Viable as a fallback**, not as the fix |
| **(b″)** | **Lazy per-miss alias caching** — on a resolution miss, take *one* individual geocoding result and cache its name forms against the `poi_index` row that matches by proximity | **Clean, on the same safe harbour**, and it stays clean only while it stays non-systematic: user-driven, one venue at a time, growing where the product actually failed. VERIFIED — Geocoding Guideline permits storing results "either permanently or temporarily … together with the external data used for querying" | Grows exactly where it is needed instead of where the data happens to be. Needs per-row provenance (C3) so the accumulation is *measurable*, and a review the moment it looks like a sweep | **Recommended second** |
| **(c)** | **Don't use OSM at all**, live with 38% | Nothing owed | The measured failure stands: TLV-13 `הסביח של עובד` is in the index and unreachable from a Latin caption, and 6,699 rows share that shape | **Not acceptable as an endpoint**, acceptable as today's state while (e) is built |
| **(e)** | **Bilingual query expansion** — the extractor emits both the caption's string *and* its other-script form (translation, not only transliteration), and both are scored | **No OSM, no licence surface at all** | Attacks **all 6,699** Hebrew-named rows, not the 423 the join reaches. The measured baseline is honest about the hard part: a deterministic transliterator scored **47%** recall at 0.80 similarity, and the misses are *translations* (`קפה בכיכר` → "Cafe Sqare") — which is the one thing an LLM is actually better at than an algorithm. Folds into the existing extraction call, so no new spend against the 500/day ceiling | **Recommended first** |

Also named for completeness, not recommended: **Wikidata** carries `he`/`en` labels under **CC0**,
so a bulk join from it has no share-alike at all. *UNAVAILABLE* — coverage of independent cafés and
falafel stands was not measured, and is likely poor. Worth a one-hour count before anyone spends two
days on the ODbL path.

**Why (e) before (a).** The bulk join's headline — "OSM is 81% Latin-reachable against Overture's
38%" — is a fact about *OSM's own 2,742 rows*, not about our 10,462. The number that governs the
decision is the one measured on the join itself: **43% join rate, 423 Hebrew-only rows gained.** A
permanent obligation over the entire index, for 4% of the rows it is meant to fix, while a
zero-licence option addresses the other 96%, is the wrong trade in that order.

---

## 6. If it goes ahead anyway — the seven conditions

"Not without X." X is these, and every one is checkable in a diff. C1–C5 are **merge-blocking**;
C6–C7 are **merge-blocking and also privacy conditions**.

**C1 — Publish the derivative.** A machine-readable dump of every `poi_index` row in every joined
region, under **ODbL 1.0**, free over the internet, at a stable public URL, with a README carrying
the OSM credit and a link to the licence. Republished whenever the join is re-run. *ODbL §4.4(a),
§4.6; Attribution Guidelines "Databases".* **Nothing may be publicly deployed before this exists.**

**C2 — Carry the Overture terms with it.** The dump ships the CDLA-Permissive-2.0 text, the
Apache-2.0 text and the Foursquare NOTICE, because we are now redistributing Overture rows as data
rather than serving them through our API. *CDLA-Permissive-2.0 §2.1; Apache-2.0 §4.*

**C3 — Per-row alias provenance.** A migration recording which alias came from OSM and its
`osm_type`/`osm_id`. Two reasons, and the second is not optional: §4.6(b) is unproducible without it,
and **the existing tripwire does not catch this path** — see §3 above and P2. Add the corresponding
assertion to `supabase/tests/inventory.sql` in the same migration.

**C4 — Containment: no OSM string leaves `poi_index`.**
  - `confirm/route.ts`'s `altNames: []` becomes a licence boundary, with a test that fails if it changes.
  - Drop `altNames` from `StoredResolvedPlaceSchema` (`resolution-record.ts`) and from the
    `/api/imports/probe` response, so OSM strings stop being cached per user in
    `extractions.candidates` and stop reaching browsers (P7).
  - No OSM-derived value may be written to `places`, `saved_places`, `sources` or `imports`. This
    contradicts `place-alias-design.md`'s `places.alt_names` proposal **for OSM-sourced aliases
    only** — model- and user-derived aliases there are unaffected.

**C5 — Attribution, on our own surfaces.** §7 gives the literal strings. Includes rewriting `NOTICE`
§2, which currently asserts that OSM enters only through a per-row `source_dataset` — after the join
that is false, in the same way and for the same reason as C3.

**C6 — Ingest hygiene.** Extract a fixed whitelist: `name`, `name:en`, `name:he`, `osm_type`,
`osm_id`, lat, lng. **Never `out meta`** (VERIFIED: returns `uid`/`user`). Never `contact:*`,
`phone`, `email`, `operator`, `website`, `opening_hours`. No OSM contributor identifier may exist
anywhere in this repo or database. Prefer a Geofabrik regional `.osm.pbf` over repeated Overpass
sweeps — Overpass is a shared community service and a bbox sweep of every eating place is exactly
what its operators ask people not to do.

**C7 — No authority change.** The migration adds no policy, no grant and no `SECURITY DEFINER`
reader; `poi_index` stays `service_role`-only. It comes back to `security-privacy` for a diff review
and a re-run of P3/P4 before merge — `agent-guardrails.md` §5 item 20.

---

## 7. Q3 — attribution: surfaces and literal strings

VERIFIED — Attribution Guidelines: attribution must be to "**OpenStreetMap**"; must make clear the
data is under the ODbL, which "may be done by making the text 'OpenStreetMap' a link to
openstreetmap.org/copyright"; must be visible **without interaction**; and "© OpenStreetMap
contributors" is an acceptable historical form. VERIFIED — ODbL §4.3's own sufficient example:
"Contains information from DATABASE NAME, which is made available here under the Open Database
License (ODbL)."

**A carve-out we currently rely on disappears the moment the join lands.** VERIFIED — Attribution
Guidelines, "Geocoding (search)": "A group of geocoding results need not maintain attribution
attached to the results, **as long as it does not form a Derivative Database**." After the join it
does. Every surface that renders an index-derived name needs the credit.

| Surface | Required? | Literal string |
|---|---|---|
| **Map corner** (`map-surface.mapcn.tsx`) | **Yes.** And it must become **ours** — today the line arrives from CARTO's TileJSON and would vanish on a CARTO change or a renderer move | Set `customAttribution` explicitly to `© CARTO · © OpenStreetMap contributors`, with `OpenStreetMap` linked to `https://www.openstreetmap.org/copyright`. Owed with it: a test asserting the rendered map contains the literal `OpenStreetMap`, so a provider change fails CI instead of silently dropping the credit |
| **Place detail sheet**, for a place matched through the joined index | **Yes** (the geocoding carve-out no longer applies) | One line of small, always-visible secondary text: `Place data: Overture Maps · alternate names from OpenStreetMap (ODbL)`, linking to `/attributions`. One component with a `source_dataset` switch — the Apache-2.0 credit for Overture rows needs the same slot |
| **Import review screen** (the shortlist) | **Yes** — it shows index-derived names before they are places | At the foot of the candidate list: `Place names from Overture Maps and OpenStreetMap (ODbL)` → `/attributions` |
| **`/attributions`** | **Yes — this is where the database obligation lives** | `Our place index contains information from OpenStreetMap, which is made available under the Open Database License (ODbL) 1.0. Data © OpenStreetMap contributors. A machine-readable copy of the index is available at <URL>.` Links: `OpenStreetMap` → `https://www.openstreetmap.org/copyright`; `Open Database License` → `https://opendatacommons.org/licenses/odbl/1-0/` |
| **The published dump's README** (C1) | **Yes** | `This database contains information from OpenStreetMap, which is made available under the Open Database License (ODbL) 1.0. Data © OpenStreetMap contributors. It also contains data from Overture Maps, under CDLA-Permissive-2.0 and Apache-2.0; see NOTICE.` |
| **Repo `NOTICE` §2** | **Yes** | Rewrite: OSM no longer enters only via a per-row `source_dataset`; it is joined into the POI index, which is therefore an ODbL Derivative Database, published at `<URL>` |
| **Database rows** | **No** | Attribution need not be attached to rows; it attaches to the database and to the Produced Works |

### How much work X is

| Item | Estimate |
|---|---|
| C1 dump script + README + a stable public URL | ~0.5 day |
| C5 attribution surfaces + the map test | ~0.5 day (`/attributions` is already owed for Apache-2.0, so partly a shared cost) |
| C3 provenance migration + `inventory.sql` assertion | ~2 h |
| C4 containment: drop `altNames` from the stored/returned shape, plus two tests | ~2 h |
| C6 whitelisted ingest script | ~0.5 day (mostly the join itself, which is owed regardless) |
| **Standing** | Republish the dump on every re-join; keep the URL alive for as long as the app is public |

**≈2 days, plus a permanent obligation, for 423 rows.**

---

## 8. What is the owner's judgement, not mine

Three things are mine to rule and I have ruled them: the **legal character** of the join
(Derivative Database, §2), the **scope and trigger** of share-alike (§3), and the **conditions**
under which it may merge (§6, §7). None of those is a preference.

One thing is not mine.

> **Do we want to become an ODbL data publisher?** Condition C1 is not a task, it is a commitment:
> a public database offered under ODbL, kept available for as long as the product is public, with our
> name on it. It is entirely ordinary — thousands of projects do it — and at 10,462 rows of public
> data it is cheap. But it is a licensing commitment made in the owner's name, it is the kind of
> thing an examiner will ask about, and an agent's assent does not make it. **`working-agreement.md`
> §7: this is an owner decision.**

Framed as a choice, with the costs already measured:

- **Option A — do the licence-free work first (recommended).** Build (e), bilingual query expansion,
  measure it on the 20–30 real TikToks the handoff already asks for, then (b″) lazy per-miss alias
  caching if a gap remains. Cost: no licensing commitment, no publication, no standing obligation.
  Risk: neither may close the gap, and we will have spent the time.
- **Option B — take the ODbL path now.** Accept §6's seven conditions and become a data publisher.
  Cost: ~2 days plus the standing obligation. Buys a measured 423 rows today, and — the fair
  argument for it — a genuinely better bilingual index later if the join is improved beyond its
  current 43%.
- **Option C — do nothing.** 38% Latin-reachable stands, TLV-13 stays broken, and the product's
  weakest city stays weakest. Not recommended as an endpoint; acceptable for the next increment,
  because §3.1 means nothing is owed until we ship the join.

**Recommendation: A, then re-ask.** The licensing answer does not change with time; the measurement
does. If (e) and (b″) land the auto-match rate the owner is actually asking for, B never needs
deciding. If they do not, B is available, priced, and its conditions are written down.

One thing to state plainly, because it is easy to misread the sequencing: **nothing here is a breach
today.** `alt_names` is empty in every environment (P1), no OSM string has ever entered `poi_index`,
the committed evidence captures are insubstantial (P9), and §4.5(c) means the measurements already
taken — private, internal, unpublished — owed nothing when they were taken.

---

## 9. Claims, labelled

| Claim | Label | Evidence |
|---|---|---|
| A systematic extraction of all eating places within a city-sized area is Substantial under ODbL | **VERIFIED** | OSMF *Substantial - Guideline*, endorsed 2014-06-06 — [raw](raw/osmf-guideline-substantial-2026-08-27.txt) |
| Repeated small extractions are treated as one big extraction | **VERIFIED** | Same |
| Complementing a proprietary restaurant list with corresponding OSM data is **not** a Collective Database, and may expose the proprietary data to share-alike | **VERIFIED** | OSMF *Collective Database Guideline*, endorsed 2016-06-17, final example — [raw](raw/osmf-guideline-collective-2026-08-27.txt) |
| Adding non-OSM features "based on comparison with OpenStreetMap data" requires sharing | **VERIFIED** | OSMF *Horizontal Map Layers - Guideline*, endorsed 2014-06-06 — [raw](raw/osmf-guideline-horizontal-2026-08-27.txt) |
| The trivial-transformation carve-out applies only where "no other source of data is involved" | **VERIFIED** | OSMF *Trivial Transformations - Guideline* — [raw](raw/osmf-guideline-trivial-2026-08-27.txt) |
| A result "intended for the extraction of the original data" is a database, not a Produced Work; publishing a Produced Work requires publishing the underlying database | **VERIFIED** | OSMF *Produced Work - Guideline* — [raw](raw/osmf-guideline-produced-2026-08-27.txt) |
| Share-alike is triggered by Publicly Using a Produced Work made from a Derivative Database — not by Conveying | **VERIFIED** | ODbL 1.0 §4.4(c); "Convey" in §1.0 — [raw](raw/odbl-1-0-definitions-and-s4-2026-08-27.txt) |
| Internal use within an organisation is not public use | **VERIFIED** | ODbL 1.0 §4.5(c) — same |
| §4.6 requires offering the entire Derivative Database **or** an alterations file, free over the internet | **VERIFIED** | ODbL 1.0 §4.6 — same |
| A Derivative Database must carry an OSM credit and the ODbL text or a link, in a readme or the metadata | **VERIFIED** | Attribution Guidelines, "Databases" — [raw](raw/osmf-attribution-guidelines-2026-08-27.txt) |
| The "geocoding results need not carry attribution" carve-out is conditioned on not forming a Derivative Database | **VERIFIED** | Attribution Guidelines, "Geocoding (search)" — same |
| "© OpenStreetMap contributors" is acceptable; the ODbL must be made clear, e.g. by linking to `/copyright` | **VERIFIED** | Attribution Guidelines, "Attribution text" — same |
| CDLA-Permissive-2.0 permits sharing modified Data provided the agreement text travels with it, and imposes no share-alike | **VERIFIED** | `https://cdla.dev/permissive-2-0/` §1.1, §2.1, fetched 2026-08-27 |
| Carrying the CDLA notice alongside an ODbL-licensed dump satisfies §4.4(a) | **ASSUMED, with reasoning** | §3.2. No authority found either way; a notice condition is not a restriction on ODbL's granted rights (§4.7(a), §4.4(d)) |
| Overpass `out meta` returns OSM contributor `uid` and `user` per element | **VERIFIED, measured** | P6, one live query, 3 nodes, 2026-08-27. No identifier value is recorded in this repo |
| `poi_index` holds 10,462 rows, 6,699 Hebrew-named, 0 with `alt_names` | **VERIFIED, measured** | P1, `supabase_db_P-002`, 2026-08-27 |
| The `source_dataset` CHECK does **not** prevent ODbL content entering `poi_index` via `alt_names` | **VERIFIED, measured by attack** | P2, rolled back |
| `anon` and `authenticated` cannot read `poi_index`; the only grantees are `postgres` and `service_role` | **VERIFIED, measured by attack** | P3, P4, P5 |
| The uncommitted resolver persists and returns `altNames` to the browser via `extractions.candidates` | **VERIFIED, read from the diff** | P7 — `place-resolver.ts:227,458`, `resolution-record.ts:66`, `probe/route.ts` response |
| `confirm/route.ts` writes `altNames: []`, so no OSM string reaches `places` today | **VERIFIED, read from the diff** | P7 — `confirm/route.ts:216` |
| Committed Overpass captures carry no contributor metadata, and 5/11 elements each | **VERIFIED, measured** | P9 |
| The OSM alias join lands 423 Hebrew-only rows at a 43% join rate | **VERIFIED, by another agent** | `handoff-2026-08-27-place-recognition.md` §4. Not re-derived, as instructed |
| Deterministic Hebrew→Latin transliteration recalls 47% at 0.80 similarity | **VERIFIED, by another agent** | Same |
| Wikidata (CC0) coverage of independent Tel Aviv food venues | **UNAVAILABLE** | Not measured. Worth an hour before choosing Option B |
| Geofabrik `.osm.pbf` extracts are a lower-impact bulk route than repeated Overpass sweeps | **ASSUMED** | Standard practice; no terms page was fetched for this task |

---

## 10. Re-opens when

- The join is proposed again with a materially better measured join rate than 43%.
- Any code writes an OSM-derived string outside `poi_index` (C4).
- `poi_index` gains a policy, a grant to a browser role, or a `SECURITY DEFINER` reader (C7).
- A bilingual autocomplete over `poi_index` is proposed (§4).
- Wikidata or another CC0 alias source is measured — that would change Option A's shape, not this
  ruling.

# Place aliases — cross-script duplicate `places` rows

> Written 2026-08-27 by `supabase-database` as part of `RICH-EXT-T2`, and deliberately **not**
> implemented in that task: the owner scoped aliases out on the day, because they reach
> `resolve_place`, the near-duplicate guard and the identity rules, which is a different concern from
> "make what we extract useful and organised". This is the design, the evidence, and what to verify
> first, so a fresh session can implement it without re-deriving any of it.
>
> **Nothing in migration `0019` implements any part of this.** There is no half-built alias
> mechanism in the tree.

## 1. This is a live defect, not an idea

`places.name` stores whatever script the model happened to pick out of the caption, and there is no
alias column anywhere. Two users saving the same Tel Aviv venue — one from a Hebrew caption, one from
an English one — get **two `places` rows that nothing will ever merge**.

`resolve_place`'s near-duplicate guard (`0007`, step 2) matches on `place_name_key(name)` plus country
plus a 75 m radius. It cannot match `הסביח של עובד` against `Ovad's Sabich`, because the two names
share no characters.

That breaks **charter invariant 4** — one physical place, many people, many TikToks — today. It is
the same class as the NULL `country_code` defect already recorded in `current-state.md` §3.2, which
also defeats the same guard, and it gets worse as Tel Aviv and Tokyo content lands.

**Scope, set by the owner on 2026-08-27: Hebrew ↔ English is the supported case.** Other scripts are
best-effort. If Japanese aliases land in the same field for free, fine — but no per-script branching
and no ICU dependency. This must not become a generic entity-resolution project.

## 2. The normalisation limit, measured — read this before proposing a normalisation fix

There is exactly one `normalise()` in this repo (`src/domain/places/normalise.ts`) and it is the
answer to "are these the same text?". It **cannot bridge scripts, and no change to it could.**

```
normalise('הקוסם')            = 'הקוסם'            normalise('HaKosem') = 'hakosem'   → not equal
normalise('猿田彦珈琲')        = '猿田彦珈琲'         normalise('Sarutahiko Coffee')     → not equal
normalise('Café Levinsky 41') = 'cafe levinsky 41' == normalise('Cafe Levinsky 41')    → equal
```

That is correct behaviour, not a bug: `normalise()` deliberately preserves Hebrew and CJK, and the
file carries a long comment explaining that a literal port of the Python prototype's `\w` would have
stripped every Hebrew and Japanese character and failed as silent coverage loss.

The SQL side is worse than the TypeScript side, and this was measured on the local container
(PG 17.6, `en_US.UTF-8`):

| input | `place_name_key()` |
|---|---|
| `הסביח של עובד` | `הסביחשלעובד` |
| `Ovad's Sabich` | `ovadssabich` |
| `ラーメン二郎` | `ラーメン二郎` |
| `Café Florentin` | `caféflorentin` |

Note the last row: **`place_name_key` does not fold accents either**, because `unaccent()` is not
`IMMUTABLE` and `place_name_key` backs a stored generated column. So `Café Florentin` and
`Cafe Florentin` are *already* two dedup keys today — a smaller, same-shaped defect hiding behind the
cross-script one, and worth fixing in the same change (see §5).

**The conclusion to write down:** the only thing that can produce a cross-script match is an explicit
stored alias, and the only thing that can produce that alias is the model. There is no normalisation
fix. Do not go looking for one.

## 3. Ruling: aliases belong on `places`

This is the opposite answer to the one `0019` gives for `tags` / `why_go` / `dishes`, and the contrast
is the point rather than an inconsistency.

- A **tag** is a claim one creator made in one video: per-recommendation, per-user, privacy-sensitive
  because `places` is readable by every user who saved the same venue (`places_select_if_saved`). It
  lives on `saved_places`.
- An **alias** is the venue's own name in another script. It is a property of the physical place, it
  is what dedup has to consult, and dedup is inherently global. It lives on `places`.

**The privacy delta for aliases is nil**, which is what makes this comfortable: `resolve_place`
already overwrites `places.name` from whoever resolved last, so user B *already* sees a venue name
derived from user A's import. An alias adds no new class of exposure. (A tag would.)

## 4. Shape: two columns on `places`, not a `place_names` table

I initially reached for a `place_names` child table with per-alias provenance, a script tag and a
`name_kind` enum, on the reasoning that `place_provider_refs` sets exactly that precedent. **The
owner's prior — the simple shape wins at this scale — is correct, and I withdraw the table.** At
hundreds of places per user with at most a handful of names each, a table buys per-alias provenance
and nothing else, at the cost of a new RLS surface (enable + force + revoke + policies), a
`merge_places` change, and a join.

```sql
alter table public.places
  add column alt_names  text[],                     -- verbatim, display + evidence
  add column match_keys text[]
    generated always as (public.place_match_keys(name, alt_names)) stored;

create index places_match_keys_gin on public.places using gin (match_keys);
```

with one new `IMMUTABLE` function:

```sql
-- place_alias_key(text): NFKC -> NFD -> strip combining marks -> lower -> strip non-alphanumeric
-- place_match_keys(name text, alt text[]): the DISTINCT set of keys for every known name,
--   including the primary `name`, empty result => NULL
```

Two things this buys that a bare `alt_names text[]` would not:

1. **`match_keys` includes the primary name's key**, so the dedup probe is one GIN lookup covering
   every name a place is known by, rather than two probes against two different columns.
2. **The key is better than `place_name_key`.** `NFD` + combining-mark strip is `IMMUTABLE` and was
   measured on the container to fold *both* Latin accents (`Café` → `Cafe`) *and* Hebrew niqqud
   (`שָׁלוֹם` → `שלום`); `NFKC` folds halfwidth kana (`ﾗｰﾒﾝ` → `ラーメン`). All three are real, all three
   are free, and none of them needs `unaccent`.

Because `match_keys` is generated, existing rows acquire their primary-name key on the table rewrite
with **no backfill of any alias data** — nothing is invented, and the accent-folding improvement
applies to the 20 existing rows immediately. That is not the backfill the owner ruled out; the ruled-out
backfill is re-extracting old rows to obtain aliases, and that stays out.

Bounds: at most ~6 `alt_names`, each ≤ 200 characters (matching `places.name`), no NULL elements, no
duplicate keys — the same CHECK + `IMMUTABLE`-predicate-function pattern `0019` uses for `tags`, which
is already in the tree and can be copied.

## 5. Should `resolve_place`'s guard consult aliases? Yes — but only for **exact key equality**

The instruction is right and I would hold to it hard: **merging two distinct venues is worse than
failing to merge one.** A false merge moves other users' `saved_places` rows onto a venue they never
saved and leaves a permanent tombstone; a missed merge is untidy.

Where I set the line:

**In scope for the database guard — exact key match, no fuzziness.** Add one step after the existing
step 2:

```sql
-- step 2b: any known name of an existing place matches any known name of the incoming candidate
if v_place_id is null and p_country_code is not null then
  select pl.id into v_place_id
    from places pl
   where pl.merged_into_place_id is null
     and pl.match_keys && v_incoming_keys          -- GIN, exact keys only
     and pl.country_code = p_country_code          -- NOT NULL and equal; see below
     and pl.lat between p_lat - v_dlat and p_lat + v_dlat
     and pl.lng between p_lng - v_dlng and p_lng + v_dlng
     and public.km_between(pl.lat, pl.lng, p_lat, p_lng) <= c_merge_radius_km
   order by public.km_between(pl.lat, pl.lng, p_lat, p_lng)
   limit 1;
end if;
```

This step is **no less conservative than the primary-name step already in production**: same 75 m,
same country, same exactness. It is in fact *stricter*, because it requires `country_code` to be
non-NULL and equal, rather than the existing `is not distinct from` — which is precisely the
NULL-matches-NULL behaviour that `current-state.md` §3.2 records as a live dedup defect. Do not
propagate `is not distinct from` into the new path.

What this fixes, and it is the owner's first named case: `HaKosem` and `Ha Kosem` both key to
`hakosem` once non-alphanumerics are stripped, so **they match with no fuzziness at all**. And
`הקוסם` matches `HaKosem` whenever the model emitted both forms on either side.

**Out of scope for the database guard, permanently: fuzzy matching.** `Ha Kosem` and `HaKesem` are
one edit apart and need not be the same place. Transliteration from Hebrew is unstable because Hebrew
omits most vowels, so one venue has several plausible Latin spellings and the model will not be
consistent between runs — and `Ovad's Sabich` vs `Sabich Ovad` from two runs produces two different
keys with no edit distance small enough to be safe. `pg_trgm` is installed and it would be easy to
reach for `similarity() > 0.6` here. **Do not.** A similarity threshold inside `resolve_place` turns
the schema's most dangerous function into a heuristic that mints cross-user data corruption, and no
threshold exists that separates `Cafe Nordoy` from `Cafe Noga` 40 m apart in Tel Aviv.

**Where the fuzzy half belongs instead:** the resolver, at the application layer, where the machinery
already exists and is already benchmarked — `domain/places/normalise.ts` plus the ported scorer, its
generic-token set, and the 44-case golden file. That layer produces a *score*, can be tuned against a
benchmark, and its mistakes are recoverable because it decides what to *propose*, not what to merge.
The database's guard should stay a boolean last-resort net.

So the honest summary is: **the database closes the stable half of the gap and should not attempt the
unstable half.** If the implementer disagrees and wants no alias step in `resolve_place` at all —
aliases stored for display and for application-layer matching only — that is a defensible position and
costs only the `HaKosem`/`Ha Kosem` case.

## 6. What `resolve_place` needs, and the two traps in changing it

Two new parameters, both defaulted so existing call sites keep working:

```sql
p_alt_names text[] default null    -- other names for this venue, from the caption and/or the model
```

(One array, not two. I considered splitting observed-vs-model-derived so the guard could refuse
model↔model matches; at this scope that is a distinction without a use, since exact key equality plus
75 m plus country is already doing the work.)

**Trap 1 — the PUBLIC EXECUTE regression, which this repo has now shipped twice.** A new parameter
means a new signature, so the 15-argument form must be dropped and a 16-argument one created.
Postgres grants `EXECUTE` on every newly created function to `PUBLIC`, and `revoke ... from anon` does
**not** remove a privilege held through `PUBLIC`. That is `0009`'s bug, and then `0018`'s bug, both
recorded. Write `revoke all on function ... from public, anon, authenticated;` and then grant back to
`service_role` alone.

**Trap 2 — `inventory.sql` check 6b asserts `resolve_place`'s argument list positionally, by name and
type**, and bans overloads outright in `public`. That check exists because `0010`/`0011` once left two
`resolve_place` signatures in place and every 12-argument call started failing at run time with
`42725` — in the import path, not in CI. Update check 6b's expected string in the same change, and
make sure the drop-and-create leaves exactly one `resolve_place`.

Also: `resolve_place` must record the incoming names on all three of its branches (alias match,
near-duplicate match, new place), otherwise the second import contributes nothing.

## 7. What is deliberately left out

- **No backfill and no merging of existing rows.** `current-state.md` §3.6 records four duplicate
  places created by earlier testing. Merging them is a data decision for the owner, not a migration.
- **`merge_places` does not union `alt_names`.** It has no caller today. When it acquires one, the
  loser's names must be unioned into the winner or they become unreachable — the guard filters
  `merged_into_place_id is null`. Three lines, and a required follow-up rather than an optional one.
- **No `script` or `lang` column, no script detection, no resolution order.** Per the owner's scope
  narrowing.
- **No client grant on either column.** `places` uses closed `SELECT` column lists (`0012`/`0015`), so
  both arrive ungranted by default. `alt_names` could later be granted for an "also known as" line on
  the place card; `match_keys` never should be — it is an internal join key, the same class as
  `name_key` and `source_dataset_id`.

## 8. What to verify first, in order

1. **The two named cases, end to end, on the local container.** `הקוסם` / `HaKosem` / `Ha Kosem`, and
   `הסביח של עובד` / `Ovad's Sabich`. Assert one `places` row and two `place_provider_refs` rows.
2. **The false-positive case, deliberately constructed.** Two genuinely different venues, same
   country, 40 m apart, whose names key identically through one side's alias. Confirm it *does* merge
   — then decide, with that in front of you, whether 75 m is still the right radius for the alias
   path. This is the assertion that tells the truth about the risk; skipping it is how a clever rule
   ships.
3. **`Sabich Ovad` vs `Ovad's Sabich`.** Assert it does **not** match, and write that down as the
   accepted limit rather than as a bug. Unstable transliteration is not solved here.
4. **The accent case as a free win:** `Café Florentin` and `Cafe Florentin` should now resolve to one
   row where today they do not.
5. `inventory.sql` check 6b, and `has_function_privilege('anon', 'public.resolve_place(...)')` = false
   after the signature change.
6. `npm run check:migrations` and `npm run check:schema`.

## 9. Evidence

Everything measured in §2 was run against the local container on 2026-08-27:
PostgreSQL 17.6, `datcollate`/`datctype` = `en_US.UTF-8`, `datlocprovider` = `i`; `normalize()` is
`provolatile = 'i'` (IMMUTABLE), so `NFKC`/`NFD` are legal in a generated column, a CHECK and an
index. The `normalise()` results in §2 were produced by the orchestrator independently.

# Name aliases — what the extraction side learned before the field was cut

RICH-EXT-T1, 2026-08-27. The `nameAliases` field was designed, built into schema v2, and then
removed on the owner's ruling (it reaches place identity, `resolve_place` and the dedup guard,
which is a separate workstream). This is what is worth keeping.

## Honest limit on this note

**No model call ever ran with the alias field in the schema.** The field was in the schema for
about twenty minutes, during which every request to `gemini-3.5-flash-lite` was rejected at
schema validation (HTTP 400, see below), so there is **zero measured evidence about whether the
model produces good Hebrew↔English aliases, invents them, or refuses**. Everything below is
design reasoning and one hard measurement about the *schema*, not about model behaviour. Do not
read it as a negative result about aliases — the experiment did not happen.

## The design that was cut, and would be the starting point

```ts
nameAliases: z.array(z.object({
  name: z.string().min(2).max(120),
  // Reuses FieldProvenance's own vocabulary rather than inventing a second one.
  //  caption_inference — the model rendered the caption's OWN name in the other language/script
  //                      (הקוסם -> HaKosem). Anchored to a string we already hold.
  //  world_knowledge   — the model recalls this venue is separately known by that name
  //                      (הסביח של עובד -> Ovad's Sabich). Unverified recall, same class as
  //                      identifiedName and coordinates.
  basis: z.enum(['caption_inference', 'world_knowledge']),
})).max(4)   // trimmed to 2 in grounding.ts
```

Three things about it that survived several rounds of narrowing and are probably still right:

1. **The provenance split is the whole value of the field.** An alias derived from the caption's
   own name is a transformation of a string we hold; an alias recalled from world knowledge is the
   same kind of claim as a guessed coordinate. A consumer that wants only the safe subset must be
   able to ask for it. One field, two values, no new vocabulary.
2. **Aliases must never touch identity.** `llm-guess-place-id.ts` keys on `rawName` precisely
   because it is stable across runs; an alias is a model output and is not. Aliases are for
   *matching* (an extra query string, a merge hint that still wants corroboration) and *display*.
   A wrong alias is more dangerous than a wrong `identifiedName` because its entire purpose is to
   make two rows look like one place.
3. **`normalise()` is the wrong key for an alias.** A Hebrew name has no written vowels, so the
   Latin rendering of `הקוסם` is `HaKosem` one run and `Ha Kosem` the next — `normalise()` keeps
   those apart (`hakosem` vs `ha kosem`). The fix that was written and then removed was one line:

   ```ts
   const nameMatchKey = (s: string) => normalise(s).replace(/ /g, '');
   ```

   Space-insensitive, so `HaKosem`/`Hakosem`/`Ha Kosem` all fold to `hakosem`. It also folds
   `Kiaans`/`Kiaan's` for free. It must **not** become a change to `normalise()` itself — that
   would move `poi_index.name_norm` for the whole POI index and force a `NORM_VERSION` bump and a
   reload, for a problem that only exists between two spellings of one alias.

## The one hard measurement: Gemini's schema-size ceiling

This is the finding most likely to bite whoever picks the workstream up, and it is not about
aliases specifically — it is about **adding any field at all**.

`gemini-3.5-flash-lite` rejects a `responseSchema` it considers too large with a bare
`400 INVALID_ARGUMENT` and **no indication of which part it disliked**. Bisected live:

| schema | result |
|---|---|
| v1 item (9 properties), `candidates.maxItems: 12` | 200 |
| v2 item (13 properties), `candidates.maxItems: 12 / 11 / 10 / 9` | **400** |
| v2 item (13 properties), `candidates.maxItems: 8` | 200 |
| v2 item + `nameAliases` (14 properties, one of them an array of objects), `maxItems: 12` | **400** |
| nested array `maxItems` above 5 (`tags` at 8 or 10) | **400** |

Removing the nested arrays' `maxItems`, flattening `whyGo` into two sibling strings, and stripping
every `minLength`/`maxLength`/`minimum`/`maximum` each changed nothing. The limit behaves like a
budget over *(root array length × item complexity)*, and the root `candidates.maxItems` is the only
lever that moves it. `GEMINI_MAX_CANDIDATES` is now 8 for that reason.

**Implication for the alias workstream:** adding `nameAliases` back is not free at the schema
level. It is an array of objects inside the candidate item, which is the most expensive shape
there is, and it will likely force `candidates.maxItems` down again — possibly below
`MAX_CANDIDATES = 7`, at which point a caption naming seven venues starts losing real places.
Budget one bisection run for it, and consider whether the alias belongs in a **second, cheaper
call** (name in, alias out) rather than in the per-candidate item at all. That second-call shape
would also make the alias independently cacheable per venue instead of per source, which fits the
"one physical place, many TikToks" invariant better than the extraction row does.

## What to measure first when the workstream starts

Nothing here was measured, so the first experiment is cheap and obvious: take the four cached
captions plus a genuinely Hebrew one, ask the model for the alias in isolation, and check three
things —

1. Does it return `[]` for a venue it does not know, or does it transliterate speculatively? (The
   invented-alias failure mode is the one that matters; a wrong alias merges two real venues.)
2. Is the Latin rendering stable across three runs of the same input, once folded through
   `nameMatchKey`?
3. For `הסביח של עובד`, does it produce the OSM `name:en` (`Ovad's Sabich`) or something else? A
   gazetteer already holds `name:en`/`name:he` as *data* — if the model's recall is worse than a
   lookup, the alias belongs in the resolver and not in the extraction at all.

My own view, recorded because it was asked for: the caption-derived half (rendering the caption's
own name in the other language) belongs in extraction, because the caption is the only place that
string exists and the model is already reading it. The world-knowledge half belongs in the
resolver, because OSM and Overture both carry per-language names as verifiable data and taking it
from an authority beats taking it from model recall.

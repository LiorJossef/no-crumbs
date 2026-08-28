# Production resolves through an empty index — the third gate, and it is a decision

Traced by the orchestrator on 2026-08-28 against `src/integrations/places/place-resolver-factory.ts`
and the measured hosted migration state in `hosted-migration-state-2026-08-28.md`.

## The finding

`resolverProviderFor()` decides the provider like this (lines 80–103):

1. an explicit `PLACE_RESOLVER=google|overture` wins;
2. otherwise, if `NEXT_PUBLIC_STAGE` is **not** one of `local`, `preview`, `staging`, `test`, the
   provider is **`overture`**, with the reason *"Google Places may not be paired with a non-Google
   map (06 §3.1)"*. An unset or unknown stage counts as production, deliberately;
3. only then is the Google API key even consulted.

So on production, **`GOOGLE_PLACES_API_KEY` is never read**. Setting it changes nothing.

Production's `poi_index` is empty. Production is in fact at migration `0009`, so `poi_index` does
not yet exist at all — `0010` creates it.

**Therefore: with the Vercel env store fully restored and all fourteen migrations pushed,
production would still resolve every candidate against an empty Overture index and return
`no_match` for all of them.** The owner's ~100-TikTok batch would persist ~100 `llm_guess` rows —
the model's own coordinates, measured 65–470 m out and drifting a median 327 m between two runs of
the same caption — permanently, into the one database with no point-in-time recovery.

This is a **third gate**, independent of the two already on record (the empty Vercel env store, and
the migration gap). Opening those two does not open this one.

## Why it is a decision and not a bug

The gate is not an oversight. It encodes `06-map-and-places-decision.md` §3.1, VERIFIED: Google
Places content may not be used in conjunction with a non-Google map. Our renderer is MapLibre +
Protomaps. The comment says the reasoning outright — *"failing safe toward the compliant pairing
costs a measurement; failing open costs a terms breach"* — and the gate lives in code rather than
in prose because a documented-only gate is one refactor from gone.

The owner's 2026-08-28 ruling made Google the canonical resolver and dropped Overture entirely.
That ruling and this gate are in direct contradiction, and the contradiction is not resolvable by
editing either one: it needs the underlying compliance question answered.

Two further facts bear on it, both from `google-places-persistence-tos-2026-08-28.md`:

- **Our citations are stale.** Google renumbered the Service Specific Terms. Places API is now
  **§14**; every repo reference to §5.3 means §14.2, and §5.4 means §14.3. The substance is
  unchanged, but nothing should be re-argued off the old numbering.
- **We are already accumulating Google content past 30 days.** The 30-day cache limit is enforced
  by `place_lookup_put` and nowhere else; `places` and `extractions.candidates` hold Google names,
  addresses and coordinates with no TTL, no CHECK and no refresh, and `PLACE_RESOLVER` defaults to
  Google in local, preview and staging.

## The three ways out, none of which is mine to pick

1. **The pairing is permitted** on a reading of §14.2 that the current gate is being
   over-cautious about — remove the gate, production resolves through Google.
2. **The pairing is not permitted** — the renderer moves to Google Maps before production can
   resolve through Google. That is a large piece of work and it is not on the L1 path.
3. **Neither yet** — production runs the honest degraded path (`llm_guess`, approximate,
   upgradeable) knowingly, and the batch is imported understanding that its coordinates are
   provisional until the pairing question is settled and the rows are upgraded.

Option 3 is only tolerable because the degraded path is being built to make those rows
*upgradeable* rather than permanent. It is still a deliberate choice to write ~100 approximate rows
into production, and it should be made rather than arrived at.

## Status

Referred to `security-privacy`, which holds the veto on data exposure and already owns the
persistence/ToS evidence. Nothing has been changed in the factory. Nothing has been pushed to any
hosted project.

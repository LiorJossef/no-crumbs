# Vercel egress + execution-model probe (NOT YET RUN — blocked on credentials)

Throwaway. No secrets, no database, no user data. Delete the Vercel project once the evidence JSON
is committed.

Answers three questions:

| Probe | Question | Owner |
|---|---|---|
| P1 `/api/probe/oembed` | Does TikTok oEmbed work from Vercel egress IPs, on all 16 URLs, with identical captions? | social-integration (`docs/04` §6 GO/NO-GO gate) |
| P2 `/api/probe/burst?n=200` | Is there a per-IP quota on a shared Vercel egress IP? Any 429 / `retry-after` / run of 400s? | social-integration |
| P3 `/api/probe/stream` | Does a Node Route Handler stream NDJSON **incrementally**, and does a **30 s handler complete on Hobby**? | nextjs-architect (`docs/07` §2, DOCUMENTED → VERIFIED) |

Non-buffering is asserted **client-side**: each line carries the server emit offset, `run-probe.mjs`
records the arrival offset. Buffered means every line lands together at ~30 s. If the unpadded run
shows buffering, the runner automatically retries with 2 KB padding — if padding fixes it, the cause
is an intermediary buffer threshold, and that is itself the finding to report.

## Run

```
cd docs/evidence/vercel/probe
npm install
npx vercel deploy --prod                 # requires a Vercel login (see BLOCKER below)
node run-probe.mjs https://<deployment>.vercel.app iad1
```

Then force the second region and re-run:

```
# set the project's function region to fra1 in Project Settings → Functions, redeploy, then
node run-probe.mjs https://<deployment>.vercel.app fra1
```

Commit `07a-stream-and-duration-probe.iad1.json` and `...fra1.json` next to this README, and update
`docs/evidence/tiktok/06-datacenter-ip.md` and `docs/07-import-execution-model.md` §2 from
DOCUMENTED to VERIFIED (or record the failure).

## BLOCKER

Not run. This machine has **no Vercel CLI, no `~/.vercel` or `~/.local/share/com.vercel.cli`
credentials, no `VERCEL_TOKEN`, and no linked project**. I did not attempt to authenticate to any
account. See the handoff note in the agent report for exactly what is needed.

## Expected results, so a failure is recognisable

- P1: `ok=16/16`, `p90` in the 400–900 ms range, `author`/`videoId`/`titleLen` matching
  `docs/evidence/tiktok/oembed-set1-raw.json` — in particular `titleLen=1229` for
  `7346702347491446049` and `author=gadderhq` for the `@gadderapp` URL.
- P2: `counts={"200":200}`, `firstNon200Index=-1`.
- P3: `firstTickClientMs≈2000` (**not** ≈30000), `tickGapsMs` all ≈2000, `completed=true`,
  `totalMs≈30000`.

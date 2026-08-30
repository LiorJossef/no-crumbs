# Ruling — how much may a public `/healthz` disclose?

> `security-privacy`, VERCEL-FIX-3, 2026-08-29. **Advisory**: no file under `src/` was touched.
> Scope: `src/app/healthz/route.ts`, `src/domain/build-info.ts`, and a sweep for equivalent
> configuration leaks elsewhere in the app.
>
> **Verdict up front: APPROVED, with two carve-outs that are veto triggers.** Naming a missing
> required environment variable in a public health response is an acceptable exposure for this
> app. Naming a *value*, a prefix, a length or a hash is not, and neither is deriving the name
> list by iterating `process.env`.

## 0. The fact that decides most of this: the repo is PRIVATE

```
$ gh repo view --json visibility,isPrivate,url
{"isPrivate":true,"visibility":"PRIVATE","url":"https://github.com/LiorJossef/P-002"}
```

**VERIFIED, 2026-08-29.** Checked rather than assumed, as instructed. Two arguments in the brief
turn on it and they turn in opposite directions:

- "the attacker could read this repo anyway" is **false**. It is not a defence for disclosing
  variable names. The names have to stand on their own merits, and below they do — but not for
  that reason.
- "a commit SHA plus a public repo is a precise pointer to the running source" is **also false
  today**. §3 keeps the SHA, and records the exact event that would reopen it.

This is coursework heading for submission. **Repo visibility is now a security-relevant setting,
not an administrative one.** If it is ever flipped to public, §3 and finding L4 both change
answer, and a git-history secret scan becomes a prerequisite — a much larger job than this task.

## 1. Live evidence: what an unauthenticated attacker gets from production right now

```
$ GET https://p-002-zeta.vercel.app/healthz
200  {"ok":true,"stage":"production","commit":"44f0737"}

$ GET https://p-002-zeta.vercel.app/map
500
```

**VERIFIED, 2026-08-29, unauthenticated, from outside.** The endpoint reports `ok:true` and a 200
while the two pages that need configuration are dead. This is the incident, reproduced. `/healthz`
is not merely uninformative — it is actively *wrong*, and an uptime monitor pointed at it is worse
than no monitor, because it manufactures confidence.

Local, for the response-header baseline:

```
$ curl -D - http://127.0.0.1:3000/healthz
HTTP/1.1 200 OK
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: frame-ancestors 'none'
Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=(), interest-cohort=()
cache-control: no-store
{"ok":true,"stage":"local","commit":"dev"}
```

`no-store` is already correct and must stay: a cached health response is a stale health response.

## 2. Question 1 — may the response name a missing environment variable? **Yes.**

### What the attacker actually learns

Given `{"missing":["SUPABASE_SERVICE_ROLE_KEY"]}`, an attacker learns three things:

1. **That this deployment uses Supabase.** Worth nothing — it is already public. The browser bundle
   ships `@supabase/supabase-js`; `/sign-in` is a Supabase Auth form; when the app is configured
   at all, the session cookie is literally named `sb-<project-ref>-auth-token` and the project
   hostname is inlined in the bundle by design (`.env.example`: *"Public: safe in the browser.
   Authorisation is RLS, not secrecy of this key."*).
2. **That a specific subsystem is unconfigured right now.** This is real information and it is the
   only genuinely new thing on the list. It is a *liveness oracle over a defect window*: an
   attacker polling `/healthz` sees the exact second a variable lands or is rotated. It confers no
   access. It is also information the attacker already has, more cheaply, by watching `/map`
   return 500 — which they can do today and which is how this outage was eventually noticed.
3. **Which LLM vendor is configured**, implicitly, if the missing name is `ANTHROPIC_API_KEY`
   rather than `GEMINI_API_KEY`. This is the one item with a plausible follow-on: caption-borne
   prompt injection is a real surface in this app (guardrail 12), and injection payloads are
   somewhat vendor-shaped. It leaks only while the deployment is broken, and the vendor is
   guessable regardless. **Acceptable at university scale, documented** — not a must-fix.

### What they can do with it that they could not do already

Nothing. A variable name is not a credential and grants no capability. The name
`SUPABASE_SERVICE_ROLE_KEY` is the name Supabase's own documentation uses; `ANTHROPIC_API_KEY` is
Anthropic's. There is no keyspace narrowing, no authentication path, no request the attacker can
now make that they could not make before.

### Why the permissive answer is the *safer* one here

The alternative — an opaque `{"ok":false}` — buys close to zero security and costs diagnosability
at precisely the moment it is needed: a misconfigured production deploy, seen through curl, by one
person, possibly at night. **This project has just lost multiple days to a health endpoint that
was too quiet.** A control whose main effect is to make outages last longer is not a security
control. Ship the names.

### The two carve-outs — these are veto triggers

**V1. Boolean or absent, never a fragment of a value.** No prefix (`"sb_secret_ab…"`), no length
(`"len":219`), no hash, no first/last four. A prefix identifies the credential *type* and narrows
the keyspace; a hash of a low-entropy value is the value. If a diff adds any of these I veto it,
and that veto is not overridable.

**V2. The name list must be a hard-coded constant, never derived from `process.env`.** This is the
important one, because it is the *natural* way to write the feature — "loop over the env, report
what's empty" — and it is catastrophic. A Vercel Node function's `process.env` contains Vercel's
own injected variables, including `VERCEL_OIDC_TOKEN`, which is a real bearer credential, plus
whatever else the platform adds in future releases without telling us. An enumeration is a
forward-dated leak: it discloses variables that do not exist yet. The list must be a literal
array in code, matching `.env.example`, reviewed when it changes. If the implementation iterates
`process.env`, `Object.keys(process.env)`, or filters by prefix, **I veto it.**

**V3, corollary.** Report only variables **required for the deployment to serve traffic**. Never
report on optional or feature-flag variables — not present, not missing, not at all. Concretely,
`PLACE_RESOLVER`, `PLACE_LOOKUP_CACHE`, `ANTHROPIC_MODEL`, `GEMINI_MODEL` and
`NEXT_PUBLIC_PROTOMAPS_API_KEY` must not appear in any `/healthz` output. `PLACE_RESOLVER`'s
presence would announce that a terms-of-service gate has been overridden
(`place-resolver-factory.ts`, `06` §3.1); `PLACE_LOOKUP_CACHE`'s would announce that the shared
provider cache is off, which changes the cost to an attacker of forcing paid provider calls.

## 3. Question 2 — is "present: true" meaningfully different from "missing"? **Argued both ways,
then dissolved.**

**They are different.** Absence is a disclosure about a *transient defect* and it self-heals: once
the deployment is configured, `missing` is empty forever and leaks nothing. Presence is a
*permanent inventory* of the deployment's configuration surface, readable at any time by anyone.
`{"GEMINI_API_KEY":true,"ANTHROPIC_API_KEY":false}` tells an attacker which vendor to shape
injection payloads for, permanently, in steady state — the absence-only form tells them the same
thing only during an outage nobody wants to last long anyway. A presence map is also the shape
that tempts you toward optional variables, because listing only required ones makes a healthy
presence map a constant, which looks pointless and invites someone to "make it useful".

**They are the same.** Over a *published, fixed* list of names, `present` and `missing` are exact
complements. Publishing either publishes both: an attacker who knows the list and sees
`missing:["X"]` immediately knows every other name is present. Arguing for one and against the
other is incoherent once the list itself is in the code, in `.env.example`, and in
`vercel-env-restore.md`. And neither is a credential; neither grants a capability.

**Resolution: the present/absent axis is the wrong axis.** The control that matters is **list
membership** (V3), not polarity. Restrict the list to required-to-serve variables and the two
shapes become equally safe, because the only thing left to leak is "this deployment needs Supabase",
which is already public. I therefore sign off on either polarity and **recommend `missing`**, on
two non-security grounds: it is empty in the healthy case, which keeps the steady-state response
small and stops the endpoint from drifting into an inventory; and it is self-explanatory to a human
reading it at 2am, which is the endpoint's job.

## 4. Question 3 — are `stage` and `commit` sound? **Yes, conditionally, and the condition is
written down.**

`stage` — no issue. `"production"` is deducible from the domain. Zero disclosure.

`commit` — a 7-character SHA prefix, 28 bits, from `BUILD_INFO.commit`. Two observations:

1. **A per-deploy identifier is already public and unavoidable.** Next.js exposes `BUILD_ID` in
   every RSC payload and in every `/_next/static/<buildId>/…` URL. An attacker can already detect
   the exact moment a deploy lands and correlate behaviour across deploys. The commit SHA adds
   only the *git* identity on top of that, and git identity is worth something only with repo
   access.
2. **With the repo private (§0), it points at nothing.** It is an opaque 7-hex token to anyone
   outside. **Sound. Keep it.** It is also load-bearing operationally: it is the only way to tell
   from outside whether a deployed build contains a given fix, which is exactly what the current
   incident response needs.

**The trigger to revisit.** If the repository is made public — plausible for submitted coursework —
the SHA becomes a precise pointer to the exact source of the running deployment, including the
ability to diff a disclosed fix against what is deployed and confirm the deployment is still
vulnerable. That is a genuine, if modest, exposure. It does **not** justify removing the SHA
pre-emptively; it justifies recording the dependency, which this paragraph does. Making the repo
public is the larger security event and needs its own review, starting with a git-history secret
scan.

## 5. Question 4 — network I/O on an unauthenticated public route. **Quantified, and the
recommendation is: don't, by default.**

The endpoint is `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `cache-control: no-store`. Every
hit is an uncached serverless invocation. No rate limiting exists anywhere in this app — there is no
limiter in `proxy.ts`, none in `next.config.ts`, and Vercel's managed WAF rate limiting is not on
the project's plan.

**Legitimate load.** UptimeRobot free polls every 5 min → 288 req/day. A 60-second monitor → 1,440
req/day. Negligible on any axis.

**Adversarial load.** One laptop on a home connection sustains ~100 req/s against a Vercel edge
with no botnet and no skill. That is **8.64 million requests/day**.

- *Today, with no I/O:* each request is a few hundred microseconds of compute. The damage is
  Vercel function quota — 8.64M invocations/day against a Hobby monthly allowance is exhausted in
  well under a day. Real, but it is a **billing/quota** event, and it exists already; it is not
  caused by adding I/O.
- *With a Supabase round-trip per request:* the same 8.64M requests become **8.64M database
  queries/day** against the free-tier Postgres instance, each request now holding 50–150 ms of
  function wall-clock instead of <1 ms. Two things change qualitatively:
  1. **Compute burn rises roughly 50–150×** per request, because Vercel bills wall-clock, and the
     request is now dominated by waiting on the network.
  2. **A quota DoS becomes a product DoS.** The free-tier instance is shared with the actual
     application. Saturating its connection pool and CPU takes `/map`, `/import` and sign-in down
     for real users. The health check becomes the load generator against the very thing it is
     checking — an availability coupling that is strictly worse than not checking.

**Mitigation, with the number.** If a database check is wanted, memoise it in module scope for 10
seconds. That caps database load at **6 queries/minute (8,640/day) regardless of request rate** — a
**1,000× reduction** against the 100 req/s case — and costs the monitor at most 10 seconds of
staleness, which is far inside any alerting threshold.

**But the stronger recommendation is that no I/O is needed to fix this incident.** The outage was
an *empty environment store*. That is detectable with a pure, in-process configuration check
costing microseconds. Make the config check the default; put the database round-trip behind an
explicit `?deep=1`, memoised as above; point the uptime monitor at the default. This gets the full
diagnostic value at none of the amplification cost.

## 6. Question 5 — the response shapes I sign off on

### Healthy — HTTP **200**

```json
{
  "ok": true,
  "stage": "production",
  "commit": "44f0737",
  "checks": { "config": "ok" }
}
```

### Unhealthy — HTTP **503**, with `Retry-After: 30`

```json
{
  "ok": false,
  "stage": "production",
  "commit": "44f0737",
  "checks": { "config": "fail" },
  "missing": [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
  ]
}
```

### With `?deep=1`, healthy

```json
{
  "ok": true,
  "stage": "production",
  "commit": "44f0737",
  "checks": { "config": "ok", "database": "ok" }
}
```

`database` takes exactly one of `"ok"`, `"fail"`, `"skipped"`, and **nothing else** — no latency
number, no error string, no row count, no hostname. A provider error message is the classic vector
for leaking a connection string or an internal host, and it belongs in the Vercel log, not the
response. When `config` fails, `database` is `"skipped"` and no connection is attempted; running it
anyway produces a misleading second error that sends the reader after the wrong problem.

### Non-negotiable in that shape

- **The status code is the load-bearing part.** Uptime monitors alert on status codes, not on JSON
  fields. `{"ok":false}` behind a 200 is the same class of bug as `{"ok":true}` behind a 200 — one
  level up. **503, not 500**: 503 is "configuration/dependency unavailable", is the correct
  semantic, and is distinguishable in logs from the app's own unhandled 500s.
- Keep `cache-control: no-store`.
- The `missing` array is drawn from a hard-coded constant (V2), contains only required-to-serve
  variables (V3), and contains names only (V1).

### One thing to hand the implementer

`stage` and `commit` are themselves derived from `NEXT_PUBLIC_*` values that **default to `local`
and `dev`** when unset (`build-info.ts`). In the exact failure being fixed — an empty env store —
production would report `"stage":"local"`. That is not cosmetic: `NEXT_PUBLIC_STAGE` is what
`place-resolver-factory.ts` reads to decide whether the Google-Places terms-of-service gate
applies, and its `NON_PRODUCTION_STAGES` set treats `local` as non-production. An unset stage on a
production build is therefore a **config failure in its own right** and should fail the `config`
check, not be silently defaulted.

### Should `/healthz` require a shared secret or sit behind auth? **No — and I recommend against it.**

Three reasons, in order of weight:

1. **It would fail exactly when it is needed.** A shared secret is itself an environment variable.
   In the empty-env-store scenario the secret is absent too. The endpoint would then have to
   either fail open (pointless) or fail closed (returning "unauthorised" during the precise outage
   it exists to detect). The gate is a chicken-and-egg that would have *hidden this very incident*.
2. **There is nothing behind the gate worth gating.** Per §2 and §5 the signed-off response
   contains no credential, no fragment of one, and no capability. Authentication protecting
   non-secrets is ceremony.
3. **The operational cost is real and recurring.** Every uptime monitor must store and send the
   secret; rotating it breaks monitoring silently — the monitor keeps returning "auth failed",
   which most tools score as *down*, producing false alarms until someone correlates it. And a
   human debugging with curl needs the secret to hand, at 2am, from a phone. The whole purpose of
   this endpoint is to be trivially checkable.

**What I would gate, or refuse outright.** The following do not belong in an unauthenticated
response and adding any of them triggers the veto: any per-user or per-row data; row counts or
table sizes; measured query latency; a connection string, database host, or Supabase project ref
that is not already in the browser bundle; any echo of the request (headers, IP, cookies); a
provider error message passed through verbatim; a full `process.env` listing under any framing.

## 7. The sweep — other places this app leaks configuration the same way

Methodology: `grep -rnoE 'NEXT_PUBLIC_[A-Z0-9_]+' src`, `grep -rhoE 'process\.env\.[A-Z0-9_]+' src`,
an enumeration of `src/app/**/route.ts`, and — the one that actually matters — a **value-shape grep
against the compiled client bundle**, because Next.js inlines the *value*, not the name, so
grepping for names in `.next/static` proves nothing.

### L1 — `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is **not** browser-exposed today. The comment is only a comment, but `server-only` is doing the actual work.

The brief asked whether *"acceptable for local work, never for a deploy"* is enforced anywhere.
Answer, precisely:

- **The comment enforces nothing.** It is prose in `src/integrations/places/place-resolver-factory.ts`.
  There is no lint rule, no test, no build assertion, and no stage check inside `apiKeyFor()` — it
  falls back to the public key unconditionally.
- **But the key is nonetheless not in the browser bundle**, and the premise in
  `docs/vercel-env-restore.md` (*"It is compiled into the browser bundle, so anyone can read it"*)
  is **wrong as stated**. `NEXT_PUBLIC_*` inlining is per-reference: a value ships to the browser
  only if a module in the *client* graph reads it. The only file that reads this name is
  `place-resolver-factory.ts`, whose **line 1 is `import 'server-only'`** — so the module can never
  enter the client graph, and Next never inlines the value.

**VERIFIED** against the local production build output (`.next/BUILD_ID` is a random build id,
`prerender-manifest.json` and `export-marker.json` present, no `.next/static/development` — i.e.
`next build`, not `next dev`):

| shape searched in `.next/static` | unique matches |
|---|---|
| `AIza[0-9A-Za-z_-]{35}` (Google API key) | **0** |
| `sb_publishable_…` / `sb_secret_…` | **0** |
| `sk-ant-…` | **0** |
| `eyJ…` JWT | **1** |

The single JWT decodes to `role: "anon"`, `iss: "supabase-demo"` — the well-known local Supabase
demo anon key, identical on every local install, public by design. **Not a finding.** No value is
quoted here or anywhere in this document.

**The gap, and it is a scheduled one.** Nothing prevents a future client component from reading
that name, and `place-resolver-factory.ts`'s own header says the next thing to build is a **Google
Maps renderer prototype** — a client component that will want a Maps key. On the day it lands, the
value ships to every browser, no test fails, and CI stays green. Quota theft is the immediate
consequence; the key in `.env.local` is a Maps key with unknown referrer restrictions
(**UNAVAILABLE** — I did not read `.env.local`, per guardrail 9, and did not query the provider).

- **Severity: not a leak today. Must fix before the Google Maps renderer prototype merges.**
- **Minimum fix (for `nextjs-architect`, not for me):** an ESLint `no-restricted-properties` rule
  banning `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` outside
  `src/integrations/places/place-resolver-factory.ts`; and a CI step that greps `.next/static` for
  `AIza[0-9A-Za-z_-]{35}` and fails the build on a hit. The second is the durable control — it
  catches the leak regardless of which variable name carried it.
- **Also correct `docs/vercel-env-restore.md`'s row for this variable.** "Do not set in
  Production" remains the right instruction, but the stated reason is wrong, and a wrong reason is
  the thing that gets argued away later.

### L2 — the bundle-shape grep should be a CI step

The table above is the right recurring check and it took one command. It catches an inlined
service-role key, an inlined model key, or an inlined Maps key, whichever variable name carries it.
Hand to `qa-reliability` / `devops-vercel`. **Recommended, not blocking.**

### L3 — `proxy.ts` protects `/map` only; `/import` and `/collections` rely on a single check

```ts
const PROTECTED_PREFIXES = ['/map'];
export const config = { matcher: ['/map/:path*'] };
```

`/import` and `/collections` are outside both. **There is no auth bypass** — I read both pages and
both call `supabase.auth.getUser()` and `redirect('/sign-in')` on null. Likewise
`/api/imports/probe` and `/api/imports/confirm` each `getUser()` and return 401 *before* touching
`serviceRoleClient()`. The defect is that the in-code comments describe belt-and-braces
(*"the middleware already redirects an unauthenticated visitor"*) which is **false for those two
routes**: they have one check, not two, and a future refactor that drops the page-level check
would silently expose them.

- **Severity: acceptable at university scale, documented.** Not a data exposure; no veto.
- **Minimum fix:** add `'/import'` and `'/collections'` to `PROTECTED_PREFIXES` and to the matcher.
  One line each, restores the stated invariant.

### L4 — `docs/vercel-env-restore.md` carries both Supabase project refs in plaintext

The production ref is the hostname of `NEXT_PUBLIC_SUPABASE_URL` and ships in the browser by
design; disclosing it costs nothing. The **staging** ref is not otherwise public and names a
second live Postgres/Auth endpoint at `<ref>.supabase.co` with the same authentication surface and
weaker operational attention.

- **Severity: acceptable while the repo is private.** Conditional finding, tied to §0: if the repo
  is made public, this is a free target list for credential stuffing against staging's auth
  endpoint, and it should be redacted in the same pass as the git-history secret scan.

### L5 — adjacent, out of scope, recorded so it is not lost

`POST /api/imports/probe` is authenticated but unmetered, and it spends the shared Gemini/Anthropic
budget (500 calls/day, shared with every agent and the owner). One signed-in user in a loop
exhausts it. Not a disclosure issue and not part of this ruling; it belongs to whoever owns the
real `POST /api/imports` at L0-F6.

## 8. Summary of the ruling

| # | Question | Ruling |
|---|---|---|
| 1 | Disclose names of missing env vars? | **Yes**, subject to V1/V2/V3 |
| 2 | Is `present:true` different from `missing`? | Informationally equivalent over a fixed list; the real control is list membership. Both acceptable; `missing` recommended |
| 3 | Existing `stage` + `commit`? | **Sound**, conditional on the repo staying private; trigger recorded |
| 4 | Network I/O on the public route? | **Not by default.** Config-only default; DB behind `?deep=1`, memoised 10 s (1,000× load reduction) |
| 5 | Shared secret / auth? | **No**, and recommended against — it fails exactly when needed |

**Veto triggers, not overridable by `product-lead` or `nextjs-architect`:** any value fragment,
prefix, length or hash of a secret (V1); any derivation of the reported name list from
`process.env` (V2); any optional or feature-flag variable in the output (V3); and any of the
items listed at the end of §6.

**Must fix before the Google Maps renderer prototype merges:** L1's lint rule and bundle grep.

**Acceptable at university scale, documented:** the LLM-vendor inference in §2.3, L3, and L4 while
the repo is private.

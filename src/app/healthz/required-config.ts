/**
 * What a deployment must have configured before it can serve `/map` and `/import`.
 *
 * The list is derived from the code that reads `process.env`, not from a doc:
 * `proxy.ts` and `app/_lib/supabase/server.ts` (anon client), `integrations/supabase/
 * service-role-client.ts` (which throws without its two) and
 * `integrations/llm/place-extractor-factory.ts` (which throws without a key for the selected
 * provider). Everything else that is read has a default or a fallback and cannot 500 the app.
 *
 * Two rules from the security ruling (`docs/evidence/security/healthz-disclosure-2026-08-29.md`
 * §2) are binding here and are the reason this file looks the way it does:
 *
 *  - **V2** — the names are a hard-coded literal list. Nothing here iterates `process.env`,
 *    `Object.keys(process.env)` or a prefix: a Vercel function's environment carries the
 *    platform's own injected variables, `VERCEL_OIDC_TOKEN` among them, so an enumeration would
 *    disclose credentials that do not exist in this repo yet.
 *  - **V3** — only variables required to serve traffic may be named at all. That is why
 *    `GOOGLE_PLACES_API_KEY`, `PLACE_RESOLVER`, `PLACE_LOOKUP_CACHE`, `ANTHROPIC_MODEL`,
 *    `GEMINI_MODEL` and `NEXT_PUBLIC_PROTOMAPS_API_KEY` are absent from this file's output in
 *    every state. `PLACE_RESOLVER` in particular would announce whether a terms-of-service gate
 *    has been overridden. Their configuration is a deploy-review question, not a public one.
 *
 * Pure: it takes a snapshot and returns a verdict, so the policy is testable without a request.
 */

/** Read explicitly, never `process.env[name]` — see `readHealthEnv` for why the names are literal. */
export interface HealthEnv {
  readonly NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string | undefined;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
  readonly LLM_PROVIDER?: string | undefined;
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly GEMINI_API_KEY?: string | undefined;
  /** Vercel sets this on every deployment, independently of the project's env store. */
  readonly VERCEL?: string | undefined;
}

export interface ConfigReport {
  /** `unenforced` means names are absent but this is not a deployment, so it is not a failure. */
  readonly status: 'ok' | 'fail' | 'unenforced';
  /** Names only. A present value is never reported, in any form — no prefix, no length, no hash. */
  readonly missing: readonly string[];
}

/**
 * Stages where absent configuration is a normal state rather than a defect: an empty `.env.local`
 * is a supported way to run the landing page and this route (README §"MS2 needs no credentials"),
 * and CI's Playwright job builds with no Supabase credentials at all.
 */
const UNENFORCED_STAGES: ReadonlySet<string> = new Set(['local', 'test', 'development']);

const ALWAYS_REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

function present(value: string | undefined): boolean {
  return value !== undefined && value !== '';
}

/** Mirrors `place-extractor-factory.ts`: unset means anthropic, and an unknown value throws there. */
function llmKeyRequirement(env: HealthEnv): 'ANTHROPIC_API_KEY' | 'GEMINI_API_KEY' | 'LLM_PROVIDER' {
  const raw = env.LLM_PROVIDER;
  if (raw === 'gemini') return 'GEMINI_API_KEY';
  if (raw === undefined || raw === '' || raw === 'anthropic') return 'ANTHROPIC_API_KEY';
  // The factory throws on any other value, so the variable itself is the defect. Naming it (never
  // its value) is what V1 permits.
  return 'LLM_PROVIDER';
}

export function configReport(env: HealthEnv, stage: string): ConfigReport {
  const missing: string[] = ALWAYS_REQUIRED.filter((name) => !present(env[name]));

  const llmKey = llmKeyRequirement(env);
  if (llmKey === 'LLM_PROVIDER' || !present(env[llmKey])) missing.push(llmKey);

  // Two independent signals, because each covers the other's blind spot. `stage` is what the app
  // actually acts on: `place-resolver-factory.ts` reads it to decide whether the Google-Places
  // terms-of-service gate applies, so `local` on a deployment is a defect in its own right, not
  // cosmetics. `VERCEL` is set by the platform on every deployment whatever the project's env
  // store contains, so enforcement cannot be switched off by the same emptiness it exists to
  // detect. Off Vercel (CI, a laptop) neither fires and the check reports without failing.
  const stageIsLocal = UNENFORCED_STAGES.has(stage);
  const onVercel = present(env.VERCEL);
  if (onVercel && stageIsLocal) missing.push('NEXT_PUBLIC_STAGE');

  const enforced = onVercel || !stageIsLocal;
  if (missing.length === 0) return { status: 'ok', missing };
  return { status: enforced ? 'fail' : 'unenforced', missing };
}

/**
 * The one place `process.env` is read for this check, and every name is a literal (V2). Next
 * replaces a static `process.env.NEXT_PUBLIC_*` reference with its build-time value where one
 * exists and leaves the lookup live where it does not; a dynamic lookup is documented not to be
 * replaced at all (`next/dist/docs/01-app/02-guides/environment-variables.md`). `ProcessEnv` also
 * has no index signature under this tsconfig.
 */
export function readHealthEnv(): HealthEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    VERCEL: process.env.VERCEL,
  };
}

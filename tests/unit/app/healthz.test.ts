import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configReport, type HealthEnv } from '@/app/healthz/required-config';

/** A copy without one name, which is how a missing variable is expressed in these tests. */
function without<T extends object, K extends keyof T>(env: T, name: K): Omit<T, K> {
  const copy = { ...env };
  delete copy[name];
  return copy;
}

const FULL: HealthEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://sentinel-project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sentinel-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'sentinel-service-key',
  ANTHROPIC_API_KEY: 'sentinel-anthropic-key',
};

describe('configReport', () => {
  it('passes when every required name is present on a deployed stage', () => {
    expect(configReport(FULL, 'production')).toEqual({ status: 'ok', missing: [] });
  });

  it('names the one variable that is missing', () => {
    const report = configReport(without(FULL, 'SUPABASE_SERVICE_ROLE_KEY'), 'production');
    expect(report).toEqual({ status: 'fail', missing: ['SUPABASE_SERVICE_ROLE_KEY'] });
  });

  it('names every missing variable when the env store is empty — the 2026-08-29 production defect', () => {
    expect(configReport({}, 'production')).toEqual({
      status: 'fail',
      missing: [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'ANTHROPIC_API_KEY',
      ],
    });
  });

  it('treats an empty string as missing, because every reader of these does', () => {
    const report = configReport({ ...FULL, NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }, 'production');
    expect(report.missing).toEqual(['NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  });

  it('requires the key for the selected LLM provider, not the other one', () => {
    const gemini = { ...FULL, LLM_PROVIDER: 'gemini' };
    expect(configReport(gemini, 'production').missing).toEqual(['GEMINI_API_KEY']);
    expect(
      configReport({ ...gemini, GEMINI_API_KEY: 'sentinel-gemini-key' }, 'production').missing,
    ).toEqual([]);
  });

  it('reports LLM_PROVIDER itself when its value is one the factory would throw on', () => {
    expect(configReport({ ...FULL, LLM_PROVIDER: 'ollama' }, 'production').missing).toEqual([
      'LLM_PROVIDER',
    ]);
  });

  it('reports what is absent off a deployment without calling it a failure', () => {
    const report = configReport({}, 'local');
    expect(report.status).toBe('unenforced');
    expect(report.missing.length).toBe(4);
  });

  it('enforces on an unrecognised stage rather than failing open', () => {
    expect(configReport({}, 'somewhere-new').status).toBe('fail');
  });

  it('enforces on Vercel even if the stage claims to be local, and says the stage is wrong', () => {
    // The blind spot this closes: enforcement keyed only on stage could be switched off by the
    // same empty env store it exists to detect.
    const report = configReport({ ...FULL, VERCEL: '1' }, 'local');
    expect(report).toEqual({ status: 'fail', missing: ['NEXT_PUBLIC_STAGE'] });
  });

  it('does not flag the stage when it is a deployed one', () => {
    expect(configReport({ ...FULL, VERCEL: '1' }, 'preview').missing).toEqual([]);
  });

  it('never names an optional variable, in any state (security ruling V3)', () => {
    const optional = ['GOOGLE_PLACES_API_KEY', 'PLACE_RESOLVER', 'PLACE_LOOKUP_CACHE', 'ANTHROPIC_MODEL', 'GEMINI_MODEL', 'NEXT_PUBLIC_PROTOMAPS_API_KEY'];
    for (const stage of ['production', 'preview', 'local']) {
      const named = configReport({}, stage).missing;
      for (const name of optional) expect(named).not.toContain(name);
    }
  });
});

const ENV_NAMES = [
  'NEXT_PUBLIC_STAGE',
  'NEXT_PUBLIC_COMMIT_SHA',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'LLM_PROVIDER',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'VERCEL',
] as const;

type EnvOverrides = { [K in (typeof ENV_NAMES)[number]]?: string | undefined };

/** The route reads BUILD_INFO at module load, so the stage has to be stubbed before the import. */
async function healthz(env: EnvOverrides) {
  for (const name of ENV_NAMES) vi.stubEnv(name, env[name]);
  vi.resetModules();
  const { GET } = await import('@/app/healthz/route');
  const response = GET();
  return { response, body: (await response.json()) as Record<string, unknown> };
}

describe('GET /healthz', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('answers 200 with the full shape when production is configured', async () => {
    const { response, body } = await healthz({
      NEXT_PUBLIC_STAGE: 'production',
      NEXT_PUBLIC_COMMIT_SHA: '44f0737abcdef',
      ...FULL,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBeNull();
    expect(body).toEqual({
      ok: true,
      stage: 'production',
      commit: '44f0737',
      checks: { config: 'ok' },
    });
  });

  it('answers 503 and names what is absent when the env store is empty', async () => {
    const { response, body } = await healthz({
      NEXT_PUBLIC_STAGE: 'production',
      NEXT_PUBLIC_COMMIT_SHA: '44f0737abcdef',
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(body).toEqual({
      ok: false,
      stage: 'production',
      commit: '44f0737',
      checks: { config: 'fail' },
      missing: [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'ANTHROPIC_API_KEY',
      ],
    });
  });

  it('answers 503 for a single missing variable too', async () => {
    const { response, body } = await healthz({
      NEXT_PUBLIC_STAGE: 'preview',
      ...without(FULL, 'SUPABASE_SERVICE_ROLE_KEY'),
    });

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.checks).toEqual({ config: 'fail' });
    expect(body.missing).toEqual(['SUPABASE_SERVICE_ROLE_KEY']);
  });

  it('never puts a configured value in the response, in any form', async () => {
    const { response, body } = await healthz({
      NEXT_PUBLIC_STAGE: 'production',
      ...FULL,
      SUPABASE_SERVICE_ROLE_KEY: '',
    });

    const serialised = JSON.stringify(body);
    expect(response.status).toBe(503);
    for (const secret of Object.values(FULL)) {
      expect(serialised).not.toContain(secret);
      // Not even a fragment: four characters of a key is four characters too many.
      expect(serialised).not.toContain(secret.slice(0, 6));
    }
  });

  it('stays 200 off a deployment, so an empty .env.local and CI still pass', async () => {
    const { response, body } = await healthz({});

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stage).toBe('local');
    expect(body.checks).toEqual({ config: 'unenforced' });
    expect(body.missing).toHaveLength(4);
  });
});

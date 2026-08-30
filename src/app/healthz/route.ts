import { BUILD_INFO } from '@/domain/build-info';

import { configReport, readHealthEnv } from './required-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deploy smoke check. Deliberately reveals no configuration **values** — only the names of
 * variables a deployment needs and does not have, under the rules in `required-config.ts`.
 *
 * It used to answer `ok: true` unconditionally, which is why production served 500s on `/map` and
 * `/import` from 2026-08-26 while this route reported healthy throughout: it was checking that the
 * process could run, not that the deployment could work. A missing env store is now a 503 with a
 * `retry-after`, so an uptime check sees it.
 *
 * `ok` follows `fail` specifically, not "anything other than ok": `unenforced` is the honest state
 * of a laptop or a CI job with no credentials, and turning that into a red healthcheck would make
 * the signal useless everywhere it is not needed.
 */
export function GET() {
  const config = configReport(readHealthEnv(), BUILD_INFO.stage);
  const ok = config.status !== 'fail';

  return Response.json(
    {
      ok,
      stage: BUILD_INFO.stage,
      commit: BUILD_INFO.commit,
      checks: { config: config.status },
      ...(config.missing.length > 0 ? { missing: config.missing } : {}),
    },
    {
      status: ok ? 200 : 503,
      headers: {
        'cache-control': 'no-store',
        ...(ok ? {} : { 'retry-after': '30' }),
      },
    },
  );
}

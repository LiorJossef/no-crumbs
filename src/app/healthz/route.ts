import { BUILD_INFO } from '@/domain/build-info';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Deploy smoke check. Deliberately reveals no configuration values. */
export function GET() {
  return Response.json(
    { ok: true, stage: BUILD_INFO.stage, commit: BUILD_INFO.commit },
    { headers: { 'cache-control': 'no-store' } },
  );
}

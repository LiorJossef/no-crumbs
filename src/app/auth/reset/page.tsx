/**
 * The route file for `/auth/reset`. Its only job is to read `?state=` on the server so the expired
 * line is on screen at first paint — the same split, for the same reason, as `/sign-in`'s.
 *
 * `robots.ts` is deny-by-default and opens exactly two paths (`/$` and `/sign-in`), so this screen
 * and the rest of `/auth/**` are closed to crawlers by construction. That is the correct posture
 * for a surface that issues credentials, and it needed no rule of its own.
 */
import { EXPIRED_STATE } from '../_lib/callback-destination';
import { ResetPasswordScreen } from './reset-client';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { state } = await searchParams;
  const value = Array.isArray(state) ? state[0] : state;

  return <ResetPasswordScreen expired={value === EXPIRED_STATE} />;
}

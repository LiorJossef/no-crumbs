/**
 * The one place the build's identity is read. Lives in domain/ because it is
 * pure data, and is populated from NEXT_PUBLIC_* values that are safe to expose
 * (env-matrix: public, non-secret).
 */
export const BUILD_INFO = {
  stage: process.env.NEXT_PUBLIC_STAGE ?? 'local',
  commit: (process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'dev').slice(0, 7),
} as const;

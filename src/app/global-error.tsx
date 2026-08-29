'use client';

/**
 * The last resort: the boundary for a failure in the root layout itself, which is the one place
 * `error.tsx` cannot reach.
 *
 * **This file is plain on purpose, and that is a constraint rather than a shortcut.** When it
 * renders it *replaces the whole document*, `<html>` and `<body>` included, so the root layout
 * never runs — Next's own reference says global-error "does not include your global styles", and
 * the Manrope webfont is loaded by the layout this file is standing in for. A Tailwind class here
 * would resolve to nothing and a `var(--foreground)` would resolve to nothing, which on a page
 * whose entire job is to be readable means invisible text. So: inline styles only, a system font
 * stack, and the design tokens written as their literal values. That is a deliberate exception to
 * `brand-and-product-foundation.md` §5's "every colour is a token" — the values below are copies
 * of `--background`, `--foreground`, `--muted-foreground`, `--border`, `--primary` and
 * `--ink-on-mint` from `globals.css`, and if the palette moves they are the one place that will
 * not follow.
 *
 * Do not add a component import, an icon or a stylesheet to this file. Everything it needs must
 * survive the app being broken.
 */

/**
 * Deliberately a second copy of `errorReference` in `./error.tsx`, four lines rather than an
 * import: the last-resort document should not depend on the module graph of the boundary it is
 * backstopping. A unit test pins the two to the same behaviour so the duplication cannot drift.
 */
export function globalErrorReference(digest: string | undefined): string | null {
  if (!digest) return null;
  const safe = digest.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  return safe.length > 0 ? safe : null;
}

export const GLOBAL_ERROR_COPY = {
  headline: 'This didn’t load.',
  body: 'The fault is ours, not anything you did. Trying again usually clears it.',
  retry: 'Try again',
  back: 'Back to the map',
  referenceLabel: 'Reference',
} as const;

const INK = '#1B1B1A';
const MUTED_INK = '#75716A';
const SURFACE = '#FAF9F6';
const MINT = '#A8ECE2';
const INK_ON_MINT = '#123B35';
const HAIRLINE = '#E7E3DC';
const SYSTEM_FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // `retry`, not `reset` — see the same note in `error.tsx`.
  retry: () => void;
}) {
  const reference = globalErrorReference(error.digest);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: SURFACE, color: INK, fontFamily: SYSTEM_FONT }}>
        {/* React 19 hoists these into <head>. The viewport meta is not optional here: the root
            layout's `viewport` export is gone with the layout, and without it a phone renders
            this at desktop width — unreadable, on the screen that exists to be read. */}
        <title>This didn’t load</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <div
          role="alert"
          style={{
            minHeight: '100dvh',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '24px',
            maxWidth: '420px',
            margin: '0 auto',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '30px',
              lineHeight: 1.1,
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            {GLOBAL_ERROR_COPY.headline}
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: '15px', lineHeight: 1.4, color: MUTED_INK }}>
            {GLOBAL_ERROR_COPY.body}
          </p>

          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: '28px',
              minHeight: '48px',
              width: '100%',
              border: 'none',
              borderRadius: '16px',
              background: MINT,
              color: INK_ON_MINT,
              font: 'inherit',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {GLOBAL_ERROR_COPY.retry}
          </button>

          {/* A plain anchor, not `next/link`: the router is part of what may have failed, so the
              escape hatch is a full document load. */}
          <a
            href="/map"
            style={{
              marginTop: '12px',
              minHeight: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '16px',
              border: `1px solid ${HAIRLINE}`,
              color: INK,
              fontSize: '15px',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            {GLOBAL_ERROR_COPY.back}
          </a>

          {reference && (
            <p style={{ margin: '16px 0 0', fontSize: '12px', color: MUTED_INK, textAlign: 'center' }}>
              {GLOBAL_ERROR_COPY.referenceLabel}{' '}
              <span style={{ fontFamily: 'ui-monospace, monospace', userSelect: 'all' }}>
                {reference}
              </span>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

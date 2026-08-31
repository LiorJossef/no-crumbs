'use client';

import {
  BRAND_HAIRLINE,
  BRAND_INK,
  BRAND_INK_MUTED,
  BRAND_INK_ON_MINT,
  BRAND_MINT,
  BRAND_SURFACE,
} from '@/components/brand/brand-colors';
import { crumbMascotMarkup, crumbMascotViewBox } from '@/components/brand/crumb-mascot-markup';
import { MASCOT_KEYLINE_LIGHT } from '@/components/brand/mascot-colors';

/**
 * The last resort: the boundary for a failure in the root layout itself, which is the one place
 * `error.tsx` cannot reach.
 *
 * **This file is plain on purpose, and that is a constraint rather than a shortcut.** When it
 * renders it *replaces the whole document*, `<html>` and `<body>` included, so the root layout
 * never runs — Next's own reference says global-error "does not include your global styles", and
 * the Manrope and Fraunces webfonts are loaded by the layout this file is standing in for. A
 * Tailwind class here would resolve to nothing and a `var(--foreground)` would resolve to nothing,
 * which on a page whose entire job is to be readable means invisible text. So: inline styles only,
 * a system font stack, and the design tokens as their literal values.
 *
 * **The literals are no longer a private copy** — W7-5. The comment they replaced said, correctly,
 * that "if the palette moves they are the one place that will not follow". That is now fixed rather
 * than merely documented: they come from `components/brand/brand-colors.ts`, whose unit test
 * asserts all seven against `:root` in `globals.css`. The exception to
 * `brand-and-product-foundation.md` §5's "every colour is a token" stands; what changed is that the
 * exception is now checked.
 *
 * **On the rule that used to read "do not add a component import, an icon or a stylesheet".** Its
 * reason is still exactly right — everything here must survive the app being broken, and the
 * last-resort document must not depend on the module graph of the boundary it is backstopping. What
 * it now permits, and only this: **leaf modules of plain constants that import nothing themselves.**
 * `crumb-path.ts` is a string and some numbers; `brand-colors.ts` is seven strings. Neither can
 * fail to evaluate, neither pulls React, a component, an icon library or CSS, and both are inlined
 * by the bundler. **Still forbidden: a component, an icon package, a stylesheet, a hook, anything
 * with a side effect at import time.** If you cannot say in one line why an import cannot throw, it
 * does not belong in this file.
 *
 * The mark is drawn as an inline `<svg>` from that shared path for the same reason. It is the
 * product's mark at the moment the product is least recognisable, and a `<PinMark>` import would
 * have been exactly the component this file refuses.
 */

/**
 * Deliberately a second copy of `errorReference` in `./error.tsx`, four lines rather than an
 * import: the last-resort document should not depend on the module graph of the boundary it is
 * backstopping. A unit test pins the two to the same behaviour so the duplication cannot drift.
 */
export function globalErrorReference(
  digest: string | undefined,
): string | null {
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

const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/**
 * The nearest thing to the display face that needs no webfont.
 *
 * `no-crumbs-design-system.html` declares the display family as
 * `"Fraunces", "Iowan Old Style", Georgia, serif`. Fraunces cannot load here, so this is the rest of
 * that stack — the fallback the design system already chose, rather than a new decision made in an
 * error boundary. The headline comes out a serif on every platform the product runs on, which is
 * most of what makes this screen read as *this* product rather than as the browser's own error page.
 */
const FALLBACK_DISPLAY_FONT = '"Iowan Old Style", Georgia, "Times New Roman", serif';

/**
 * The mint bloom off the top-right corner.
 *
 * `--brand-wash` stacks three radials over `--background`; this is the one that carries it, at the
 * one opacity that survives being written as an eight-digit hex. Written out because there is no
 * stylesheet here to read the token from — the same reason as the colours above it.
 */
const WASH = `radial-gradient(120% 90% at 108% -12%, ${BRAND_MINT}66 0%, ${BRAND_SURFACE} 62%)`;

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
      <body
        style={{
          margin: 0,
          background: BRAND_SURFACE,
          backgroundImage: WASH,
          color: BRAND_INK,
          fontFamily: SYSTEM_FONT,
        }}
      >
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
          {/*
           * **The character, in the mood this screen is in** — and it is drawn here without
           * importing a component, which is the rule this file exists to keep.
           *
           * `crumb-mascot-markup.ts` is a pure function of two leaf constant modules and its own
           * header says it was written so that this file could use it: *"it is a pure function of
           * constants, which is also what lets `app/global-error.tsx` keep its rule about leaf
           * modules that cannot throw."* No React, no icon package, no stylesheet, no side effect
           * at import time. The affordance was designed in advance; this is the first call site to
           * take it.
           *
           * **`offline`, matching `error.tsx`.** `#moods` binds it to *"connection lost, retryable
           * error"* and this is the retryable error of last resort. Flat eyes, wiggle mouth — not a
           * frown. `not-found.tsx` keeps the silhouette, because a 404 is not an error the product
           * had; see `pin-mark.tsx`.
           *
           * **Two things this screen cannot have, and both are consequences of having no
           * stylesheet.** The keyline is passed as `MASCOT_KEYLINE_LIGHT` rather than as
           * `--mascot-keyline`, because an unresolved `var()` makes the whole declaration invalid
           * and the outline would vanish — the exact failure `MASCOT_KEYLINE_VAR`'s fallback exists
           * to prevent, arriving here where there is no cascade to fall back through. And there is
           * no `crumb-anim-stir`: the class has no rule without `globals.css`, so this mark is
           * still. That is correct rather than a limitation — the root layout has failed, and a
           * mascot doing an idle animation on top of that would be the product performing
           * liveliness it does not have.
           *
           * The viewBox comes from the same module, because `outlined` pads the artboard for its
           * keyline and the square would clip it on all four sides.
           */}
          <svg
            viewBox={crumbMascotViewBox('outlined')}
            width="34"
            height="34"
            aria-hidden="true"
            style={{ display: 'block', marginBottom: '20px' }}
            dangerouslySetInnerHTML={{
              __html: crumbMascotMarkup({
                mood: 'offline',
                construction: 'outlined',
                keyline: MASCOT_KEYLINE_LIGHT,
              }),
            }}
          />

          <h1
            style={{
              margin: 0,
              // A serif, and one notch lighter than the 800 it was. The display face is set at 700
              // everywhere else in the product (`components/brand/display-type.ts`); an extra-bold
              // serif at 32px on a failure screen reads as shouting.
              fontFamily: FALLBACK_DISPLAY_FONT,
              fontSize: '32px',
              lineHeight: 1.12,
              fontWeight: 700,
              letterSpacing: '-0.012em',
            }}
          >
            {GLOBAL_ERROR_COPY.headline}
          </h1>
          <p
            style={{
              margin: '12px 0 0',
              fontSize: '15px',
              lineHeight: 1.4,
              color: BRAND_INK_MUTED,
            }}
          >
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
              // 8px, the product's `--radius-lg`, not the 16px this used to draw. A pill-radius
              // button is not a shape the rest of the product has, and the point of this screen is
              // to look like the rest of the product.
              borderRadius: '8px',
              background: BRAND_MINT,
              color: BRAND_INK_ON_MINT,
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
              borderRadius: '8px',
              border: `1px solid ${BRAND_HAIRLINE}`,
              color: BRAND_INK,
              fontSize: '15px',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            {GLOBAL_ERROR_COPY.back}
          </a>

          {reference && (
            <p
              style={{
                margin: '16px 0 0',
                fontSize: '12px',
                color: BRAND_INK_MUTED,
                textAlign: 'center',
              }}
            >
              {GLOBAL_ERROR_COPY.referenceLabel}{' '}
              <span
                style={{
                  fontFamily: 'ui-monospace, monospace',
                  userSelect: 'all',
                }}
              >
                {reference}
              </span>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

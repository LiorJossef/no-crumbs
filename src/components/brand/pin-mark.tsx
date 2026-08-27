/**
 * The mint pin glyph. Not a logo — the product has no name yet
 * (`docs/brand-and-product-foundation.md` §3 is deliberately open, owed at L1-F1-T1), so this
 * shape is the only mark the product has and it carries the job a wordmark would otherwise do.
 *
 * Extracted from `src/app/sign-in/page.tsx`, where it was first drawn, so the landing page can
 * reuse the same mark rather than draw a second one. Two surfaces copying an SVG is how a brand
 * drifts; when the name lands and the mark is redrawn, this is the one file to change.
 *
 * Colours come from the mint ramp in `globals.css` (`--mint-700` body, `--mint-100` aperture)
 * rather than literals, so a token repass — including the dark-mode pass that is still owed —
 * moves the mark with everything else.
 */
export function PinMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 22s-8-7.4-8-12.5A8 8 0 1 1 20 9.5C20 14.6 12 22 12 22Z"
        fill="var(--mint-700)"
      />
      <circle cx="12" cy="9.5" r="3" fill="var(--mint-100)" />
    </svg>
  );
}

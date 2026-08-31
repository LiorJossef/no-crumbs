/**
 * **Press feedback — the state matrix's sixth column, asserted where it is written.**
 *
 * `facelift-plan.md` §3a measured three uses of `active:` in the whole codebase against
 * ninety-seven of `focus-visible:`: a product built for a phone that acknowledged a keyboard well
 * and a finger almost never. W3-1 puts one press treatment on the three pressable shapes — a
 * button, a list row, a chip — and the thing that makes it hold is that all three read from one
 * place (`components/ui/button.tsx`) rather than being restated at each call site.
 *
 * So this file asserts two properties, and neither of them is "the design is right":
 *
 *  1. **The strings are what they claim to be.** Registered utilities, no arbitrary value in
 *     square brackets (run rule 6a), and the transform arm gated behind `motion-safe:` so that the
 *     un-prefixed state is the reduced-motion case rather than an afterthought (§3a rule 4).
 *  2. **They actually reach the DOM**, through cva's variants and through the chip's shared class
 *     string. A constant nothing renders is a constant that will drift.
 *
 * `environment: 'node'` (`vitest.config.ts`), so this is `react-dom/server` markup: it is evidence
 * about which classes are emitted and about nothing else. Whether 98% at 90ms *reads* as a press
 * on a mid-range Android is a device, and that evidence lives with the task.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PRESS_BUTTON, PRESS_CHIP, PRESS_ROW } from '@/lib/interaction';
import { CHIP_PRESSABLE } from '@/components/sheet/place-enrichment';

const ALL = { PRESS_BUTTON, PRESS_CHIP, PRESS_ROW };

describe('the three press strings', () => {
  it('give every shape a press, at the matrix depth for that shape', () => {
    // The matrix: a filled button `scale-[.985]`, a list row `scale-[.995]`, a chip `scale-95`.
    // Bare numeric scales rather than brackets — the half-percent is invisible at 90ms and a
    // registered utility is not.
    expect(PRESS_BUTTON).toContain('active:scale-98');
    expect(PRESS_ROW).toContain('active:scale-99');
    expect(PRESS_CHIP).toContain('active:scale-95');
  });

  it('carries no arbitrary value', () => {
    // Run rule 6a: after W0 registered the scales, a bracket is a review failure the same way a
    // hard-coded colour is. The duration and the easing are tokens, not numbers.
    for (const [name, value] of Object.entries(ALL)) {
      expect(value, name).not.toMatch(/\[[^\]]+\]/);
      expect(value, name).toContain('duration-press');
      expect(value, name).toContain('ease-standard');
    }
  });

  it('puts every transform behind motion-safe, and never uses motion-reduce', () => {
    // The inversion is the whole point: the un-prefixed state *is* the reduced case, so an author
    // cannot forget to write one. §3a — under `prefers-reduced-motion` a press collapses to the
    // colour change the element already had, not to nothing that happens at all.
    for (const [name, value] of Object.entries(ALL)) {
      expect(value, name).not.toContain('motion-reduce:');
      for (const utility of value.split(' ')) {
        if (utility.includes('scale-') || utility.includes('transition')) {
          expect(utility, name).toMatch(/^motion-safe:/);
        }
      }
    }
  });
});

describe('the state matrix, row by row, on the button (W3-4)', () => {
  it('warms an outline button\'s border on hover instead of greying its fill', () => {
    // §3a: "border → mint, tint wash". An outlined control's border *is* its affordance, and this
    // was the one hover in the table answered with a grey.
    const markup = renderToStaticMarkup(createElement(Button, { variant: 'outline' }, 'Clear'));
    expect(markup).toContain('hover:border-primary');
    expect(markup).toContain('hover:bg-primary/5');
    // Far below `default`'s solid mint, so the two never read as the same button.
    expect(markup).not.toContain('hover:bg-primary/80');
  });

  it('disables an icon button harder than a labelled one', () => {
    // 30% against the base's 45%. A disabled icon button is a glyph and nothing else — no label to
    // carry the meaning, no fill to sit in — so at 45% it still reads as live and gets tapped.
    const icon = renderToStaticMarkup(
      createElement(Button, { size: 'icon', disabled: true, 'aria-label': 'Close' }),
    );
    expect(icon).toContain('disabled:opacity-30');
    const labelled = renderToStaticMarkup(createElement(Button, { disabled: true }, 'Save'));
    expect(labelled).toContain('disabled:opacity-45');
    expect(labelled).not.toContain('disabled:opacity-30');
  });

  it('has no un-prefixed transition left on the base', () => {
    // W3-3. `transition-all` here ran the hover fade and the press translate *only* for users who
    // had asked for reduced motion, because `PRESS_BEAT` supersedes it for everyone else — the
    // inversion failing in the exact direction it exists to prevent.
    const markup = renderToStaticMarkup(createElement(Button, {}, 'Add a TikTok'));
    expect(markup).not.toMatch(/(?<!motion-safe:)transition-all/);
    expect(markup).toContain('motion-safe:transition');
  });
});

describe('the input, which owed the matrix a hover (W3-4)', () => {
  it('warms its border on hover', () => {
    // Row 9's one blank cell. Focus and disabled were already right; hover did not exist, so on a
    // pointer device nothing said "this is a target" until the caret was already in it.
    const markup = renderToStaticMarkup(createElement(Input, { 'aria-label': 'Name' }));
    expect(markup).toContain('hover:border-ring/60');
  });

  it('keeps its focus and disabled columns exactly as they were', () => {
    const markup = renderToStaticMarkup(createElement(Input, { 'aria-label': 'Name' }));
    expect(markup).toContain('focus-visible:border-ring');
    expect(markup).toContain('focus-visible:ring-3');
    expect(markup).toContain('disabled:bg-input/50');
  });

  it('reads its invalid state from the attribute, so a caller needs no ternary', () => {
    // This is what let `saved-place-edits.tsx`'s rename field stop assembling
    // `!validation.ok && 'border-destructive …'` by hand: the styling follows `aria-invalid`, so
    // the field cannot look valid while announcing itself invalid.
    const markup = renderToStaticMarkup(createElement(Input, { 'aria-label': 'Name' }));
    expect(markup).toContain('aria-invalid:border-destructive');
    expect(markup).toContain('aria-invalid:ring-destructive/20');
  });
});

describe('the strings reach the DOM', () => {
  it('presses a primary button, and drops its shadow a level', () => {
    // `shadow-raised` exists so `active:shadow-none` has somewhere to fall from: a press that only
    // shrinks reads as a rendering glitch rather than as a press.
    const markup = renderToStaticMarkup(createElement(Button, {}, 'Add a TikTok'));
    expect(markup).toContain('motion-safe:active:scale-98');
    expect(markup).toContain('shadow-raised');
    expect(markup).toContain('active:shadow-none');
  });

  it('presses an icon button at the chip depth', () => {
    // 1.5% of a 32px button is half a pixel. `size` lands after `variant` in cva's own order, so
    // an icon-sized default button resolves to this one.
    const markup = renderToStaticMarkup(
      createElement(Button, { size: 'icon', 'aria-label': 'Clear search' }),
    );
    expect(markup).toContain('motion-safe:active:scale-95');
    expect(markup).not.toContain('motion-safe:active:scale-98');
  });

  it('leaves a ghost button the translate and no scale', () => {
    // The matrix gives ghost/secondary/outline `translate-y-px` alone — they have no fill to push,
    // so a scale on them reads as the label wobbling.
    const markup = renderToStaticMarkup(createElement(Button, { variant: 'ghost' }, 'Cancel'));
    expect(markup).toContain('active:not-aria-[haspopup]:translate-y-px');
    expect(markup).not.toContain('active:scale-98');
  });

  it('holds the disabled step at one number', () => {
    // The matrix says 45% and the cva base said 50%. Two numbers for one state is how a token
    // layer stops being one.
    const markup = renderToStaticMarkup(createElement(Button, { disabled: true }, 'Save'));
    expect(markup).toContain('disabled:opacity-45');
    expect(markup).not.toContain('disabled:opacity-50');
  });

  it('presses a chip through the one shared class string', () => {
    // Both the detail's tag chips and the library's category chips are built from this constant,
    // so there is one press for a chip rather than two that drift.
    expect(CHIP_PRESSABLE).toContain('motion-safe:active:scale-95');
  });
});

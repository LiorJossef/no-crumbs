'use client';

/**
 * **The theme control — three states, in profile settings.** Owner ruling, 2026-08-31.
 *
 * `facelift-plan.md` §4 decision 3 read *no dark-mode toggle: a signed pass, or none*, and
 * `iteration-2-plan.md` §4 repeated it. The owner asking for the control **is** that signature, and
 * the measurement that made it grantable is on the record: both themes score **0 AA failures across
 * 464 scored strings** (`contrast-render.mjs` at `0fa25ab`, 12/12 known-answer cases). The palette
 * is worth exposing; it was not before I2-1 and I2-2 landed.
 *
 * ## Three targets, never a switch, and this is the load-bearing decision
 *
 * `ThemePreference` is `'light' | 'dark' | 'system'` and `'system'` is **not a third appearance** —
 * it is the absence of a choice (`lib/theme.ts`). A two-way switch has nowhere to put it, so the
 * first press silently converts "follow my device" into a stored `'dark'`, and the user who wanted
 * their phone to decide can never get back: `prefers-color-scheme` keeps changing at sunset and
 * nothing listens to it any more. The destruction is invisible, permanent, and only reaches the
 * people who touched the setting once.
 *
 * So it is a radio group over `THEME_PREFERENCES`, which is also what `nextPreference`'s own
 * docblock recommended before this screen existed — *"'follow my device' is a thing you choose once
 * from a menu rather than something you land on by pressing a button twice."* That function stays
 * uncalled and correct; see its note.
 *
 * ## Why the selection is withheld until hydration, rather than rendered from the server
 *
 * The preference lives in `localStorage`, so the server genuinely does not know it, and
 * `useSyncExternalStore`'s server snapshot is honest about that — it returns `DEFAULT_PREFERENCE`.
 * Painting that would put the highlight on **System** for a user whose stored choice is **Dark**,
 * and then move it after hydration: a control that states something false and corrects itself, on
 * the one screen whose entire job is to report the truth about your account.
 *
 * `hydrated` is the standard `useSyncExternalStore` mount flag, and the visual selection is driven
 * from it rather than from `data-checked`. Before hydration the track shows three equal segments
 * and no highlight; after it, the real one. **An empty control is not a lie and a wrong one is.**
 * The radio semantics are unaffected — `RadioGroup` still carries `value`, so the accessibility
 * tree is never blank.
 *
 * This is the same argument `THEME_INIT_SCRIPT` makes about the *page* one layer up, and the page
 * flash is genuinely solved: the head script writes the class before first paint, so nothing here
 * is responsible for the theme arriving. This is only about the control's own state.
 *
 * ## Without JavaScript
 *
 * The control is hidden, by a `<style>` the browser only parses when scripting is off. It cannot
 * work: the preference is `localStorage` and the class is written by script, so with JS disabled
 * every page renders light whatever the device says, and a control that appears to offer a choice
 * it cannot make is worse than no control. Hiding it leaves the page complete and usable rather
 * than broken.
 *
 * **The residual gap is real and is not mine to close here.** Following the device with no
 * JavaScript needs either a `@media (prefers-color-scheme: dark)` block in `globals.css` or a
 * server-read cookie in `app/layout.tsx`, and both of those files are held by other lanes. Recorded
 * rather than worked around.
 */

import { useId, useSyncExternalStore } from 'react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Monitor, Moon, Sun } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PRESS_CHIP } from '@/lib/interaction';
import { THEME_PREFERENCES, type ThemePreference } from '@/lib/theme';
import { useTheme } from '@/components/theme/theme-provider';

/**
 * The label and the sentence under it, one per preference.
 *
 * **`System` keeps the word every operating system uses and the caption does the explaining**, which
 * is `voice-and-vocabulary.md` §4 rule 2 — *concrete over technical* — applied to a case where the
 * conventional word is also the recognisable one. `Follows your device.` is second person and
 * states what happens, and the three captions are the same length of sentence so the block does not
 * change height when the choice does.
 *
 * `Always light.` and `Always dark.` are not filler: they are the half of the answer a user needs
 * to understand that this overrides their phone, which is exactly the thing a two-way switch hides.
 *
 * **`Monitor` rather than `SunMoon`, decided on the rendered pixel and not on the name.** Shot at
 * 390×844 in both themes, `SunMoon`'s crescent-inside-rays resolves at 16px to a sun with a bite
 * taken out of it — busy, and it does not say *device*. `Monitor` is the glyph this control carries
 * in every product a user has already met one in, it reads at 16px, and it pairs with the caption
 * beneath it. The screen shape is wrong on a phone and that is the smaller error: the icon has to
 * mean "the thing you are holding decides", and no lucide glyph means that on both form factors.
 */
const CHOICES: Readonly<
  Record<ThemePreference, { readonly label: string; readonly caption: string; readonly Icon: typeof Sun }>
> = {
  light: { label: 'Light', caption: 'Always light.', Icon: Sun },
  dark: { label: 'Dark', caption: 'Always dark.', Icon: Moon },
  system: { label: 'System', caption: 'Follows your device.', Icon: Monitor },
};

/**
 * `true` once React has hydrated, and `false` in the server render — the `useSyncExternalStore`
 * form of it rather than `useState` + an effect, which is the shape `theme-provider.tsx` already
 * argues for at length and which `react-hooks/set-state-in-effect` rejects.
 *
 * `subscribe` returns a no-op teardown and never calls back: the value transitions exactly once, at
 * hydration, and React re-renders then anyway.
 */
const NEVER_CHANGES = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

/**
 * The section heading and the `<section>` around it stay in `page.tsx`, which is a Server Component
 * — so the heading ships in the HTML, it is the page's own `SectionHeading` rather than a second
 * copy of its type, and this island holds only the part that genuinely needs a browser. `labelledBy`
 * is that heading's id; the caller owns it because the caller owns the element.
 */
export function ThemeChoice({ labelledBy }: { labelledBy: string }) {
  const captionId = useId();
  const { preference, setPreference } = useTheme();
  const hydrated = useHydrated();
  // The highlight is driven from this rather than from `data-checked`, so the server render shows
  // no selection instead of the wrong one. See the header.
  const shown = hydrated ? preference : null;

  return (
    <>
      {/* Only parsed when scripting is disabled, at which point the control cannot function. The
          selector is global, so hiding the whole section works from inside it. */}
      <noscript
        dangerouslySetInnerHTML={{ __html: '<style>[data-theme-choice]{display:none}</style>' }}
      />

      {/* `grid-cols-3` rather than `flex-1` children: the three segments hold one width each, so the
          highlight moving between them does not resize anything, and `Follows your device.`
          replacing `Always dark.` below cannot reflow the track above it. */}
      <RadioGroup<ThemePreference>
        aria-labelledby={labelledBy}
        aria-describedby={captionId}
        value={preference}
        onValueChange={setPreference}
        className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-border bg-card-2 p-1 dark:bg-card"
      >
        {THEME_PREFERENCES.map((value) => {
          const { label, Icon } = CHOICES[value];
          const selected = shown === value;
          return (
            <Radio.Root
              key={value}
              value={value}
              nativeButton
              render={<button type="button" />}
              className={cn(
                // `h-11` inside a `p-1` track: a 44px target, which is the floor every other
                // control on this page is built to, and the reason this is a row of three rather
                // than a menu item that opens something.
                'flex h-11 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-clip-padding text-sm outline-none select-none',
                'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                '[&_svg]:pointer-events-none [&_svg]:shrink-0',
                PRESS_CHIP,
                selected
                  ? // **The selected segment is the raised one, and which token is "raised" flips
                    // with the theme.** `--card-2` is *one step below* `--card` in light (`#F3F1EB`
                    // against `#FFFFFF`) and *one step above* it in dark (`#2A2825` against
                    // `#201F1C`) — `globals.css` says so at the declaration. So a single pair of
                    // classes gets the figure/ground right in one theme and inverted in the other,
                    // which is what the first version shipped: photographed at 390×844, the chosen
                    // segment was the *darkest* thing in the track at night. The `dark:` variants
                    // are not a night tweak, they are the same decision expressed against a ramp
                    // that runs the other way.
                    //
                    // `shadow-raised` is the product's resting elevation token, not a shadow
                    // invented here; at night the lighter fill is what actually carries the lift.
                    'border-border bg-card font-bold text-foreground shadow-raised dark:bg-card-2'
                  : 'font-medium text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Radio.Root>
          );
        })}
      </RadioGroup>

      {/* Always rendered, so the block holds its height from the server render onward; `invisible`
          rather than absent before hydration, for the same reason the highlight is withheld — the
          caption would otherwise state `Follows your device.` at a user who chose dark. */}
      <p
        id={captionId}
        className={cn('mt-2 text-xs text-muted-foreground', hydrated ? undefined : 'invisible')}
      >
        {CHOICES[preference].caption}
      </p>
    </>
  );
}

import { CRUMB_MOODS, type CrumbMood } from './crumb-path';
import { crumbMascotMarkup, crumbMascotViewBox } from './crumb-mascot-markup';
import type { CrumbAnimation, CrumbConstruction } from './mascot-colors';

/**
 * The character, for the DOM.
 *
 * ## Why the drawing is injected rather than written as JSX
 *
 * Because it is the *same* drawing the app icon, the link preview and the favicon use, and writing
 * it twice is precisely how iteration 1's app icon ended up with a smile the component did not
 * have. `crumb-mascot-markup.ts` builds it once from `crumb-path.ts`'s geometry; satori gets it as
 * a data URI, the DOM gets it here. There is no user input anywhere in that chain — every byte
 * comes from constants in two modules this repository owns — so the injection carries no escaping
 * question, and `tests/unit/brand/crumb-mascot.test.ts` asserts the markup's shape directly.
 *
 * The alternative was a second JSX transcription of the rig kept in step by a reviewer's eye. That
 * is the arrangement §3.1 rule 1 exists to forbid for the outline, and the face turned out to need
 * it just as much.
 *
 * ## Choosing a mood is choosing a screen
 *
 * `#moods`: *"a face may only exist if there is a screen that needs it."* `mood` is required and
 * has no default, so a call site cannot drift into decoration by omission — naming `idle` is a
 * claim that this is the header, the app icon or a resting mark. Omit the face entirely by using
 * the `mono` construction, which is the silhouette and has no face by definition.
 *
 * ## Motion is a class, not a prop that reaches into the drawing
 *
 * `animation` puts `crumb-anim-*` on the `<svg>`; the stylesheet targets the groups the markup
 * emits (`crumb-all`, `crumb-eyes`, `crumb-halo`, `crumb-spark-*`). Two consequences that are the
 * point rather than side effects: `prefers-reduced-motion` is answered **once**, in CSS, for every
 * call site at once — seven animations would otherwise be seven chances to forget it — and the
 * component stays a pure function of its props with no timers, no `useEffect` and nothing to run
 * on the main thread. The transforms are compositor-friendly by construction.
 *
 * **`land` is one-shot and the others loop.** `#motion`: *"It plays once, on confirm, timed to the
 * pins dropping on the map. If it loops it stops being an event and becomes wallpaper."*
 *
 * ## Accessibility
 *
 * `aria-hidden` by default and that is almost always right: the mascot sits next to the wordmark or
 * a heading that already says the thing. A caller that is using the mascot *as* the message — an
 * empty state with no other graphic — passes `label`, which turns it into an `img` with a name.
 *
 * **A mascot is never the announcement of a state.** `aria-busy`, a live region or the visible
 * sentence beside it carries that; a face that is the only signal of "working" is a signal a screen
 * reader cannot see and a reduced-motion user gets a still frame of.
 */
export function CrumbMascot({
  mood,
  construction = 'outlined',
  animation = 'none',
  className,
  clipId,
  color,
  label,
}: {
  readonly mood: CrumbMood;
  readonly construction?: CrumbConstruction;
  readonly animation?: CrumbAnimation;
  readonly className?: string;
  /** Only needed where `#rules` rule 2 is deliberately being set aside — a specimen sheet. */
  readonly clipId?: string;
  /** Mono only: the single colour the silhouette takes. */
  readonly color?: string;
  readonly label?: string;
}) {
  return (
    <svg
      viewBox={crumbMascotViewBox(construction)}
      className={
        animation === 'none' ? className : [className, `crumb-anim-${animation}`].filter(Boolean).join(' ')
      }
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      data-mood={mood}
      data-construction={construction}
      dangerouslySetInnerHTML={{
        __html: crumbMascotMarkup({
          mood,
          construction,
          ...(clipId === undefined ? {} : { clipId }),
          ...(color === undefined ? {} : { color }),
        }),
      }}
    />
  );
}

/** The eight moods and the state each one is bound to, for anything that needs to enumerate them.
 *  Exported from here rather than re-derived so a specimen sheet cannot list a ninth. */
export const CRUMB_MOOD_STATES = CRUMB_MOODS;

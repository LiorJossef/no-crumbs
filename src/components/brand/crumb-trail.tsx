import {
  CRUMB_BOUNDS,
  CRUMB_TRAIL_DOTS,
  CRUMB_TRAIL_HEAD,
  CRUMB_TRAIL_VIEWBOX,
  type CrumbMood,
} from './crumb-path';
import { crumbMascotMarkup } from './crumb-mascot-markup';
import { MASCOT_TRAIL } from './mascot-colors';

/**
 * **The trail: three crumbs rising into the character**, and the product's one loading animation.
 *
 * `#apps`: *"Three crumbs fading in left to right, then the mascot lands — used for the import wait
 * and nothing else. It is on-concept (the trail is the product), it takes about 700ms, and it
 * replaces a generic spinner on the one screen where the user waits seven to thirty-four seconds.
 * **One animation, one place.**"* `#motion` calls it *"the only animation that draws the brand idea
 * rather than just moving the logo"*.
 *
 * `#mark` gives the silhouette four jobs — mascot, pin, favicon, trail — and this is the fourth.
 *
 * ## Why this is a component and not an `animation` on `CrumbMascot`
 *
 * Because it is not a property of the character. It is three crumbs *and* a character, in one box,
 * with a stagger between four elements — so it has its own geometry, and `CrumbAnimation` stays a
 * union of things the mascot does to itself.
 *
 * ## Why the character here is `CRUMB_PATH` and not the drawing's own fourth path
 *
 * `#crumbTrail` draws the character at the end as a separate 47-unit blob that is **not** the
 * shared outline. §3.1 rule 1 allows exactly one: *"if they change the outline, you lose the pin
 * and you are back to a teardrop like everyone else."* So the outline is the system's and only the
 * *placement* is the drawing's — `CRUMB_TRAIL_HEAD` is the box that blob occupied, measured off it.
 *
 * ## What it must not claim
 *
 * `#motion`'s constraint on the whole set, and it binds hardest here: *"none of them may imply
 * progress the product cannot measure. The import call is request/response with no percentage, so
 * an animation that fills, counts down or completes would be a lie told sixty times a day."* The
 * dots **loop** — they rise, fade and rise again. They do not fill, advance toward a total, or
 * arrive. A trail that completed once would be a progress bar drawn in crumbs.
 *
 * That is also why this carries no label and no live region. The sentence beside it says what is
 * happening; a decorative loop that announced itself would be announcing a thing it does not know.
 *
 * ## The drawn opacities are a light-ground assumption, and the night fix is in the stylesheet
 *
 * `#crumbTrail` fades the dots to 38%, 55% and 75%, which on paper reads as three crumbs receding.
 * **Rendered on the night ground it does the opposite**: opacity fades toward whatever is behind,
 * so on a near-black card the furthest dot goes nearly black and the trail loses its tail — looked
 * at, at 180px on `#131312`, not inferred. The drawing was made on one ground and the value is a
 * property of two.
 *
 * The geometry stays the drawing's, and the theme answer is where this repo already puts theme
 * answers: `.dark .crumb-trail-dot` lifts the floor in `globals.css`, so the trail follows the
 * theme with no prop, no hook and no hydration hazard — the same reasoning as `categoryColorVar()`
 * over a theme-aware literal. **If that rule is ever removed, the tail goes with it.**
 */
export function CrumbTrail({
  className,
  mood = 'idle',
}: {
  readonly className?: string;
  /**
   * The face the character at the end wears. `#motion` draws the trail with the rig's own defaults,
   * which is `idle`, so that is the default here — but the import rail passes `reading`, because
   * `#moods` binds that face to *"Import running"* and the trail is what the import wait shows.
   * One mascot per screen (`#rules` rule 2), so the trail's head **is** that screen's mascot and it
   * should be wearing that screen's face.
   */
  readonly mood?: CrumbMood;
}) {
  // The shared outline, scaled to the box the drawing gives the character and centred in it.
  const inkWidth = CRUMB_BOUNDS.maxX - CRUMB_BOUNDS.minX;
  const inkHeight = CRUMB_BOUNDS.maxY - CRUMB_BOUNDS.minY;
  const scale = CRUMB_TRAIL_HEAD.width / inkWidth;
  const x = CRUMB_TRAIL_HEAD.x - CRUMB_BOUNDS.minX * scale;
  const y =
    CRUMB_TRAIL_HEAD.y + (CRUMB_TRAIL_HEAD.height - inkHeight * scale) / 2 - CRUMB_BOUNDS.minY * scale;

  return (
    <svg
      viewBox={`0 0 ${CRUMB_TRAIL_VIEWBOX.width} ${CRUMB_TRAIL_VIEWBOX.height}`}
      className={['crumb-trail', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {CRUMB_TRAIL_DOTS.map((dot, index) => (
        <circle
          key={dot.cx}
          className={`crumb-trail-dot crumb-trail-dot-${index + 1}`}
          cx={dot.cx}
          cy={dot.cy}
          r={dot.r}
          // The dots step from the crust toward the body as they approach the character, so the
          // trail reads as the crumb gathering itself rather than as three objects.
          fill={MASCOT_TRAIL[index]}
          opacity={dot.opacity}
        />
      ))}
      {/* The character, in the Flat construction: it is 47 units wide in a 120-unit box, which
          renders around 24px at the size this is used, and `#styles` drops the keyline below 40px
          — *"reads cleaner small"*. Faced, because this is chrome and the wait is the one screen
          where a person is looking at nothing else. */}
      <g className="crumb-trail-head" transform={`translate(${x} ${y}) scale(${scale})`}>
        <g
          dangerouslySetInnerHTML={{
            __html: crumbMascotMarkup({ mood, construction: 'flat', clipId: 'crumbTrailClip' }),
          }}
        />
      </g>
    </svg>
  );
}

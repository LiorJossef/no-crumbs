'use client';

/**
 * The product's three destinations, and its one primary action, as a floating bar.
 *
 * **This reverses `ux-navigation-structure-2026-08-29.md` §1, on the owner's instruction
 * (2026-08-29).** That ruling refused a bar and answered the reachability problem with a third slot
 * in the sheet's peek row. The owner used it and asked instead for Plotline's structure — paged
 * destinations reached from persistent chrome — which is the owner's call to make and not a
 * specialist's. What follows is how the ruling's one surviving objection is paid for rather than
 * ignored, because it was a real objection.
 *
 * ## The collision the ruling named, and how this settles it
 *
 * §1.2: a persistent bottom bar and a three-stop drag sheet are two answers to the same question
 * about the bottom of a phone screen, and both ways of resolving it are bad — covered at `full` and
 * the bar is not persistent, floating over `full` and it steals the bottom of the list at the one
 * stop the list exists for.
 *
 * It is settled by **moving the import action out of the sheet**. `Add a TikTok` was a 48 px button
 * in the peek row; as the `＋` circle here it leaves the peek row carrying one line of text, which
 * frees the bottom of the 128 px peek band for this bar. So:
 *
 *  - `PEEK_PX` does not change, and therefore neither does the camera's bottom budget, the query
 *    rect, or MapLibre's attribution padding — the licence condition `globals.css` mirrors.
 *  - The bar is genuinely persistent, at every stop, because it is chrome over the viewport rather
 *    than content inside the sheet.
 *  - It does not steal from the list: the sheet's scroll container is padded by exactly this bar's
 *    height, so the last row clears it instead of hiding under it.
 *
 * ## Three destinations, and the third was ruled in by the owner
 *
 * `/map`, `/collections` and `/profile`. This paragraph said **two** and named Profile in the
 * refusal list, on the grounds that we have no settings; the owner reversed that on 2026-08-29 and
 * asked for a profile page carrying basic account information, a few library stats and sign-out.
 *
 * The reason the refusal was right and is now wrong is worth keeping, because it is what stops a
 * fourth tab: **an empty tab is a promise**, and a bar sized for destinations we do not have is the
 * template-SaaS shape Charter §6 bans. Profile stopped being empty the moment it had somewhere to
 * put sign-out — which was a permanent button over the map, a primary navigation action for
 * something people do about once a year. The rest of §4's list still binds: no Trips (Charter §1
 * declines itinerary planning), no References destination (a source link is a field on a saved
 * place, not an entity with a screen).
 *
 * **The labels moved under the icons, and only because three tabs made them.** Measured at the
 * 375 px reference viewport: the pill has 275 px of inner width, so a third tab leaves each one
 * 73 px of content — and `Collections` beside a 16 px icon needs about 102 px at `text-sm`. Every
 * phone width fails that, so a horizontal label could only ever have shipped truncated. Stacked at
 * 11 px it measures about 63 px and fits, inside the same 44 px tab height, so `BOTTOM_NAV_HEIGHT_PX`
 * does not move and neither does anything that reads it.
 *
 * `＋` is deliberately not a tab. It is an action, it changes nothing about where you are, and
 * Plotline separates it into its own circle for the same reason. It carries no `aria-current` and
 * is not inside the tab list.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Library, Map as MapIcon, Plus, UserRound } from 'lucide-react';

import { cn } from '@/lib/utils';
import { BOTTOM_NAV_HEIGHT_PX } from './bottom-nav-metrics';

/**
 * Re-exported for the client components that already import it from here — the sheet has to pad its
 * scroll container by exactly this, and two independent readings of one number is how a list comes
 * to end underneath a control.
 *
 * **A Server Component must import it from `./bottom-nav-metrics` instead**, and that module's
 * header says what happens when it does not: a non-component export of a `'use client'` module is a
 * client reference rather than a value on the server, so it interpolates into `calc()` as a thrown
 * error's source text and takes the whole declaration to `0` without anything failing loudly.
 */
export { BOTTOM_NAV_HEIGHT_PX };

/** The one thing the circle ever does. Not a prop — see the note above `BottomNavProps`. */
const ADD_LABEL = 'Add a TikTok';

interface BottomNavProps {
  /**
   * What the `＋` does on this route. Omitted, the circle links to `/import` — the standalone route
   * that has always existed and does the same job as `/map`'s overlay.
   */
  readonly onAdd?: () => void;
}

/**
 * **The `＋` means one thing on every screen, and it must stay that way.**
 *
 * It was briefly contextual — `Add a TikTok` on `/map`, `New collection` on `/collections` — to
 * resolve a visual collision with that page's own create button. That was the wrong fix and the
 * owner named it: the same circle, in the same place, doing two different jobs depending on the tab
 * is a mode, and people learn a control in persistent chrome by its gesture and its position, not
 * by the label they cannot see on it.
 *
 * So the circle is always the product's one core action, and page-level actions live on their page.
 * `/collections` creates from a row inside its own list, which is also where Plotline puts theirs.
 */

/**
 * **There is no count on the Collections tab, and that is deliberate.**
 *
 * `CollectionsNavRow` carried one and was right to: it was a row in a list, where a trailing number
 * is how a row says how much is behind it. A tab is not a row. The destination is the same whether
 * it says 2 or 12, a number beside a nav label reads as a notification badge, and Plotline's own
 * tabs carry none.
 *
 * There is also a correctness reason, which is what settled it. The two routes hold different sets:
 * `CollectionsContext` under `/map` carries the collections you can **edit**, because that is what
 * the "add to a collection" picker needs, while the index lists every membership including the ones
 * you can only view. A viewer-role collection would make the same control say `2` on one page and
 * `3` on the next. A number that changes as you cross between the two routes it exists to join is
 * worse than no number.
 */

export function BottomNav({ onAdd }: BottomNavProps) {
  const pathname = usePathname();

  // `startsWith`, so `/collections/[id]` and the join route keep the Collections tab lit rather
  // than lighting nothing. `/map` is exact — there is nothing below it.
  const onMap = pathname === '/map';
  const onCollections = pathname.startsWith('/collections');
  const onProfile = pathname === '/profile';

  return (
    <nav
      aria-label="Main"
      style={{ height: `calc(${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom))` }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md items-start gap-2 px-3 lg:hidden"
    >
      {/* Two surfaces, not one, and the gap between them is the point. The destinations live in
          the pill; the action is its own detached circle beside it. That is the separation Plotline
          makes and the reason `＋` is not a third tab: it does not take you anywhere, so it should
          not sit in the control that says where you are. It also puts the one destructive-ish tap
          — the one that opens a full-screen takeover — a deliberate distance from the two that
          merely navigate. */}
      <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1 rounded-full border border-border/70 bg-card/90 p-1.5 shadow-[var(--shadow-elevated)] backdrop-blur-md">
        {/* A `<Link>` to the route you are already on, rather than a disabled control. It is the
            cheapest correct answer for a two-destination bar: the browser handles the no-op, the
            control keeps its accessible name and its focus behaviour, and nothing has to model
            "pressed but inert". */}
        <NavTab href="/map" icon={MapIcon} label="Map" active={onMap} />
        <NavTab href="/collections" icon={Library} label="Collections" active={onCollections} />
        <NavTab href="/profile" icon={UserRound} label="Profile" active={onProfile} />
      </div>
      <AddButton {...(onAdd ? { onAdd } : {})} />
    </nav>
  );
}

function NavTab({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: '/map' | '/collections' | '/profile';
  icon: typeof MapIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      // `page`, not `true`: this marks the tab whose route is the current document, which is
      // exactly what `aria-current="page"` means. `true` would be a weaker, vaguer claim.
      {...(active ? { 'aria-current': 'page' as const } : {})}
      className={cn(
        'flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {/* Visually hidden rather than removed under 360 px, so a narrow phone gets a bar of icons
          on screen and a bar of named controls in the accessibility tree. A CSS breakpoint, never
          a media query in JavaScript — `map-page-client.tsx` forbids the latter outright. The
          threshold still holds at three tabs: `Collections` at 11 px measures ~63 px against 73 px
          of content width at 375 and ~57 px at 320, which is where it would start to truncate. */}
      <span className="max-w-full truncate text-[11px] leading-none max-[359px]:sr-only">
        {label}
      </span>
    </Link>
  );
}

/**
 * The add action.
 *
 * Filled and circular so it reads as the one thing on the bar that *does* something rather than
 * going somewhere — the same separation Plotline makes, and the reason it is outside the two tabs
 * instead of being a third one.
 *
 * The visible glyph is a `＋` because at this size a label does not fit, so the accessible name
 * carries the whole meaning. It is a constant, deliberately — see the note above `BottomNavProps`.
 */
function AddButton({ onAdd }: { onAdd?: () => void }) {
  // `size-14`, taller than the 44 px tabs beside it, because it is its own surface rather than a
  // control inside one — it has to read as a peer of the pill, not as a chip that escaped it.
  const className =
    'pointer-events-auto flex size-14 shrink-0 items-center justify-center rounded-full border border-border/70 bg-primary text-primary-foreground shadow-[var(--shadow-elevated)] backdrop-blur-md transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

  if (!onAdd) {
    return (
      <Link href="/import" aria-label={ADD_LABEL} className={className}>
        <Plus className="size-5" aria-hidden />
      </Link>
    );
  }

  return (
    <button type="button" onClick={onAdd} aria-label={ADD_LABEL} className={className}>
      <Plus className="size-5" aria-hidden />
    </button>
  );
}

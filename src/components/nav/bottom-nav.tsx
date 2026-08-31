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

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Library, Loader2, Map as MapIcon, Plus, UserRound } from 'lucide-react';

import type { MapPlace } from '@/components/map/types';
import { cn } from '@/lib/utils';
import { PRESS_BUTTON, PRESS_CHIP } from '@/lib/interaction';
import { BOTTOM_NAV_HEIGHT_PX } from './bottom-nav-metrics';

/**
 * Both loaded on press, not on paint — and this is a **bundle-weight** decision, not a correctness
 * one.
 *
 * `place-sheet.tsx` imports this file for `BOTTOM_NAV_HEIGHT_PX`, so whatever this module pulls
 * in statically lands in that chunk too: the create sheet and the whole import screen, the
 * product's largest client module, for one number.
 *
 * This comment used to claim a static import would also drag `server-only` in behind them. It
 * would not, and `tests/unit/nav/bottom-nav-import-boundary.test.ts` measures it: walking the
 * graph with both imports treated as static reaches no `server-only` module, because every chain
 * into server code passes through `app/actions/manual-add.ts`, a `'use server'` boundary a client
 * component may cross. `map-page-client.tsx` imports both statically and builds.
 *
 * Both carry a `loading:`. Without one the fallback is nothing at all, and the import branch below
 * renders a full-screen container — measured at 390×844 with the chunk throttled, that was 5.4 s
 * of a transparent `fixed inset-0` swallowing every tap with nothing on screen to explain it.
 */
const AddSheetHost = dynamic(
  () => import('@/components/add/add-sheet-host').then((mod) => mod.AddSheetHost),
  { ssr: false, loading: () => <CreateMenuPending /> },
);
const ImportPageClient = dynamic(
  () => import('@/app/import/import-page-client').then((mod) => mod.ImportPageClient),
  { ssr: false, loading: () => <ImportPending /> },
);

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

/**
 * What the circle does, everywhere. Not a prop: a caller may not *rename* this button — see the
 * note under `BottomNavProps`.
 */
const ADD_LABEL = 'Create';

interface BottomNavProps {
  /**
   * Open this route's own create menu, with this route's library in it. Passed by `/map`; omitted
   * everywhere else, where this component opens the same menu itself.
   */
  readonly onAdd?: () => void;
  /**
   * The library that menu should search, for a route that hosts no menu of its own. Every such
   * route loads it: `/collections/[id]` for its picker, `/collections` and `/profile` for this.
   *
   * Ignored when `onAdd` is passed, because that route is opening its own menu with its own
   * library. The default is empty only so a caller with genuinely no library — a test, a future
   * route — is expressible; **it is not a shape a real screen should ship in.** The menu's search
   * is `Array.prototype.filter` over this array, so an empty one answers "nothing you've saved
   * matches that" for places the user has, and the only action it then offers writes a duplicate
   * row and spends one of 100 daily Google Places lookups doing it.
   */
  readonly places?: readonly MapPlace[];
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

export function BottomNav({ onAdd, places = [] }: BottomNavProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  /** The menu is in the tree only after the `＋` has been pressed once, which is what makes the
   *  dynamic import above true: mounted unconditionally, it would fetch its chunk on paint on every
   *  route that draws this bar, and its `loading:` fallback would paint a sheet nobody opened. */
  const [menuMounted, setMenuMounted] = useState(false);
  /** The link the user pressed `Add this TikTok` on, on a tab with no import overlay of its own.
   *  Never a draft — mounting the overlay with one spends a model call, which is
   *  `ImportPageClient.initialUrl`'s stated contract. */
  const [importUrl, setImportUrl] = useState<string | null>(null);
  const router = useRouter();

  function openMenu() {
    setMenuMounted(true);
    setMenuOpen(true);
  }

  // `startsWith`, so `/collections/[id]` and the join route keep the Collections tab lit rather
  // than lighting nothing. `/map` is exact — there is nothing below it.
  const onMap = pathname === '/map';
  const onCollections = pathname.startsWith('/collections');
  const onProfile = pathname === '/profile';

  // `/collections/[id]` is a section match, not the current document, so the tab is `true` there
  // and `page` only on the index itself.
  const collectionsCurrent: NavCurrent = !onCollections
    ? false
    : pathname === '/collections'
      ? 'page'
      : 'true';

  if (importUrl !== null) {
    // The bar is not rendered beside it: a half-finished import is a takeover, and a tab out of one
    // is not a thing to offer. `/map` guards its own copy of this overlay the same way.
    return (
      <div className="fixed inset-0 z-50">
        <ImportPageClient
          initialUrl={importUrl}
          onClose={() => setImportUrl(null)}
          // Whatever was saved is a pin, and the map is the only surface that shows one.
          onSaved={() => router.push('/map')}
          onAddManually={() => {
            setImportUrl(null);
            openMenu();
          }}
        />
      </div>
    );
  }

  return (
    <>
      <nav
        aria-label="Main"
        style={{
          height: `calc(${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom))`,
        }}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md items-start gap-2 px-3 lg:hidden"
      >
        {/* Two surfaces, not one, and the gap between them is the point. The destinations live in
            the pill; the action is its own detached circle beside it. That is the separation Plotline
            makes and the reason `＋` is not a third tab: it does not take you anywhere, so it
            should not sit in the control that says where you are. It also puts the one
            destructive-ish tap — the one that opens a full-screen takeover — a deliberate distance
            from the two that merely navigate. */}
        <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1 rounded-full border border-border/70 bg-card/90 p-1.5 shadow-sheet backdrop-blur-md">
          {/* A `<Link>` to the route you are already on, rather than a disabled control. It is
              the cheapest correct answer for a two-destination bar: the browser handles the no-op,
              the control keeps its accessible name and its focus behaviour, and nothing has to
              model "pressed but inert". */}
          <NavTab href="/map" icon={MapIcon} label="Map" current={onMap && 'page'} />
          <NavTab
            href="/collections"
            icon={Library}
            label="Collections"
            current={collectionsCurrent}
          />
          <NavTab href="/profile" icon={UserRound} label="Profile" current={onProfile && 'page'} />
        </div>
        <AddButton onAdd={onAdd ?? openMenu} />
      </nav>
      {/* Outside the `<nav>`: a sheet is not navigation, and the bar's own `pointer-events-none`
          and `lg:hidden` are about the bar. Only for the tabs with no menu of their own — `/map`
          passes `onAdd` and opens its own, with its library in it. */}
      {onAdd || !menuMounted ? null : (
        <HostlessCreateMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          places={places}
          onSubmitTikTok={setImportUrl}
        />
      )}
    </>
  );
}

/** `page` when this tab's route *is* the current document, `true` when the document merely lives
 *  under it, `false` when neither. The distinction is the whole reason this is not a boolean. */
type NavCurrent = 'page' | 'true' | false;

function NavTab({
  href,
  icon: Icon,
  label,
  current,
}: {
  href: '/map' | '/collections' | '/profile';
  icon: typeof MapIcon;
  label: string;
  current: NavCurrent;
}) {
  return (
    <Link
      href={href}
      {...(current === false ? {} : { 'aria-current': current })}
      className={cn(
        'flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 font-medium motion-safe:transition-colors',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        // Rest and hover unconditionally; the on state as a variant over the attribute that is
        // already on the element (rule 6a — state comes from the DOM, never from a class string
        // assembled by a ternary). `aria-[current]` matches on the attribute's *presence* rather
        // than on a value, because this component passes `'page'` for the route you are on and
        // `'true'` for a section within it, and both mean on. A ternary here could render a tab
        // looking selected while telling a screen reader it is not; this shape cannot.
        'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        'aria-[current]:bg-muted aria-[current]:text-foreground',
        // The matrix's press for a nav tab is the chip's 5%: a 44px target with no fill of its own
        // and, on a phone, no hover and no focus-visible to confirm the tap landed.
        PRESS_CHIP,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {/* Visually hidden rather than removed under 360 px, so a narrow phone gets a bar of icons
          on screen and a bar of named controls in the accessibility tree. A CSS breakpoint, never
          a media query in JavaScript — `map-page-client.tsx` forbids the latter outright. The
          threshold still holds at three tabs: `Collections` at 11 px measures ~63 px against 73 px
          of content width at 375 and ~57 px at 320, which is where it would start to truncate. */}
      <span className="max-w-full truncate text-micro leading-none max-[359px]:sr-only">
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
function AddButton({ onAdd }: { onAdd: () => void }) {
  // `size-14`, taller than the 44 px tabs beside it, because it is its own surface rather than a
  // control inside one — it has to read as a peer of the pill, not as a chip that escaped it.
  //
  // **`PRESS_BUTTON`, not `PRESS_CHIP`, and this was W3-1's one miss.** The tabs beside it got a
  // press and this did not, which left the single most-pressed control in the product — the entry
  // point to the whole create flow — with no acknowledgement at all. On a phone there is no hover
  // and no focus-visible, so the only confirmation a tap had landed was the sheet arriving a beat
  // later.
  //
  // It takes the *primary button's* row of the matrix rather than the icon button's, because that
  // is what it is: `bg-primary text-primary-foreground`, the same fill the `default` variant has,
  // rendered round. The size argument points the same way — the matrix gives icon buttons 5%
  // because "at 24–36px a 1.5% squeeze is under half a pixel", and at 56px 1.5% is 1.1px of travel
  // on every edge of a large circle, which is comfortably perceptible.
  //
  // **The shadow drops one level rather than to nothing**, which is the difference between this
  // and the `default` variant. `default` goes `shadow-raised` → none because it sits on the page;
  // this floats over the map, and a floating action button that lands flat on press reads as
  // having been switched off rather than pushed. `shadow-sheet` → `shadow-raised` is the matrix's
  // "drops a level" said literally.
  //
  // `transition-colors` is **deleted, not prefixed**. With `PRESS_BUTTON`'s
  // `motion-safe:transition` in the string it is superseded for every pointer user, so it survived
  // only in the reduced-motion branch — the same shape as the `transition-all` removed from the
  // button base in `979ebcc`, arrived at from the other direction. `motion-safe:transition`
  // carries background-color anyway, so nothing is lost.
  const className = cn(
    'pointer-events-auto flex size-14 shrink-0 items-center justify-center rounded-full border border-border/70 bg-primary text-primary-foreground shadow-sheet backdrop-blur-md hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
    'active:shadow-raised',
    PRESS_BUTTON,
  );

  return (
    <button type="button" onClick={onAdd} aria-label={ADD_LABEL} className={className}>
      <Plus className="size-5" aria-hidden />
    </button>
  );
}

/**
 * The create menu for the tabs that have no library of their own.
 *
 * The circle used to be a `<Link href="/import">` here, which broke the one rule this control has:
 * it skipped the menu, offered only a TikTok, and on a collection route it was a one-way door out
 * of the collection. This is the same `AddSheetHost` `/map` opens, with the two things a host owes
 * it supplied locally — an import overlay for a submitted link, and somewhere to send a place that
 * was just saved.
 *
 * The library is whatever the host route has in hand, and every route that draws this menu now
 * loads one — see `BottomNavProps.places` for what an empty one does to the search.
 *
 * **Where a picked or newly saved place goes.** `/map`, with that place revealed: it is the only
 * surface that shows a pin, and arriving on the whole map with no camera move and no selection is
 * indistinguishable from the tap having done nothing. The id travels as a query param because these
 * are separate documents — the navigation unmounts this tree — and `map-page-client.tsx` consumes
 * it once and strips it from the URL, so selection stays client state (`ux-architecture.md` §1.5)
 * rather than becoming addressable. A reload restores no selection.
 */
function HostlessCreateMenu({
  open,
  onOpenChange,
  places,
  onSubmitTikTok,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  places: readonly MapPlace[];
  onSubmitTikTok: (url: string) => void;
}) {
  const router = useRouter();

  return (
    <AddSheetHost
      open={open}
      onOpenChange={onOpenChange}
      places={places}
      onSelectPlace={(id) => router.push(revealHref(id))}
      onSubmitTikTok={onSubmitTikTok}
      onManualSaved={(saved) => router.push(revealHref(saved.savedPlaceId))}
    />
  );
}

/**
 * `/map`, carrying which saved place to open on arrival. The param is a handoff, not state: the map
 * clears it the moment it has read it.
 *
 * The cast is the one `sign-in/page.tsx` already makes for `?next=` — `typedRoutes` types the route
 * literal and has nothing to say about a query string on it.
 */
function revealHref(savedPlaceId: string) {
  return `/map?place=${encodeURIComponent(savedPlaceId)}` as '/map';
}

/**
 * What the `＋` shows while the create sheet's chunk is in flight.
 *
 * Sheet-shaped and scrimmed, matching what is about to replace it, because the alternative is a
 * press that appears to have done nothing for as long as the network takes. It is deliberately
 * inert — the fallback has no props and therefore no way to reach `onOpenChange` — so it says what
 * it is doing rather than offering a control that would not work.
 */
function CreateMenuPending() {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-scrim" aria-hidden />
      <div className="relative w-full rounded-t-2xl border-t border-border/70 bg-card pt-2.5 pb-[calc(env(safe-area-inset-bottom)+2rem)] shadow-sheet">
        <span className="mx-auto block h-1 w-9 rounded-full bg-border" aria-hidden />
        <p
          role="status"
          className="flex items-center justify-center gap-2 pt-6 text-sm font-medium text-muted-foreground"
        >
          {/* **Hidden under reduced motion rather than frozen**, and that is the whole of the
              inversion here rather than a mechanical prefix. `motion-safe:animate-spin` alone
              leaves a *stationary* `Loader2` on screen for anyone who asked for less motion, and
              that glyph is a three-quarter arc: still, it does not read as a spinner at rest, it
              reads as a rendering artefact. Measured on `/sign-in` at 390x844 — the same shape of
              spinner, computed `animation-name: spin` under `prefers-reduced-motion: reduce`.
              `Opening…` is right beside it and carries the whole meaning on its own, so the
              reduced arm is the word alone. §3a's "collapse to the opacity change, not to
              nothing" is satisfied by the text, which never leaves. */}
          <Loader2 className="hidden size-4 motion-safe:block motion-safe:animate-spin" aria-hidden />
          Opening…
        </p>
      </div>
    </div>
  );
}

/**
 * The same, for the import screen — and this one is the reason both have a fallback. The branch
 * that renders it early-returns a full-screen container, so with no fallback that container is
 * transparent and empty while the chunk loads: every tap on the viewport lands on it, and nothing
 * on screen accounts for it.
 */
function ImportPending() {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3"
      style={{ background: 'var(--brand-wash)' }}
    >
      {/* Same rule as `CreateMenuPending` above: no glyph at all under reduced motion rather than
          a frozen one, with `Opening…` directly below carrying the state. */}
      <Loader2
        className="hidden size-5 text-brand motion-safe:block motion-safe:animate-spin"
        aria-hidden
      />
      <p role="status" className="text-sm font-medium text-muted-foreground">
        Opening…
      </p>
    </div>
  );
}

'use client';

/**
 * The product's two destinations, and its one primary action, as a floating bar.
 *
 * ## It held three until 2026-08-31, and `Collections` moved into the drawer
 *
 * Owner: *"the collection / places navigation should be inside the drawer"*. That is a different
 * claim from "there should be fewer tabs", and it is the right one. A tab says **which screen you
 * are on**; Places and Collections are not two screens, they are two lists on the same screen —
 * the same map, the same drawer, the same camera, with different rows in it. Sending that choice
 * through the bar meant a route change, and a route change unmounted the sheet: measured at
 * `c585ce7`, 390x844, tapping this bar's `Collections` tab replaced the element carrying
 * `data-testid="place-sheet"` (1 -> 2 distinct nodes) and let vaul animate the new one up from the
 * bottom of the screen, 844 -> 703 -> 458 -> 248 -> 129 -> 77 -> 25 -> 0 px. The switch now lives
 * in `map-shell.tsx`'s `DrawerViewSwitch`, where changing view is not a change of screen.
 *
 * **What that costs, stated rather than buried:** from `/profile`, which has no drawer, reaching a
 * collection is now two taps (Map, then Collections) where it was one. That is the price of the
 * control living on the surface it acts on, and it is paid on the one screen in the product that
 * is not the map.
 *
 * **Why `Map` stays a tab even though the switch's `Places` reaches the same list.** They are not
 * the same control: `Map` is how a person on `/profile` gets back to the product, and it is the
 * only thing in the bar that answers that. On the map itself it is a link to the route you are
 * already on, which is the same cheap no-op it has always been.
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
 * It is settled by **moving the import action out of the sheet**. `Add a TikTok link` was a 48 px button
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
 * ## Two destinations, and Profile was ruled in by the owner
 *
 * `/map` and `/profile`. This paragraph once refused Profile on the grounds that we have no
 * settings; the owner reversed that on 2026-08-29 and asked for a profile page carrying basic
 * account information, a few library stats and sign-out.
 *
 * The reason the refusal was right and is now wrong is worth keeping, because it is what stops a
 * third tab coming back: **an empty tab is a promise**, and a bar sized for destinations we do not
 * have is the template-SaaS shape Charter §6 bans. Profile stopped being empty the moment it had
 * somewhere to put sign-out — which was a permanent button over the map, a primary navigation
 * action for something people do about once a year. The rest of §4's list still binds: no Trips
 * (Charter §1 declines itinerary planning), no References destination (a source link is a field on
 * a saved place, not an entity with a screen).
 *
 * **The labels stay under the icons.** They moved there when there were three tabs and 73 px of
 * content width each; at two there is room for a horizontal label, and the stack is kept anyway
 * because `BOTTOM_NAV_HEIGHT_PX` is read by five surfaces that pad themselves clear of this bar and
 * a 68 px constant that moves for a layout preference is not worth the blast radius. The
 * `max-[359px]:sr-only` threshold is now comfortably clear rather than marginal.
 *
 * `＋` is deliberately not a tab. It is an action, it changes nothing about where you are, and
 * Plotline separates it into its own circle for the same reason. It carries no `aria-current` and
 * is not inside the tab list.
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { lazy, Suspense, useState } from 'react';
import { Loader2, Map as MapIcon, Plus, UserRound } from 'lucide-react';

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
/**
 * **The account menu, on the same terms as the two above and for the same reason.**
 *
 * `tests/unit/nav/bottom-nav-import-boundary.test.ts` holds this file's static graph at exactly
 * four internal modules, because `place-sheet.tsx` imports it for one number and inherits whatever
 * lands here. The menu reaches a `localStorage` radio group, the two-branch deletion flow and Base
 * UI's popover; statically imported, all of that would ride into the sheet's chunk for a surface
 * most sessions never open.
 *
 * **`React.lazy` rather than `next/dynamic`, and the difference is the fallback.** `dynamic`'s
 * `loading` component takes no props, so it cannot render *this* tab — it would have to render a
 * generic one, and the tab would lose its `aria-current` for as long as the chunk took. With
 * `Suspense` the fallback is the very element that was just pressed, so nothing on screen moves
 * while the chunk arrives.
 *
 * **The trigger lives inside the loaded module, not out here.** An anchored popup driven by an
 * outside button double-toggles: Base UI dismisses on the outside press, the button's own click
 * then reopens it, and the menu cannot be closed by the control that opened it. Handing
 * `Popover.Trigger` the element solves that by construction, which is why `ProfileMenu` takes the
 * button rather than a ref to it.
 */
const ProfileMenu = lazy(() =>
  import('./profile-menu').then((mod) => ({ default: mod.ProfileMenu })),
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
 * It was briefly contextual — `Add a TikTok link` on `/map`, `New collection` on `/collections` — to
 * resolve a visual collision with that page's own create button. That was the wrong fix and the
 * owner named it: the same circle, in the same place, doing two different jobs depending on the tab
 * is a mode, and people learn a control in persistent chrome by its gesture and its position, not
 * by the label they cannot see on it.
 *
 * So the circle is always the product's one core action, and page-level actions live on their page.
 * `/collections` creates from a row inside its own list, which is also where Plotline puts theirs.
 */

/**
 * **There is no count on any tab here, and none on the drawer's `Collections` switch either.**
 *
 * The `Collections` row in the desktop panel carried one and was right to: it was a row in a list,
 * where a trailing number is how a row says how much is behind it. (That row was deleted on
 * 2026-08-31, for the same reason this tab was — the drawer's switch reaches the view from the top
 * of the same column.) A tab is not a row, and neither is a switch segment. The destination is the same whether
 * it says 2 or 12, a number beside a nav label reads as a notification badge, and Plotline's own
 * tabs carry none.
 *
 * There is also a correctness reason, which is what settled it and which outlived the tab.
 * `CollectionsContext` under `/map` carries the collections you can **edit**, because that is what
 * the "add to a collection" picker needs, while the index lists every membership including the ones
 * you can only view. A viewer-role collection would make the same control say `2` in one view and
 * `3` in the next. A number that changes as you cross between the two things it exists to join is
 * worse than no number.
 */

export function BottomNav({ onAdd, places = [] }: BottomNavProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  /** The menu is in the tree only after the `＋` has been pressed once, which is what makes the
   *  dynamic import above true: mounted unconditionally, it would fetch its chunk on paint on every
   *  route that draws this bar, and its `loading:` fallback would paint a sheet nobody opened. */
  const [menuMounted, setMenuMounted] = useState(false);
  /** The link the user pressed `Add this TikTok link` on, on a tab with no import overlay of its own.
   *  Never a draft — mounting the overlay with one spends a model call, which is
   *  `ImportPageClient.initialUrl`'s stated contract. */
  const [importUrl, setImportUrl] = useState<string | null>(null);
  const router = useRouter();

  function openMenu() {
    setMenuMounted(true);
    setMenuOpen(true);
  }

  // **Every collections URL lights the `Map` tab**, because the collections views *are* the map
  // screen with different rows in the drawer. Since the route merge they are search params on
  // `/map`, so `pathname` already says `/map` and the first arm covers them.
  //
  // The `/collections` arm is kept for the redirect shims, which are a real if brief URL — a hard
  // load of a shared link paints once at that path before the redirect lands. Lighting nothing
  // there would tell a screen reader user that they are on none of the product's destinations
  // while looking at one of them.
  const onMap = pathname === '/map' || pathname.startsWith('/collections');
  // `/account` counts, and the reason is the same one that makes every collections URL light
  // `Map`: the settings page is reached only from this control's menu, so a bar that marked
  // nothing there would tell a screen reader user they are on none of the product's destinations
  // while looking at one. See `ProfileTab` for why the attribute sits on a button.
  const onProfile = pathname === '/profile' || pathname === '/account';

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
          <NavTab href="/map" icon={MapIcon} label="Map" current={onMap} />
          <ProfileTab current={onProfile} />
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

/**
 * One tab's appearance, as a string, because two elements now wear it: `Map` is a `<Link>` and
 * `Profile` is the button that opens the account menu. Extracting it is what stops the bar growing
 * two slightly different tabs.
 *
 * The `aria-` variants are the whole state model. Rest and hover apply unconditionally; the on
 * state is a variant over an attribute that is already on the element (rule 6a — state comes from
 * the DOM, never from a class string assembled by a ternary), so a tab cannot look selected while
 * telling a screen reader it is not. `aria-[current]` matches on the attribute's *presence*.
 * `aria-expanded` is the second one and belongs to the menu button alone: an open menu is a state
 * of the control, and without it the trigger looks identical whether or not its popup is up.
 */
const NAV_TAB_CLASS = cn(
  'flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 font-medium motion-safe:transition-colors',
  'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
  'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  'aria-[current]:bg-muted aria-[current]:text-foreground',
  'aria-expanded:bg-muted aria-expanded:text-foreground',
  // The matrix's press for a nav tab is the chip's 5%: a 44px target with no fill of its own
  // and, on a phone, no hover and no focus-visible to confirm the tap landed.
  PRESS_CHIP,
);

/**
 * **The `Profile` slot is a menu button, not a destination** (owner, 2026-08-31: *"convert the
 * profile page, into a profile popover menu when clicking the profile avatar"*).
 *
 * It was a `<Link href="/profile">`, and `/profile` is the last route segment outside
 * `MAP_ROUTES` — so tapping it released the persistent MapLibre instance and rebuilt the whole map
 * on the way back. `profile-menu.tsx` has the mechanism and the measurement. A menu that opens over
 * the current route never navigates, so nothing is released.
 *
 * **`aria-current` stays, on a button.** ARIA allows it on any element and it is the honest answer
 * on `/profile` and `/account`: those two pages belong to this control, and a bar that marked
 * neither would leave a screen reader user on none of the product's destinations. It is not a claim
 * that the button is a link.
 *
 * **The visible label stays the constant `Profile`.** A name here would be the failure mode the
 * brief names — a product that says your name constantly — and worse, chrome is learned by position
 * and label, so a label that differs per account is not a label. The name appears inside the menu,
 * where it answers *which account is this*.
 */
function ProfileTab({ current }: { current: boolean }) {
  /** The menu's chunk is fetched by the first press and never before — see `ProfileMenu` above. */
  const [mounted, setMounted] = useState(false);

  /**
   * The tab itself, and it is one element used two ways: rendered plainly until the menu exists,
   * then handed to `Popover.Trigger` as its `render` prop, which merges `aria-haspopup`,
   * `aria-expanded` and its own click handling onto exactly this markup.
   *
   * `onClick` is attached only in the first state. Once the menu is mounted the popover owns the
   * press, and a second handler here would mount what is already mounted.
   *
   * **`aria-current="true"`, never `"page"`.** `page` means *this link points at the document you
   * are reading*, and this is not a link — it opens a menu. `true` is the generic member of the
   * same attribute: *the current item within this set of related elements*, which is exactly what
   * the account control is while you are on `/profile` or `/account`. The styling reads
   * `aria-[current]`, which matches on the attribute's presence, so the highlight is unchanged and
   * the claim is narrower.
   */
  const trigger = (
    <button
      type="button"
      data-profile-trigger
      {...(current ? { 'aria-current': 'true' as const } : {})}
      {...(mounted ? {} : { onClick: () => setMounted(true) })}
      className={NAV_TAB_CLASS}
    >
      <UserRound className="size-4 shrink-0" aria-hidden />
      <span className="max-w-full truncate text-micro leading-4 max-[359px]:sr-only">Profile</span>
    </button>
  );

  return (
    <>
      {/* Only parsed with scripting off, at which point the button cannot open anything. Same
          mechanism `theme-choice.tsx` uses, for the same reason: a control that appears to offer
          something it cannot do is worse than no control. */}
      <noscript
        dangerouslySetInnerHTML={{ __html: '<style>[data-profile-trigger]{display:none}</style>' }}
      />
      {mounted ? (
        <Suspense fallback={trigger}>
          {/* `initialOpen`, because the press that mounted this is the press that opens it. Every
              press after the first goes through the popover's own trigger. */}
          <ProfileMenu trigger={trigger} side="top" align="end" initialOpen />
        </Suspense>
      ) : (
        trigger
      )}
      {/* The door with scripting off: a plain link to the page, which still exists and still holds
          everything the menu holds. Rendered as markup rather than as JSX because `<noscript>`
          children are parsed as text by React's server renderer. Text-only — a lucide glyph is a
          React component and cannot be interpolated into a string — which is why this is a
          fallback and not a second implementation. */}
      <noscript
        dangerouslySetInnerHTML={{
          __html: `<a href="/profile" class="${NAV_TAB_CLASS}">Profile</a>`,
        }}
      />
    </>
  );
}

function NavTab({
  href,
  icon: Icon,
  label,
  current,
}: {
  href: '/map';
  icon: typeof MapIcon;
  label: string;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      {...(current ? { 'aria-current': 'page' as const } : {})}
      className={NAV_TAB_CLASS}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {/* Visually hidden rather than removed under 360 px, so a narrow phone gets a bar of icons
          on screen and a bar of named controls in the accessibility tree. A CSS breakpoint, never
          a media query in JavaScript — `map-page-client.tsx` forbids the latter outright. The
          threshold still holds at three tabs: `Collections` at 11 px measures ~63 px against 73 px
          of content width at 375 and ~57 px at 320, which is where it would start to truncate. */}
      {/* **`leading-4` and not `leading-none`, and it is a clipping fix rather than a spacing
          preference.** `truncate` is `overflow: hidden`, which clips to the *content box* — and the
          content box is the line-height. At `leading-none` that box is 11px while this font's
          inline box at 11px is **15px**, so 2px was being shaved off each end. Photographed at
          390x844 dark, dsf 3, by re-rendering with the clip released and diffing: **20 device
          pixels of fully opaque ink, worst channel delta 628** — the descender of the `p` in `Map`,
          cut off square. Latin, as shipped, with no substitution needed to provoke it.

          The tab has the room. It is `h-11` with a 16px icon and a 2px gap, so the stack goes from
          29px to 34px inside 44px and `justify-center` keeps it centred. */}
      <span className="max-w-full truncate text-micro leading-4 max-[359px]:sr-only">
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

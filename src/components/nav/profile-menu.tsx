'use client';

/**
 * **The account menu — the profile surface, opened over whatever you are looking at.**
 *
 * Owner, 2026-08-31: *"convert the profile page, into a profile popover menu when clicking the
 * profile avatar."*
 *
 * ## What this fixes, and it is not only a matter of taste
 *
 * `/profile` is the **last sibling route segment** in this product. Places and collections stopped
 * being segments on 2026-08-31 and became search params on `/map` precisely because a segment
 * change unmounts the outgoing subtree; profile is the one surface still paying it.
 *
 * The mechanism has moved since that fix and the new one is sharper. `persistent-map.tsx` hoists
 * the single MapLibre instance into the root layout, so a route change no longer destroys it by
 * itself — what destroys it is an **allow-list**:
 *
 *     export const MAP_ROUTES = ['/map', '/collections', '/import'] as const;
 *
 * `MapCanvasHost` publishes `null` for any path outside it, which unmounts `MapSurface` and takes
 * its WebGL context with it. `/profile` is outside it, deliberately — the comment there argues the
 * release as a privacy rule, because a parked map holds the signed-in user's pins in the document
 * and sign-out must not leave them there for the next account.
 *
 * So the release is correct and this does not touch it. **A menu that opens *over* the current
 * route never navigates, so the allow-list is never consulted and the map is never released.** That
 * is the whole of the repair, and it is why this is a popover rather than a faster route.
 *
 * ## What is in here, and where the line is drawn
 *
 * The menu takes the **account-shaped half** of `/profile`: who you are, the theme, the way to
 * account settings, the way out, and delete-my-data. It also takes the **three headline figures**,
 * because *"what have I built here"* is the one thing on that page a person wants at a glance and a
 * glance is exactly what a menu is for.
 *
 * It does **not** take the breakdown lists — `Where you save` and `What you save`. Those are a
 * small piece of personal cartography, they are the nicest thing on that page, and they are a list
 * of up to a dozen rows: a glance is three numbers, a page is nine countries. They stay at
 * `/profile`, which this menu links to, and which keeps working as a URL exactly as it does today.
 *
 * **Nothing is deleted and no URL breaks.** `/profile` is unchanged in content; what it loses is
 * its tab in `BottomNav`, which is now this menu's trigger.
 *
 * ## Two islands are imported from the route rather than copied
 *
 * `ThemeChoice` and `AccountActions` live under `app/profile/`. Importing them from
 * `components/nav/` runs against the usual direction of travel, and the alternative was worse:
 * either two copies of a `localStorage` radio group and a two-branch deletion flow whose every
 * string is `overnight-copy-deck.md` §5 verbatim, or a move that would strand the path references
 * in `globals.css`, `lib/theme.ts` and two test files that other lanes are holding right now. One
 * definition each, imported. If `/profile` is ever retired, they move then.
 *
 * ## Without JavaScript
 *
 * A popover cannot open, so the trigger would be a control that does nothing. `BottomNav` renders a
 * plain `<a href="/profile">` inside a `<noscript>` beside it and hides the button with the same
 * `<noscript><style>` trick `theme-choice.tsx` uses — so the door to the profile surface survives
 * with scripting off, as a link to the page that still exists. The page is the fallback; that is
 * the second reason it was not folded into this component.
 */

import { useLayoutEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Popover } from '@base-ui/react/popover';
import { ChevronRight, LogOut, Settings, UserRound } from 'lucide-react';

import { signOut } from '@/app/actions/sign-out';
import { loadProfileMenu, type ProfileMenuData } from '@/app/actions/profile';
import { AccountActions } from '@/app/profile/account-actions';
import { ThemeChoice } from '@/app/profile/theme-choice';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ENTER_POPOVER, ENTER_SCRIM, PRESS_ROW } from '@/lib/interaction';

/**
 * Every string on this surface, in one place.
 *
 * `Your library` and `Account settings` are destinations and are named as such;
 * `voice-and-vocabulary.md` §4 puts the concrete word above the technical one, and *Settings* alone
 * would be a section this product does not have. The delete flow's strings are not here — they are
 * `AccountActions`' own, from the copy deck, and a second copy of them in this file is exactly how
 * the sentence that tells somebody their data is gone comes to differ between two screens.
 */
const COPY = {
  /** The accessible name of the trigger when there is no name to use. See `triggerLabel`. */
  triggerFallback: 'Your account',
  library: 'Your library',
  libraryHint: 'Where you save, and what',
  settings: 'Account settings',
  appearance: 'Appearance',
  signOut: 'Sign out',
  /** The last stop in the focus trap, and the only way out for a touch screen reader. Never
   *  visible: sighted users close this menu by pressing outside it or by pressing Escape. */
  close: 'Close this menu',
  loading: 'Loading your account…',
  failed: 'Couldn’t load your account.',
} as const;

/**
 * What a screen reader hears on the trigger.
 *
 * **A name when there is one, and never the email in a name's slot.** That last clause is not
 * hypothetical: `/profile` shipped `identity.title` into a heading, which fell through to the
 * address for every account predating `0035` — which is all of them — and read as *"the profile
 * screen shows a demo email"*. `accountIdentity` carries the whole root cause.
 *
 * This is one of the three sites where a name is used at all; the visible tab label stays the
 * constant `Profile`, because people learn a control in persistent chrome by its position and its
 * label and a label that differs per account is not a label.
 */
export function triggerLabel(name: string | null): string {
  return name === null ? COPY.triggerFallback : `Your account, ${name}`;
}

export interface ProfileMenuProps {
  /**
   * The control that opens the menu. Rendered through Base UI's `render` prop, so it keeps its own
   * markup, classes and accessible name and gains `aria-haspopup` / `aria-expanded`.
   *
   * It is a caller's element rather than a prop bundle because the two triggers are genuinely
   * different objects: a 44 px tab in the floating bar below `lg`, and the translucent account chip
   * in the map's top-right corner above it. One component, two anchors, no `variant`.
   *
   * **It must be a `<button>`, never a link.** A `<Link>` here would navigate *and* open the menu
   * on the same click — Base UI's trigger does not cancel the browser's default action — which is
   * the exact route change this component exists to stop. The no-JS door is a separate
   * `<noscript>` anchor in `bottom-nav.tsx`, which is the honest shape: with scripting the control
   * opens a menu and is a button, without it the control goes somewhere and is a link.
   */
  readonly trigger: React.ReactElement<Record<string, unknown>>;
  /** Which way the popup opens from the trigger. `top` for the bottom bar, `bottom` for the chip. */
  readonly side: 'top' | 'bottom';
  readonly align?: 'start' | 'center' | 'end';
  /**
   * Open on mount.
   *
   * This module is loaded lazily and is mounted **by the press that should open it**, so without
   * this the first press would fetch a chunk and then appear to do nothing. It is a seed for the
   * open state and not a controlled value: every press after the first goes through the popover's
   * own trigger. See `ProfileTab` in `bottom-nav.tsx`.
   */
  readonly initialOpen?: boolean;
}

export function ProfileMenu({
  trigger,
  side,
  align = 'center',
  initialOpen = false,
}: ProfileMenuProps) {
  const [open, setOpen] = useState(initialOpen);
  const [data, setData] = useState<ProfileMenuData | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  /**
   * Loaded once, on the first open, and kept.
   *
   * Not on paint: this bar renders on every route in the product and most visits never open the
   * menu, so four queries per page load would be paid for a surface nobody asked for. Not on every
   * open either — the figures move when you save a place, and a menu that re-queries on each press
   * would spend a round trip to redraw the same three numbers. The identity block and the deletion
   * pre-check are the parts that must be right, and neither changes within a session except through
   * `/account`, which revalidates.
   */
  function load() {
    if (data !== null || pending) return;
    startTransition(async () => {
      const loaded = await loadProfileMenu();
      if (loaded === null) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setData(loaded);
    });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) load();
  }

  /**
   * The mount-open case, and why this is a layout effect rather than a render-phase call.
   *
   * This component is mounted by the press that opens it, so the load must start before the browser
   * paints or there is an empty menu on screen between the press and the request. That concern was
   * right, and the first implementation answered it by calling `load()` **during render** — which
   * React rejects: `startTransition` around a server action dispatches a Router update, and updating
   * another component while rendering this one is invalid. It threw 12–17 times per press, the
   * `Popover.Trigger` never committed, `aria-haspopup` was `null`, and the visible control was
   * permanently the Suspense fallback. **The menu could not be opened at all, at either breakpoint.**
   *
   * `useLayoutEffect` keeps the property the render-phase call was reaching for — it runs after
   * commit and *before* paint, so no empty frame reaches the screen — without doing work in a phase
   * that forbids it. Adjusting state during render is legal; dispatching an update to a different
   * component is not, and the two are easy to conflate.
   */
  /**
   * A ref rather than state, and that is the whole point: this latch is never read while rendering,
   * so it is not render state. As `useState` it made the effect set state in its own body — React
   * flags it (`react-hooks/set-state-in-effect`) because it schedules a second render pass that
   * produces identical output, and it had to name itself in the dependency array to do it, so the
   * effect re-ran to discover it should do nothing.
   *
   * A ref keeps the once-only guarantee, drops the wasted pass, and lets the dependency array say
   * what the effect actually depends on: `open`.
   */
  const loadStarted = useRef(false);
  useLayoutEffect(() => {
    if (open && !loadStarted.current) {
      loadStarted.current = true;
      load();
    }
    // `load` is stable for this purpose: it only reads state setters, which React guarantees.
     
  }, [open]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={onOpenChange}
      /**
       * Focus stays inside the menu; everything else about the page keeps working.
       *
       * Measured on 2026-09-01 at 1440×900: the popup announces `role="dialog"` and then lets you
       * Tab straight out of it. Four tabs walk the menu and the fifth lands on `Map of your saved
       * places`, `Toggle attribution`, `CARTO`, `OpenStreetMap` — the map underneath. `aria-modal`
       * was `null`, so it was a dialog by name only.
       *
       * The scrim comment below argues, correctly, that a full-viewport wash at desktop widths
       * would be a modal claim this menu does not make. That reasoning covers the *scrim*, and it
       * was quietly taken to cover focus as well — but they are separate choices and only the first
       * was ever made. `'trap-focus'` is exactly the difference: focus is contained, while page
       * scroll stays unlocked and pointer interaction outside the menu keeps working, so nothing
       * the scrim decision protects is given up.
       *
       * `true` is the wrong instrument here. It would lock document scroll and disable outside
       * pointer interaction, which on a phone is most of the screen and on desktop is a live map.
       */
      modal="trap-focus"
    >
      {/* **No `aria-label` from here, and that is a rule rather than an omission.** The trigger
          owns its own accessible name: the bar's tab is visibly labelled `Profile`, and overriding
          that with a name would break WCAG 2.5.3 — the accessible name has to contain the visible
          one. The chip above `lg` is where a name belongs, and it gets one on the server, where the
          name is known before this component has loaded anything. */}
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        {/* The scrim is a phone thing. Below `lg` this popup covers most of the screen and reads as
            a surface, so the map behind it wants pushing back; at desktop widths it is a small
            panel beside a live map and a full-viewport wash over the whole document would be a
            modal claim the menu does not make. Transparent above `lg` rather than absent, because
            the element is also what closes the menu on an outside press. */}
        <Popover.Backdrop
          className={cn('fixed inset-0 z-40 bg-scrim lg:bg-transparent', ENTER_SCRIM)}
        />
        <Popover.Positioner
          side={side}
          align={align}
          /*
           * Round-3 feedback §7.3, *"the profile popover feels awkward on mobile"*, measured at
           * 390×844: with a flat `8` the popup's bottom edge came to rest at **y 775 against a bar
           * whose top is 776** — one pixel. The offset is measured from the *trigger*, and the
           * bar's tab sits 6 px inside a pill that is itself 6 px inside the bar's box, so eight
           * pixels of anchor offset buys one pixel of visible separation and the menu reads as
           * something growing out of the bar rather than floating above it.
           *
           * Only the `top` side has that problem. The `lg+` chip opens `bottom` from a control
           * with nothing under it, where 8 is right and always has been.
           */
          sideOffset={side === 'top' ? 20 : 8}
          // Keeps the popup off the safe-area edges on a phone, where it is nearly viewport-wide.
          collisionPadding={12}
          className="z-50"
        >
          <Popover.Popup
            className={cn(
              /*
               * **Viewport-width below `lg`, 20 rem above it — round-3 feedback §7.3.**
               *
               * The old `min(20rem, calc(100vw - 1.5rem))` resolved to a flat 320 px on a 390 px
               * phone, and 320 px is the size at which *where* the card sits starts to matter. It
               * is anchored `align="end"` on the bar's `Profile` tab, whose right edge is at
               * x 312, so it wanted x −8…312 and the collision boundary pushed it to **12…332 —
               * a 12 px gutter on the left and 58 px on the right**. Nothing was clipped and
               * nothing overlapped; it just sat visibly off-centre over a symmetrical bar, which
               * is what "awkward" turned out to mean when it was measured.
               *
               * Alignment is the wrong lever for it: `center` on the same anchor only mirrors the
               * lopsidedness (58 left, 12 right), because the trigger is not in the middle of the
               * screen and no `align` value can put a 320 px card there. Width is the lever — at
               * `100vw − 1.5rem` both edges are decided by `collisionPadding` instead of by the
               * anchor, so the card is symmetric by construction on every phone width.
               *
               * It stays a *compact popover*, which §12.2 says the owner likes and which this is
               * not allowed to trade away: same card, same radius, same scrim, same height. It
               * gains 46 px of width, which goes to `Appearance`'s three segments (92 px → 107 px
               * each, measured).
               *
               * `--available-height` is Base UI's own measurement of the room between the anchor
               * and the viewport edge, so the menu scrolls rather than overflowing when the delete
               * flow expands into its blocked branch.
               */
              'flex w-[calc(100vw-1.5rem)] max-h-[min(32rem,var(--available-height))] flex-col overflow-y-auto overscroll-contain lg:w-80',
              'rounded-2xl border border-border/70 bg-card p-3 shadow-[var(--shadow-elevated)] outline-none',
              ENTER_POPOVER,
            )}
          >
            <Identity data={data} failed={failed} />

            <div className="mt-2 flex flex-col gap-1">
              <MenuLink
                href="/profile"
                label={COPY.library}
                hint={data === null ? COPY.libraryHint : libraryLine(data)}
              />
              <MenuLink href="/account" label={COPY.settings} icon />
            </div>

            {/* The one setting the product keeps, in the same position it holds on `/profile` — the
                page and the menu say the same things in the same order, which is what stops them
                becoming two different accounts of one surface. `data-theme-choice` is not
                decoration: `ThemeChoice` renders a `<noscript><style>` that hides every element
                carrying it, because a `localStorage` control cannot work with scripting off. */}
            <section aria-labelledby="menu-appearance" className="mt-3" data-theme-choice>
              <SectionHeading id="menu-appearance" visuallyHidden>
                {COPY.appearance}
              </SectionHeading>
              <ThemeChoice labelledBy="menu-appearance" />
            </section>

            <div className="mt-3 border-t border-border/60 pt-3">
              {/* A plain form posting to a server action: sign-out needs no JavaScript and gets
                  none. Not `destructive` — it destroys nothing, and this product reserves that role
                  for the controls that do. */}
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="lg" className="h-11 w-full justify-start px-2 text-sm">
                  <LogOut className="size-4" aria-hidden />
                  {COPY.signOut}
                </Button>
              </form>

              {/* `L1-F8-T1`'s delete flow, on the surface its row names — *the account menu with
                  delete-my-data*. It is the same component `/profile` renders, with the same
                  server-side pre-check, so the two doors cannot drift into two behaviours.

                  Withheld until the data arrives rather than rendered with an empty `blocking`: an
                  empty list is what makes the control open the *confirmation* branch, so offering
                  it early would show a user who owns a shared collection the wrong screen and let
                  the action refuse afterwards. The action is the authority either way; this is
                  about not asking the question wrongly first. */}
              {data === null ? null : (
                <div className="mt-1">
                  <AccountActions blocking={data.blocking} align="start" />
                </div>
              )}
            </div>

            {/* The way out, and it is required rather than decorative: with `modal="trap-focus"`
                Base UI asks for a `Close` inside the popup so a touch screen reader — which has no
                Escape key and cannot press "outside" a trap — is not sealed in. Visually hidden
                because sighted users already have two doors, the scrim and Escape, and a third
                visible button would be a control that says nothing the surface does not. It sits
                last so it is the end of the tab cycle rather than something to tab past. */}
            <Popover.Close className="sr-only">{COPY.close}</Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * `32 places · 2 cities · 3 countries`, and the singulars are not a nicety.
 *
 * A library of one prints `1 place`, and the same `·` this product already separates with in five
 * other places rather than a sixth separator style for one job.
 */
export function libraryLine(data: ProfileMenuData): string {
  const { saved, cities, countries } = data.stats;
  const parts = [`${saved} ${saved === 1 ? 'place' : 'places'}`];
  if (cities > 0) parts.push(`${cities} ${cities === 1 ? 'city' : 'cities'}`);
  if (countries > 0) parts.push(`${countries} ${countries === 1 ? 'country' : 'countries'}`);
  return parts.join(' · ');
}

/**
 * Who you are signed in as.
 *
 * **Every line here is omitted rather than rendered empty**, which is the rule this exact screen
 * had to learn: nine of the accounts on this product have no name and the schema permits that
 * permanently, so a blank, a stray separator or the email standing in a name's slot is not an edge
 * case, it is the common case. `accountIdentity` returns `name: null` and an `account` that always
 * says something, and the two weights below are how a nameless account still reads as an answer
 * rather than as a broken row.
 */
function Identity({ data, failed }: { data: ProfileMenuData | null; failed: boolean }) {
  return (
    <div className="flex items-center gap-3 px-1 py-1">
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <UserRound className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        {data === null ? (
          <p role="status" className="truncate text-sm text-muted-foreground">
            {failed ? COPY.failed : COPY.loading}
          </p>
        ) : (
          <>
            {/* `dir="auto"` on the text and never on the block — the pattern the rest of the app
                follows. The isolate has to wrap the name so a Hebrew one shapes right-to-left while
                the column it sits in stays left-aligned like the address under it. */}
            {data.name === null ? null : (
              <p className="truncate font-heading text-base font-bold tracking-tight">
                <span dir="auto">{data.name}</span>
              </p>
            )}
            {data.account === null ? null : (
              <p
                className={cn(
                  'truncate text-xs',
                  data.name === null
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {data.account}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * One destination in the menu.
 *
 * A real `<a href>`, so both rows work with hydration killed and both are middle-clickable — the
 * same requirement `DrawerViewSwitch` states for the drawer's own two links, and this product has
 * shipped a blank screen by forgetting it twice.
 */
function MenuLink({
  href,
  label,
  hint,
  icon = false,
}: {
  href: '/profile' | '/account';
  label: string;
  /** Omitted where the label is the whole answer — `Account settings` names its own destination
   *  and the subtitle under it only described the next screen's contents. */
  hint?: string;
  icon?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 text-left',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        PRESS_ROW,
      )}
    >
      {icon ? <Settings className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold text-foreground">{label}</span>
        {hint === undefined ? null : (
          <span className="truncate text-xs text-muted-foreground tabular-nums">{hint}</span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/**
 * The same heading `/profile` uses, so the two surfaces label one section one way.
 *
 * `visuallyHidden` is how the menu drops the kicker without dropping the name. Three theme
 * segments sitting under `Sign out` in a ten-row card do not need a section label drawn on the
 * screen — but `ThemeChoice` is a `radiogroup` and points its `aria-labelledby` here, so the
 * element has to stay in the accessibility tree. The page keeps it visible, where it separates two
 * real sections.
 */
function SectionHeading({
  id,
  children,
  visuallyHidden = false,
}: {
  id: string;
  children: string;
  visuallyHidden?: boolean;
}) {
  return (
    <h2
      id={id}
      className={
        visuallyHidden
          ? 'sr-only'
          : 'px-1 text-micro font-bold uppercase tracking-wide text-muted-foreground'
      }
    >
      {children}
    </h2>
  );
}

export { COPY as PROFILE_MENU_COPY };

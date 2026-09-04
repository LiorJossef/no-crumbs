'use client';

/**
 * **The account control on the desktop map** — the `lg+` half of the owner's *"a profile popover
 * menu when clicking the profile avatar"*.
 *
 * `BottomNav` does not render above `lg`, so this chip is the only account-shaped thing on the
 * desktop map and was the only way to `/profile` there. It was a `<Link href="/profile">`, which
 * left the popover half-built above 1024 px: on a phone the menu opened over the map and on a
 * laptop the same intent still navigated away from it.
 *
 * ## Why leaving the map matters here specifically
 *
 * `persistent-map.tsx` holds one MapLibre instance for the whole session and releases it for any
 * path outside `MAP_ROUTES` — a **deliberate privacy rule**, not an oversight: a parked map keeps
 * the signed-in user's pins in the document, and sign-out must not leave one account's saved places
 * in the DOM of the next. This control stays inside that rule rather than defeating it. It does not
 * ask for `/profile` to be added to the allow-list; it stops asking for `/profile` at all.
 *
 * ## The same lazy boundary the bar uses, for a different reason
 *
 * `/map` is the product's hottest route and the menu reaches a `localStorage` radio group, the
 * deletion flow and Base UI's popover. None of that belongs in this route's first paint, so the
 * chunk is fetched by the first press. `Suspense` rather than `next/dynamic` so the fallback is
 * this very chip, which keeps the corner of the map from flickering while it loads.
 *
 * ## What it deliberately still shows
 *
 * The email address, exactly as before, and **not** the first name. A name here would be the better
 * label and it costs a `profile_names` read on the map's hot path; that is a change to this route's
 * query plan rather than to this control, and it is recorded for the owner rather than taken
 * quietly. The address is honest in the meantime — the accessible name says *signed in as*, which
 * is what an address answers.
 */

import { lazy, Suspense, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Same boundary and same reasoning as `bottom-nav.tsx`'s copy; see the header there. */
const ProfileMenu = lazy(() =>
  import('./profile-menu').then((mod) => ({ default: mod.ProfileMenu })),
);

/** The chip's own material: the map's floating-control language — hairline, translucent card, blur
 *  — and the mirror of `ShellWordmark` in the opposite corner. Below `lg` it does not render at
 *  all; the bar's `Profile` control is the way in there, and two doors to one menu on one screen is
 *  what the owner ruled against on 2026-08-29. */
const CHIP_CLASS =
  'absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 hidden h-11 items-center gap-1.5 rounded-full border border-border/70 bg-card/85 pl-3.5 pr-3 shadow-[var(--shadow-elevated)] backdrop-blur-md transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-card lg:right-4 lg:top-4 lg:flex';

export function AccountChip({ email }: { readonly email: string | null }) {
  const [mounted, setMounted] = useState(false);

  const trigger = (
    <button
      type="button"
      aria-label={`Your account, signed in as ${email ?? 'this account'}`}
      {...(mounted ? {} : { onClick: () => setMounted(true) })}
      className={CHIP_CLASS}
    >
      {/* `leading-5`: `truncate` clips to the line-height, `text-xs` sets it to 16px, and this
          font's inline box at 12px is 17px. The same one-pixel shave `place-enrichment.tsx`
          records, and an account identifier is the last string in the product that should be
          guessing which alphabet it will be handed. */}
      <span className="max-w-[9rem] truncate text-xs font-bold leading-5 text-foreground sm:max-w-[14rem]">
        {email}
      </span>
      {/* `ChevronDown`, not `ChevronRight`, and the glyph is the whole of what changed visually
          here. A right chevron says *this takes you somewhere*; this control opens a panel
          underneath itself and now says so. */}
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );

  if (!mounted) return trigger;
  return (
    <Suspense fallback={trigger}>
      {/* `bottom`/`end`: the chip is in the top-right corner, so the panel hangs below it and is
          right-aligned to it. */}
      <ProfileMenu trigger={trigger} side="bottom" align="end" initialOpen />
    </Suspense>
  );
}

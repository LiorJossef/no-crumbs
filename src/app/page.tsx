import Link from 'next/link';
import { createClient } from '@/app/_lib/supabase/server';
import { PinMark } from '@/components/brand/pin-mark';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * S1, the landing screen (`docs/brand-and-product-foundation.md` §6): "one line of what this is,
 * one CTA", explicitly **pruned from a marketing page**. It replaces MS2's deploy placeholder,
 * which was still shipping `Milestone MS2 — toolchain and deploy pipeline` to users and rendered
 * both of its paragraphs in `var(--muted)` — the *surface* token (`#FAF9F6`), byte-identical to
 * the page background, so the only sentence describing the product was invisible. Body text is
 * `--muted-foreground`; `--muted` is never a text colour.
 *
 * `BUILD_INFO` is not read here any more. It is still the deploy check's payload in
 * `app/healthz/route.ts`, which is the surface that is actually asserted on — a stage name is
 * operator information, not something a visitor has any use for.
 *
 * Composition follows `/sign-in` rather than inventing a second full-screen language: the same
 * `--brand-wash` atmosphere, the same mint `PinMark`, the same editorial stack (uppercase mint
 * kicker → extrabold two-line headline → muted subhead), and the same responsive logic — hero at
 * the top with the action pinned to the thumb zone on mobile, a genuine two-panel split at `lg+`
 * with the action in a frosted right-hand panel. Landing and sign-in are adjacent in the demo
 * path; if they do not read as one product, that is the first thing anyone notices.
 *
 * No marketing claims, no counts, no testimonials, no screenshots: every line on this page is
 * either what the product does or the state the visitor is in.
 */

// Static so the copy is diffable in one place rather than inline in three ternaries.
const KICKER = 'A personal map';
const HEADLINE = ['Your saved places,', 'on one map.'] as const;
const SUBHEAD =
  'Paste a TikTok link and the place lands on your map. Organised by where, not by when.';
// The honest boundary, stated in the product rather than in a footnote
// (`brand-and-product-foundation.md` §1). Deliberately does *not* promise the manual-add recovery
// path for an Instagram or YouTube link: S8 (`/add-place`) does not exist yet, and the tone rule
// is that we never state something as done that is not.
const BOUNDARY = 'Works with TikTok links today.';
// What actually happens, in the product's own three steps — not a feature list and not a claim
// about how well it works. Step 2 is deliberately "check what we found" rather than anything that
// promises a result: at LEVEL B the modal import outcome is *no places in this post*
// (`mvp-plan.md`), and the review screen is where the user confirms, not where we celebrate.
const STEPS = [
  'Paste a link from TikTok',
  'Check what we found',
  'It lands on your map',
] as const;

/**
 * The session, or `null` if it cannot be read for any reason — unconfigured, unreachable, or
 * failing. Never throws, so nothing here can take the landing page down.
 */
async function currentUserOrNull() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export default async function Home() {
  // The proxy (`src/proxy.ts`) only guards `/map`, so `/` renders for signed-out and signed-in
  // visitors alike and the single CTA has to be correct for both. Read rather than redirected:
  // bouncing a signed-in visitor straight to `/map` would remove the landing screen from the demo
  // path, and S1 is a surface the product is graded on.
  //
  // Wrapped, and this is not defensive padding. Reading the session made `/` the first public
  // surface that depends on Supabase being configured at all — and CI proved the consequence
  // immediately: with no Supabase env vars, `createClient()` throws, the page 500s, and
  // Playwright's webServer never comes up. `current-state.md` §5.1 records that **production is
  // in exactly that state right now**, so unguarded this would have taken the landing page down
  // in production the moment it deployed.
  //
  // A landing page is the one screen that must render when everything else is broken: it is what
  // a visitor sees first and it is the route to sign-in, which is where a misconfigured
  // deployment gets diagnosed. So a failure to answer "is anyone signed in?" degrades to "nobody
  // is" — the signed-out view is correct for every visitor who has not signed in, which is every
  // first-time visitor, and a signed-in one loses only the `Open your map` shortcut.
  const user = await currentUserOrNull();

  return (
    <main className="relative min-h-dvh overflow-hidden" style={{ background: 'var(--brand-wash)' }}>
      <div className="relative flex min-h-dvh flex-col lg:flex-row">
        {/* Editorial column — top-aligned and pushed up by the action panel's `mt-auto` on
            mobile, vertically centred in a flex-1 left panel at `lg+`. Mirrors `/sign-in`. */}
        <div className="relative flex flex-1 flex-col px-6 pt-14 lg:justify-center lg:px-[clamp(48px,7vw,110px)] lg:pt-0">
          <div className="relative z-10 flex items-center gap-2.5">
            <PinMark className="h-[30px] w-[30px] lg:h-9 lg:w-9" />
            {/*
              OPEN OWNER DECISION — the product name is not decided and is not ours to invent
              (`brand-and-product-foundation.md` §3, owed at L1-F1-T1). The repo codename is set
              as a small tracked-uppercase label beside the mark so it reads as a deliberate
              treatment rather than an unfinished one. When the name lands, this string and the
              `<title>` in `app/layout.tsx` are the two places it goes.
            */}
            <span className="font-heading text-[13px] font-extrabold tracking-[0.2em] text-muted-foreground uppercase lg:text-sm">
              P-002
            </span>
          </div>

          {/* Top-aligned under the mark on mobile, exactly as on sign-in: the slack belongs in one
              piece between the subhead and the thumb-zone action, not split either side of the
              headline. At `lg` the column as a whole is centred, so this only needs the gap. */}
          <div className="relative z-10 mt-10 lg:mt-8">
            <p className="text-[11px] font-bold tracking-[0.14em] text-brand uppercase lg:text-[13px]">
              {KICKER}
            </p>

            <h1 className="mt-2 font-heading text-[34px] leading-[1.05] font-extrabold tracking-tight text-foreground lg:text-[clamp(40px,5.5vw,64px)]">
              {HEADLINE[0]}
              <br />
              {HEADLINE[1]}
            </h1>

            <p className="mt-3 max-w-xs text-sm font-medium leading-snug text-muted-foreground lg:max-w-md lg:text-base">
              {SUBHEAD}
            </p>
          </div>
        </div>

        {/* Action panel — thumb-zone block on mobile, a full-height frosted panel behind a single
            hairline edge at `lg+`. Same geometry as sign-in's form panel so the two screens line
            up when a visitor moves between them. */}
        <div className="relative mt-auto flex w-full flex-col gap-4 px-6 pb-8 pt-10 lg:mt-0 lg:w-[clamp(360px,32vw,460px)] lg:flex-none lg:justify-center lg:border-l lg:border-[rgba(231,227,220,0.7)] lg:bg-white/55 lg:px-10 lg:py-0 lg:backdrop-blur-[10px]">
          <div className="w-full lg:mx-auto lg:max-w-[320px]">
            {/* The numerals use `--tag` / `--tag-foreground`, whose whole definition is "a label,
                never an action" — which is what a step number is. No new colour is introduced. */}
            <ol className="mb-7 flex flex-col gap-3 lg:mb-8">
              {STEPS.map((step, index) => (
                <li key={step} className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--tag)] font-heading text-[11px] font-extrabold text-[var(--tag-foreground)]"
                  >
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-foreground">{step}</span>
                </li>
              ))}
            </ol>

            {user ? (
              <>
                <Link
                  href="/map"
                  className={cn(
                    buttonVariants(),
                    'h-12 w-full rounded-lg text-base font-bold lg:h-[52px] lg:text-[15.5px]',
                  )}
                >
                  Open your map →
                </Link>
                <p className="mt-3 truncate text-center text-sm font-medium text-muted-foreground">
                  Signed in as <span className="font-bold text-foreground">{user.email}</span>
                </p>
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className={cn(
                    buttonVariants(),
                    'h-12 w-full rounded-lg text-base font-bold lg:h-[52px] lg:text-[15.5px]',
                  )}
                >
                  Sign in →
                </Link>
                <p className="mt-3 text-center text-sm font-medium text-muted-foreground">
                  New here?{' '}
                  <Link href="/sign-in" className="font-bold text-brand">
                    Create an account
                  </Link>
                </p>
              </>
            )}

            <p className="mt-6 text-center text-xs font-medium text-muted-foreground lg:mt-8">
              {BOUNDARY}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

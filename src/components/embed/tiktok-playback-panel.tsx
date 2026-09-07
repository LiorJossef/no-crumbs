'use client';

/**
 * **The whole of the TikTok embed, from the press onward.** The glyph that opens it belongs to the
 * place-sheet lane; everything this file does happens after that press.
 *
 * ## What this component is for, in one sentence
 *
 * Mounting TikTok's Embed Player hands TikTok a cookie that lasts a year and runs a device
 * fingerprint, before anything plays — so **the first press is the disclosure**, and this component
 * is where that is made true rather than promised.
 *
 * `docs/evidence/tiktok/10-embed-playback-2026-08-31.md` §4 has the measurements;
 * `docs/archive/security-ruling-embed-playback-2026-08-31.md` is the conditional permit, and its §6 is a
 * ten-item gate. `docs/security.md` R-18 is the same fact in the risk register, which is where it
 * belongs for anyone reading the product's privacy posture rather than this file.
 *
 * ## The three branches, and why none of them is a default
 *
 *  - **Nothing stored** → the two co-equal actions, with the disclosure between them and the
 *    heading. Same element, same `variant`, same size, rendered from one array so a future styling
 *    change cannot make one of them the primary. **No iframe exists in this branch.** Not hidden,
 *    not `display:none`, not `src=""` — absent from the tree, because a hidden iframe with a `src`
 *    has already made every request a visible one would.
 *  - **`play-here`** → the player, and `Open on TikTok` still underneath it. The link is not a
 *    fallback: `security-ruling-embed-playback` §6 item 9 requires this product's own creator
 *    handle, caption and link-back to render *alongside* the player rather than depending on the
 *    Embed Player's own chrome defaults.
 *  - **`open-on-tiktok`** → the link, and nothing else. Zero requests to any TikTok host from this
 *    branch, which is the entire value of having offered it and is checked by counting requests in
 *    a real browser rather than by reading this comment.
 *
 * ## Two things that look like omissions and are not
 *
 * **There is no `onMouseEnter` anywhere in this file, and no `IntersectionObserver`.** Owner ruling
 * (`iteration-6-plan.md` §6.2), restated as gate item 1: a mouse crossing a list row would tell
 * TikTok *this device looked at post X* at exactly the same cost as a deliberate press.
 * `tests/unit/embed/panel-source.test.ts` asserts their absence as source text, because that is a
 * property a reviewer cannot see by looking at the rendered output.
 *
 * **There is no `postMessage` from host to player.** TikTok documents `play`, `pause`, `seekTo`,
 * `mute` and `unMute`, and none of them is needed: `autoplay=1` starts the video and the player's
 * own controls do the rest. A control layer of our own over a third-party player would be a second
 * set of buttons that can disagree with the first, for no behaviour we do not already have. The
 * player→host direction *is* handled, because that is where the error states come from.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import {
  PLAYER_IFRAME_ALLOW,
  PLAYER_IFRAME_SANDBOX,
  embedPlayerUrl,
  tiktokPostId,
} from './embed-player-url';
import { PLAYBACK_COPY, playerFrameTitle } from './playback-copy';
import {
  clearStoredChoice,
  getServerChoice,
  getStoredChoice,
  playbackMode,
  setStoredChoice,
  subscribeStoredChoice,
} from './playback-consent';
import {
  PLAYER_READY_TIMEOUT_MS,
  nextPlayerState,
  parsePlayerMessage,
  type PlayerState,
} from './player-messages';

/**
 * The stored answer, read the way React reads a value the server cannot know.
 *
 * `getServerChoice` returns `null` for the server render and the hydration pass, so both see *not
 * asked*. That is the safe direction and it is not a detail: a guess in the other direction would
 * put an `<iframe src="https://www.tiktok.com/…">` into server-rendered markup, which is the
 * disclosure being made before the user has been asked for it.
 */
export function usePlaybackChoice() {
  return useSyncExternalStore(subscribeStoredChoice, getStoredChoice, getServerChoice);
}

type Props = {
  /** The canonical TikTok post URL this product already stores. `null` for a place added by hand,
   *  in which case nothing here renders — there is no post to play or link to. */
  videoUrl: string | null | undefined;
  /** `@handle`, if we hold one. Attribution, and the iframe's accessible name. */
  authorLabel?: string | null;
  /** Our own stored caption for the post. Rendered by us, which is why `description=0` is safe to
   *  pass to the player (`embed-player-url.ts`). */
  caption?: string | null;
  className?: string;
};

/**
 * The panel. Renders `null` when there is no post behind this place, which is the honest answer for
 * a manually-added place rather than a disabled control.
 */
export function TikTokPlaybackPanel({ videoUrl, authorLabel, caption, className }: Props) {
  const choice = usePlaybackChoice();
  const postId = tiktokPostId(videoUrl);

  if (typeof videoUrl !== 'string' || videoUrl.length === 0) return null;

  // A URL this product could not read a post id out of — a short link that was never canonicalised,
  // or a stored value from before the resolver. The player is not reachable, so the panel is the
  // link and says nothing about a choice the user cannot act on.
  if (postId === null) {
    return (
      <div className={cn('flex flex-col gap-2', className)} data-slot="tiktok-playback">
        <Attribution authorLabel={authorLabel} caption={caption} />
        <OpenOnTikTokLink videoUrl={videoUrl} />
      </div>
    );
  }

  const mode = playbackMode(choice);

  return (
    <div className={cn('flex flex-col gap-3', className)} data-slot="tiktok-playback" data-mode={mode}>
      <Attribution authorLabel={authorLabel} caption={caption} />

      {mode === 'ask' && <Disclosure videoUrl={videoUrl} />}

      {mode === 'play-here' && (
        <>
          <Player postId={postId} authorLabel={authorLabel} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <OpenOnTikTokLink videoUrl={videoUrl} />
            <SecondaryAction onClick={clearStoredChoice}>
              {PLAYBACK_COPY.stopPlayingHere}
            </SecondaryAction>
          </div>
        </>
      )}

      {mode === 'link-only' && (
        <>
          <p className="text-sm text-muted-foreground">{PLAYBACK_COPY.linkOnly}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <OpenOnTikTokLink videoUrl={videoUrl} />
            {/* The way back. A year-long grant with no revocation and a refusal with no way to
                change your mind are the same bug seen from two sides; both are one press from
                here, and neither needs a settings screen this lane does not own. */}
            <SecondaryAction onClick={() => setStoredChoice('play-here')}>
              {PLAYBACK_COPY.playHereInstead}
            </SecondaryAction>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * **The first press, and the only screen on which this feature is allowed to be verbose.**
 *
 * Four lines of disclosure above two buttons. Every one of the four is load-bearing and
 * `playback-copy.ts` records which measurement each states; `standing` in particular is the clause
 * the ruling made a condition, because without it `Play here` reads as a decision about one video
 * and is wrong by about a year.
 *
 * **The two actions are rendered from one array.** Not for brevity — so that a future change to
 * `variant`, `size` or order applies to both or to neither. `security-ruling-embed-playback` §6
 * item 2 requires that neither is visually or functionally the default, and an array is the only
 * form of that requirement a diff can enforce. `outline` rather than `default` for the same reason:
 * `default` is the filled mint button, and there is exactly one of those per screen by convention.
 */
function Disclosure({ videoUrl }: { videoUrl: string }) {
  const actions = [
    {
      key: 'play-here' as const,
      label: PLAYBACK_COPY.playHere,
      onClick: () => setStoredChoice('play-here'),
    },
    {
      key: 'open-on-tiktok' as const,
      label: PLAYBACK_COPY.openOnTikTok,
      // Recorded before the tab opens, so the answer survives the navigation. The `<a>` does the
      // opening: a `window.open` here would be a popup for the browser to block, on the one branch
      // whose whole purpose is that it always works.
      onClick: () => setStoredChoice('open-on-tiktok'),
      href: videoUrl,
    },
  ];

  return (
    <div
      data-slot="tiktok-playback-disclosure"
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold text-foreground">{PLAYBACK_COPY.title}</p>
        <p className="text-sm text-muted-foreground">{PLAYBACK_COPY.cookie}</p>
        <p className="text-sm text-muted-foreground">{PLAYBACK_COPY.device}</p>
        <p className="text-sm text-muted-foreground">{PLAYBACK_COPY.standing}</p>
        <p className="text-sm text-muted-foreground">{PLAYBACK_COPY.refusal}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) =>
          action.href === undefined ? (
            <Button
              key={action.key}
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11 flex-1 basis-40"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ) : (
            <Button
              key={action.key}
              render={
                <a
                  href={action.href}
                  target="_blank"
                  // `noreferrer` implies `noopener`. Same policy the place detail's own
                  // `Open on TikTok` already uses, and the same reason: the destination has no
                  // business holding a handle on this window or knowing the page it came from.
                  rel="noreferrer"
                  data-vaul-no-drag
                />
              }
              variant="outline"
              size="lg"
              className="min-h-11 flex-1 basis-40"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ),
        )}
      </div>
    </div>
  );
}

/**
 * **The iframe, and the state machine that keeps a refused autoplay from looking like a bug.**
 *
 * Every hardening attribute here is `embed-player-url.ts`'s, imported rather than written inline, so
 * that the review question *"what is the sandbox?"* has one file to read and one test to fail.
 * That file's header is also where the honest account of what they do and do not buy lives — the
 * short version being that `allow-same-origin` is required for the player to run and is exactly the
 * permission the cookie depends on, so **the sandbox does not reach the disclosure the consent gate
 * is for.** It closes a different, real risk class, at zero cost.
 *
 * The `<div>` wrapper carries the aspect ratio rather than the iframe, so TikTok's own document can
 * do whatever it likes with its internal layout without the box changing size under the reader.
 * 9:16 with a `max-w` clamp: the video is portrait, and letting it fill a 1440 px panel would put a
 * 900 px-tall video in a place detail.
 */
function Player({ postId, authorLabel }: { postId: string; authorLabel: string | null | undefined }) {
  const [state, setState] = useState<PlayerState>('loading');
  // A ref alongside the state so the timeout can read the *current* value without re-arming itself
  // every time a state change lands, which would mean it never fires.
  const stateRef = useRef<PlayerState>('loading');

  const apply = useCallback((next: PlayerState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const parsed = parsePlayerMessage(event.origin, event.data);
      if (parsed === null) return;
      apply(nextPlayerState(stateRef.current, parsed));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [apply]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // Only from `loading`. A player that reported ready and then went quiet is idle, not broken,
      // and replacing its own chrome with our failure line would be this component overruling the
      // thing it is hosting.
      if (stateRef.current === 'loading') apply('failed');
    }, PLAYER_READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [apply]);

  const notice = playerNotice(state);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative mx-auto aspect-9/16 w-full max-w-[325px] overflow-hidden rounded-xl bg-muted">
        <iframe
          src={embedPlayerUrl(postId)}
          title={playerFrameTitle(authorLabel)}
          sandbox={PLAYER_IFRAME_SANDBOX}
          allow={PLAYER_IFRAME_ALLOW}
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full border-0"
        />
        {/* An overlay rather than a replacement: `blocked` in particular needs TikTok's own play
            button to stay reachable, since pressing it is the whole instruction. `pointer-events-
            none` on the wrapper is what keeps the notice from being the thing the user taps. */}
        {notice !== null && state !== 'blocked' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/90 p-4">
            <p className="text-center text-sm text-muted-foreground">{notice}</p>
          </div>
        )}
      </div>
      {/* `blocked` reads under the player, not over it, for the reason above. `role="status"` so a
          state that arrives after the press is announced rather than silently appearing. */}
      {state === 'blocked' && (
        <p role="status" className="text-sm text-muted-foreground">
          {PLAYBACK_COPY.blocked}
        </p>
      )}
    </div>
  );
}

/** The line for a state, or `null` when the player is speaking for itself. */
function playerNotice(state: PlayerState): string | null {
  switch (state) {
    case 'loading':
      return PLAYBACK_COPY.loading;
    case 'unavailable':
      return PLAYBACK_COPY.unavailable;
    case 'failed':
      return PLAYBACK_COPY.failed;
    case 'blocked':
      return PLAYBACK_COPY.blocked;
    case 'ready':
    case 'playing':
      return null;
  }
}

/**
 * `security-ruling-embed-playback` §6 item 9, and `09` §5's `III.3(n)` obligation underneath it:
 * the creator and the description render from **our** row, beside the player, rather than from the
 * Embed Player's chrome. A default that discharges an obligation today and changes next August is
 * not a discharge.
 *
 * No platform glyph. `09` refused the mark on every surface we draw, and this is one of them — the
 * mark inside TikTok's own iframe is licensed precisely because we do not draw it.
 */
function Attribution({
  authorLabel,
  caption,
}: {
  authorLabel: string | null | undefined;
  caption: string | null | undefined;
}) {
  const handle = typeof authorLabel === 'string' ? authorLabel.trim() : '';
  const words = typeof caption === 'string' ? caption.trim() : '';
  if (handle.length === 0 && words.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {/* Verbatim the form already shipped on the place detail. */}
      {handle.length > 0 && (
        <p className="text-xs font-medium text-muted-foreground">Saved from {handle}</p>
      )}
      {words.length > 0 && <p className="text-sm text-foreground">{words}</p>}
    </div>
  );
}

/** The zero-disclosure destination, in the wording and the weight the rest of the product already
 *  uses for it. It renders in every branch, so no state on this surface is a dead end. */
function OpenOnTikTokLink({ videoUrl }: { videoUrl: string }) {
  return (
    <a
      href={videoUrl}
      target="_blank"
      rel="noreferrer"
      data-vaul-no-drag
      className="flex min-h-11 items-center text-sm font-bold text-brand underline-offset-4 hover:underline"
    >
      {PLAYBACK_COPY.openOnTikTok}
    </a>
  );
}

/** The quiet control that changes the stored answer. A text button rather than a filled one: it is
 *  the least-pressed thing on the surface and it must not compete with the link beside it. */
function SecondaryAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-vaul-no-drag
      className="flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:underline"
    >
      {children}
    </button>
  );
}

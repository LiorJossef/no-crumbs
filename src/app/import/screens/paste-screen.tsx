'use client';

/**
 * F0/F1 — the paste screen. The first thing anyone sees in the flagship flow.
 *
 * Lifted verbatim out of `import-page-client.tsx` (its lines 844-989) by W6-1.
 *
 * **The state it does not own, and must not acquire.** `url`, `touched` and `offline` stay in the
 * shell's run (`_lib/use-import-run.ts` after step 4) and arrive as props. This component unmounts
 * on every screen transition, so anything held here is discarded on the way to the rail and rebuilt
 * on the way back — which for the seed effect in particular would mean a second Gemini call against
 * a hard 500/day ceiling every time the user returns to paste.
 */

import { useId } from 'react';
import { Link2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { extractPastedUrl, pasteWasNarrowed } from '@/domain/source/extract-pasted-url';
import { COPY_LINK_INSTRUCTION } from '@/ui/import/import-error-copy';
import { IMPORT_SEED_LINKS } from '@/ui/import/seed-links';

import { ScreenKicker } from './screen-kicker';

/* ------------------------------------------------------------------------------------------- *
 * F0/F1 — paste screen
 * ------------------------------------------------------------------------------------------- */

export function PasteScreen({
  url,
  setUrl,
  setTouched,
  showInvalid,
  showOffline,
  canSubmit,
  onSubmit,
  onSeed,
}: {
  url: string;
  setUrl: (v: string) => void;
  setTouched: (v: boolean) => void;
  showInvalid: boolean;
  /** The last submit stopped because the browser is offline — the link is fine and still in the
   *  field, so this is news about the connection, not about what was pasted. */
  showOffline: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  /** Runs one of `IMPORT_SEED_LINKS` through the ordinary submit path. */
  onSeed: (url: string) => void;
}) {
  const seedsLabelId = useId();
  return (
    // A real `<form>`, because the first action in the flagship flow was tap-only: the field was a
    // bare `<Input>` with no form and no key handler, so Enter on a desktop keyboard and Go on a
    // phone keyboard both did nothing at all. Every seed button below is `type="button"`, so none
    // of them submits it.
    <form
      className="flex flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div className="flex flex-col gap-2 pb-8">
        <ScreenKicker icon={<Link2 className="size-3.5" aria-hidden />} label="Add a place" />
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground">
          Add a TikTok
        </h1>
        {/* C03, from the same module the failure copy comes from — `MALFORMED_URL`'s body is
            this exact sentence, and one of the two would eventually be edited alone. */}
        <p className="text-sm font-medium text-muted-foreground">{COPY_LINK_INSTRUCTION}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Input
          autoFocus
          inputMode="url"
          // A URL is not prose: autocapitalising it, autocorrecting it or underlining it in red are
          // all a phone keyboard trying to help with something it cannot help with. `go` turns the
          // return key into the action, which is what makes the form above reachable on a phone.
          enterKeyHint="go"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Paste a TikTok link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(event) => {
            // What TikTok's share sheet copies is `caption … link … #hashtags`, not a bare link,
            // and rejecting that as "That doesn't look like a TikTok link" was a lie — the link is
            // right there. Read on paste only, never while typing: rewriting a field under a
            // moving cursor is worse than not helping. `extract-pasted-url.ts` states plainly that
            // it is not part of the SSRF boundary; whatever it picks still goes through the full
            // host allow-list.
            const pasted = event.clipboardData.getData('text');
            if (!pasteWasNarrowed(pasted)) return;
            event.preventDefault();
            setUrl(extractPastedUrl(pasted));
          }}
          onBlur={() => setTouched(true)}
          aria-invalid={showInvalid || undefined}
          className={cn(
            'h-12 rounded-lg border-2 px-4 text-base font-medium',
            showInvalid ? 'border-destructive' : 'border-input',
          )}
        />
        {showInvalid && (
          <p className="text-sm font-semibold text-destructive">
            That doesn&rsquo;t look like a TikTok link.
          </p>
        )}
        {/* Not `aria-invalid` on the field: the link is not the problem. `role="status"` because
            this appears after an action rather than describing what is typed. The sentence is the
            one `/collections/join` already uses for the same stop. */}
        {showOffline && !showInvalid && (
          <p role="status" className="text-sm font-semibold text-destructive">
            You&rsquo;re offline. Check your connection and try again.
          </p>
        )}
      </div>

      {/*
        Cold start. With no places saved, this screen is a heading, an empty field and a disabled
        button, and the user has to leave the product to find something to paste. These are real
        TikToks (`ui/import/seed-links.ts`) that run the real pipeline — tapping one is a paste, not
        a demo, and it still stops at review-and-confirm before anything is saved.

        Deliberately quiet and skippable: no card, no arrow, muted chips under the field rather than
        beside it, and the field keeps focus (`autoFocus` above) so a user with a link in their
        clipboard never has to look at this row. One tap costs one model call, so nothing here runs
        without one.
      */}
      {IMPORT_SEED_LINKS.length > 0 && (
        <div className="flex flex-col gap-2.5 pt-6">
          <p
            id={seedsLabelId}
            className="text-micro font-bold tracking-[0.14em] text-muted-foreground uppercase"
          >
            Or try one of these
          </p>
          <ul aria-labelledby={seedsLabelId} className="flex flex-wrap gap-2">
            {IMPORT_SEED_LINKS.map((seed) => (
              <li key={seed.url}>
                <button
                  type="button"
                  onClick={() => onSeed(seed.url)}
                  className="flex h-11 items-center rounded-full border border-input bg-background px-4 text-caption font-semibold text-muted-foreground hover:border-brand hover:text-brand motion-safe:transition-colors"
                >
                  {seed.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sticky thumb-zone primary action — bottom of the flex column, not fixed, so it sits above
          the home indicator on a short viewport without extra plumbing at this fidelity. */}
      <div className="mt-auto flex flex-col gap-2 pt-10">
        <Button
          type="submit"
          disabled={!canSubmit}
          className="h-12 w-full rounded-lg text-base font-bold"
        >
          Add →
        </Button>
      </div>
    </form>
  );
}

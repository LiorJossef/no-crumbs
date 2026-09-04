/**
 * **The two halves of the `modal={false}` repair, and the wiring that makes either one real.**
 *
 * Round 3 finding 3: below 1024 px the places sheet was a keyboard trap — 16 of 16 Tab and
 * Shift+Tab presses left `document.activeElement` unchanged, at 390, 430, 768, 1000 and 1023, and
 * clean at 1024. The cause is `vaul@1.1.2` not forwarding `modal` to Radix, which
 * `non-modal-drawer.tsx` enumerates in full.
 *
 * **What this file can and cannot claim.** `vitest.config.ts` sets `environment: 'node'`: there is
 * no DOM, so sequential focus navigation is not observable here, and the proof that a keyboard can
 * leave the sheet is the browser measurement, not this. What is checkable without a DOM is the
 * *condition* — that the release stops exactly `Tab` and nothing else, that it never calls
 * `preventDefault` (the browser's own focus move is the whole point of the fix), that the listener
 * is attached and detached on the node vaul hands us, and that the scope really asks Radix for
 * `modal: false`.
 *
 * The fourth block reads `map-shell.tsx`'s source, and it is not ceremony. Both halves are wiring:
 * a `NonModalDrawerScope` that stops wrapping `Drawer.Portal`, or a `ref` that stops reaching
 * `Drawer.Content`, restores the trap in full while every assertion above still passes.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  NonModalDrawerScope,
  releaseTab,
  useNonModalDrawerTabRelease,
} from '@/components/shell/non-modal-drawer';

const MAP_SHELL = readFileSync(
  fileURLToPath(new URL('../../../src/components/shell/map-shell.tsx', import.meta.url)),
  'utf8',
);

/** The three fields `releaseTab` reads, plus the two calls it may make. */
function keyEvent(init: {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): KeyboardEvent & { stopPropagation: ReturnType<typeof vi.fn> } {
  return {
    key: init.key,
    altKey: init.altKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent & { stopPropagation: ReturnType<typeof vi.fn> };
}

/** A node that records what was attached to it. `addEventListener` is all the hook touches. */
function fakeNode() {
  const added: Array<[string, unknown]> = [];
  const removed: Array<[string, unknown]> = [];
  return {
    added,
    removed,
    node: {
      addEventListener: (type: string, handler: unknown) => added.push([type, handler]),
      removeEventListener: (type: string, handler: unknown) => removed.push([type, handler]),
    } as unknown as HTMLElement,
  };
}

/**
 * The hook, run for real. `renderToStaticMarkup` executes the component body, so `useRef` and
 * `useCallback` behave; refs are never attached by the server renderer, which is why the callback
 * is captured and driven by hand below.
 */
function callbackFromHook(): (node: HTMLElement | null) => (() => void) | void {
  let captured: ((node: HTMLElement | null) => (() => void) | void) | null = null;
  function Probe() {
    captured = useNonModalDrawerTabRelease();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!captured) throw new Error('the hook returned nothing');
  return captured;
}

describe('releaseTab — the condition, which is what decides the blast radius', () => {
  it('stops an unmodified Tab, in both directions', () => {
    // Shift+Tab is the same `key`; `shiftKey` is deliberately not read, because Radix's own handler
    // treats both directions and only skips alt/ctrl/meta.
    for (const key of ['Tab']) {
      const event = keyEvent({ key });
      releaseTab(event);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    }
  });

  it('never calls preventDefault — the browser is what moves focus', () => {
    const event = keyEvent({ key: 'Tab' });
    releaseTab(event);
    expect((event as unknown as { preventDefault: ReturnType<typeof vi.fn> }).preventDefault)
      .not.toHaveBeenCalled();
  });

  it('leaves every other key alone, so Escape still reaches the sheet', () => {
    // The four `onKeyDown` handlers under `components/sheet/` and `components/collections/` all
    // test for Escape and nothing else. Swallowing it would break the note and name editors.
    for (const key of ['Escape', 'Enter', 'a', ' ', 'ArrowDown']) {
      const event = keyEvent({ key });
      releaseTab(event);
      expect(event.stopPropagation, `${key} is untouched`).not.toHaveBeenCalled();
    }
  });

  it('leaves a modified Tab alone, which is what Radix does too', () => {
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey'] as const) {
      const event = keyEvent({ key: 'Tab', [modifier]: true });
      releaseTab(event);
      expect(event.stopPropagation, `${modifier}+Tab is untouched`).not.toHaveBeenCalled();
    }
  });
});

describe('useNonModalDrawerTabRelease — the attachment', () => {
  it('attaches one keydown listener to the node vaul hands it', () => {
    const ref = callbackFromHook();
    const { added, node } = fakeNode();
    ref(node);
    expect(added).toEqual([['keydown', releaseTab]]);
  });

  it('returns a cleanup, which is what composeRefs looks for before it stops passing null', () => {
    // `@radix-ui/react-compose-refs` only builds a cleanup path when at least one composed ref
    // returns a function; without one React calls the composed callback with `null` instead. Both
    // routes have to end in the listener coming off, so the callback handles both.
    const ref = callbackFromHook();
    const { added, removed, node } = fakeNode();
    const cleanup = ref(node);
    expect(typeof cleanup).toBe('function');
    (cleanup as () => void)();
    expect(removed).toEqual(added);
  });

  it('detaches the previous node when React swaps the element', () => {
    const ref = callbackFromHook();
    const first = fakeNode();
    const second = fakeNode();
    ref(first.node);
    ref(second.node);
    expect(first.removed).toEqual([['keydown', releaseTab]]);
    expect(second.added).toEqual([['keydown', releaseTab]]);
  });

  it('does nothing on the null call, and is safe to call twice', () => {
    const ref = callbackFromHook();
    const { added, removed, node } = fakeNode();
    ref(node);
    ref(null);
    ref(null);
    expect(removed).toEqual([['keydown', releaseTab]]);
    expect(added).toHaveLength(1);
  });
});

describe('NonModalDrawerScope — the value vaul refuses to forward', () => {
  it('asks Radix for a non-modal, open dialog', () => {
    // The whole of consequences 1–4: `DialogContent` branches on `context.modal`, and the nearest
    // provider wins. If this ever renders `modal` as anything but `false`, `hideOthers()`,
    // `FocusScope trapped` and `disableOutsidePointerEvents` all come back at once.
    const element = NonModalDrawerScope({ children: null }) as unknown as {
      props: { modal: boolean; open: boolean; onOpenChange: () => void };
    };
    expect(element.props.modal).toBe(false);
    expect(element.props.open).toBe(true);
    expect(typeof element.props.onOpenChange).toBe('function');
  });
});

describe('map-shell.tsx — the wiring, read from source', () => {
  it('wraps the drawer portal in the scope', () => {
    expect(MAP_SHELL).toMatch(/<NonModalDrawerScope>\s*<Drawer\.Portal>/);
    expect(MAP_SHELL).toMatch(/<\/Drawer\.Portal>\s*<\/NonModalDrawerScope>/);
  });

  it('puts the release ref on Drawer.Content', () => {
    const content = MAP_SHELL.slice(
      MAP_SHELL.indexOf('<Drawer.Content'),
      MAP_SHELL.indexOf('>', MAP_SHELL.indexOf('className="fixed inset-x-0 bottom-0 z-40')),
    );
    expect(content).toContain('ref={releaseTabRef}');
  });

  it('still declares the drawer non-modal and undismissable', () => {
    // Both are load-bearing for the fix above: `dismissible={false}` is why Escape is not an escape
    // route and Tab has to be one, and `modal={false}` is the statement the scope makes true.
    expect(MAP_SHELL).toMatch(/<Drawer\.Root\s+open\s+modal=\{false\}\s+dismissible=\{false\}/);
  });

  it('no longer carries the symptom-level aria-hidden observer', () => {
    // `use-non-modal-background.ts` stripped `aria-hidden` off anything Radix's `hideOthers` had
    // marked — including, measured on 2026-09-01, the eleven background elements the *genuine*
    // modal `AddSheet` had correctly hidden. Fixing the prop makes the observer unnecessary and
    // its blast radius unacceptable.
    expect(MAP_SHELL).not.toContain('useNonModalBackground');
  });
});

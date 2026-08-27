import { describe, expect, it } from 'vitest';

import { describeCause } from '@/app/api/imports/_lib/error-reporting';

/**
 * FIX-ERR-QA — `describeCause` runs inside the failure handler, so it must not throw.
 *
 * `failureResponse` calls `importFailureLogLine`, which calls `describeCause`, and `failImport`
 * calls it again from inside its own `catch`. Both sites run *after* something has already gone
 * wrong; a throw in either replaces an honest 4xx with an unhandled exception and Next's own 500.
 * The module's header states the redaction contract but says nothing about totality, and the
 * function reads `.message`, `.code`, `.name`, `.cause` and `issue.path` off an object it did not
 * construct.
 *
 * These are adversarial shapes, not observed ones. Nothing on this route's real paths (an undici
 * `TypeError`, a plain PostgREST error object, a `ZodError`, a `SyntaxError`) carries a throwing
 * accessor or a symbol `name`, so this is a defensive gap rather than a live defect — but the cost
 * of it firing is the loss of the exact honesty this change exists to add.
 */
function attempt(cause: unknown): { readonly threw: string | null; readonly out: string | null } {
  try {
    return { threw: null, out: describeCause(cause) };
  } catch (e) {
    return { threw: `${(e as Error).name}: ${(e as Error).message}`, out: null };
  }
}

/** Each entry is one hostile `cause`, built fresh so a throwing accessor cannot poison the next. */
const HOSTILE: readonly { readonly name: string; readonly build: () => unknown }[] = [
  {
    name: 'a throwing getter on .code',
    build: () => Object.defineProperty(new Error('boom'), 'code', { get() { throw new Error('code getter'); } }),
  },
  {
    name: 'a throwing getter on .message',
    build: () => Object.defineProperty(new Error('boom'), 'message', { get() { throw new Error('message getter'); } }),
  },
  {
    name: 'a throwing getter on .cause',
    build: () => Object.defineProperty(new Error('boom'), 'cause', { get() { throw new Error('cause getter'); } }),
  },
  {
    name: 'a symbol .name',
    build: () => Object.defineProperty(new Error('boom'), 'name', { value: Symbol('nope') }),
  },
  {
    name: 'a validation issue whose .path getter throws',
    build: () => ({ issues: [Object.defineProperty({}, 'path', { get() { throw new Error('path getter'); } })] }),
  },
  {
    name: 'a proxy with throwing traps',
    build: () => new Proxy({}, { has() { throw new Error('has trap'); }, get() { throw new Error('get trap'); } }),
  },
];

/** Shapes that are already handled, kept so a hardening fix cannot regress them. */
const HANDLED: readonly { readonly name: string; readonly build: () => unknown; readonly out: string }[] = [
  {
    name: 'a self-referential cause',
    build: () => {
      const e = new Error('outer') as Error & { cause?: unknown };
      e.cause = e;
      return e;
    },
    out: 'Error: outer <- <cycle>',
  },
  {
    name: 'a two-node cause cycle',
    build: () => {
      const a = new Error('a') as Error & { cause?: unknown };
      const b = new Error('b') as Error & { cause?: unknown };
      a.cause = b;
      b.cause = a;
      return a;
    },
    out: 'Error: a <- Error: b <- <cycle>',
  },
  { name: 'a thrown symbol', build: () => Symbol('s'), out: 'non-error symbol' },
  { name: 'a thrown bigint', build: () => 10n, out: 'non-error bigint' },
  {
    name: 'a null-prototype object with a message',
    build: () => Object.assign(Object.create(null) as object, { message: 'np' }),
    out: 'np',
  },
  {
    name: 'a validation issue path holding a symbol',
    build: () => ({ issues: [{ code: 'custom', path: [Symbol('lat')] }] }),
    out: 'ValidationError: 1 issue(s) at Symbol(lat)(custom)',
  },
];

describe('describeCause under hostile input', () => {
  it.each(HANDLED)('survives $name', ({ build, out }) => {
    expect(describeCause(build())).toBe(out);
  });

  it('never throws, whatever it is handed', () => {
    const threw = HOSTILE.map((c) => ({ case: c.name, ...attempt(c.build()) })).filter((r) => r.threw !== null);
    expect(threw, 'a throw here loses the honest response the failure handler was building').toEqual([]);
  });
});

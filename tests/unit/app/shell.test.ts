/**
 * The app shell: the four screens a user reaches when something has gone wrong, plus the crawl
 * policy and the viewport.
 *
 * The test runner has no DOM (`vitest.config.ts` sets `environment: 'node'`), so nothing here
 * renders. That is why the copy and the digest formatter are exported from the boundary files as
 * data — what is worth pinning about these screens is what they *say* and what they refuse to
 * put on screen, and both are assertable without React.
 *
 * The viewport assertion reads the layout's source text rather than importing it. Importing
 * `app/layout.tsx` would pull in `next/font/google` and a CSS import, neither of which resolves in
 * a node test; and the property being defended is literally "this line is not in this file".
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SHELL_ERROR_COPY, errorReference } from '@/app/error';
import { GLOBAL_ERROR_COPY, globalErrorReference } from '@/app/global-error';
import { NOT_FOUND_COPY } from '@/app/not-found';
import robots from '@/app/robots';

const repoFile = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), 'utf8');

describe('the shell reference line', () => {
  it('is nothing when there is no digest', () => {
    expect(errorReference(undefined)).toBeNull();
    expect(errorReference('')).toBeNull();
    // A digest of only punctuation would filter down to an empty string; an empty `Reference `
    // line is worse than no line.
    expect(errorReference('---')).toBeNull();
  });

  it('keeps only characters a user can read out, and only one line of them', () => {
    expect(errorReference('1a2b3c4d')).toBe('1a2b3c4d');
    expect(errorReference('1a2b<script>3c')).toBe('1a2bscript3c');
    expect(errorReference('0123456789abcdef0123456789')).toBe('0123456789abcdef');
  });

  it('is duplicated in global-error and the two copies agree', () => {
    // The duplication is deliberate (see the comment in `global-error.tsx`); this is what stops it
    // drifting into two different reference formats for the same incident.
    for (const input of [undefined, '', '---', 'abc', 'a-b_c', '0123456789abcdef0123456789']) {
      expect(globalErrorReference(input)).toEqual(errorReference(input));
    }
  });
});

describe('shell copy', () => {
  const allCopy = [
    ...Object.values(SHELL_ERROR_COPY),
    ...Object.values(GLOBAL_ERROR_COPY),
    ...Object.values(NOT_FOUND_COPY),
  ];

  // `brand-and-product-foundation.md` §4 rule 2, quoting `ux-architecture` §12 verbatim. The
  // failure screens are where this vocabulary leaks in, which is exactly why it is asserted here.
  const BANNED = [
    /\bmetadata\b/i,
    /\bLLM\b/i,
    /\bAI\b/i,
    /\bmodel\b/i,
    /\bgeocode/i,
    /\bextraction\b/i,
    /\bpipeline\b/i,
    /\bparse\b/i,
    /\bAPI\b/i,
    /\bpayload\b/i,
    /confidence score/i,
    /\bworker\b/i,
    /\boops\b/i,
    /something went wrong/i,
  ];

  it('uses none of the banned vocabulary', () => {
    const offenders = allCopy.flatMap((line) =>
      BANNED.filter((banned) => banned.test(line)).map((banned) => `${banned} in "${line}"`),
    );
    expect(offenders).toEqual([]);
  });

  it('names one destination, once, across all three screens', () => {
    // The backlog counts four labels for one action already (§13). Three shell screens with three
    // wordings for "go to /map" would be the fifth, sixth and seventh.
    expect(SHELL_ERROR_COPY.back).toBe(NOT_FOUND_COPY.back);
    expect(GLOBAL_ERROR_COPY.back).toBe(NOT_FOUND_COPY.back);
  });

  it('never claims the thing is missing, because sometimes it is only not yours', () => {
    // `collections/[id]` calls `notFound()` both for a collection that does not exist and for one
    // the caller cannot see. Any wording that asserts non-existence is a lie in the second case.
    const claimsAbsence = [
      /does ?n[o’']?t exist/i,
      /\bnot found\b/i,
      /no such/i,
      /\bdeleted\b/i,
      /\bmissing\b/i,
      /\b404\b/,
    ];
    for (const claim of claimsAbsence) {
      expect(claim.test(NOT_FOUND_COPY.headline)).toBe(false);
      expect(claim.test(NOT_FOUND_COPY.body)).toBe(false);
    }
    // ...and it must still be honest that we cannot show them anything.
    expect(NOT_FOUND_COPY.body).toMatch(/nothing at this address/i);
    expect(NOT_FOUND_COPY.body).toMatch(/is ?n[o’']?t yours/i);
  });
});

describe('robots', () => {
  // A single rule object, not an array — asserted so the shape below means what it reads as.
  const rules = robots().rules;
  if (Array.isArray(rules)) throw new Error('robots() is expected to return one rule block');

  it('is deny-by-default, so a route added tomorrow is closed', () => {
    expect(rules.disallow).toBe('/');
    expect(rules.userAgent).toBe('*');
  });

  it('opens only the two screens designed for a stranger', () => {
    // The real assertion: nothing that can carry a person's saved places, an import, or an invite
    // token may appear in this list. Written as an allow-list check rather than a scan for those
    // prefixes, because the failure to catch would be a *new* private prefix nobody listed here.
    expect(rules.allow).toEqual(['/$', '/sign-in']);
  });

  it('points at no sitemap it does not have', () => {
    expect(robots().sitemap).toBeUndefined();
  });
});

describe('viewport', () => {
  it('does not pin the scale — WCAG 1.4.4', () => {
    const layout = repoFile('src/app/layout.tsx');
    // Both spellings of the same failure. `maximumScale: 1` shipped for months and blocked
    // pinch-zoom on every screen in the product.
    expect(layout).not.toMatch(/maximumScale\s*:/);
    expect(layout).not.toMatch(/userScalable\s*:\s*false/);
  });

  it('does not ship the repo codename as the product name', () => {
    // The name is an open owner decision (`mvp-plan.md`, L1-F1-T1). `P-002` is a folder, and it
    // was the browser tab title, the bookmark and every link preview.
    const layout = repoFile('src/app/layout.tsx');
    const title = /title:\s*'([^']+)'/.exec(layout)?.[1];
    expect(title).toBeDefined();
    expect(title).not.toMatch(/P-002/);
  });
});

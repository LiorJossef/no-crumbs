/**
 * The collections index's entry-point control — `New collection` — checked against the markup the
 * component actually produces, at both branches `ux-sparse-panel-2026-08-31.md` §3 names: zero
 * collections (primary CTA) and one or more (the existing dashed, in-list "add one more" row,
 * unchanged).
 *
 * Rendered with `react-dom/server`: vitest runs in a `node` environment, there is no jsdom and no
 * testing library, so nothing here can click. What is checked is the first paint's markup — enough
 * to tell the two button treatments apart and confirm neither state leaked the other's classes, but
 * not evidence of layout, colour resolution or focus order on a real screen.
 *
 * `next/navigation` and the create-collection hook are mocked: the former because importing it
 * outside an app-router context throws, the latter because it wraps a Server Action this test never
 * calls.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/collections/use-create-collection', () => ({
  useCreateCollection: () => ({
    pending: false,
    error: null,
    create: vi.fn(),
    clearError: vi.fn(),
  }),
}));

const { CollectionsIndexList } = await import('@/app/map/collections-index-list');

import type { CollectionSummary } from '@/app/collections/_lib/get-collections';

function summary(overrides: Partial<CollectionSummary> = {}): CollectionSummary {
  return {
    id: 'c1',
    name: 'Tel Aviv food',
    description: null,
    role: 'owner',
    ownerName: null,
    placeCount: 3,
    memberCount: 1,
    categories: [],
    updatedAt: '2026-08-30T00:00:00.000Z',
    ...overrides,
  };
}

function render(collections: readonly CollectionSummary[]): string {
  return renderToStaticMarkup(
    createElement(CollectionsIndexList, {
      collections,
      libraryIsEmpty: false,
      onExpand: () => {},
      idPrefix: 'test',
    }),
  );
}

/** The one control both branches share a label with — found by that label, not by position, since
 *  the two branches render a different element (`Button`'s `<button>` vs. a bare `<button>`) at the
 *  same spot in the tree. */
function entryPoint(markup: string): string {
  const buttons = markup.match(/<button[\s\S]*?<\/button>/g) ?? [];
  const match = buttons.find((button) => button.includes('New collection'));
  if (!match) throw new Error('entry-point control not found in markup');
  return match;
}

describe('CollectionsIndexList — zero collections: the entry point is the primary CTA', () => {
  it('renders the solid, bold, full-width treatment', () => {
    const button = entryPoint(render([]));
    expect(button).toContain('bg-primary');
    expect(button).toContain('text-primary-foreground');
    expect(button).toContain('h-12');
    expect(button).toContain('w-full');
    expect(button).toContain('font-bold');
  });

  it('carries none of the dashed, muted, in-list row styling', () => {
    const button = entryPoint(render([]));
    expect(button).not.toContain('border-dashed');
    expect(button).not.toContain('text-muted-foreground');
    // The grey circle badge around the icon is the muted row's signature — gone with it.
    expect(button).not.toContain('rounded-full');
  });

  it('keeps the label exactly "New collection", with no trailing arrow', () => {
    const button = entryPoint(render([]));
    expect(button).toContain('New collection');
    expect(button).not.toContain('→');
  });

  it('leaves EmptyIndex\'s two lines of copy untouched', () => {
    // Not this task's surface, but a regression here would be silent — the copy sits right next to
    // the control this task did change.
    const markup = render([]);
    expect(markup).toContain('Nothing collected yet.');
    expect(markup).toContain(
      'A collection is a set of places you can share with one other person.',
    );
  });
});

describe('CollectionsIndexList — one or more collections: the "add one more" row is unchanged', () => {
  it('keeps the dashed, muted, in-list styling', () => {
    const button = entryPoint(render([summary()]));
    expect(button).toContain('border-dashed');
    expect(button).toContain('text-muted-foreground');
    expect(button).toContain('rounded-full'); // the grey icon badge
  });

  it('carries none of the primary-CTA styling', () => {
    const button = entryPoint(render([summary()]));
    expect(button).not.toContain('bg-primary');
    expect(button).not.toContain('text-primary-foreground');
  });

  it('keeps the same label as the zero-collection state', () => {
    expect(entryPoint(render([summary()]))).toContain('New collection');
  });

  it('renders real rows above the entry point rather than EmptyIndex', () => {
    const markup = render([summary({ name: 'Coffee crawl' })]);
    expect(markup).toContain('Coffee crawl');
    expect(markup).not.toContain('Nothing collected yet.');
  });
});

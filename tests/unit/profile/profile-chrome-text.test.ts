/**
 * **What the account surfaces stopped saying** — the overwhelm audit's §7 items 11 and 15, and the
 * alignment defect from the standing open list.
 *
 * Owner, 2026-09-02: *"top priority is that the ui will feel nice and friendly and not overwhelming
 * by a lot of tags or buttons or texts."* The account menu is `calc(100vw - 1.5rem)` wide on a
 * phone, so every line in it is a full-width line.
 *
 * Source assertions rather than a render, for the reason the theme-choice suite gives: these are
 * two server components and a popover, and what is under test is a string's *absence* from the
 * markup a builder writes — a rendered snapshot would pass just as well with the string moved into
 * a variable and interpolated back.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MENU = readFileSync('src/components/nav/profile-menu.tsx', 'utf8');
const PAGE = readFileSync('src/app/profile/page.tsx', 'utf8');
const ACTIONS = readFileSync('src/app/profile/account-actions.tsx', 'utf8');

/** Everything after the imports and the doc comment — where JSX and copy live. */
function body(source: string): string {
  return source.slice(source.indexOf('const COPY') === -1 ? 0 : source.indexOf('const COPY'));
}

describe('the account menu', () => {
  it('gives `Account settings` no subtitle', () => {
    // `Your name` described the contents of the *next* screen. The row names its own destination.
    expect(MENU).not.toContain("'Your name'");
    expect(MENU).toContain('<MenuLink href="/account" label={COPY.settings} icon />');
  });

  it('makes a menu row’s hint optional rather than passing an empty one', () => {
    // An empty string would still render the `<span>` and its line box. The prop is absent.
    expect(MENU).toContain('hint?: string;');
    expect(MENU).toContain('{hint === undefined ? null : (');
  });

  it('draws no `Joined …` line', () => {
    // It is on `/profile`, where there is room for a record; it is acted on nowhere.
    expect(body(MENU)).not.toContain('{data.joined}');
  });

  it('keeps `Appearance` in the accessibility tree while dropping the drawn kicker', () => {
    // `ThemeChoice` is a `radiogroup` pointing its `aria-labelledby` here — the name may not go
    // with the label. Screen-reader-only, not deleted.
    expect(MENU).toContain('<SectionHeading id="menu-appearance" visuallyHidden>');
    expect(MENU).toContain('<ThemeChoice labelledBy="menu-appearance" />');
    expect(MENU).toContain("? 'sr-only'");
  });
});

describe('the profile page', () => {
  it('drops the `Your account` kicker and keeps the section named', () => {
    // Three full-width buttons that name themselves needed no heading over them; the landmark
    // still has an accessible name, so the document outline is unchanged.
    expect(PAGE).not.toContain('<SectionHeading id="your-account">');
    expect(PAGE).toContain('<section aria-label="Your account"');
  });

  it('keeps `Appearance` drawn on the page, where it separates two real sections', () => {
    expect(PAGE).toContain('<SectionHeading id="appearance">Appearance</SectionHeading>');
  });
});

describe('the delete-my-data entry', () => {
  it('aligns its line with everything above it, using a logical property', () => {
    // It was the only centred text in a left-aligned column, and `text-center` would not follow an
    // RTL locale to the other edge either.
    expect(ACTIONS).toContain('text-start text-xs text-muted-foreground');
    expect(ACTIONS).not.toMatch(/className="[^"]*\btext-center\b/);
  });

  it('lets the entry label follow its host’s other controls rather than its own taste', () => {
    // `/profile` stacks three full-width buttons and centres all three, which is that page's own
    // rule. The menu draws `Sign out` `justify-start` directly above this one, so a centred label
    // there was the only thing in the card that did not line up.
    expect(ACTIONS).toContain("align === 'start' && 'justify-start px-2'");
    expect(ACTIONS).toContain("align = 'center',");
    expect(MENU).toContain('<AccountActions blocking={data.blocking} align="start" />');
    expect(PAGE).toContain('<AccountActions blocking={blocking} />');
  });

  it('changes neither the words nor the two-step behaviour', () => {
    expect(ACTIONS).toContain("entry: 'Delete my data',");
    expect(ACTIONS).toContain("setView(blocking.length > 0 ? 'blocked' : 'confirm')");
  });
});

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
const SETTINGS = readFileSync('src/app/account/page.tsx', 'utf8');
const ACTIONS = readFileSync('src/app/profile/account-actions.tsx', 'utf8');

/** Everything after the imports and the doc comment — where JSX and copy live. */
function body(source: string): string {
  return source.slice(source.indexOf('const COPY') === -1 ? 0 : source.indexOf('const COPY'));
}

describe('the account menu', () => {
  it('gives `Account settings` no subtitle and no leading glyph', () => {
    // `Your name` described the contents of the *next* screen. The row names its own destination.
    expect(MENU).not.toContain("'Your name'");
    expect(MENU).toContain('<MenuLink href="/account" label={COPY.settings} />');
    // Round 4, §4.5: `Account settings` carried a leading `Settings` glyph and `Your library` did
    // not, so two labels in a two-row list started at two inline offsets. The trailing chevron is
    // the glyph that means *this goes somewhere*, and it is on both.
    expect(MENU).not.toMatch(/\bSettings\b.*from 'lucide-react'/);
  });

  it('keeps delete-my-data off a quick menu', () => {
    // Owner, 2026-09-03: deleting your account is not something a menu offers beside `Sign out`.
    // It lives at the bottom of `Account settings`, behind a disclosure. The header paragraph still
    // records that it was here, which is why this reads the body rather than the whole file.
    expect(body(MENU)).not.toContain('AccountActions');
    expect(body(MENU)).toContain('<form action={signOut}>');
  });

  it('reserves the hint line rather than filling it with a placeholder sentence', () => {
    // Round 4, §4.1. `COPY.libraryHint` — `Where you save, and what` — described the next screen
    // for ~300 ms and was then replaced by the counts, so the row said two different things on one
    // open. An **empty string** now holds the line: `min-h-4 block` gives it its height, so nothing
    // moves when the data lands. Omitting the prop is still how a one-line row is drawn
    // (`Account settings`), which is why the two states are not the same value.
    expect(MENU).not.toContain('libraryHint');
    expect(MENU).toContain("hint={data === null ? '' : libraryLine(data)}");
    expect(MENU).toContain('hint?: string;');
    expect(MENU).toContain('{hint === undefined ? null : (');
    expect(MENU).toContain('block min-h-4');
  });

  it('draws no `Joined …` line', () => {
    // It is on `/profile`, where there is room for a record; it is acted on nowhere.
    expect(body(MENU)).not.toContain('{data.joined}');
  });

  it('draws the `Appearance` kicker AND the caption', () => {
    // Two reversals, and they do not cancel. 2026-09-03 made the kicker visible, because three
    // unlabelled segments between two link rows named nothing. It also hid the caption, on the
    // argument that a kicker plus a caption is two lines of chrome — and the owner asked for the
    // caption back on 2026-09-04: `Follows your device.` is the line that says what `System`
    // means, and the kicker names the group without answering that. So both are drawn, and
    // `ThemeChoice` has one appearance on every surface again — the `captionVisible` prop that
    // existed only for this call site is gone rather than left dead.
    expect(MENU).toContain('<h2 id="menu-appearance"');
    expect(MENU).toContain('<ThemeChoice labelledBy="menu-appearance" />');
    expect(MENU).not.toContain('captionVisible');
    expect(MENU).not.toContain('visuallyHidden');
  });

  it('labels every section with the product\u2019s one section label', () => {
    // Four spellings of one kicker lived on these three surfaces — two byte-identical private
    // `SectionHeading` components, a third with an `sr-only` branch, and an inline uppercase class
    // in the delete flow. None of them was `SECTION_LABEL`, which is what the place card and the
    // share panel converged on. `text-[11px]` was also an arbitrary bracket where `text-micro` is
    // the registered token.
    for (const source of [MENU, PAGE, SETTINGS, ACTIONS]) {
      expect(source).not.toContain('function SectionHeading');
      expect(source).not.toContain('text-[11px]');
      expect(source).not.toContain('uppercase');
      expect(source).toContain('SECTION_LABEL');
    }
  });
});

describe('the account settings page', () => {
  it('drops the `Your account` kicker and keeps the section named', () => {
    // The controls under it name themselves, so the kicker restated its own stack; the landmark
    // still has an accessible name, so the document outline is unchanged.
    expect(SETTINGS).not.toContain('<SectionHeading id="your-account">');
    expect(SETTINGS).toContain('<section aria-label="Your account"');
  });

  it('keeps `Appearance` drawn on the page, where it separates two real sections', () => {
    expect(SETTINGS).toContain('<h2 id="appearance" className={SECTION_LABEL}>');
    // Both surfaces keep the caption, and neither call site says anything about it: there is one
    // `ThemeChoice` and it looks the same wherever it is drawn.
    expect(SETTINGS).toContain('<ThemeChoice labelledBy="appearance" />');
  });
});

describe('the delete-my-data entry', () => {
  it('is a disclosure rather than a fourth full-width button', () => {
    // Owner, 2026-09-03: *"too prominent"* and *"looks wrong"*. A muted, centred, full-width ghost
    // label read as a section heading and sat as a peer of `Sign out`. It is the product's own
    // disclosure idiom now — the same `aria-expanded` / `aria-controls` pair `add-by-note.tsx`
    // uses — and it may not grow back into a `w-full` control.
    expect(ACTIONS).toContain('aria-expanded={open}');
    expect(ACTIONS).toContain('aria-controls={panelId}');
    expect(ACTIONS).not.toContain('h-12 w-full text-base');
    expect(ACTIONS).not.toContain("align === 'start'");
  });

  it('reveals the whole flow instead of printing any of it on the page', () => {
    // The scope sentence used to sit loose under the button — a permanent explanation of a thing
    // nobody had asked to do. Nothing but the row's own label renders until the panel opens; the
    // owner's 2026-09-03 cut then removed that sentence outright as a duplicate of the
    // confirmation's, which `account-deletion.test.ts` holds the honesty bar for.
    const panel = ACTIONS.indexOf('{open ? (');
    expect(panel).toBeGreaterThan(-1);
    expect(ACTIONS.indexOf('COPY.confirmBody')).toBeGreaterThan(panel);
    // Between the trigger and that guard, the row's own label is the only string on screen.
    const collapsed = ACTIONS.slice(ACTIONS.indexOf('aria-expanded'), panel);
    expect(collapsed.match(/COPY\./g)).toEqual(['COPY.']);
  });

  it('is the last thing on the page and subordinate to `Sign out`', () => {
    // The exits are ordered by what they cost. The hairline is what makes the row read as a
    // footnote to the button above rather than as its peer.
    expect(SETTINGS).toContain('<AccountActions blocking={blocking} />');
    expect(SETTINGS.indexOf('<AccountActions')).toBeGreaterThan(
      SETTINGS.indexOf('action={signOut}'),
    );
    expect(ACTIONS).toContain('border-t border-border/60');
  });

  it('changes neither the words nor the two-step behaviour', () => {
    // Opening reveals; the destructive press is still a second, separate one inside `InlineConfirm`
    // — and the branch is still decided by the server's pre-check rather than by the panel.
    expect(ACTIONS).toContain("entry: 'Delete my data',");
    expect(ACTIONS).toContain("blocking.length > 0 ? 'blocked' : 'confirm'");
    expect(ACTIONS).toContain('<InlineConfirm');
  });
});

describe('the account surfaces\u2019 materials', () => {
  it('draws no hairline under a breakdown row', () => {
    // Nine countries and four categories is eleven rules on one phone screen, under two lists
    // whose rows already read as rows. The place card's field run and the account menu's rows draw
    // none. If a long list ever stops parsing, the fallback is one `divide-y` on the `<ul>`.
    expect(PAGE).not.toContain('border-b border-border/60');
  });

  it('gives the blocked-deletion panel the page\u2019s own box', () => {
    // `rounded-lg border bg-muted/40 p-3` was the only tinted box anywhere in settings, which made
    // a refusal read as an alert. It is a section of the page that happens to say no, so it takes
    // the string the two name cards use. Its list is flush for the same reason `/profile`'s is.
    expect(ACTIONS).toContain('rounded-xl border border-border bg-card p-4');
    expect(ACTIONS).not.toContain('className="mt-2 rounded-lg border border-border bg-muted/40 p-3"');
    expect(ACTIONS).not.toContain('border-b border-border/60');
  });

  it('shortens the peer-label form to one statement per line', () => {
    const PEER = readFileSync('src/app/account/peer-label-form.tsx', 'utf8');
    // The heading and the blurb already name the audience twice above the field.
    expect(PEER).toContain("field: 'Name',");
    // `Right now` states nothing that `People see` does not.
    expect(PEER).toContain("current: 'People see \u201cA collaborator\u201d.',");
    // One clause at a time, twice, rather than a 60-character compound.
    expect(PEER).toContain("suggestion: 'From your first name. Save to keep it.',");
  });

  it('draws no generic avatar disc on either surface', () => {
    // A `UserRound` in a grey circle carried no information and was the largest element in the
    // menu's top row. This product's mark is the crumb mascot, and there is no upload path behind
    // the circle to make it anybody's.
    for (const source of [PAGE, MENU]) {
      expect(source).not.toContain('<UserRound');
      expect(source).not.toMatch(/\bUserRound\b.*from 'lucide-react'/);
    }
  });

  it('reserves the identity block\u2019s settled height', () => {
    // The data is fetched on the first open and the popup is anchored `side="top"`, so it grows
    // upward — a block that gets taller when the fetch lands drags the card up under the thumb.
    // Measured 2026-09-03 with the avatar removed: 20 px of height and 28 px of top edge without
    // this, 0 px with it.
    expect(MENU).toContain('flex min-h-11 min-w-0 flex-1 flex-col justify-center');
  });
});

describe('the line between the two account pages', () => {
  /**
   * Owner, 2026-09-03: `/profile` reads and `/account` changes. Both pages exist; the earlier
   * attempt to fold one into the other was reversed before it shipped. These are the four controls
   * that decide which page a person is on, so they are pinned by side rather than by prose.
   */
  it('puts everything that writes on `Account settings`', () => {
    for (const control of [
      '<AccountNameForm',
      '<PeerLabelForm',
      '<ThemeChoice labelledBy="appearance" />',
      'action={signOut}',
      '<AccountActions',
    ]) {
      expect(SETTINGS).toContain(control);
      expect(body(PAGE)).not.toContain(control);
    }
  });

  it('leaves `/profile` with nothing to press but the way through', () => {
    // It is the bottom-bar tab's landing page and it reports; the row to `/account` is the only
    // control on it. It is also the only door to that page without JavaScript — the account menu
    // is a popover and cannot open with scripting off.
    expect(body(PAGE)).toContain('href="/account"');
    expect(body(PAGE)).toContain('Account settings');
  });

  it('keeps the two names as two forms with two saves', () => {
    // `0035_names_at_sign_up.sql` keeps the private given name apart from the peer-visible label
    // and deleted, under a security veto, the trigger that derived one from the other. One
    // combined `Save` would put that trigger back in the interface.
    const NAME = readFileSync('src/app/account/name-form.tsx', 'utf8');
    const PEER = readFileSync('src/app/account/peer-label-form.tsx', 'utf8');
    for (const form of [NAME, PEER]) {
      // The same size and the same variant on both: two buttons is the security rule; two *shapes*
      // was an accident that read as two kinds of action. The shape itself is pinned by the
      // density suite below.
      expect(form.match(/type="submit"/g)).toHaveLength(1);
    }
  });
});

describe('the page header', () => {
  const HEADER = readFileSync('src/components/nav/page-header.tsx', 'utf8');

  /**
   * `/profile` and `/account` are the only two surfaces carrying this pattern — every other back
   * control in the product is a sheet's own step navigation (`components/collections/*`) or the
   * import overlay's absolutely-positioned ✕. They had a copy of the header each and drifted: the
   * owner caught `/profile`'s arrow on its own row *above* the title and indented to the right of
   * the column the title starts on, while `/account`'s hung correctly in the gutter. One component
   * with a slot, so it cannot happen again.
   */
  it('is one component, not a pattern each page re-types', () => {
    for (const page of [PAGE, SETTINGS]) {
      expect(page).toContain('<PageHeader');
      // Nobody re-declares the box or the title.
      expect(page).not.toContain('<header');
      expect(page).not.toContain('<h1');
    }
  });

  it('puts the title on the content column’s leading edge', () => {
    // At 1440 the title used to sit in the far top-left corner while the column it labels was in
    // the middle of the screen, so it read as chrome. Same box as the body, and no horizontal
    // padding of its own on the `h1`.
    expect(HEADER).toContain('mx-auto w-full max-w-140 px-4');
    expect(HEADER).toContain('<h1 className="font-heading text-lg font-bold tracking-tight">');
    for (const page of [PAGE, SETTINGS]) expect(page).toContain('mx-auto');
  });

  it('floors its top padding rather than leaning on the safe-area inset', () => {
    // The inset is `0` on a desktop, so `+0.5rem` alone left the title 8px from the top of the
    // window while the content below it started ~90px down. `1.5rem` is `import-shell.tsx`'s own
    // `lg:top-6`.
    expect(HEADER).toContain('pt-[calc(env(safe-area-inset-top)+1.5rem)]');
  });

  it('hangs the back control in the gutter at `lg`, from one definition', () => {
    // `end-full` puts its trailing edge on the column's leading edge, so the `h1` keeps the column
    // line with no empty 44px row above it. `relative` on the row is what that hangs off.
    expect(HEADER).toContain('lg:absolute lg:end-full');
    expect(HEADER).toContain('relative flex items-center');
    for (const page of [PAGE, SETTINGS]) expect(page).toContain('HEADER_BACK_CONTROL');
  });

  it('keeps `/profile`’s arrow to the map, and only at `lg`', () => {
    // `/profile` is a bottom-bar tab, so below `lg` the bar is the way back and the arrow would be
    // a second one. The map is genuinely the level above it. Visibility is all it adds.
    expect(PAGE).toContain("cn(HEADER_BACK_CONTROL, 'hidden lg:inline-flex')");
    expect(PAGE).toContain('href="/map"');
    expect(PAGE).toContain('aria-label="Back to the map"');
  });

  it('gives `/account` a control at every breakpoint that knows where it came from', () => {
    // `/account` is not on the bar, so a phone that arrived from the account menu had no exit but
    // the Map tab, which throws away where you were. And the menu opens on every tab, so there is
    // no fixed page above this one to point a `<Link>` at — hence the client island.
    // `HEADER_BACK_CONTROL` alone, with no visibility class composed onto it — that is what makes
    // it render below `lg` where `/profile`'s arrow does not.
    expect(SETTINGS).toContain('<BackControl className={HEADER_BACK_CONTROL} />');
    expect(body(SETTINGS)).not.toMatch(/\bhidden lg:/);

    const BACK = readFileSync('src/app/account/back-control.tsx', 'utf8');
    // Both branches leave the page: history where there is in-app history, `/profile` otherwise.
    expect(BACK).toContain('router.back()');
    expect(BACK).toContain("router.push('/profile')");
    // The same glyph `/profile` draws, at the same size: every back control in this product is an
    // arrow, and one page drawing an ✕ would read as a modal rather than as an ordinary page.
    expect(BACK).toContain('<ArrowLeft className="size-4" aria-hidden />');
    expect(PAGE).toContain('<ArrowLeft className="size-4" aria-hidden />');
    // No destination in the label — this component cannot know one until it is pressed.
    expect(BACK).toContain('aria-label="Back"');
  });
});

describe('the density of `Account settings`', () => {
  /**
   * Two rulings, a day apart, and the second corrects the first. The page was two bordered cards
   * around three full-column `h-11` inputs, and the owner's *"the inputs are really big and massive
   * and I feel overwhelmed by that"* (2026-09-03) was answered by shrinking the fields **and** by
   * taking the cards off. Only the first half of that was theirs. Having seen it: *"Save button too
   * small. I liked it when it was in the white wrapper."*
   *
   * So the cards are back and `Save` matches the field's height, while the shortened copy, the
   * capped width and the disabled-until-dirty rule — the parts that were actually asked for — stay.
   * These assertions pin the corrected state, not the pass that produced it.
   */
  const FORMS = ['src/app/account/name-form.tsx', 'src/app/account/peer-label-form.tsx'].map(
    (path) => readFileSync(path, 'utf8'),
  );

  it('wraps each name section in a card', () => {
    // The card is the section's own edge — `/profile`'s library summary draws the same one. It is
    // also why neither form carries a rule: a border and a hairline draw the same line twice.
    for (const form of FORMS) {
      expect(form).toContain('rounded-xl border border-border bg-card p-4');
      expect(form).not.toContain('border-t border-border/60');
    }
  });

  it('shares one field shape rather than hand-tuning each input', () => {
    for (const form of FORMS) {
      expect(form).toContain('className={SETTINGS_FIELD}');
      expect(form).not.toContain('h-11');
    }
  });

  it('puts the fields and their save on one row that stacks on a phone', () => {
    // Owner, 2026-09-03: *"first name, last name and save button in the same line."* A three-column
    // row does not fit a 375px phone, so the row is a column below `sm` — the breakpoint is in the
    // shared constant, not re-typed per form.
    const FIELD = readFileSync('src/app/account/_lib/field-style.ts', 'utf8');
    expect(FIELD).toContain("SETTINGS_ROW = 'flex flex-col gap-4 sm:flex-row sm:items-end");
    for (const form of FORMS) {
      expect(form).toContain('className={SETTINGS_ROW}');
      expect(form).toContain('className={SETTINGS_FIELD_COLUMN}');
    }
  });

  it('keeps a label over every field rather than leaning on a placeholder', () => {
    // A row of bare boxes is the failure mode this layout invites, and a placeholder disappears the
    // moment someone types. Three fields, three `<Label htmlFor>`.
    const labels = FORMS.map((form) => form.match(/<Label htmlFor=/g)?.length);
    expect(labels).toEqual([2, 1]);
    for (const form of FORMS) expect(form).not.toContain('placeholder=');
  });

  it('caps the field width so a first name is not a 560px box', () => {
    // The cap moved from the input to the column when the layout became a row, and it is 192px
    // rather than 320: that is what the two name fields naturally divide the card into, so capping
    // there makes every field on the page one width. At 320 the cap bound only the peer form's
    // single field, and the two cards drew fields at two different sizes (owner, 2026-09-03).
    const FIELD = readFileSync('src/app/account/_lib/field-style.ts', 'utf8');
    expect(FIELD).toContain('sm:max-w-48');
    expect(FIELD).not.toContain('sm:max-w-xs');
    for (const form of FORMS) expect(form).not.toContain('w-full');
  });

  it('keeps the 16px font on small screens, because iOS zooms below it', () => {
    // Not restated in the forms: `Input` ships `text-base md:text-sm`, so the field constant must
    // not carry a font size that would override it.
    const FIELD = readFileSync('src/app/account/_lib/field-style.ts', 'utf8');
    expect(FIELD).not.toMatch(/SETTINGS_FIELD = '[^']*text-/);
    expect(readFileSync('src/components/ui/input.tsx', 'utf8')).toContain('text-base');
  });

  it('keeps each `Save` live, and still one submit per form', () => {
    // Reversed on 2026-09-03. `Save` used to be disabled until the form was dirty; the owner
    // rejected it — *"only when I update the state it gives me the opportunity to click on save,
    // but there's no way in the UI that says that."* A control that greys itself out for a reason
    // the screen never states is a dead end, so it is disabled only while a save is in flight.
    //
    // The `type="submit"` count is the part that is NOT about looks: two forms with one submit
    // each is `0035`'s boundary drawn in the interface — a single combined save would write a
    // private given name into the column collection peers read.
    for (const form of FORMS) {
      expect(form).toContain('disabled={pending}');
      expect(form).not.toContain('!dirty');
      expect(form.match(/type="submit"/g)).toHaveLength(1);
    }
  });

  it('sizes `Save` to the field beside it, from one constant', () => {
    // Owner, 2026-09-03: *"Save button too small"* at `size="sm"` (28px), and then *"save matching
    // the size of it"* once the button moved onto the field's line. No `size` variant is 40px —
    // `lg` is 36px — so the height lives in `SETTINGS_SAVE` rather than being typed twice, which is
    // also what keeps the two saves identical to each other.
    const FIELD = readFileSync('src/app/account/_lib/field-style.ts', 'utf8');
    const height = /SETTINGS_FIELD = '(h-\d+)'/.exec(FIELD)?.[1];
    expect(height).toBeTruthy();
    expect(FIELD).toContain(`SETTINGS_SAVE = '${height} `);
    for (const form of FORMS) {
      expect(form).toContain('className={SETTINGS_SAVE}');
      expect(form).not.toContain('size="sm"');
    }
  });

  it('draws the two exits from one family', () => {
    // Owner, 2026-09-03: sign out *"doesn't match the design"*. A bordered `outline` button sat
    // directly on a `text-xs` muted disclosure row — two controls doing the same kind of job in two
    // visual vocabularies, the louder one at the bottom of a settings page. These are exits rather
    // than the page's work; the only bordered boxes on it are the two name cards.
    // **One sign-out, character for character** — that is the invariant this guards, and the
    // string it holds them to changed on 2026-09-04. It was `h-8 -ms-2.5` here and
    // `h-11 w-full justify-start px-2` in the account menu — different size, different padding,
    // one full width — for the single most consequential press on either surface.
    //
    // `w-full` came back on the owner's call. The mis-tap argument it replaces was about the phone,
    // where the popup grows upward from the bar; the desktop menu grows downward from the account
    // chip, and there a `ghost` ground that stopped after the label drew a box narrower than the
    // two link rows above it. `h-11` is still the 44 px floor, and `justify-start` still puts the
    // label on the column's line.
    const SIGN_OUT =
      'className="h-11 w-full justify-start px-2 -ms-2 text-sm"';
    expect(SETTINGS).toContain(SIGN_OUT);
    expect(MENU).toContain(SIGN_OUT);
    expect(SETTINGS).toContain('variant="ghost"');
    expect(MENU).toContain('variant="ghost"');
    expect(SETTINGS).not.toContain('variant="outline"');
    expect(SETTINGS).not.toContain('h-12 w-full text-base');
    // Still a plain form posting to the server action: the one control here that has to work with
    // JavaScript off.
    expect(SETTINGS).toContain('<form action={signOut}>');
  });

  it('keeps two hairlines in the bottom third, not three', () => {
    // One under the fields, one separating the two exits. The `Your account` section drew a third
    // directly above `Sign out`, one row above `AccountActions`' own.
    expect(SETTINGS).toContain('<section aria-label="Your account" className="mt-6">');
    expect(ACTIONS).toContain('border-t border-border/60');
  });

  it('says the privacy claim in one line per form, and keeps the audience in it', () => {
    // Owner, 2026-09-03: four lines of prose above three fields. The clause that had to survive is
    // the one naming *who reads this name* — that contrast is `0035`'s boundary drawn in the
    // interface, and it is the reason the owner chose one line over none.
    const [NAME, PEER] = FORMS;
    expect(NAME).toContain("blurb: 'Only you see this.',");
    expect(PEER).toContain("blurb: 'Shown to people you share a collection with.',");
    // `voice-and-vocabulary.md` §2: the product's name ships on six surfaces and a settings blurb
    // is not one of them. The old line read *"how No Crumbs addresses you"*.
    for (const form of FORMS) expect(form).not.toContain('No Crumbs');
  });
});

import { describe, expect, it, vi } from 'vitest';

/**
 * The share panel's pure parts only. There is no jsdom environment in this repo
 * (`vitest.config.ts` sets `environment: 'node'`), so nothing here renders; what is asserted is
 * the link the owner hands out, the button's label, the role wording and the one piece of copy in
 * this feature that must not drift.
 *
 * The Server Actions module is mocked because importing it pulls in `@/app/_lib/supabase/server`,
 * which imports `server-only` — that package throws by design outside a React Server Component.
 * The mock is a load-bearing part of being able to test the helpers at all, not a stub of
 * behaviour under test: no assertion below calls an action.
 */
vi.mock('@/app/_lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/app/actions/collections', () => ({
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  updateDisplayName: vi.fn(),
}));

const {
  JOIN_PATH_PREFIX,
  PRIVACY_BLOCK,
  SEE_LABEL,
  inviteRoleLabel,
  joinLink,
  memberRoleLabel,
  roleSwitchNotice,
  shareButtonLabel,
  shareMessage,
} = await import('@/components/collections/share-panel');

// It lives in the domain rather than beside `NamePrompt`, because every export of a `'use client'`
// module is a client *reference* — a Server Component importing one gets a proxy, not a function —
// and the address must be reduced on the server, since the whole point is that it never reaches
// the client.
const { MEMBER_NAME_MAX_LENGTH: DISPLAY_NAME_MAX_LENGTH, emailLocalPart } = await import(
  '@/domain/collections/collection'
);

const { JOINER_PRIVACY_LINE, roleSentence } = await import(
  '@/app/collections/join/[token]/join-client'
);

describe('joinLink', () => {
  it('builds the link the owner shares from the running origin', () => {
    expect(joinLink('https://example.app', 'f3k9')).toBe(
      'https://example.app/collections/join/f3k9',
    );
  });

  it('does not double the slash when the origin carries a trailing one', () => {
    // `window.location.origin` never has one, but a caller passing a configured base URL might,
    // and `//collections/join/x` is a different path to a router.
    expect(joinLink('http://localhost:3000/', 'abc')).toBe(
      'http://localhost:3000/collections/join/abc',
    );
  });

  it('agrees with the prefix the sign-in round trip validates against', () => {
    // §5.3 validates `next` as a same-origin path beginning with this prefix; if the two ever
    // disagree, every signed-out join silently lands on /map instead.
    expect(joinLink('https://example.app', 'abc')).toContain(JOIN_PATH_PREFIX);
  });
});

describe('shareButtonLabel', () => {
  it('offers the share sheet where the browser has one, and the clipboard otherwise', () => {
    expect(shareButtonLabel({ canShare: true, copied: false })).toBe('Share link');
    // `Copy invite`, not `Copy link`: since §8.3 this button copies the sentence and the link
    // together. The bare link keeps its own control — the icon button beside the field.
    expect(shareButtonLabel({ canShare: false, copied: false })).toBe('Copy invite');
  });

  it('acknowledges the copy regardless of which path produced it', () => {
    // A copy affordance with no visible result is the usual failure in this pattern (§4.2).
    expect(shareButtonLabel({ canShare: true, copied: true })).toBe('Copied');
    expect(shareButtonLabel({ canShare: false, copied: true })).toBe('Copied');
  });
});

describe('role wording', () => {
  it('names a member by what they can do, not by a role noun', () => {
    expect(memberRoleLabel('owner')).toBe('Owner');
    expect(memberRoleLabel('editor')).toBe('Can edit');
    expect(memberRoleLabel('viewer')).toBe('Can view');
  });

  it('uses the shorter words on the segmented control, where the legend carries the verb', () => {
    expect(inviteRoleLabel('editor')).toBe('Edit');
    expect(inviteRoleLabel('viewer')).toBe('View');
  });

  it('tells the joiner what the role means in a sentence, never a permission list', () => {
    expect(roleSentence('editor')).toBe("You'll be able to add and remove places.");
    expect(roleSentence('viewer')).toBe("You'll be able to see the places in it.");
  });
});

describe('roleSwitchNotice', () => {
  it('says nothing when there is no link yet, or the role already matches', () => {
    expect(roleSwitchNotice(null, 'editor')).toBeNull();
    expect(roleSwitchNotice('viewer', 'viewer')).toBeNull();
  });

  it('warns that the old link dies, because createInvite revokes it', () => {
    // §4.2's own copy says the previous link "still works". It does not: `createInvite` revokes
    // the live invite before inserting the new one. This assertion is here so the spec's sentence
    // cannot be pasted back in without a test going red.
    const notice = roleSwitchNotice('viewer', 'editor');
    expect(notice).toBe('Switching makes a new link. The one you shared before stops working.');
    expect(notice).not.toContain('still works');
  });
});

describe('the privacy disclosure', () => {
  it('names what is behind it, and does not say member', () => {
    // The row is what the reader trades a tap for; `More` or `Details` would make the tap blind.
    expect(SEE_LABEL).toBe('What people can see');
    expect(SEE_LABEL.toLowerCase()).not.toContain('member');
  });

  it('keeps the matched pair on one side of the boundary', () => {
    // Sentence 1 stays visible; 2 and 3 are the pair and travel together. A split would leave a
    // claim about what is shared with nothing saying what is withheld.
    expect(PRIVACY_BLOCK).toHaveLength(3);
    expect(PRIVACY_BLOCK.slice(1)).toHaveLength(2);
  });
});

describe('the privacy copy', () => {
  it('is §4.4 verbatim, in order', () => {
    expect(PRIVACY_BLOCK).toEqual([
      'Anyone with this link who signs in can open this collection.',
      "They'll see each place's name, category and address, the notes added for everyone, and who added what.",
      "They won't see your own notes, your been marks, your tags, or the links you saved places from.",
    ]);
  });

  it('names fields rather than claiming a category is private', () => {
    // The third sentence is never shortened to "your private data stays private" — that is a
    // claim about a category, and it is not checkable. §4.4 makes this rule explicit.
    const [, shared, withheld] = PRIVACY_BLOCK;
    for (const field of ['name', 'category', 'address']) expect(shared).toContain(field);
    for (const field of ['notes', 'been marks', 'tags', 'links']) expect(withheld).toContain(field);
    expect(PRIVACY_BLOCK.join(' ')).not.toContain('private data');
  });

  it('tells the joiner the same boundary from their own side', () => {
    expect(JOINER_PRIVACY_LINE).toBe("They won't see your notes or your been marks either.");
  });
});

describe('emailLocalPart', () => {
  it('offers the part before the @ as a prefill', () => {
    expect(emailLocalPart('maya@gmail.com')).toBe('maya');
  });

  it('never returns anything containing the domain', () => {
    // A full address rendered to a collaborator is a privacy leak into a shared surface (§6), so
    // the component is only ever handed the local part.
    for (const address of ['maya@gmail.com', 'a.b+tag@sub.example.co.uk']) {
      expect(emailLocalPart(address)).not.toContain('@');
    }
  });

  it('is empty rather than wrong for a missing or malformed address', () => {
    // An empty prefill leaves the person as `A collaborator`, which is the honest fallback.
    expect(emailLocalPart(null)).toBe('');
    expect(emailLocalPart(undefined)).toBe('');
    expect(emailLocalPart('')).toBe('');
    expect(emailLocalPart('not-an-address')).toBe('');
    expect(emailLocalPart('@example.com')).toBe('');
  });

  it('clamps to the field limit so the prefill is never longer than the field allows', () => {
    const long = `${'m'.repeat(60)}@example.com`;
    expect(emailLocalPart(long)).toHaveLength(DISPLAY_NAME_MAX_LENGTH);
  });
});

/**
 * §8.3 — the link now travels with a sentence.
 *
 * The two things worth pinning are what it says and, harder, **what it must never say**.
 * `preview_collection_invite` (migration `0026`) is the disclosure boundary before somebody joins:
 * collection name, inviter name, role. The message is forwardable to people who will never open
 * the link, so anything about the collection's *contents* — the place count above all, which is in
 * the read model and one interpolation away — stays out.
 */
describe('shareMessage', () => {
  it('names the collection and what the link lets you do, in the sender\u2019s own voice', () => {
    // Feedback 3.2: the caption shape (`\u201cX\u201d \u2014 a collection of places, shared with you.`) had no
    // sender in it and read as machine-written in a chat thread. First person, two facts, stop.
    expect(shareMessage({ collectionName: 'Weekend', role: 'viewer' })).toBe(
      'I\u2019m sharing my collection \u201cWeekend\u201d with you. You can see the places in it.',
    );
    expect(shareMessage({ collectionName: 'Weekend', role: 'editor' })).toBe(
      'I\u2019m sharing my collection \u201cWeekend\u201d with you. You can add places to it.',
    );
  });

  it('states facts and stops \u2014 no exclamation mark, no adjective about the collection', () => {
    for (const role of ['viewer', 'editor'] as const) {
      expect(shareMessage({ collectionName: 'Weekend', role })).not.toContain('!');
    }
  });

  it('carries no fact about the contents — not even the count', () => {
    const message = shareMessage({ collectionName: 'Weekend', role: 'viewer' });
    expect(message).not.toMatch(/\d/);
  });

  it('does not say the product name — §2 bans it in invite copy', () => {
    expect(shareMessage({ collectionName: 'Weekend', role: 'viewer' }).toLowerCase()).not.toContain(
      'crumb',
    );
  });

  it('says collection and no synonym for it', () => {
    const message = shareMessage({ collectionName: 'Weekend', role: 'editor' });
    expect(message).toContain('collection');
    expect(message.toLowerCase()).not.toMatch(/\b(list|board|folder|album)\b/);
  });

  it('passes a user-typed name through unchanged, including a Hebrew one', () => {
    expect(shareMessage({ collectionName: '\u05ea\u05dc \u05d0\u05d1\u05d9\u05d1', role: 'viewer' })).toContain(
      '\u05ea\u05dc \u05d0\u05d1\u05d9\u05d1',
    );
  });
});

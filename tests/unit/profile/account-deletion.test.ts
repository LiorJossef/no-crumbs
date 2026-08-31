import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { blockingCollections } from '@/app/profile/_lib/blocking-collections';

/**
 * `L1-F8-T1` — account deletion, built to `docs/overnight-deletion-review.md`.
 *
 * **What is asserted here and why it is source text.** The three things most likely to be undone by
 * a later edit are not behaviours a unit test can drive — they are properties of *how the code is
 * shaped*, and each has a named failure mode the review spells out:
 *
 *  1. The action's signature is the entire authorisation boundary. `serviceRoleClient()` is a
 *     cached singleton whose `auth.admin.deleteUser(id)` deletes **any account in the project**,
 *     and a Server Action is a POST endpoint anyone who knows its id can reach. A parameter here is
 *     an escalation, and the review says it will veto one.
 *  2. The pre-check must not run on `service_role`, which holds no privilege on the collections
 *     tables at all (`0024:106`) and would fail `42501`.
 *  3. The check runs **twice**, either side of revoking the outstanding invites, because a stranger
 *     holding an invite token can join between one check and the delete.
 *
 * Driving these would need a live Postgres with RLS and a GoTrue admin key; the run has neither
 * leased. What a source assertion cannot do is prove the deletion works — that is stated as
 * unverified in the commit rather than implied by a green test.
 *
 * The cascade case the exit criterion names — *"a shared collection's other members do not lose
 * it"* — is asserted against `checkDeletionBlocked`'s own logic, below.
 */

const ACTION = 'src/app/actions/account.ts';
const CHECK = 'src/app/profile/_lib/deletion-block.ts';
const RULE = 'src/app/profile/_lib/blocking-collections.ts';
const UI = 'src/app/profile/account-actions.tsx';

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the delete-account action', () => {
  it('takes no user-identifying parameter', () => {
    const source = code(ACTION);
    expect(source).toMatch(/export async function deleteAccount\(\)/);
    // The id handed to the admin API is read in the same scope, from the session, and nowhere else.
    expect(source).toContain('auth.admin.deleteUser(user.id)');
    expect(source).not.toMatch(/deleteUser\((?!user\.id\))/);
  });

  it('keeps the rule free of the database', () => {
    // The pure half carries no `server-only` and imports nothing, which is what makes the cascade
    // case below assertable at all.
    expect(code(RULE)).not.toContain('import ');
  });

  it('never reaches the collections tables through the service role', () => {
    // `service_role` was revoked everything on these tables by `0024:106` and never granted any of
    // it back. A service-role pre-check does not bypass that — BYPASSRLS is not a table privilege
    // — it fails 42501.
    expect(code(CHECK)).not.toContain('serviceRoleClient');
    expect(code(CHECK)).toContain("from '@/app/_lib/supabase/server'");
  });

  it('checks twice, with the invite revocation between', () => {
    const source = code(ACTION);
    const checks = [...source.matchAll(/checkDeletionBlocked\(\)/g)];
    expect(checks.length, 'the race in review §3.3 needs a check either side').toBe(2);
    const revoke = source.indexOf('collection_invites');
    expect(revoke).toBeGreaterThan(checks[0]!.index!);
    expect(revoke).toBeLessThan(checks[1]!.index!);
  });

  it('writes no cleanup statement of its own', () => {
    // Everything goes by FK cascade from `auth.users`. An application-level sweep would be a
    // second, drifting definition of "the user's data" beside the FK graph.
    const source = code(ACTION);
    expect(source).not.toMatch(/\.delete\(\)/);
    expect(source).not.toContain("from('saved_places')");
    expect(source).not.toContain("from('imports')");
  });

  it('fails closed when the pre-check cannot answer', () => {
    // `ok: false` is "we could not tell", and it must never be read as permission.
    expect(code(ACTION)).toMatch(/if \(!before\.ok\) return \{ ok: false/);
    expect(code(ACTION)).toMatch(/if \(!after\.ok\) return \{ ok: false/);
  });
});

describe('the refusal', () => {
  it('is offered as an instruction, not a wall', () => {
    const source = code(UI);
    // Every blocking collection is a link to itself, which is where both of the moves the copy
    // names already live. No new action is built for the refusal.
    expect(source).toContain('/collections/${collection.id}');
    expect(source).not.toContain('deleteCollection');
    expect(source).not.toContain('removeMember');
  });

  it("carries the deck's strings and no others", () => {
    const source = readFileSync(UI, 'utf8');
    for (const string of [
      'Delete my data',
      'This removes your places, your collections and your account.',
      'Delete your account?',
      'Your places, your collections and your account are removed. This can’t be undone.',
      'Delete my account',
      'Deleting…',
      'Couldn’t delete your account. Try again in a moment.',
      '1 of your collections is shared.',
      'Deleting your account would take them away from the people you shared them with.',
      'Delete those collections, or remove the other people from them, and then come back here.',
      'Shared by you',
      'Open my collections',
    ]) {
      expect(source, `${string} is missing`).toContain(string);
    }
  });

  it('claims nothing about what the user wrote elsewhere', () => {
    // `collection_items.added_by` is `on delete set null`, so a note the user wrote on an item in
    // somebody else's collection survives with the attribution stripped (review §4.2). No string
    // here may say everything they wrote is gone.
    const source = readFileSync(UI, 'utf8');
    expect(source).not.toMatch(/everything you/i);
    expect(source).not.toMatch(/permanently/i);
    expect(source).not.toMatch(/are you sure/i);
  });
});

describe('which collections block deletion — the cascade case', () => {
  const ME = 'me';
  const OTHER = 'someone-else';

  it('blocks a collection somebody else is live in', () => {
    // The exit criterion, restated as an assertion: *"a shared collection's other members do not
    // lose it"*. `collections.owner_id` is `on delete cascade`, so if this returns empty for a
    // shared collection the account is deleted and that collection disappears for everyone in it.
    const blocking = blockingCollections(
      ME,
      [{ id: 'c1', name: 'Weekend list' }],
      [
        { collection_id: 'c1', user_id: ME },
        { collection_id: 'c1', user_id: OTHER },
      ],
    );
    expect(blocking).toEqual([{ id: 'c1', name: 'Weekend list', otherMemberCount: 1 }]);
  });

  it('does not block a solo collection', () => {
    // The owner is always a member of their own collection (`0024:290`'s trigger), so the naive
    // "has members" test would refuse every deletion in the product.
    expect(
      blockingCollections(ME, [{ id: 'c1', name: 'Just mine' }], [{ collection_id: 'c1', user_id: ME }]),
    ).toEqual([]);
  });

  it('does not block on a collection the user is merely a member of', () => {
    // Somebody else's collection is not in `owned`, and losing that membership harms nobody: the
    // row cascades, the items survive de-identified (`collection_items.added_by` set null).
    expect(
      blockingCollections(
        ME,
        [],
        [
          { collection_id: 'theirs', user_id: ME },
          { collection_id: 'theirs', user_id: OTHER },
        ],
      ),
    ).toEqual([]);
  });

  it('counts every other live member, and only them', () => {
    const [first] = blockingCollections(
      ME,
      [{ id: 'c1', name: 'Weekend list' }],
      [
        { collection_id: 'c1', user_id: ME },
        { collection_id: 'c1', user_id: 'a' },
        { collection_id: 'c1', user_id: 'b' },
      ],
    );
    expect(first?.otherMemberCount).toBe(2);
  });

  it('separates a shared collection from a solo one in the same account', () => {
    expect(
      blockingCollections(
        ME,
        [
          { id: 'solo', name: 'Just mine' },
          { id: 'shared', name: 'Weekend list' },
        ],
        [
          { collection_id: 'solo', user_id: ME },
          { collection_id: 'shared', user_id: ME },
          { collection_id: 'shared', user_id: OTHER },
        ],
      ).map((c) => c.id),
    ).toEqual(['shared']);
  });
});

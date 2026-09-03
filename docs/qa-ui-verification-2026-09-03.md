# QA verification — UI-6, three UI commits (2026-09-03)

**Verified against commit `3fb628b4faab6d9d897abdc74e8c8f2658fbaa1c`** (branch
`no-crumbs-implementation`), working tree clean at start. Not the working tree — the commit.

**How.** Headless Chromium (Playwright 
`node_modules/playwright`) driving a real `next dev` server on `localhost:3411`
against the local Supabase (`supabase_db_P-002`), signed in as `demo@example.com`
(59 saved places, 3 owned collections). Viewports 375x812, 390x844 and 1280x900.
Measurements are `getBoundingClientRect` / `getComputedStyle` on the **visible** node
(the tree renders a hidden duplicate of the sheet and the desktop panel; measuring
without a visibility filter returns zeros and is how you get a false pass).

**The dev server described in the brief as "already running on :3000" was not running.**
Nothing was listening on 3000. I started my own on **3411** and left it up.

---

## HEADLINE ANSWER — the share panel role switch (`3fb628b`)

**The role switch works. It is not the defect you suspected.** `selectedRole` is not
"only used when creating"; it is compared against the live invite's role on every
render, and a mismatch replaces the whole share block with a confirmation.

`share-panel.tsx:352` — `const notice = roleSwitchNotice(invite?.role ?? null, selectedRole);`
`share-panel.tsx:164-170` — returns a sentence whenever the two differ.
`share-panel.tsx:542` — `{notice ? <confirm card> : invite === null ? <Create a link> : <Share link + link field>}`

Driven end to end on collection `tel aviv food` (`d0b19581-…`), and **verified in the
database, not from the UI's self-report**:

| step | UI |
|---|---|
| A. initial | trigger `Edit`, link `…/join/c82963fa-…`, no notice |
| C. pick `View` | trigger `View`, notice *"Switching makes a new link. The one you shared before stops working."*, `Share link` and the link field **replaced** by `Make a new link` / `Cancel` |
| D. `Cancel` | trigger back to `Edit`, original link restored |
| F. `Make a new link` | trigger `View`, new link `…/join/d0c55dba-…` |

`collection_invites` before → after:

```
editor  created 2026-09-02 06:18:13  revoked_at NULL                  token c82963fa-…
                       ↓
editor  created 2026-09-02 06:18:13  revoked_at 2026-09-03 18:47:30   token c82963fa-…
viewer  created 2026-09-03 18:47:30  revoked_at NULL                  token d0c55dba-…
```

The old editor invite is revoked and a new viewer invite issued. `roleSwitchNotice`'s
docstring — which says it deliberately contradicts spec §4.2 because `createInvite`
revokes first — is **accurate**; I checked the rows.

**NOTE — I mutated your data.** `tel aviv food`'s live invite is now
`d0c55dba-f766-4736-8da3-7b654dbf0d6f` (**viewer**). The previous editor link
`c82963fa-…` is revoked and dead. That is the feature doing its job, but it is a real
state change on a shared local database and you should know.

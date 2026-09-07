# Collections — shared sets of places

> Task **L2-COLLECTIONS-T0**. Owner of this document: `ux-interaction`. Owner of the code:
> `design-system-frontend`. I have no shell and have verified nothing at runtime.
>
> **The data model is fixed and is not reopened here.** Collection = name + owner + members
> (`owner`/`editor`/`viewer`); items are canonical `places` rows with an optional shared note, an
> adder, and a `position`; a place is in a collection at most once; sharing is by invite link
> carrying a role, redeemable only by a signed-in user; you can only add a place you already have.
>
> Binding inputs: `ux-architecture.md` §1.1–1.4, §6.5, §11 · `ux-map-is-the-query.md` §5 ·
> `ux-library-at-scale.md` §4, §6 · `brand-and-product-foundation.md` §4–§6 ·
> `00-project-charter.md` §6. Surfaces read: `map-page-client.tsx`, `place-sheet.tsx`,
> `place-desktop-panel.tsx`, `marker-style.ts`, `category-display.ts`.

---

## 0. The one idea

**A collection is a map, not a list.** `/collections/[id]` is `/map` with a different set of pins and
a different heading — same MapLibre surface, same three-stop vaul sheet, same `PlaceRow`, same peek
row. Nothing new is invented: the active-area machinery is switched off (a collection is not
geography) and the heading becomes the collection's name.

Everything below follows from that. If a decision would require a second layout language, I cut the
decision instead.

---

## 1. `/collections` — the index

Full-screen task that returns to the map, like `/import/[id]`. Not a layer over the map: it is
library-wide and has no camera of its own.

### 1.1 Layout (mobile, source of truth)

```
┌─────────────────────────────┐
│ ‹  Collections              │  56px header, ‹ → /map
├─────────────────────────────┤
│ YOURS                       │  11px bold uppercase, muted
│ ┌─────────────────────────┐ │
│ │ Tel Aviv food           │ │  16px extrabold, dir="auto", line-clamp-2
│ │ 12 places · 2 people    │ │  13px muted
│ │ ●●●●●                   │ │  category strip (§1.2), aria-hidden
│ ├─────────────────────────┤ │
│ │ Tokyo                   │ │
│ │ No places yet           │ │
│ ├─────────────────────────┤ │
│ SHARED WITH YOU             │
│ │ Weekend in Jaffa        │ │
│ │ 7 places · From Maya    │ │
│ │ ●●●                     │ │
│ └─────────────────────────┘ │
│  (scrolls)                  │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │    New collection       │ │  56px, sticky above safe area
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

Rows, not cards. Hairline dividers, no borders around each item, no shadows — a bordered box per
collection is card soup at four collections and the banned aesthetic at ten. Row height ~76–92px,
whole row is one target.

### 1.2 The visual, since there are no covers

**A cover image would have to be invented, and inventing one is the wrong move.** We hold no photos.
The available fakes — a gradient tile, a static map thumbnail, a letter avatar in a coloured square —
are all Charter §6 material and none of them says anything true about the collection.

**What we draw instead: the collection's own category mix.** A single row of up to five 8px discs in
`CATEGORY_DISPLAY` colours, ordered by count descending, one disc per distinct category present. A
collection that is six restaurants and four cafés shows two discs; a mixed trip list shows five.
Same palette the pins and the list rows already use, so the strip is recognisably *these places*.

- Empty collection: **no strip at all**, and the count line reads `No places yet`. No placeholder
  strip, no skeleton, no grey ghost discs.
- Six or more distinct categories: five discs, no `+n`. The strip is a texture, not a count.
- `aria-hidden`; the row's accessible name carries the facts as text (§8).

If the strip proves to be noise on device, delete it — the row survives on name + count, and I would
rather lose it than gain a decorative tile.

### 1.3 Copy

```
Collections
Yours
Shared with you
```
```
12 places
1 place
No places yet
```
```
2 people          ← owner's own row, when members > 1. Omitted entirely when it is only you.
From Maya         ← a collection shared with you. Never "Maya's collection" (§9).
```

Second line composition, as separate elements, never one interpolated string:
`{count}` · `·` · `{people or From X}`.

### 1.4 Create

Sticky primary at the bottom, in the thumb zone, `56px`, full width:

```
New collection
```

Tapping it does **not** navigate. It opens a one-field composer in place, at the bottom of the same
screen, above the keyboard:

```
┌─────────────────────────────┐
│ Name this collection        │
│ ┌─────────────────────────┐ │  48px field, autofocus, enterKeyHint="done"
│ │ e.g. Tel Aviv food      │ │  dir="auto", maxLength 60
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │        Create           │ │  56px, disabled while empty
│ └─────────────────────────┘ │
│          Cancel             │
└─────────────────────────────┘
```

On create: navigate straight into `/collections/[id]` — a new empty collection you cannot see is a
dead end. Duplicate names are allowed and not warned about; two lists called `Food` is the user's
business.

**No description field.** See §10.

### 1.5 Empty index

```
Nothing collected yet.

A collection is a set of places you can share
with one other person.

[ New collection ]
```

No illustration, no example collection, no "get started" checklist. If the user has zero saved
places as well, the second line becomes:

```
Save some places first, then group them here.
[ Go to your map ]
```

### 1.6 Desktop

Same screen, one column, `max-width: 560px`, centred, with the header's `‹` becoming
`‹ Back to the map`. The create button is not sticky (there is room) and sits under the last row.
No grid of tiles: a two-column grid of coverless rows is a table pretending to be a gallery.

---

## 2. `/collections/[id]` — the collection as a map

### 2.1 Composition

Identical shell to `/map`. Differences, and only these:

| | `/map` | `/collections/[id]` |
|---|---|---|
| Pins | your whole library, filtered | this collection's places only |
| Initial camera | anchor area | fit **all** the collection's places, padded by `PEEK_PX`, cap z15 |
| Active area | four writers, `Elsewhere` section | **off.** No area heading, no `Elsewhere` section, no pan-changes-the-list |
| Sheet heading | `12 places in London` | the collection's name |
| Peek primary action | `Add a TikTok` | `Add places` (owner/editor) · nothing (viewer) |
| Row | `PlaceRow`, unchanged | `PlaceRow`, unchanged, plus §6 attribution when the adder is not you |
| Search field | present at half/full | present at half/full, same component, scoped to this collection |

The map is the reason this exists. A shared list of seven Jaffa restaurants that you cannot see
spatially is a note in a chat app; the same seven as pins is a plan.

### 2.2 The sheet header

At `half`/`full`:

```
┌─────────────────────────────┐
│ ──                          │
│ ‹  Weekend in Jaffa      ⋯  │  ‹ → /collections. ⋯ → §2.6 (44px each)
│    7 places · You and Maya  │  13px muted
│ ⌕ Search this collection    │
│ ─────────────────────────── │
│  rows…                      │
└─────────────────────────────┘
```

At `peek`, the line reads `7 places · Weekend in Jaffa`, tappable to expand, with the primary action
in the trailing slot exactly as `/map` does today.

The name is the `<h2>`, `dir="auto"`, `line-clamp-2`, **never `truncate`** (§8.6).

### 2.3 Members, displayed

Text, not avatar stacks. Avatar circles need images or initials; we have neither reliably (§6), and a
row of grey initial-discs is the exact "template SaaS" texture Charter §6 bans.

```
You and Maya
You, Maya and 1 other
Maya and you            ← never. Always "You" first in a list you are in.
```

Tapping the members line opens the share/members panel (§4). For a viewer it opens the read-only
member list.

### 2.4 Adding places

Peek primary → `Add places`. Opens **in place, inside the same sheet** (push, not a stacked dialog —
see §8.1), at `full`:

```
┌─────────────────────────────┐
│ ‹  Add places               │
│ ⌕ Search your places        │
│ ─────────────────────────── │
│ ☑ HaKosem                   │  already in — checked, disabled-looking but
│    Falafel · Shlomo HaMelech│  still a 64px row, not tappable to remove
│ ☐ Anat Bakery               │
│    Bakery · Jaffa           │
│ ☐ Tokii                     │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │      Add 2 places       │ │  56px, sticky, live count
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

- **This is the multi-select surface, and it is the only one.** Selecting several is the whole task
  here; on `/map` it is not (§3.3).
- Rows are the user's own library, most recent first, searchable with the existing
  `PlaceSearchField`. No area scoping — you are picking from everything you own.
- Places already in the collection are shown **checked and inert**, at the top of no special group.
  That is how the "re-add is a silent no-op" rule becomes visible instead of mysterious.
- Disabled state of the button: `Select places to add`.
- On success: pop back to the collection, camera re-fits to include the new pins with the same
  1.3s drop choreography `ux-architecture.md` §10.4 already specifies. Toast:
  `2 places added to Weekend in Jaffa.`
- Failure: stay on the picker, selection preserved, one line above the button:
  `Couldn't add those. Try again.`

### 2.5 Removing

Inside the collection, tap a row → the same `PlaceDetail`, in its collection variant (§2.7). At the
bottom, quiet, same slot `RemoveSavedPlace` occupies today:

```
Remove from this collection
```
inline confirm replacing the row for 4s:
```
Remove from this collection?   [ Remove ]  [ Cancel ]
```
then the pin fades over 240ms and a toast offers `Undo` for 5s.

**Owner and editor only.** A viewer does not see the control at all — not a disabled one.

This removes the item, never the user's own saved place. Copy says `from this collection` in both
strings precisely so that is unambiguous.

### 2.6 The `⋯` menu (owner only)

Four items, a popover, 44px rows:

```
Share
Rename
Leave collection        ← members who are not the owner see only this
Delete collection
```

`Delete collection` inline-confirms:
```
Delete "Weekend in Jaffa"? Everyone loses it.
```
`Leave collection`:
```
Leave "Weekend in Jaffa"? You can rejoin with the link.
```

### 2.7 The place detail inside a collection

**It shows shared fields only.** This is what makes the privacy claim in §4.4 trivially true rather
than a thing we have to police:

| Shown | Not shown |
|---|---|
| name, category, address, locality | your private note |
| the **shared note** | your been / not-been mark |
| `Added by Maya` (§6) | your tags |
| `Google Maps ›` | the TikTok source link, the caption quote, the thumbnail |

The shared note, for an owner/editor, is an editable field in the `NoteEditor` shape:

```
Shared note
placeholder: Add a note everyone here can see
```

For a viewer, it renders as plain text and is absent when empty. Never `No note yet`.

**Deliberately not built tonight:** a `Save to your places` action for a collection place you do not
own. It is the first thing I would add next.

### 2.8 Empty collection

Map at the timezone-derived regional view (`ux-map-is-the-query.md` §5's table, reused, no
permission prompt). Sheet at `half`:

```
Nothing in this collection yet.
Add places from your map and everyone here will see them.
[ Add places ]
```
Viewer variant:
```
Nothing in this collection yet.
Maya hasn't added any places.
```

### 2.9 Desktop

`PlaceDesktopPanel` with the collection's heading, members line, `Add places` in the button slot, no
`Elsewhere` section. Detail opens in the map's pin popover as today, in its collection variant. The
`Add places` picker replaces the panel's list content in place with a `‹ Add places` header — not a
modal over the map.

---

## 3. Add to collection, from `/map`

### 3.1 Where the control sits

In `PlaceDetail`, **directly under `BeenToggle`, above `CategoryEditor`**. Argument: been/not-been
and "which list is this in" are both statements about *your intent* with the place; category and note
are corrections to what we got wrong. Grouping the two intent controls keeps the correction block
intact underneath.

Full-width 48px row, leading icon, trailing chevron:

| State | Label |
|---|---|
| in none | `Add to a collection` |
| in one | `In Tel Aviv food` |
| in two or more | `In 3 collections` |

The one-collection case names it because at one collection the name *is* the information. Beyond
that a name plus "+2" is a truncation problem for no gain.

### 3.2 The picker

**Replaces the detail's content in place**, inside the same sheet / same popover, with a back
chevron. Not a dialog stacked over the sheet — see §8.1.

```
┌─────────────────────────────┐
│ ‹  Add HaKosem to…          │  h2, place name dir="auto"
│ ─────────────────────────── │
│ ＋ New collection           │  44px, first row, always
│ ─────────────────────────── │
│ ☑ Tel Aviv food     12      │  44px rows, whole row is the target
│ ☐ Weekend in Jaffa   7      │
│ ☐ Tokyo              0      │
└─────────────────────────────┘
```

- **Toggling writes immediately** (optimistic, with the checkbox reverting on failure). There is no
  `Save`. The back chevron is the only exit, and nothing is pending behind it.
- Failure line under the row that failed: `Couldn't add that. Try again.`
- Only collections you own or can edit are listed. Viewer-role collections are absent, not disabled.
- `＋ New collection` opens the §1.4 composer in place; on create it is added, checked, and the
  picker returns with the new row at the top. Two taps from a place to a brand-new shared list.
- No collections at all: the list is replaced by
  `You don't have any collections yet.` above the same `＋ New collection` row.

### 3.3 Multi-select from the main list: **not tonight**

At 31 places the arithmetic is not the argument — the mode is. A selection mode on `/map`'s list
needs an entry affordance, an exit affordance, a checked state that fights the existing 64px row
target, and a sticky action bar over a sheet that already has one; and it has an invisible off-state
on the product's most-used surface. The genuine multi-select need is "fill a collection", and §2.4
serves it from inside the collection, where selecting several *is* the task and no mode has to be
entered or left.

Revisit when someone actually reports adding the same six places one at a time.

---

## 4. Sharing

### 4.1 Who sees what

| | Owner | Editor | Viewer |
|---|---|---|---|
| `⋯ → Share` | yes | — | — |
| Members line → | share panel | member list (read-only) | member list (read-only) |
| See the link | yes | no | no |
| Change a role | yes | no | no |
| Remove a member | yes | no | no |
| Replace the link | yes | no | no |
| `Add places` / remove items | yes | yes | no |
| Edit a shared note | yes | yes | no |

An editor cannot invite. The model puts link generation on the owner, and a `Share` button that
cannot share is worse than no button.

### 4.2 The share panel (owner)

In place, pushed from `⋯ → Share`:

```
┌─────────────────────────────┐
│ ‹  Share                    │
│                             │
│ People with the link can    │
│ ┌──────────┐ ┌────────────┐ │  two 48px segmented options
│ │ View     │ │ Edit       │ │  View selected by default
│ └──────────┘ └────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ …/join/f3k9…        ⧉   │ │  read-only field, tap = copy
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │      Share link         │ │  56px. Web Share where available,
│ └─────────────────────────┘ │  else the label is "Copy link"
│                             │
│ Anyone with this link who   │  ← §4.4, the privacy block
│ signs in can open this      │
│ collection. …               │
│                             │
│ IN THIS COLLECTION          │
│ Maya           Can edit  ⋯  │  44px rows
│ You            Owner        │
│                             │
│ Replace link                │  quiet text button, bottom
└─────────────────────────────┘
```

- **Changing the role toggle changes the link.** The link is generated for the selected role; if a
  link already exists for the other role, switching states it plainly under the toggle:
  `This is a different link. The one you shared before still works.` Owner then uses
  `Replace link` if they want the old one dead.
- `⧉` and the field both copy. On copy: the button label swaps to `Copied` for 2s and a live region
  announces `Link copied.` A copy affordance with no feedback is the most common small failure in
  this pattern.
- Member row `⋯` (owner only): `Can edit` · `Can view` · `Remove from collection`. Removing
  inline-confirms: `Remove Maya? They'll lose access.`
- `Replace link` inline-confirms: `Replace the link? The old one stops working.` Then the field
  updates in place and the label reads `Copied` never — the user must copy the new one deliberately.

### 4.3 Editor / viewer panel

Same push, header `In this collection`, member rows read-only, no link, no controls, and at the
bottom the quiet `Leave collection`.

### 4.4 The privacy line — exact copy

This is the load-bearing string in the whole feature. Three sentences, concrete, no jargon, no
reassurance-voice:

```
Anyone with this link who signs in can open this collection.

They'll see each place's name, category and address, the notes added
for everyone, and who added what.

They won't see your own notes, your been marks, your tags, or the
links you saved places from.
```

Rules: the third sentence is never shortened to "your private data stays private" (that is a claim
about a category, not about fields, and it is not checkable). The second and third sentences must
stay a matched pair — if a field ever moves between shared and private, both change together.

Repeated once, shorter, on the join screen (§5) so the joiner learns the same boundary from their
own side:

```
They won't see your notes or your been marks either.
```

---

## 5. `/collections/join/[token]`

**Never auto-join, in either signed state.** A link in a group chat gets opened by accident, and
joining is a membership fact about someone else's collection. Always an explicit tap.

### 5.1 What can honestly be shown before joining

You cannot read the collection yet, so we show only what the token itself carries and what the
inviter obviously intended you to know:

**Shown:** the collection name · the inviter's display name (§6) · the role you are being given.
**Not shown, and it is a promise until you join:** the places, the count, the other members.

Showing a place count would be leaking a fact about content in the one place we have no read
permission; and it buys the user nothing they need in order to decide.

### 5.2 Signed in

```
┌─────────────────────────────┐
│                             │
│  Maya invited you to a      │  24px, font-heading
│  collection                 │
│                             │
│  Weekend in Jaffa           │  20px extrabold, dir="auto"
│                             │
│  You'll be able to add and  │  editor
│  remove places.             │
│                             │
│  They won't see your notes  │
│  or your been marks either. │
│                             │
│  ┌───────────────────────┐  │
│  │   Join collection     │  │  56px
│  └───────────────────────┘  │
│         Not now             │  text button → /map
└─────────────────────────────┘
```

Viewer variant of the third line:
```
You'll be able to see the places in it.
```

On join → `/collections/[id]`, camera fitting all its places, toast
`You joined Weekend in Jaffa.`

### 5.3 Signed out — the round trip

The screen renders identically (name, inviter, role, privacy line), because the joiner deserves to
know what they are signing in *for*. Only the action changes:

```
  ┌───────────────────────┐
  │   Sign in to join  →  │   → /sign-in?next=/collections/join/f3k9…
  └───────────────────────┘
  You'll come straight back here.
```

- `next` is validated server-side as a same-origin path beginning `/collections/join/`. Anything else
  falls back to `/map`.
- The sign-in screen's existing `Create an account` toggle carries `next` through unchanged, so a
  brand-new account also lands back here.
- After the round trip the user is on this screen, signed in, and still has to tap `Join collection`.
  One extra tap, deliberately: they have just typed a password and should see what they are joining.
- The name prompt (§6) fires **after** `Join collection`, not before — never between a person and the
  thing they clicked.

### 5.4 The other outcomes

| Case | Behaviour |
|---|---|
| Already a member | Skip the screen entirely, redirect to `/collections/[id]`. No "you're already in" message. |
| You are the owner | Same — straight to the collection. |
| Token revoked / replaced / unknown | `This link doesn't work any more.` / `The person who shared it can send you a new one.` / `[ Go to your map ]` |
| Collection deleted | `This collection isn't there any more.` / `[ Go to your map ]` |
| Join write fails | Stay on the screen: `Couldn't join right now. Try again.` with the button intact. |
| Offline | `You're offline. Check your connection and try again.` — the existing string, reused. |

---

## 6. Attribution when `display_name` is null

It usually is, so this is not an edge case — it is the default rendering.

**Ruling: ask for a name once, at the two moments it first matters, and make it required there.**
Those moments are (a) the owner generating their first share link, and (b) a user tapping
`Join collection`. Both are moments where the user has just decided to be visible to someone else,
so a single field is expected rather than intrusive.

```
What should people in this collection call you?
[ field, prefilled with the part of your email before the @ ]
[ Continue ]
```

One field, prefilled, `dir="auto"`, max 40. No skip link — with a prefilled value, `Continue` *is*
the skip.

**Fallback, if a null somehow reaches a surface:** the email local-part, never the full address.
`maya@gmail.com` renders as `Maya`. Showing a full email to a collaborator is a privacy leak into a
shared surface and must not happen anywhere in this feature.

**Never rendered:** `Unknown`, `Anonymous`, `User 4f3a`, a blank, or an initial-only avatar.

Copy:
```
Added by Maya
Added by you
From Maya            ← index row, §1.3
You and Maya         ← members line, §2.3
```

`Added by X` appears **only in the place detail**, and **only when the adder is not you**. Putting it
on every row gives a 12-row collection twelve lines reading `Added by you`, which is noise dressed as
information.

Rendering: `Added by` and `{name}` are separate elements, the name carries `dir="auto"` (§9).

---

## 7. Navigation — how anyone reaches Collections

### 7.1 No bottom tab bar, and here is the argument I would need to overturn that

A tab bar would need to be worth: a permanent 56px + safe-area strip removed from the map on every
screen; a second navigation concept in a product whose entire IA is "the map is the shell"
(`ux-architecture.md` §1.1); a conflict with the sheet's peek stop, which already lives exactly
there; and a "which tab am I on" state. Collections is one destination that most sessions will not
visit. **It does not earn a tab bar. Nothing in the MVP does.**

### 7.2 The entry points, in order

1. **One row at the bottom of the sheet's scroll area**, at `half`/`full`, below `ElsewhereSection`,
   in the same 44px row language:

   ```
   Collections                        3  ›
   ```
   Zero collections: the row still renders, reading `Collections` with no count. It is the only
   discoverable route and hiding it at zero would make the feature invisible to everyone who has
   never used it.

2. **The same row at the bottom of `PlaceDesktopPanel`'s scroll area.** No new desktop chrome.

3. **`In Tel Aviv food`** in a place's detail (§3.1) is a link into that collection.

4. **The post-add toast** carries `View collection`.

That is four ways in and zero pixels of new permanent chrome. Reached-from-the-list is also correct
by meaning: a collection is a subset of your places, so it belongs under your places.

**Explicitly not built:** a Collections entry in the account chip, a floating collections button on
the map, a `/collections` link on the sign-in or import screens.

---

## 8. Accessibility traps I can see

1. **The picker must not be a dialog stacked over the vaul sheet.** `use-non-modal-background.ts`
   exists because a drawer once marked `<main>` `aria-hidden` and made the whole map page unreachable
   to screen readers. Every new surface in this spec — the collection picker, the share panel, the
   member list, the `Add places` list — is an **in-place push inside the existing sheet or panel**,
   with a back control. No second Radix `Dialog`. This is the single most likely way to reintroduce
   that bug.
2. **Focus on push/pop.** Pushing moves focus to the new heading (`tabIndex={-1}`, `preventScroll`),
   as `selectArea` already does. Popping returns focus to the control that opened it — a back chevron
   that dumps focus at the top of the document strands the user mid-task.
3. **Copy has no visible result.** `Link copied.` in the page's existing `role="status"` region, plus
   the 2s label swap. Do not add a second live region — §7 of `ux-map-is-the-query` keeps that region
   single, and a share panel is not a reason to break it.
4. **The category strip is decoration.** `aria-hidden` on the strip; the row's accessible name is
   `Tel Aviv food, 12 places, shared with 2 people` (or `…, no places yet`). Never let a colour
   carry meaning alone (Charter §6 / `ux-architecture` §6.1).
5. **Targets ≥44px with ≥8px gaps**, and they are easy to lose here: the member row's `⋯`, the
   role segmented control, the checkbox rows in both pickers (the *whole row* is the target, never a
   20px box inside it — the same nested-interactive trap `ux-library-at-scale` §3.1 closed for tag
   chips), and the `⧉` copy glyph inside the link field.
6. **RTL.** Collection names, shared notes and display names are user-authored and in this market
   often Hebrew. Every one carries `dir="auto"` inside an LTR row frame, and the collection name uses
   `line-clamp-2`, **never `truncate`** — ellipsis on an RTL string in an LTR box clips the
   *beginning*, i.e. the identifying part (`ux-library-at-scale` §4.2, still an open defect on
   `place-sheet.tsx:451`; do not copy that line into a new component).
7. **Never interpolate.** `7 places · You and Maya`, `Added by {name}`, `{Country} · {n}` — all
   separate elements with a literal separator between them. Concatenate and the digits and the `·`
   land on the wrong side of a Hebrew name.
8. **Destructive actions inline-confirm, never in a dialog.** Remove item, remove member, replace
   link, delete collection, leave collection. Same 4s inline pattern `RemoveSavedPlace` already uses.
9. **Reduced motion.** Only three things move in this feature: the push/pop slide (200ms `spatial`),
   the camera fit on entering a collection (~700ms `spatial`), and the pin drop after `Add places`
   (`ux-architecture` §10.4). Under `prefers-reduced-motion: reduce`: push/pop becomes an instant
   swap with a 100ms opacity crossfade, the camera `jumpTo`s, and the pins appear at final position
   with a 140ms fade — exactly the existing §10.4 reduced variant. No list ever animates on filter.
10. **The join screen is a signed-out surface.** It must be readable, focusable and contrast-correct
    with no session and no map behind it. Its heading is the page `<h1>`.
11. **`Add places` at `full` opens the keyboard.** The sheet stays bound to `visualViewport` so the
    search field is never behind it, and the sticky `Add n places` button sits above
    `env(safe-area-inset-bottom)`.
12. **Gesture conflict.** Every scrolling list added here (`Add places`, the picker, the member list)
    needs `data-vaul-no-drag`, or a press that starts on a row is read as a sheet drag and the tap is
    swallowed — the same reason `PlaceRow` already carries it.

---

## 9. Copy that would read badly in Hebrew

The interface stays English (established, `ux-library-at-scale` §4); what is bidirectional is
content. The risks are where content sits inside an English sentence:

| Avoid | Use | Why |
|---|---|---|
| `Maya's collection` | `From Maya` | Possessive `'s` attached to a Hebrew name renders with the apostrophe on the wrong side and reads as a typo. |
| `Add to "מסעדות"` in one string | `Add HaKosem to…` as a heading, name below | A quoted RTL name inside an English sentence puts its quote marks on the wrong ends. |
| `Shared by Maya with 2 others` | `From Maya` / `You, Maya and 1 other` | Long mixed-direction sentences with two names and a number are where bidi reordering actually shows. |
| `Remove Maya's access` | `Remove Maya? They'll lose access.` | Same possessive, and the two-sentence form is clearer anyway. |
| `12 places in מסעדות טובות` | `{name}` as heading, `12 places` as its own line | Never put a count and an RTL name in one line of text. |

Also: Hebrew renders ~15–20% shorter, so the risk on these rows is a short line sitting oddly beside
a long Latin one, not overflow. Check a mixed index on device.

---

## 10. What should NOT ship tonight

Opinionated, and I would rather lose half this list than ship all of it half-built.

| Idea | Ship? | Why |
|---|---|---|
| **Map view inside a collection** | **Ship** | It is the entire reason this is not a notes app. Cutting it makes collections a list page and I would rather cut the feature. |
| **Invite link + roles** | **Ship** | This is the feature. Roles reduce to one choice at generate time plus a member list. |
| **Add to collection from a place** | **Ship** | The only way places get in. |
| **Multi-select inside `Add places`** | **Ship** | Selecting several *is* the task there; no mode is entered or left. |
| **Duplicate handling** | **Ship** | Already checked + inert in the picker. Costs one class, makes a silent no-op legible. |
| **"Added by X"** | **Ship, reduced** | Detail only, only when the adder is not you. |
| **Shared note** | **Ship** | It is the one thing a collaborator can contribute that is not a place, and it is in the model. |
| **Multi-select on `/map`'s list** | **Cut** | A mode with an invisible off-state on the most-used surface, to save taps in a case §2.4 already serves. §3.3. |
| **Manual reordering** | **Cut** | Drag-to-reorder over a canvas map, inside a sheet that already owns vertical drag, with the map owning horizontal pan, is the worst gesture-conflict surface in the product. Write `position` on append so nothing is lost; render by `position`. When it does ship, the mechanism is a dedicated `Reorder` mode locked at `full` with a 44px trailing handle per row and `data-vaul-no-drag` — **not** long-press drag on the normal list. |
| **Descriptions** | **Cut** | A field almost nobody fills, that then renders as blank space on every row and every header. The name is the description. One less field on the composer is also one less keyboard interaction on a phone. |
| **Cover images** | **Cut** | We have no images and every substitute is Charter §6 material. §1.2's derived category strip is the honest version. |
| **Add to collection after an import** | **Cut** | The end of the import is the product's hero moment (`ux-architecture` §10.4) and bolting a picker onto it trades the moment for a step. Later, the existing toast grows `Add to a collection` beside `View list` — that is the cheap version and it can wait. |
| **Quick add from a list row** | **Cut** | A second target inside the 64px row, which `ux-library-at-scale` §3.1 already closed for exactly this reason. |
| **External / public sharing** | **Cut** | There is no unauthenticated read path in the model. Any affordance that implies one is a lie in a button. |
| **Voting, reactions, activity feed** | **Cut, permanently** | Charter §4 bans gamification, `product-specification` §2.1 says this has no social graph, and an activity feed is a notifications product. Not "later" — no. |
| **Email invites** | **Cut** | No email infrastructure. The link is the mechanism and it is enough for two people. |
| **`Save to your places` from a collection place** | **Cut tonight** | Genuinely useful, genuinely out of scope for one night. First thing I would add next. |
| **Collections filter on `/map`** | **Cut** | A fourth filter dimension beside tag / been / search on the page that already composes three. |

**The coherent minimum, if the night runs short**, in the order I would drop things: reordering
(already cut) → the category strip → `Added by X` → the shared note → the member list's role
changes. The last thing to cut is the map inside a collection; if that goes, cut the feature.

---

## 11. Acceptance checks

1. `/collections` with 0, 1 and 4 collections, one of them empty, one shared with you, at 390×844 and
   1440×900. No card borders, no cover tiles, no grid.
2. A collection with places opens with **all** its pins framed, sheet at `peek` reading
   `7 places · Weekend in Jaffa`, and panning changes neither the heading nor the rows.
3. From `/map`, a place goes into a brand-new collection in **two taps** from its detail
   (`Add to a collection` → `＋ New collection` → name + `Create`), and the detail then reads
   `In {name}`.
4. Re-adding a place already in a collection is impossible from the UI: its row in `Add places` is
   checked and inert.
5. Screen reader: opening the picker, the share panel and `Add places` all leave `<main>` present in
   the accessibility tree — the existing regression guard still passes.
6. Tab order in the share panel: back → role View → role Edit → link field → copy → Share link →
   member rows → Replace link. Focus returns to `⋯` on back.
7. Signed out, opening a join link, signing in, and landing back on the same join screen still
   requires an explicit `Join collection` tap. A tampered `next` goes to `/map`.
8. A revoked link shows `This link doesn't work any more.` and never a raw error.
9. A viewer sees no `Add places`, no remove control, no link, and an uneditable shared note — none of
   them as disabled controls.
10. A collection named `מסעדות טובות` renders with its first characters visible on the index row, in
    the sheet heading, and in the picker, beside `Tel Aviv food`.
11. `prefers-reduced-motion: reduce`: entering a collection jumps the camera, panels swap without
    sliding, and added pins fade in at final position.
12. Inspect the rows: a collaborator's session can produce no read of another user's private note,
    visit state, tags or source URL. This is a `security-privacy` check, not a visual one.

---

## Change log

| Date | Change |
|---|---|
| 2026-08-29 | Created for `L2-COLLECTIONS-T0`. Decided: a collection is `/map` with different pins, reusing the sheet/peek/full language rather than inventing a list page (§0, §2); rows not cards on the index, with a **derived category strip** instead of an invented cover (§1.2); the add-to-collection control under `BeenToggle` with an **in-place** picker that writes on toggle and has no Save (§3); multi-select **only** inside a collection's `Add places`, not on `/map` (§3.3); sharing as an owner-only panel with a role toggle, a copy-with-feedback link and an inline member list, and a three-sentence privacy block that names fields rather than categories (§4); a join screen that **never auto-joins**, shows name + inviter + role and nothing else, and round-trips through `/sign-in?next=` (§5); a required one-field name prompt at first share and first join, falling back to the email local-part and never the full address (§6); Collections reached from **one row at the bottom of the existing list** with no new chrome and an explicit argument against a tab bar (§7); and cuts of descriptions, covers, manual reordering, `/map` multi-select, quick add, add-after-import, external sharing and all social mechanics (§10) |

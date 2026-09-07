# Two removals on one screen — the collection place detail footer

**UX ruling, 2026-08-30 (NAV-A-UX).** Binding spec. Implemented in
`collection-place-detail.tsx` and `saved-place-edits.tsx`.

R1 (`docs/product-ruling-one-place-one-object.md`) made the canonical `PlaceDetail` render inside a
collection. That put two destructive controls near-adjacent at the foot of one scroll, both opening
with the words "Remove from":

| control | writes | reversible |
|---|---|---|
| `Remove from your places` | deletes the viewer's `saved_places` row — note, tags, Been mark, source link | **no** |
| `Remove from this collection` | unlinks one `collection_item` | yes, re-add is three taps |

The pair is confusable, the mis-tap is asymmetric, and the louder of the two (full-width, red) is
the safe one while the irreversible one is a small grey text link.

---

## 1. Both controls stay

`Remove from your places` stays. Removing it here would be a context hiding what the canonical
screen draws, which R1 forbids, and no argument rescues it: hiding it does not remove the risk, it
relocates the user to `/map` to take the same action with less context on screen. A place you saved
yourself is your row wherever you are looking at it.

The collection unlink stays because the detail is the only surface that can carry it.

Adjacency is the defect. It is fixed by **distance, divergent copy, divergent visual weight and
divergent confirm depth** — not by deletion.

## 2. Treatment

### 2.1 Order — the footer slot moves above the canonical delete

`PlaceDetail` renders `footer` **before** `RemoveSavedPlace`, not after it.

This is not a context reordering canonical content. `PlaceDetail` changes its own document order,
once, for every host; the collection passes the identical node. `/map` and the desktop popover pass
no `footer`, so nothing moves there. R1 is satisfied.

Why this way round: the irreversible action becomes the last thing on the screen, which is where it
already sits on every other surface, and it stops being sandwiched between two collection-scoped
blocks. Resulting order:

```
Saved on 26 August                      ← provenance
┌ SHARED NOTE ───────────────────┐
│ Add a shared note              │      ← collection-scoped card, unchanged
└────────────────────────────────┘
  Take out of this collection           ← attached to the card above (mt-2, no rule)

                                        ← ≥32 px clear
────────────────────────────────────    ← RemoveSavedPlace's own hairline
🗑 Delete from your places
```

### 2.2 Grouping and separation

- The unlink row loses `border-t border-border/70 pt-4` and gains `mt-2`. It reads as the second
  row of the collection block, not as the start of a new zone. **One container on this screen, not
  two** — the shared-note card is the only box, and the unlink attaches to it.
- `RemoveSavedPlace` keeps its own `border-t border-border/60 pt-4` and gains `mt-3` in this
  composition. The load-bearing number is **≥32 px of clear vertical distance between the bottom of
  the unlink's hit area and the top of the delete trigger's hit area** — hit areas, not baselines.
- No new heading. No second card. The copy carries the scope.

### 2.3 Weight — the collection unlink stops being red

At rest neither control is red.

- **Unlink**: full-width, left-aligned, `min-h-11`, `text-sm font-semibold`, `text-foreground`, no
  icon. Red is wrong on it: unlinking destroys nothing of the viewer's. It goes `text-destructive`
  on hover/`focus-visible` only (pointer devices imply intent).
- **Delete**: unchanged — `self-start` (content-width, ~200 px, deliberately not full-bleed), small,
  `text-muted-foreground`, `Trash2` glyph, `hover:text-destructive hover:underline`. It gains
  `min-h-11 py-2`: today it is a bare ~20 px text button and fails the 44 px floor, which is a
  pre-existing defect on `/map` too.

Red now appears on this screen only inside an open confirm, on its confirm button.

### 2.4 Confirm steps — same idiom, deliberately unequal depth

`InlineConfirm` remains right for the unlink: reversible, one line, two buttons, no autofocus. A
modal is still forbidden here for the reasons in `saved-place-edits.tsx`'s header (drag sheet,
focus trap).

`RemoveSavedPlace` keeps its own, deeper confirm and it must stay the heavier of the two:

- it names the place;
- it enumerates what is lost;
- it says the action cannot be undone;
- **focus lands on Cancel**, which the unlink's confirm does not need and must not copy.

So: same idiom, unequal depth. That inequality is the safety mechanism.

Motion: none. Both confirms are an instant swap — no height animation, no fade. The
`prefers-reduced-motion` equivalent is identical, because there is nothing to reduce.

When the delete confirm opens it is the last block in a scrolling column and its buttons can fall
below the fold. On open, `scrollIntoView({ block: 'nearest', behavior: 'instant' })` on the confirm
group, and only when it is not already fully visible.

### 2.5 Accessibility

- Both triggers carry the place name in their accessible name, because two removal controls now
  live in one scroll:
  - `aria-label="Delete Fugazi from your places"`
  - `aria-label="Take Fugazi out of this collection"`
- DOM order equals visual order after 2.1, so focus order is unlink → delete.
- Every control and both confirms carry `data-vaul-no-drag`. `RemoveSavedPlace`'s trigger and its
  two confirm buttons **do not have it today** and are inside a vaul sheet on both routes; a press
  beginning on them is read as the start of a sheet drag and the tap is swallowed.

### 2.6 Residual, accepted

Both confirms can be open at once — separate components, separate state. Reaching it takes two
deliberate taps on two controls now 32 px apart with different words, and the fix (controlling
`RemoveSavedPlace`'s confirm state through `PlaceDetail`) threads a prop through a shared component
for one host. **Do not build it in this diff.** If it ever bites, the rule is: opening either
confirm closes the other.

## 3. Copy, verbatim

**Library control (changes on `/map` and the desktop popover too — see §5):**

> Delete from your places

**Its confirm:**

> Delete **Fugazi** from your places? Your note, your tags and your Been mark go with it, and this
> can't be undone.

Buttons: `Delete` / `Cancel` (Cancel autofocused). Pending label: `Deleting…`.

**Collection control:**

> Take out of this collection

**Its confirm prompt**, which depends on whether the viewer has their own row (`mine`):

- viewer owns it:
  > Take Fugazi out of this collection? Nobody here will see it any more. It stays in your places.
- viewer does not own it:
  > Take Fugazi out of this collection? Nobody here will see it any more.

The second sentence is the whole distinction and must not be dropped, and must not be shown when it
is false. Buttons: `Take out` / `Cancel`. No autofocus. While pending the button is disabled and
`aria-busy`; it does not change its label.

The two verbs are `Delete` and `Take out`. They diverge at the first character, which is the point —
`Remove … / Remove …` is the defect.

`InlineConfirm.prompt` may be widened from `string` to `ReactNode` to bold the name as the other
confirm does. Optional; plain text is acceptable.

## 4. Mobile first (375 px), then desktop

At 375 the hosted column is `px-4`, so both controls sit in a 343 px measure.

- Unlink: full-bleed in that measure, 44 px tall, text left. Full-bleed is safe now that it is not
  the dangerous one.
- Delete: content-width and left-aligned, so ~140 px of the row's right side is dead space above the
  bottom padding. A downward mis-tap from the unlink lands on nothing.
- ≥32 px plus a hairline between them.
- `PlaceDetail`'s hosted padding is already `calc(env(safe-area-inset-bottom) + 2rem)`, so the
  delete control never comes to rest under the home indicator and is never the first thing a thumb
  finds at the bottom edge.
- Both confirms are inline; nothing on this screen may open a dialog over the drag sheet.

**Desktop (`lg+`): nothing changes structurally.** Same single column in the collections panel, same
order, same spacing, same copy. The only difference is hover: both controls reveal `text-destructive`
on hover, which is legible as a warning because hovering is intentional and a touch device never
sees it. The map popover variant receives no `footer`, so it is unaffected except for the delete
control's new label and 44 px height.

## 5. The owner's calls, not mine

1. **`Delete from your places` reverses a deliberate ruling.** `saved-place-edits.tsx` argues for
   "Remove", not "Delete", because `places` is shared and never touched. I hold that the objection
   was to the *object* ("Delete place"), not the verb, and "Delete from your places" keeps the
   object correct while buying the verb distance the screen needs. But this string ships on `/map`
   and the desktop popover, not only inside collections, so it is a product-copy change on a shipped
   surface. If the owner refuses it, the fallback is `Take out of this collection` →
   `Stop sharing it here` and the library control keeps "Remove", which is weaker but still diverges.
2. **Who may unlink.** Any editor can currently remove any member's item. Whether that should be
   restricted to the member who added it is a permissions/product question, and it changes how
   frightening the unlink is and therefore whether it needs a confirm at all.
3. **Undo instead of confirm.** If the collection unlink ever gets an undo, its confirm step should
   be deleted outright rather than kept alongside. That is scope.

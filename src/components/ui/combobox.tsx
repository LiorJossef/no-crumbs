'use client';

/**
 * **The combobox parts, wearing this product's tokens instead of shadcn's.**
 *
 * These arrived as a stock shadcn/Base UI vendor drop and sat unimported for a week — the library
 * supplies behaviour, and the *look* was upstream's: `ring-foreground/10` for the popup edge,
 * `bg-accent` for the highlighted row, `zoom-in-95` on open, `pr-8` with an absolutely positioned
 * `right-2` indicator. Each of those is wrong here for a reason, not by taste:
 *
 * - **`ring-foreground/10`** paints a surface in the ink role at an alpha. `--border` is the role
 *   that exists for an edge, and `tests/unit/design-system/token-call-sites.test.ts` fails on the
 *   former by name.
 * - **`bg-accent`** is `--mint-100` in light, a 2 % step on white, and `#222A28` in dark, a 1 % step
 *   on `#201F1C`. `--card-2` is the product's documented neutral hover and is a real step on both.
 * - **`zoom-in-95`** is the single most "goofy"-reading motion available on a menu, which is the
 *   word the owner used for what is being fixed.
 * - **`right-2`** is a physical edge. Half this library is Hebrew.
 *
 * The `InputGroup` family went with the trim: it existed only to serve `ComboboxInput`, the
 * text-field-shaped variant this product does not use — the tag axis is a trigger with the field
 * *inside* the panel — and it carried nineteen arbitrary values into the token budget for a
 * component nothing rendered.
 *
 * `library-filter-bar.tsx` is the only consumer. Anything added back here should be added because a
 * second surface needs it.
 */

import type * as React from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

const Combobox = ComboboxPrimitive.Root;
const ComboboxCollection = ComboboxPrimitive.Collection;

/**
 * The floating half: portal, positioner, popup. Portalled on purpose — a popup that lives outside
 * the drawer's DOM cannot have its presses read as the start of a sheet drag.
 *
 * The caller passes the surface classes, because the menus on this surface all wear one.
 */
function ComboboxContent({
  className,
  side = 'bottom',
  sideOffset = 6,
  align = 'start',
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor'
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50 outline-none"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn('group/combobox-content', className)}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

/** The list itself carries no scroll container: the panel around it is the one scroll track, so a
 *  thumb on a phone can only ever grab one. */
function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn('scroll-py-1 data-empty:p-0', className)}
      {...props}
    />
  );
}

/** A row. The indicator is the caller's child, not this component's, so the tag rows and the radio
 *  rows are one row with one inline offset. */
function ComboboxItem({ className, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      data-vaul-no-drag
      className={cn(
        'cursor-pointer select-none outline-none data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/** What the panel says when the typed text matches nothing. Base UI empties the children when
 *  there *are* matches, so `empty:` collapses the padding with them. */
function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        'px-2 py-3 text-xs font-medium text-muted-foreground empty:m-0 empty:p-0',
        className,
      )}
      {...props}
    />
  );
}

/** The rail above the list: what is already chosen, plus the field, plus this axis's own clear. It
 *  is the affordance that replaces the empty checkbox the owner removed from the rows. */
function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> & ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      data-vaul-no-drag
      className={cn(
        'flex min-h-8 flex-wrap items-center gap-1 rounded-sm border border-border bg-clip-padding px-1.5 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        className,
      )}
      {...props}
    />
  );
}

/** One chosen value, with its own removal. `removeLabel` is required rather than optional: an
 *  `aria-hidden` glyph carrying a dismissal's affordance with no name behind it is defect D3, and
 *  this product has shipped it once already. */
function ComboboxChip({
  className,
  children,
  removeLabel,
  ...props
}: ComboboxPrimitive.Chip.Props & { removeLabel: string }) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        'flex min-w-0 items-center gap-1 rounded-full bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground',
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ChipRemove
        data-slot="combobox-chip-remove"
        aria-label={removeLabel}
        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full opacity-70 outline-none hover:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <XIcon aria-hidden className="size-3" />
      </ComboboxPrimitive.ChipRemove>
    </ComboboxPrimitive.Chip>
  );
}

/** The field that lives inside the rail rather than in the header — which is what lets the tag
 *  trigger look like the three beside it instead of being a text field parked in a row of pills. */
function ComboboxChipsInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn('min-w-16 flex-1 bg-transparent outline-none', className)}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxCollection,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
};

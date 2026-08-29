/**
 * The micro-label that names a secondary section — `CATEGORY`, `YOUR NOTE`, `SHARED NOTE`.
 *
 * One string, in one place, because it had been written out character-for-character in three files
 * and `collection-place-detail.tsx`'s copy carried a comment asking for exactly this on the third
 * use. Four further copies exist outside this change's path scope (`place-enrichment.tsx`,
 * `share-panel.tsx`, `sign-in/page.tsx`, `import/import-page-client.tsx`); they should import this
 * too rather than a fifth being written.
 *
 * A class string rather than a component: the label is a `<p>` in one place and a `<label>` in
 * another, and which element names a section is a question about the form on the screen, not about
 * the type ramp.
 */
export const SECTION_LABEL =
  'text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase';

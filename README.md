# Gridline: a 100,000-row data grid, from scratch

A spreadsheet-grade data grid in **React + TypeScript with no table library**: no AG Grid, TanStack Table or react-window. It scrolls 100k rows at 60 fps, sorts and filters in a Web Worker, and is fully keyboard-driven.

## What's in it
- **Row and column virtualisation.** Only the cells in view are in the DOM, about 30 rows × 10 columns out of 1.2M cells. The status bar shows the live count.
- **Off-main-thread queries.** Filter, search and multi-column sort run in a Web Worker and return an `Int32Array` of row indexes as a *transferable*, so nothing is copied. Results superseded by a newer query are dropped.
- **Sticky header and pinned first column** with plain CSS `position: sticky`.
- **Multi-sort.** Shift-click headers to add sort keys; enums sort by meaning (Free → Enterprise), not alphabet.
- **Keyboard grid.** Arrows, PageUp/PageDown, Home/End, ⌘-arrows to jump. Enter/F2 edits a cell, Space selects a row, Shift-click selects a range, ⌘A selects all, ⌘C copies as TSV.
- **Inline editing** with validation. Edits sync to the worker, so sorting and search stay correct.
- **Resizable columns**: drag, double-click to reset, or use arrow keys on the focused handle. Columns can also be shown or hidden.
- **CSV export** of the filtered rows, or just the selection.
- **Accessibility**: `role="grid"`, `aria-rowcount`/`aria-colcount`/`aria-rowindex`, `aria-activedescendant`, `aria-sort` and `aria-selected`.
- Live **FPS meter** and query timing in the footer.

## How it works
`data.ts` generates the dataset from a seeded PRNG, so the main thread and the worker build identical data without posting 100k objects between them. `query.ts` holds pure filter and sort functions: it pre-extracts one flat typed array per sort key, so the comparator never touches row objects. `Grid.tsx` computes the visible row and column window from `scrollTop`/`scrollLeft`, with updates batched to one per animation frame.

## Run
```bash
npm install
npm run dev     # http://localhost:5173
npm test        # query + data tests (Vitest)
npm run build
```

# Collection presentation tranche

Author: Codex `gpt-6.1-sol` high. Local implementation only; different-model exact-head review pending. This is a shared component pass, not acceptance of the complete collection pattern or every page.

## Implemented

- Table, List and Grid use one TanStack row model and one mounted presentation. Selecting a view retains search, selected rows, sorting, filters and pagination. Resizing does not switch presentation or remount drafts.
- Real accessor columns can group records, ordered before pagination. Group headers count matching loaded records, including records on other pages. Header and toolbar sorting preserve the grouping order.
- Compact/comfortable density and visible-column controls remain available. Inventory retains its existing richer column controls instead of duplicating them.
- Inventory and movable-unit Grid use actual cover photos, with a Codex SVG when no photo exists; List retains compact rows. Existing photo lightboxes and inline editing remain available.
- Browser-local presentation preferences validate stored values, synchronize through storage events, and retain a memory fallback when writes are refused. No server preferences or capabilities are invented.
- Footer reports shown/matching, records hidden by caller filters when known, and records on other pages separately. Show all clears existing caller filters where supplied. Unknown archived counts are omitted.

## Source checks

Foundation fixes: six affected suites passed, 45 tests; typecheck passed (`foundation-review-fixes-final.log`).

Existing inventory table and workspace suites passed after the presentation change (13 tests across those two suites). The new collection suite passed all five tests after replacing unnecessary simulated pointer sequences with direct click events in three cases; keyboard and grouping interactions still use user events. Initial runs had three five-second timeouts on this shared Windows host; no assertion was weakened and no timeout was increased. The successful isolated recheck took 2.61 seconds of test time. The later typecheck rejected an invalid test query option (`exact`); string role names already match exactly, so that option was removed.

The new tests cover selection/search retention across all three views, grouping before pagination with truthful counts, grouped header reversal, density and column visibility, nested checkbox/row-open isolation, and denied-storage remount behavior. All fixtures are synthetic.

Latest full typecheck and lint both passed (`collection-static-final.log`); lint retains the same pre-existing image-worker anonymous-export warning. `git diff --check` passed. No authenticated page rendering, screenshot acceptance, print rendering or final taste score is claimed here. The full-suite baseline still has the two failures documented in `baseline-checks.md`; the full check has not been declared green.

## Remaining collection work

Inventory now keeps every existing built-in state as a real named view and adds actual named browser-local snapshots. A modified dot, Discard and Save as view operate on real saved state, not illustrative controls. Snapshots include search, facets, sort, grouping, Table/List/Grid, density and column visibility. They validate on restore and are scoped to the household/move on the current browser. Refused writes keep session memory and say so. No backend or cross-device persistence is claimed.

The + Filter sheet lists flat room, category, owner, status, disposition, condition, review/value flags, photo/evidence, box and load facets. Counts respect search/base view and all other facets; alternatives within one facet combine with OR, different facets with AND. Removable chips retain selected zero-match values after live changes. Search and primary disposition chips can also be cleared individually. All original column controls/descriptions, intake and bulk actions remain, now using the shared Columns control. New filter/search/reset/close icons are Codex SVGs.

The affected pass passed TypeScript, focused lint and four suites /39 tests (`facet-view-checks-final.log`). It includes actual Inventory saved-view restore after unmount/remount, sort/group/density/columns/query restoration, modified/Discard behavior, phone facet counts and continuity, absent/multi-valued facet identity and selected zero-match options. The initial TypeScript check caught a required column metadata field during consolidation; preserving the typed definition and its mobile value corrected it before the passing run.

Phone Options consolidation, rendered Inventory/filter/named-view proof, and application across every other collection remain. The gallery's current page captures prove Home only; source tests do not supply collection visual acceptance.

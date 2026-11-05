# Candidate Q — source review fixes

Review target `3e845357ed5bb6789063efb2d3167020865e7f8b`; author Codex `gpt-6.1-sol` high. Both independent source judges requested changes. Scores and raw reports remain unchanged in `scores.json` and `02-Q-{sol,opus}.md`; the Opus review supplies the different-model code review.

Implemented after review:

- Inventory preset selection clears the controlled column sorting, preserving grouping. Inventory and movable units retain their existing preset menu and omit the duplicate generic Sort popover.
- A first client visit without a saved presentation chooses List below 768px, Table otherwise. This choice is stored once, with the same denied-storage memory fallback. No resize listener changes the presentation or remounts the record tree; saved choices override the initial phone default.
- Only explicitly groupable, sortable columns are offered. Inventory uses real categorical fields; movable units offers labelled location routes and load state. Measurement sorting remains available, but numeric sentinels and names are not offered as groups.
- Normalized grouping identity and its leading comparator now agree: whitespace/case variants join one group, and null/undefined/empty values form one Not recorded group. That comparator orders full groups before pagination and disables TanStack's separate undefined ordering for the active group.
- Reversing a group retains the existing secondary sort. Group headings are header cells; controls have a named group, phone-sized Group select, and explicit sort direction semantics.
- Print hides collection presentation/pagination/bulk controls. Unnamed shared tables use an instance preference key rather than all sharing records. Current product callers still use their stable explicit keys.

Checks: two affected suites passed 22 tests, full typecheck passed, focused lint passed (`collection-review-fixes.log`). Coverage includes preset recovery in Table/List/Grid; mixed-case and missing group values spanning pages; secondary sort retention on group reversal; phone initial view; stored preference/remount/resize continuity; existing bulk, selection, row opening and query tests. An unmatched third filename was supplied to Vitest; its summary correctly reports two discovered suites, not three. No full-suite or rendered page acceptance is claimed.

The next review combines these corrections with the substantive Home desk implementation. These fixes do not themselves create an extra visual exploration round or override the playbook.

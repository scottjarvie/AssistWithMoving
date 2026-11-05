# Candidate Q — opus source review

**Exact head confirmed: `3e845357ed5bb6789063efb2d3167020865e7f8b`**, clean tree, nothing changed. I reviewed `1ec0fdf..3e84535` from source only. Following the blindness rule, I did not open `scores.json` or the other judges' records.

The foundation fixes hold up in source. I found **two blocking problems in the collection tranche**: one breaks an existing control, one is a phone regression. Both are small to fix.

## Blocking

**B1 — Inventory's Sort menu stops working once someone sorts by a column. (Major, capability regression)**
- **Where:** `src/components/inventory-table.tsx:1417` and `:1437-1438`, `src/components/ui/data-table.tsx:409`, `src/components/collection-presentation-controls.tsx:31-38`.
- **Why it's new:** Inventory used to show only its own Sort menu, because the column headers weren't shown. Now the Table view header sorts and the new generic Sort popover appear next to it. `enableSortingRemoval: false` is also set for every table.
- **What happens:** Click "Sort by Room" in the Table header, then pick "Newest" in inventory's Sort menu. Nothing visibly changes, because the column sort still wins and the menu's order only breaks ties. Nothing on the page clears that column sort until reload.
- **Fix:** Have the Sort menu call `setSorting([])`, as movable units already does at `movable-units-table.tsx:779-783`. Better still, keep one sort control on Inventory: hide the generic Sort popover or fold the menu's options into it. Add a test for this sequence.

**B2 — Phones now open every collection as a 980px-wide table. (Major, phone)**
- **Where:** `data-table.tsx:322` defaults to Table unless `cardOnly`. `data-table.tsx:320` and `:514-521` mount that Table at `min-w-[980px]` at every width. `inventory-table.tsx:1421` dropped `cardOnly`.
- **Before:** movable units showed cards below `md` (`md:hidden`), and Inventory showed the list at every width.
- **Now:** A first visit on a phone gets a sideways-scrolling table of tappable rows with inline selects. The playbook says "phones not shrunk desktops". The inventory test now locks in Table at phone width.
- **Fix:** Pick the default once, on the client, only when nothing is stored yet. For example, read `matchMedia("(min-width: 768px)")` after the first render, choose List on narrow screens and save that choice. Resizing then never switches the view or remounts it. Update the 100-record phone-width test to expect List.

## Non-blocking (ranked)

3. **Group-by produces misleading group names. (Medium, truthfulness)** `collection-presentation-controls.tsx:16` offers every column that has a value to group by, and `data-table.tsx:447-450` uses that value as the label.
   - Grouping movable units by Weight or Density shows "Weight: -1" for missing values (`movable-units-table.tsx:609,629`).
   - Location shows the two room names run together as "Kitchen Garage" (`:589`).
   - Item and Unit names give one group per record.
   - **Fix:** let each column opt in to grouping (e.g. `meta.groupable`) and supply its own group value and label.
4. **The same group can be split or shown twice. (Medium-low)** At `data-table.tsx:446` the group key is case- and type-sensitive, but the table's text sort ignores case.
   - Rooms "Den" and "den" can come out as Den / den / Den, so the Table shows three headers while List/Grid merges them into one section and re-orders rows.
   - Missing (`undefined`) and empty (`""`) both read "Not recorded", but they sort to opposite ends, so that group appears twice with separate counts.
   - **Fix:** normalise the value once (trim, lowercase, treat null/undefined/"" as one value) and sort the group on that same value.
5. **Grouping by an unsortable column is silently ignored. (Low, latent in the shared table)** The table library drops sorts on columns that can't sort, so grouping by one would not happen before pagination. Only offer sortable columns at `collection-presentation-controls.tsx:16`.
6. **Reversing the group order drops the second sort. (Low)** When grouping is on and a second sort is set, clicking the group column's header replaces both, so the second sort is lost (`data-table.tsx:410-416`). Handle the group-column toggle yourself.
7. **Accessibility details. (Low)**
   - `collection-presentation-controls.tsx:17`: `aria-label` on a plain `div` is ignored by screen readers; use `role="toolbar"` or `role="group"`.
   - `:26`: the Group select is 32px tall (`h-8`) on phones while the other controls are 44px.
   - `:34-35`: sort direction is shown only as ↑/↓; add `aria-pressed` or screen-reader text.
   - `data-table.tsx:554`: group header rows use a plain cell; use a header cell scoped to the row group.
8. **Print shows interactive controls. (Low, not checked visually)** The `globals.css` print block hides the shell but not the collection toolbar, page buttons or bulk-action bar.
9. **Shared default preference key. (Low)** At `data-table.tsx:322`, tables without a `preferenceKey` or label all share `"records"`, so one view choice applies to all of them. Both current callers pass a key.

## What verified cleanly

- **Foundation fixes:**
  - Top navigation keeps Add, and its sheets only mount when opened.
  - The account menu's appearance and navigation choices are real menu radio items reachable by keyboard; hidden items on phones are skipped.
  - The operations strip sticks only from `sm` up on pages that opt out; the pages that keep `sticky={true}` have no operations strip.
  - Section icons use an exact lookup.
  - Print resets every colour role and restores the person's appearance afterwards.
  - The first theme pass reads the saved preference.
  - Decorative illustrations are `aria-hidden`.
- **One shared table state across views:** search, selection, bulk actions, pagination, sorting, inline editing (Table), row and card opening, the movable-unit photo lightbox and the checkbox-doesn't-open-the-row guard all carry over between Table, List and Grid.
- **Grouping comes before pagination**, and counts cover every matching loaded record.
- **Footer counts are truthful** for both callers: inventory uses all loaded items; movable units uses the full unit summary, and Show all clears search and the stat chip.
- **Hydration is safe:** the server renders the default view, and a saved List/Grid choice switches after hydration (a layout shift, not a mismatch).
- **Storage fallback works:** read failures are caught, refused writes fall back to memory, and changes sync through storage events.

```json
{
  "exactHead": "3e845357ed5bb6789063efb2d3167020865e7f8b",
  "implementationBase": "1ec0fdfcf140efa679ef78d2bfb8b9bfdffed5a5",
  "authorModel": "Codex gpt-6.1-sol high",
  "reviewerModel": "claude-opus-5-5",
  "blindLabel": "Q",
  "evidenceType": "source-only",
  "rubric": {
    "foundationFixCorrectness": 8.5,
    "capabilityRetention": 6.5,
    "crossViewStateIntegrity": 8.5,
    "groupingSortingCorrectness": 6.5,
    "footerCountTruthfulness": 8.5,
    "storageFallbackAndHydration": 8.5,
    "accessibilitySource": 7.0,
    "phoneRiskSource": 5.5,
    "testCoverage": 7.0,
    "codeClarity": 7.0,
    "renderedPolish": null,
    "responsiveRendering": null,
    "printRendering": null,
    "finalTaste": null
  },
  "overallSourceScore": 7.3,
  "visualVerdict": "unverified",
  "disposition": "changes-requested",
  "blockingFindings": [
    {
      "id": "B1",
      "severity": "major",
      "file": "src/components/inventory-table.tsx",
      "line": 1417,
      "related": ["src/components/ui/data-table.tsx:409", "src/components/collection-presentation-controls.tsx:31"],
      "summary": "Inventory Sort menu no longer changes the order once a Table header or generic Sort popover sort is chosen; no control clears that sort (sorting removal disabled) until reload.",
      "fix": "Sort menu onChange also calls setSorting([]) (as movable units does), or keep one sort control on Inventory; add a test."
    },
    {
      "id": "B2",
      "severity": "major",
      "file": "src/components/ui/data-table.tsx",
      "line": 322,
      "related": ["src/components/ui/data-table.tsx:320", "src/components/inventory-table.tsx:1421"],
      "summary": "With no saved view, phones open every collection as a min-w-980px table; before, movable units showed cards below md and Inventory showed its list at every width.",
      "fix": "When nothing is stored, pick the default once on the client after first render (List below md) and save it; never change it on resize."
    }
  ]
}
```


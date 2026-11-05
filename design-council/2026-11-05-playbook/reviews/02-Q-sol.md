# Candidate Q — sol source review

{
  "exactHead": "3e845357ed5bb6789063efb2d3167020865e7f8b",
  "observedHead": "3e845357ed5bb6789063efb2d3167020865e7f8b",
  "implementationBase": "1ec0fdfcf140efa679ef78d2bfb8b9bfdffed5a5",
  "authorModel": "Codex gpt-6.1-sol high",
  "reviewerModel": "Codex gpt-6.1-sol high",
  "blindLabel": "Q",
  "evidenceType": "source-only",
  "rubric": {
    "scale": "0–10",
    "foundationFixImplementation": 9,
    "capabilityRetention": 7,
    "collectionStateAndOrdering": 6,
    "filterAndCountTruth": 9,
    "storageAndHydration": 9,
    "accessibilitySemantics": 8,
    "renderedPolish": null,
    "responsiveRendering": null,
    "printRendering": null,
    "finalTaste": null
  },
  "overallSourceScore": 8,
  "visualVerdict": "unverified",
  "disposition": "request_changes",
  "blockingFindings": [
    {
      "severity": "P2",
      "location": "src/components/inventory-table.tsx:1417",
      "title": "Inventory presets cannot regain control after a column sort",
      "trigger": "Sort Item through the table header or new Sort popover, then choose Weight or Recently added in the existing preset menu.",
      "behavior": "The preset updates sortField and reorders input data, but the controlled TanStack sorting remains active and overrides that order. The preset menu displays the selected choice without delivering it. Sorting removal is disabled, and the new controls offer no reset.",
      "fix": "Clear sorting when a preset is chosen, following MovableUnitsTable's existing handler. Preserve the independently selected grouping. Add coverage that applies a column sort and then verifies a preset becomes effective in Table, List and Grid."
    },
    {
      "severity": "P2",
      "location": "src/components/ui/data-table.tsx:385",
      "relatedLocation": "src/components/ui/data-table.tsx:446",
      "title": "Grouping identity and sorting equality disagree",
      "trigger": "Group at least eleven records by a text field containing alternating values such as Den and den.",
      "behavior": "TanStack's automatic text comparator treats those values as equal, while groupKey treats them as distinct. A small library probe confirmed the alternating order survives sorting. Table repeats group headings; List/Grid merge only the current page's members. Both groups can therefore be spread across pages despite grouping being selected.",
      "fix": "Ensure complete groups are contiguous before pagination. Use a group comparator with an exact-identity tie-break matching groupKey, or build and order complete groups before flattening them into the paginated row model. Cover mixed-case values and a page boundary."
    }
  ],
  "nonBlockingFindings": [
    {
      "severity": "P3",
      "location": "src/components/ui/data-table.tsx:449",
      "title": "Group headings expose missing-measurement sentinels",
      "trigger": "Group movable units with unknown weight or density by Weight or Density.",
      "behavior": "Those accessors use -1 for missing measurements, and groupLabel displays the raw value. Headings consequently report Weight: -1 or Density: -1 instead of identifying an unknown measurement.",
      "fix": "Provide column-specific group labels or separate grouping values from sorting sentinels, preserving missing-value ordering while displaying Not recorded."
    }
  ],
  "evidenceNotes": [
    "The requested foundation fixes are present in the frozen source; no additional foundation source blocker identified.",
    "Caller filter clearing, footer count separation, selection state, storage fallback and deterministic hydration snapshots are implemented.",
    "Reported test results were considered; no suites, application server or browser were run.",
    "Phone rendering, print rendering and visual acceptance remain unverified. The table default retains a 980px minimum width, making authenticated phone verification important.",
    "Saved views, facets and other unfinished page families were excluded from completion judgments.",
    "Prohibited scores and other judges' records were not read.",
    "HEAD remained unchanged. Concurrent uncommitted changes were not reviewed."
  ],
  "filesChanged": []
}


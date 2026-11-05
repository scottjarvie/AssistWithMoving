# Candidate R — sol source and component-image review

**Disposition: request changes.** HEAD remained `682decc12ece3865809b80fb36cd692fdae49706`; the worktree stayed clean. All four required PNGs were opened.

1. **R1 · P2 — Sort direction remains inaccessible in the actual collection tables.** [data-table.tsx:176](/C:/Users/accou/.t3/worktrees/AssistWithMoving/design-assistwithmoving-d3ead6c9063dcef0/src/components/ui/data-table.tsx:176)  
   **Trigger:** Sort or reverse a column in Inventory or Movable Units.  
   **Impact:** The button name remains “Sort by …”, its direction icon is hidden from assistive technology, and column headers lack `aria-sort`. The improved generic menu is suppressed in both consumers, so its direction announcements do not help them.  
   **Fix:** Expose primary sort state on the column header and include direction and secondary-sort priority in accessible text.

2. **R2 · P2 — Group headers do not have matching semantic row groups.** [data-table.tsx:580](/C:/Users/accou/.t3/worktrees/AssistWithMoving/design-assistwithmoving-d3ead6c9063dcef0/src/components/ui/data-table.tsx:580)  
   **Trigger:** Display two or more groups on one table page.  
   **Impact:** Every `scope="rowgroup"` header belongs to the same enclosing `<tbody>`, rather than its corresponding visual group. Assistive technology cannot reliably associate each heading with only its member rows.  
   **Fix:** Render a separate `<tbody>` per displayed group, or explicitly associate cells with their group header.

3. **R3 · P2 — Synthetic captures replace the application’s canvas colors.** [build-page-samples.mjs:52](/C:/Users/accou/.t3/worktrees/AssistWithMoving/design-assistwithmoving-d3ead6c9063dcef0/design-council/tools/build-page-samples.mjs:52)  
   **Trigger:** Generate either theme sample.  
   **Impact:** `html,body{background:transparent}` overrides the real paper/charcoal background. The saved images therefore show host-dependent canvas colors, weakening palette and surface-contrast evidence despite using actual component CSS.  
   **Fix:** Paint the sample canvas with `var(--background)` and refresh the captures, metadata and gallery.

4. **R4 · P3 — “Show all” escapes print-control hiding.** [data-table.tsx:683](/C:/Users/accou/.t3/worktrees/AssistWithMoving/design-assistwithmoving-d3ead6c9063dcef0/src/components/ui/data-table.tsx:683)  
   **Trigger:** Print a filtered collection with hidden records.  
   **Impact:** The interactive “Show all” button remains printable because only its neighboring pagination controls receive `collection-controls`.  
   **Fix:** Hide that button in print while retaining the count summary.

The Home source preserves all five destinations, both AI links and detailed guidance. Its counts derive from loaded records or explicitly named destinations. The collection corrections implement the requested initial view, preference fallback, preset recovery, categorical grouping, normalized ordering before pagination and secondary-sort preservation. SVGs use semantic colors and appropriate decorative treatment. Gallery source provides newest-first rounds, numbered modal navigation and a timestamp.

The four images support bounded approval of the Home composition: clear folder trays, move evidence first, retained image slots and readable phone wrapping. Palette acceptance requires corrected captures. No tests were run during this review; supplied check results remain reported evidence, including the two known full-suite baseline failures.

```json
{
  "exactHead": "682decc12ece3865809b80fb36cd692fdae49706",
  "observedHead": "682decc12ece3865809b80fb36cd692fdae49706",
  "implementationBase": "3e845357ed5bb6789063efb2d3167020865e7f8b",
  "authorModel": "Codex gpt-6.1-sol high",
  "reviewerModel": "Codex gpt-6.1-sol high",
  "blindLabel": "R",
  "evidenceType": "source-and-synthetic-component-images",
  "sourceRubric": {
    "scale": "0–10, equally weighted; scoped source assessment",
    "capabilityPreservationAndTruth": 9.5,
    "collectionOrderingAndControls": 9.0,
    "responsiveStructureAndPreferences": 9.0,
    "accessibility": 7.0,
    "printControlCoverage": 8.0,
    "evidenceCorrectnessAndProvenance": 8.0
  },
  "overallSourceScore": 8.4,
  "homeComponentVisualRubric": {
    "scale": "0–10, equally weighted; four supplied component images only",
    "decidedTrayCompositionAndHierarchy": 9.0,
    "observedDesktopAndPhoneLayout": 8.8,
    "imageSlotsAndDomainSymbols": 8.6,
    "observedContentLegibility": 8.8,
    "applicationCanvasPaletteFidelity": null,
    "finalTypography": null
  },
  "homeComponentVisualScore": 8.8,
  "homeComponentTasteVerdict": "Bounded approval of the decided Home composition. Refresh canvas-correct captures before palette acceptance. Opus remains the final AI tastemaker; Scott overrides.",
  "disposition": "request-changes",
  "blockingFindings": ["R1", "R2", "R3"],
  "wholeAuthenticatedResponsiveRendering": null,
  "fullPrintRendering": null,
  "finalTaste": null,
  "evidenceLimitations": [
    "Synthetic SSR Home component with application CSS; no authenticated shell, live data or interactive hydration.",
    "Only 1440x743 desktop and 390x1008 phone images were inspected, in light and dark.",
    "Images show one loaded synthetic move; empty, loading, multi-move and 320px rendering remain unverified.",
    "System font fallback prevents final typography acceptance; transparent canvas overrides prevent application-background acceptance.",
    "Source provenance matches the reviewed application tree; later commits changed generator/evidence only.",
    "Checks were not rerun. Reported focused checks do not establish a green full suite; two baseline failures remain recorded.",
    "Reviewer uses the same model as the author; this does not supply different-model approval.",
    "Remaining collection facets/saved views, page families and spatial/load/move-day explorations remain outside this tranche."
  ],
  "filesChanged": false
}
```


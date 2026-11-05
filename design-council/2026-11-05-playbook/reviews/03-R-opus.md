# Candidate R — opus source and component-image review

I reviewed the exact head and the four saved Home images. No files were changed. I found no blocking defects; there are three medium findings and five low ones.

**Head check:** `git rev-parse HEAD` returned `682decc12ece3865809b80fb36cd692fdae49706`, which matches the target. `src/` and `tests/` are identical between `2efb468`, `cca4dd4` and the target, so the captures show the source under review.

## Ranked findings

**1. Medium: phones in List or Grid lost reverse sorting and group direction (`src/components/ui/data-table.tsx:499`, `src/components/inventory-table.tsx:1437`, `src/components/movable-units-table.tsx:831`)**
- **Trigger:** Items and Movable units now pass `showSortControl={false}`. List and Grid have no column headers. The preset `SortMenu` only sorts one way, and changing the Group select resets `groupDesc` to false.
- **Impact:** List is now the phone default. There, people can no longer sort light→heavy or Z→A, or reverse group order. Desktop Table can still do all of this through headers. That breaks §2.9 (phone and desktop keep the same capability) against this branch's own previous commit. It is not a loss compared with `main`, because the generic Sort control is new on this branch.
- **Fix:** Keep one Sort control. Either merge the presets into the generic popover (presets, then reversible column sorts), or add a direction toggle to `SortMenu` plus a group-direction toggle next to the Group select.

**2. Medium: group headings show raw database values that don't match the cell labels (`data-table.tsx:475`; groupable columns at `inventory-table.tsx:932`, `:958`, `:1042`, and `movable-units-table.tsx:674`)**
- **Trigger:** The new `meta.groupLabel` hook has no callers. Headings therefore print the raw stored value: "Disposition: personalTransport", "Load: owner" (the cell badge says "Personal"), "Load: unassigned" (the badge says "Needs load"), "Status: draft".
- **Ordering:** Groups sort alphabetically by those raw values, so Status runs active, archived, damaged, delivered, draft… rather than in workflow order.
- **"Not recorded" placement (`compareGroups` at `data-table.tsx:303-308`):** the empty group sorts by the key string `"empty"`. It comes first in ascending text columns but last for true/false columns.
- **Impact:** Moving's own vocabulary is broken in a primary control, and two names exist for the same state.
- **Fix:** Supply `groupLabel` from the existing labels (`itemStatusOptions`, disposition options, the `AssignmentBadge` wording). Optionally add a `groupOrder` and always put "Not recorded" last.

**3. Medium: the Home move count says "active" but counts every move that isn't archived (`src/components/home-launchpad.tsx:50`)**
- **Trigger:** `activeMoves` is every move whose status isn't `"archived"`. The schema has `planning`, `active` and `completed` statuses.
- **Impact:** "3 active" can include completed or planning moves. That contradicts the new design-doc rule "Every count says what it counts", and the explicit truthful-count goal.
- **Fix:** Label it "N moves" or "N current", or count only `status === "active"`. Whatever is chosen should match the Moves page wording.

**4. Low: the preset Sort button keeps showing the old preset after a header sort overrides it (`inventory-table.tsx:1421`, `movable-units-table.tsx:778`; check mark in `inventory-sort-menu.tsx`)**
- **Trigger:** Choosing a preset now clears the column sort, which is correct. But clicking a column header afterwards leaves "Sort: Added ✓" displayed.
- **Impact:** The control states the wrong sort order.
- **Fix:** When `sorting.length > 0`, show "Custom" or the column name and remove the check mark.

**5. Low: group headings use `scope="rowgroup"` inside a single `<tbody>` (`data-table.tsx:580`)**
- **Impact:** `rowgroup` scope covers the whole tbody, so screen readers may announce every group heading for every row.
- **Fix:** Render one `<tbody>` per group, or drop `scope` and rely on the header-cell text.

**6. Low: Home links have no explicit focus style (`home-launchpad.tsx:50`, `:55`, `:77`, `:85`)**
- **Trigger:** The move rows, Library rows and footer links only change on hover. They inherit only the global `outline-ring/50`, which is weak on the cream tray background.
- **Fix:** Add `focus-visible:outline-2 focus-visible:outline-ring`, the same as the collection select.

**7. Low, evidence honesty: the sample builder's provenance stamp can be incomplete (`design-council/tools/build-page-samples.mjs:18`, `:19-23`)**
- **Dirty check:** `sourceDirty` only checks `src`. The captures were stamped `cca4dd4` with no "uncommitted" note, but they came from a later, then-uncommitted generator (the date-string and viewport-rule changes). `home-evidence.md` does disclose this.
- **Relative dates:** the dates render relative to build time ("in 9 days"), so rebuilding later changes the output.
- **One-move fixture:** the fixture has a single move. The three-row overview, long titles, and the empty and loading states have no visual evidence.
- **Fix:** Include `design-council/tools` in the dirty check, fix the clock or add a time to the stamp, and add a 3–4 move fixture plus an empty-state sample.

**8. Low, taste (for Opus or Scott): the "Library" tray holds navigation links (`home-launchpad.tsx:75`)**
- Across the family, "Library" means saved knowledge, but this tray is the global destination list. Its "5 destinations" count counts links, not records.
- **Suggestion:** Consider "Go to" or "Destinations" and drop the count. This is flair, not skeleton.

## Checked and confirmed
- **Home:** all five destinations, both AI links and the full "How the connection works" text are present. The selected move comes first. The first-move empty state and the loading skeleton remain. No new queries or made-up Queue or activity counts. Heading levels are h1 → h2 trays → h3.
- **New symbols:** `arrow` and `add` are original 24-unit SVGs drawn in the current colour, hidden from screen readers and dark-mode safe. The disclosure arrow rotates on open.
- **View choice:** on a first visit, phones get List and desktops Table. It is chosen once and stored with the existing in-memory fallback. There is no resize listener and no remount; a saved choice wins.
- **Grouping:** only columns marked groupable and sortable are offered. Case, spacing and missing values are normalised the same way for grouping and ordering, before pagination. `sortUndefined: false` is set, and secondary sorts survive a group reversal (with `enableSortingRemoval: false`, the header toggle analysis holds).
- **Controls:** the Group select is labelled and 44px tall on phones. Sort buttons expose their direction. Print hides the presentation, pagination and bulk controls.
- **Gallery tool:** the rounds file and lightbox are newest-first and honestly labelled.

## Bounded visual read (four synthetic Home component images)
- The folder-tab trays read clearly as a desk and stay calm in Moving's kraft palette. Light and dark both hold up; outlines and link colours stay legible.
- On a 390px phone the trays stack in a sensible order (moves, Library, AI) with no clipping.
- On desktop the AI tray ends well above the Library tray, and a single move leaves the moves tray sparse.
- Overall it is a disciplined but launchpad-like desk with three trays. That is justified by the data Home can load today; the evidence-type trays (Ready for you, This week and so on) are honestly left out.

```json
{
  "exactHead": "682decc12ece3865809b80fb36cd692fdae49706",
  "observedHead": "682decc12ece3865809b80fb36cd692fdae49706",
  "implementationBase": "3e845357ed5bb6789063efb2d3167020865e7f8b",
  "authorModel": "Codex gpt-6.1-sol high",
  "reviewerModel": "claude-opus-5-5",
  "blindLabel": "R",
  "evidenceType": "source-and-synthetic-component-images",
  "sourceRubric": {
    "capabilityPreservation": 8.0,
    "truthfulCounts": 8.0,
    "responsiveStructure": 8.5,
    "controlsAndAccessibility": 7.5,
    "collectionCorrectness": 8.5,
    "evidenceHonesty": 8.5
  },
  "overallSourceScore": 8.2,
  "homeComponentVisualRubric": {
    "playbookHomeFit": 7.5,
    "hierarchyAndScanning": 8.0,
    "calmDensity": 8.0,
    "lightDarkParity": 8.5,
    "phoneLayout": 8.0,
    "movingFlair": 7.5
  },
  "homeComponentVisualScore": 7.9,
  "homeComponentTasteVerdict": "Coherent, restrained kraft folder-tray desk that fits the decided §3.5 skeleton within the data Home can load today; slightly sparse and launchpad-like; 'Library' naming is a flair question for Opus/Scott. Bounded to synthetic single-move SSR component images.",
  "disposition": "approve-with-non-blocking-changes",
  "blockingFindings": [],
  "nonBlockingFindings": [
    "Medium: generic Sort hidden removes reverse/group-direction sorting in List/Grid (phone default) for Items and Movable units",
    "Medium: group headings show raw stored values (personalTransport, owner, unassigned) and order alphabetically; groupLabel hook unused",
    "Medium: Home 'N active' counts every non-archived move, including planning and completed",
    "Low: preset SortMenu keeps showing the old preset after a header sort overrides it",
    "Low: scope=rowgroup group headings inside a single tbody",
    "Low: Home links lack an explicit focus-visible style",
    "Low: sample builder dirty check ignores the generator; relative dates; single-move fixture",
    "Low/taste: 'Library' tray label and its nav-link count"
  ],
  "authenticatedResponsiveRendering": null,
  "fullPrintRendering": null,
  "finalTaste": null,
  "evidenceLimitations": [
    "Source review plus four static synthetic SSR images of the HomeLaunchpad component only; no authenticated app shell, live data, hydration or interaction",
    "Fixture has one move: the three-row overview, long titles, empty state and loading state are not visually evidenced",
    "System font fallback, so final typography is unverified",
    "Collection changes reviewed in source only; no rendered collection, phone list or print evidence",
    "No tests run by this reviewer; relied on the reported 22 collection tests, 3 Home tests and typecheck; the full suite still has two recorded failures",
    "Remaining page families, facets and saved views, and spatial/load/move-day explorations are out of this tranche; no global completion claimed"
  ],
  "filesChanged": []
}
```


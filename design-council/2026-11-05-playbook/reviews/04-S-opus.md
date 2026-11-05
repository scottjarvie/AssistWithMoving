**Candidate S review: request changes. There is one blocker, and the fix is small.** HEAD was `99d0396` at the start and end, the tree was clean, and I edited nothing. `src/` is identical between `29bb94a` (the capture source) and HEAD. I read the source and opened all seven `03-home-*` images. I did not run any tests or builds, open a browser, or read `scores.json` or any other judge's record.

## Findings, most serious first

**1. Blocker: the fact source links point at the wrong history entry and name the wrong author.** (`src/components/item-detail-sheet.tsx:138-141`, `src/components/record-evidence-stream.tsx:629`)
- **Cause:** `handleSubmit` (`item-detail-sheet.tsx:663-708`) sends the full form every time: status, disposition, location fields, value, notes and so on. Neither `patchItem` nor `movable-units-table` compares it against the saved item first. `convex/items.ts:1367` then records `changedKeys: Object.keys(patch)`, so every save from this dialog says it changed nearly every field.
- **Trigger:** an AI or API key sets Status to "packed". A person later opens the item and only renames it.
- **Impact:** "Status: from its entry" now jumps to the person's rename and labels it Person. The stream also lists "Changed: … status, disposition, value…" for a rename. This breaks the design-system rule that "Source links require an actual matching history entry", and it misattributes the author.
- **Why tests pass:** the new test uses `changedKeys: ["name"]` for `item.updated`, which a real save from this dialog never produces.
- **Fix:**
  - In `items.update` (and the REST/MCP equivalents), compute `changedKeys` only for values that actually differ from the saved item.
  - For Status, prefer entries that carry `statusFrom`/`statusTo`.
  - Older saves already recorded every field, so for those say "last save that included Status" instead of "from its entry", and don't show their full "Changed:" list.
  - Add a test with a realistic full-form save.

**2. Medium (plausible, not rendered): at desktop widths the dialog's close button sits on top of the "All 7" section chooser.** (`item-detail-sheet.tsx:166, 296` with `ui/dialog.tsx:81`)
- **Cause:** the header that used to reserve `pr-12` now lives in the left column. From the `md` breakpoint up, the right column's tab strip starts at the top edge, and the close button (`absolute right-3 top-3`) is drawn over that strip's chooser button.
- **Impact:** aiming for "All 7" can close the dialog instead. Whether that discards unsaved edits depends on how the parent handles closing; I didn't verify it.
- **Fix:** add `md:pr-10` to the right column or to the `within-panel` tab-list wrapper.

**3. Medium: nothing tells the person they have unsaved edits.** (`item-detail-sheet.tsx:198-220, 410`)
- The draft does survive switching between the record and the editors; the new test covers that.
- But back on the Record view, the saved facts show the saved values while a different draft is pending. The footer still says "Detailed edits are saved to the item history."
- **Fix:** compare the draft with the item and show an "Unsaved changes" mark near the saved facts and the footer.

**4. Low: a source link with no matching entry gives no feedback.** (`item-detail-sheet.tsx:133-137`)
- Under the 50-entry cap it quietly loads more history but never looks for the source again. At the cap it does nothing.
- **Fix:** after loading, look again and focus the entry, or announce "No source in the latest N entries" in a polite live region.

**5. Low: focus gets lost after the remove/convert confirmation closes.** Cancel or finishing removes the confirmation panel, and focus falls back to the page. Return it to the "More item actions" button.

**6. Low: plurals.** Home can say "1 moves"; the history stream can say "1 loaded entries" and "1 earlier loaded entries". The Home number itself is truthful: it counts the real non-archived moves, and the label is correct.

**7. Taste: the item record has four ways to reach the same seven sections.** There is an icon action row, the tab strip, the "All 7" chooser, and the phone Contents grid. The action icons also clash with the tab icons: Handling is a truck on its tab but a box on its action button, and the notes button reuses the Record tab's icon but opens Review. I'd trim the action row to Photos plus More, and align the icons.

**8. Taste:**
- Private notes now show on the default Record view. Consider collapsing them.
- The Inventory toolbar no longer shows the current sort preset without opening Sort. Consider "Sort · Added".
- In dark mode the 80px route illustration on phones is low contrast.

**Checked and passing:**
- **Tables:** sort direction and priority are announced, `aria-sort` sits on the primary column only, and each group gets its own `<tbody>`.
- **Grouping:** status and load groups follow workflow order, records with no value stay last in both directions, and group labels match the badge wording.
- **Sorting:** there is one Sort menu with truthful preset/custom states, plus a reversible group order that also works in phone List and Grid. Collection controls are hidden in print.
- **Home and gallery:** every Home destination and the AI guidance remain. The gallery is newest-first, keeps every round, and uses lossless WebP with the original PNGs left on disk. I did not decode the WebP myself; I'm relying on the author's pixel comparison for that.
- **Item record:** every original editor, photo control, sell/trash, convert/remove confirmation, measurement-source step and save/error path is still there. History stays bounded at the default 8, with an option for up to 50 and an honest "older history may exist" note.

**Home images:** all seven show the paper (light) and charcoal (dark) app background. Long titles wrap completely at both 390px and 320px next to the 80px image slot. Empty and loading states are sound, and each image's footer stamps the source commit and generation time. Focus outlines can only be confirmed in source; these static images don't show them. I make no claim about the item dialog's appearance from these images.

```json
{
  "exactHead": "99d0396229cbcdaad392dde056b07f1d52060c53",
  "implementationBase": "682decc12ece3865809b80fb36cd692fdae49706",
  "authorModel": "codex gpt-6.1-sol high",
  "reviewerModel": "claude-opus-5-5",
  "blindLabel": "S",
  "evidenceType": "source-and-synthetic-Home-images",
  "sourceRubric": {
    "productTruthProvenance": 6.0,
    "preservationOfEditorsAndActions": 9.0,
    "accessibilityFocus": 8.0,
    "phoneReadingOrderDraftContinuity": 8.0,
    "collectionSortGroupCorrections": 9.0,
    "homeCountsAndDestinations": 8.8,
    "evidenceToolingProvenance": 8.8,
    "testHonesty": 7.0
  },
  "overallSourceScore": 7.8,
  "homeComponentVisualRubric": {
    "canvasLightDark": 9.0,
    "longTitlesAndImageSlot": 8.8,
    "phoneWrapping320": 8.5,
    "hierarchyAndCompactness": 8.4,
    "emptyLoadingStates": 8.3,
    "darkIllustrationContrast": 7.5
  },
  "homeComponentVisualScore": 8.5,
  "homeTasteVerdict": "approve bounded Home component (synthetic SSR only)",
  "disposition": "request-changes",
  "blockers": [
    "Fact source links and the 'Changed:' list use changedKeys from full-form saves (item-detail-sheet handleSubmit + convex/items.ts:1367), so any rename is presented as the source of status/disposition/value/location and attributed to its author; the test fixture masks this."
  ],
  "evidenceLimitations": [
    "Source and saved images only; no tests, build, browser or rendering run by the reviewer",
    "Home images are synthetic SSR without the authenticated shell, with system fonts and no live interaction",
    "Item dialog rendering, close-button overlap, authenticated responsive/print rendering and final whole-site taste remain unverified (null)",
    "Lossless WebP pixel equality not independently decoded; author's reported check relied on",
    "No green full suite or build at this head is asserted",
    "Bounded tranche: remaining page families, collection facets and saved views are in progress and not judged"
  ],
  "itemDialogVisualScore": null,
  "wholeSiteTaste": null,
  "filesChanged": false
}
```

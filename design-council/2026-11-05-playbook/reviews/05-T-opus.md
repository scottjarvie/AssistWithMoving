I'd score candidate T at **8.2 on source alone, with no blockers**. HEAD was a7185089 at both start and end, the tree stayed clean, and I changed no files. All the core claims hold in the code: real browser-local named views that persist and restore, 12 counted facets, honest "related history" fact links, and nothing from the existing workflows removed. Rendered checks and whole-site taste remain null. I found five defects, none blocking; the three most important are below.

**One disclosure about blindness.** One of my `git grep` runs matched a single line in a file under `reviews/` (`02-Q-opus.md`, a prior candidate, about the shared DataTable preference key). I read nothing else from `reviews/`, `scores.json` or other judges, and that line didn't affect this review.

**Ranked defects (no blockers)**

1. **Discard drops keyboard focus.** `src/components/collection-view-tabs.tsx:89`
   - Trigger: a view is modified, then the user presses Discard.
   - Impact: the view becomes unmodified, so the Discard button unmounts and focus falls to the page body. Keyboard and screen-reader users lose their place. The test checks focus after Save but not after Discard.
   - Fix: after `onApply`, move focus to the selected view's button or to "Save as view".

2. **Saved views can't be deleted, renamed or updated.** `src/components/collection-view-tabs.tsx:20-63`
   - Trigger: any typo'd or out-of-date saved view.
   - Impact: the only write is "save another one". A wrong view stays on that browser for good, and changing a saved view means making a duplicate.
   - Fix: add Delete and Rename, and "Update view" when a saved view is modified. All three go through the same `save` path and storage events.

3. **"Unsaved changes" stays after a measurement is typed back.** `src/components/item-detail-sheet.tsx:567-114`, with the setters at `:655-682`
   - Trigger: an item has `weightConfidence: "low"`. The user types 41 into weight, then back to 40.
   - Impact: typing in a measurement field changes `weightConfidence` to "actual" or "manual", and that never reverts. The draft comparison includes that value, so the warning stays even though the fields match again. The save doesn't send this value at all; it rebuilds confidence from the "This is an estimate" checkboxes. The claim that the warning clears after reversion is false for weight, volume and dimensions.
   - Fix: drop the three confidence values from `draftComparisons`, or compare the confidence the save would actually send.

4. **The modified dot can stay when nothing visible changed.** `src/components/inventory-table.tsx:1115-1118`
   - Trigger: hide the Item column, then show it again.
   - Impact: column visibility gains `name: true`, but the default doesn't list `name`, so the view reads as modified while it looks identical.
   - Fix: normalise visibility before comparing, e.g. drop entries that are `true` and absent from the defaults.

5. **The "no related history" message may not be announced.** `src/components/item-detail-sheet.tsx:252`
   - Trigger: tap a fact link with no matching event when history is already at 50 entries.
   - Impact: the message's live region is created together with its text. Many screen readers don't announce content inserted that way, so the message can go unannounced.
   - Fix: keep an empty status region always mounted and only swap its text.

**Taste observations (not defects)**
- Picking a built-in view (e.g. Needs review) now also resets search, facets, sort and hidden columns. Before, it only changed the filter. Resetting columns surprises people.
- On phones, ten built-in view buttons (44px tall each) now wrap above the records. The previous version collapsed them on phone. This belongs to the unfinished phone Options work, but this tranche is what exposes it.
- The unassigned owner option is now labelled "Not recorded" instead of the old "Unassigned", which was clearer for a person. Owners whose contact can't be loaded all show the same "Owner not available" label.
- The filter button's accessible name becomes "+ Filter2" with no word for the number. The "+" next to the filter icon is redundant.
- An inline disposition change to the same value would read "Moving → Moving".

**What checked out:** the facet logic (OR within a facet, AND across facets, counts that apply all other facets, missing kept apart from literal text, one count per record, zero-match selections staying removable); strict validation of stored views; the session-only fallback when the browser refuses storage, plus cross-tab updates; matching server and first client render; the shared Columns control keeping its descriptions; every built-in filter kept as a view; bulk actions, intake and opening details unchanged; the history wording and latest-event-by-date logic; and focus handoff to the section tabs. No backend files changed in this diff.

```json
{
  "exactHead": "a7185089b824024195caa537683449bc8d59933e",
  "implementationBase": "99d0396229cbcdaad392dde056b07f1d52060c53",
  "headVerification": {"start": "a7185089b824024195caa537683449bc8d59933e", "end": "a7185089b824024195caa537683449bc8d59933e", "treeClean": true, "reviewedCommittedDiffOnly": true},
  "authorModel": "Codex gpt-6.1-sol high",
  "reviewerModel": "claude-opus-5-5",
  "blindLabel": "T",
  "evidenceType": "source-only",
  "sourceRubric": {
    "capabilityPreservation": 9,
    "facetCorrectnessAndHonesty": 9,
    "savedViewPersistenceAndRobustness": 8,
    "savedViewManagementCompleteness": 6,
    "itemHistoryTruthfulness": 9,
    "draftStateAccuracy": 7,
    "accessibilityAndFocus": 7.5,
    "designSystemConsistency": 8.5,
    "testCoverageOfClaims": 8
  },
  "overallSourceScore": 8.2,
  "disposition": "approve-with-followups",
  "blockers": [],
  "defects": [
    {"rank": 1, "file": "src/components/collection-view-tabs.tsx", "line": 89, "summary": "Discard unmounts itself and drops keyboard focus to the page body"},
    {"rank": 2, "file": "src/components/collection-view-tabs.tsx", "line": 54, "summary": "Saved views cannot be deleted, renamed or updated"},
    {"rank": 3, "file": "src/components/item-detail-sheet.tsx", "line": 567, "summary": "Unsaved-changes warning stays after reverting a measurement because confidence values that are never saved are compared"},
    {"rank": 4, "file": "src/components/inventory-table.tsx", "line": 1115, "summary": "Hiding then showing the Item column leaves a false modified dot"},
    {"rank": 5, "file": "src/components/item-detail-sheet.tsx", "line": 252, "summary": "Status region is created together with its text, so screen readers may not announce it"}
  ],
  "evidenceLimitations": [
    "Source read only; no tests, build, Next or browser run by this reviewer",
    "Reported checks (TypeScript, 39 + 16 tests, focused lint) accepted as reported, not rerun",
    "No rendered Inventory, filter sheet, named views, item dialog, phone or print evidence",
    "Close-button clearance only reserved from md up (md:pr-10); phone overlap not verifiable without rendering",
    "Full-suite baseline still has Windows symlink EPERM and load-planner timeout; no green full suite/build at this HEAD",
    "Blindness note: one grep output line from reviews/02-Q-opus.md (prior candidate) was seen incidentally; no other reviews/scores/judge content read"
  ],
  "filesChanged": false,
  "renderedInventory": null,
  "renderedItem": null,
  "renderedPhone": null,
  "renderedPrint": null,
  "wholeSiteTaste": null
}
```

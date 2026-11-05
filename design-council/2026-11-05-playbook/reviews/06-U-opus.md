I found no blockers in this source-only review of candidate U. Two medium focus defects should be fixed before the harness is captured: one leaves the opened connection details off-screen, the other puts focus straight on the "Yes, revoke it" button. Rendered polish, responsive layout and taste are not assessed here.

HEAD was 5da80247cd768f745b838584098d9e11c54cb772 at the start and at the end, and the tree stayed clean. I reviewed only the code, tool and design-doc parts of a7185089..5da80247. I did not read `scores.json`, `reviews/`, `STATUS.md` or `ai-settings-evidence.md`. I ran no tests, builds, browsers or agents.

## Ranked defects

**1. Medium: Review moves focus to connection details that can be off-screen.** `src/components/ai-connection-manager.tsx:245`, with the details list at `:726`.
- **Trigger:** clicking "Review" in the matrix focuses the details heading with `preventScroll: true`. The details list sits below the whole matrix.
- **Impact:** on a phone, or with more than two or three connections, the details open below the visible area and the page does not move. To a sighted user Review appears to do nothing, while keyboard focus has gone off-screen. The Revoke path does scroll, because the confirm button's `focus()` has no `preventScroll`.
- **Fix:** drop `preventScroll`, or call `scrollIntoView({block:"start"})` on the list item and give it a `scroll-margin-top` the height of the sticky tab strip. Alternatively, show the details right after the matching row.

**2. Medium: revoking puts focus straight on the irreversible "Yes, revoke it" button.** `ai-connection-manager.tsx:248` and `:873`; the matrix trigger is at `ai-permissions-matrix.tsx:581`.
- **Trigger:** pressing Enter on the matrix Revoke icon, or on "Revoke this connection", moves focus to "Yes, revoke it" in the same commit.
- **Impact:** holding Enter past the key-repeat delay, or a double activation, revokes the grant. Restoring it means approving a new grant and signing in again. The accessibility guidance for destructive confirmations is to focus the least destructive choice.
- **Fix:** focus the confirmation text instead (a `tabIndex={-1}` region labelled by its sentence), or focus "Keep it". Update the `toHaveFocus` assertion in `tests/unit/ai-connection-manager-component.test.tsx`.

**3. Low: a reverted measurement can leave a stale confidence in the "Measurement source" card.** `src/components/item-detail-sheet.tsx:567-582`, setters at `:658/666/671/679`, display at `:1608-1620`.
- **Trigger:** confidence values were correctly removed from the unsaved-changes check, since they never save directly. But typing a value still sets the displayed confidence to "manual" or "actual", and reverting the value does not restore it.
- **Impact:** for an item with no recorded measurement source, the card shows "manual" or "actual" while the form reports no unsaved changes. Nothing wrong is saved; the display is just untruthful.
- **Fix:** while values match the saved item, show the saved item's confidence, or restore it on revert.

**4. Low: the offline fixture silently answers unlisted queries with `[]`.** `design-council/tools/offline-fixture.ts:109`.
- **Trigger:** queries with no fixture entry fall through to the default. That includes `photos.listForMove`, `apiKeys.listForHousehold`, `movePeople.listForMove`, `moveSpaces.listForMove` and `transportResources.listForMoveWithZones`.
- **Impact:** captures will show empty states (no photos, no API keys) that the provenance file does not mention.
- **Fix:** record unlisted query names in `window.__fixtureUnknownQueries` and write them into `provenance.json`.
- **Related provenance gaps** (`build-offline-components.mjs:23,44-46`):
  - The dirty check skips `convex/` and the lockfile.
  - "real Geist" is actually the Latin-only Geist copy shipped with Next's devtools. The app's `next/font` fallback metrics are not reproduced; say so.

**5. Low: two status messages appear and announce at the same moment, so screen readers may skip them.** `collection-view-tabs.tsx:119` and `ai-connection-manager.tsx:364`. The `role="status"` element is created together with its text. The item sheet in this same diff (`item-detail-sheet.tsx:1043`) already uses the right pattern: an always-present status region whose content changes.

**6. Low: heading levels skip from h1 to h3.** `src/app/(product)/settings/ai/page.tsx:13` became an h1, but the manager's sections are still h3, with h4 inside. Make the sections h2 and the details h3.

**7. Low: the matrix's table structure is fragile.** `ai-permissions-matrix.tsx:555-585`.
- The `<caption>` comes after `<tbody>`; HTML requires it first. Move it first and use `caption-side: bottom` on phones.
- On phones, rows and cells use block, grid or flex display. Only `<table>` has an explicit role, so WebKit can drop the row and cell roles. Add `role="row"`, `"rowheader"` and `"cell"`.
- Column header names become "About …" because the header buttons carry that aria-label.

**8. Low: the Review button claims to expand but never collapses.** `ai-permissions-matrix.tsx:581`. It has `aria-expanded`, but clicking it again neither closes the details nor re-focuses them. Make it a real toggle or drop `aria-expanded`.

**9. Low: the "Recent refused request · see Activity" mark is not a control.** `ai-permissions-matrix.tsx:572`. Pass an `onOpenActivity` callback and make it a link-style button.

**10. Low: the Connections count is unqualified.** `ai-connection-manager.tsx:227`. The server's `listMine` returns at most 40 grants (`convex/aiGrants.ts:522`), while the Activity count already says "latest loaded". Qualify the Connections count when it reaches 40.

**11. Nit: tap targets shrink between 640 and 767px.** `ai-connection-manager.tsx:363`. The wrapper rule `sm:[&_button]:min-h-8` overrides the matrix's own `min-h-11 md:min-h-8`, so the phone card layout gets 32px targets at those widths. Change the wrapper to `md:` or remove it.

## Retention

- **Seven sections are kept:** Setup, Approve, Connections, Activity, Boundaries, API keys and Manual. I checked the Radix tabs source (`index.mjs:157-173`): with `forceMount`, all children stay rendered and the passed `hidden` overrides Radix's own. Unfinished Approve drafts and the API key manager's state therefore survive switching sections. The Approve form's state lives in the parent anyway.
- **Every connection field and action is still reachable** behind Review: reported client name, registration method, moves, approved, expires, last used, use count, revoked, approved wording, note, and revoke with its named confirmation. The approved-wording list now also shows what each ability allows.
- **API keys moved from a collapsed `<details>` into its own section,** so they are more visible, not less. The new empty-state copy corrects an earlier overclaim.
- **The missing "pencil editor" is correct.** `convex/aiGrants.ts` only exposes approve and revoke to the person, so no editor was invented.
- **Collections:** all built-in views are kept. Saved views gain update, rename and named delete, with a session-only fallback when browser storage is refused. Built-in baselines are fixed when a view is selected. The fixed baseline waits until stored presentation preferences have loaded, so there is no false modified mark on load. Column normalization only drops explicit `true` values for columns outside the defaults; with TanStack treating a missing column as visible, the table renders the same either way. The filter button reads "Filter" with an add icon; its accessible name is "Add filter".
- **The related-history message** is now an always-present live region outside the tab panels, and its "Open related update" link is kept.
- **No backend, schema or access changes:** nothing under `convex/` is in the diff.

## Offline evidence boundary

- **No app auth bypass:** the Clerk and Convex substitutes exist only inside the esbuild bundle written to the gitignored `/output`. The Clerk stub exports only `useAuth`, so any other Clerk import fails the build rather than slipping through.
- **No network:** the page's security policy sets `connect-src 'none'` and `default-src 'none'`.
- **Writes are refused:** mutations and actions both throw and increment a counter.
- **No real data:** every fixture record is fictional and labelled "[synthetic]".
- **Not yet verified:** whether `script-src 'self'` allows the bundle to load when the page is opened from a `file://` URL. Only a build will tell.

```json
{
  "exactHead": "5da80247cd768f745b838584098d9e11c54cb772",
  "implementationBase": "a7185089b824024195caa537683449bc8d59933e",
  "authorModel": "Codex gpt-6.1-sol high",
  "reviewerModel": "claude-opus-5-5",
  "blindLabel": "U",
  "evidenceType": "source-only",
  "sourceRubric": {
    "correctness": 8,
    "capabilityRetention": 9.5,
    "truthfulCapabilities": 8.5,
    "accessibilityFocusSemantics": 6.5,
    "phoneStructureSource": 7.5,
    "confirmationSemantics": 7,
    "collectionViewsCrudFallbackBaseline": 8.5,
    "offlineEvidenceBoundary": 8,
    "testCoverage": 8
  },
  "overallSourceScore": 7.9,
  "disposition": "approve-with-fixes (source only)",
  "blockers": [],
  "shouldFixBeforeCapture": [
    "Review focus uses preventScroll on details rendered below the matrix (ai-connection-manager.tsx:245)",
    "Revoke moves focus directly to the irreversible confirm button (ai-connection-manager.tsx:248, :873)"
  ],
  "lowFindings": 9,
  "backendSchemaAccessChanged": false,
  "filesChanged": false,
  "visual": {
    "renderedPolish": null,
    "responsiveRendering": null,
    "authenticatedShell": null,
    "print": null,
    "wholeSiteTaste": null,
    "darkMode": null,
    "note": "Harness not built or captured; no aesthetic approval from unrendered source. Scott overrides; Opus is final AI tastemaker once visual evidence exists."
  },
  "checksRerun": false
}
```

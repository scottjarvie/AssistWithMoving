# Candidate W: source-only review

**HEAD:** `82bf06a211486f81f749dfeab195c452ab4ebe55`. I confirmed it at the start and end of the review, and the tree was clean both times. Base is `e39a165`. Reviewer model is Claude Opus 5.5 (`claude-opus-5-5`). Author model is Codex gpt-6.1-sol high.

I made no edits and ran no tests, builds, browsers or agents. I read the diff, the fix record and the files listed in the brief. I did not read `scores.json`, the other reviews, `STATUS.md` or any gallery.

"Verified" below means I read it in the source. "Inferred" means it is a likely runtime effect that no one has seen yet.

## Defects, most serious first

**1. Medium (evidence integrity): a capture can be paired with an offline bundle from a different commit.** `capture-offline-components.mjs:18-21`
- **Verified:** the runner records `runnerHead`, `runnerDirty` and a hash of the runner script itself. It never checks that `runnerHead` matches the bundle's `provenance.sourceHead`. `runnerDirty` only looks at `design-council/tools`. Nothing hashes the bundle files (`components.js` / `index.html`).
- **Trigger:** run `build-offline-components` at one commit, commit more source changes, then run the capture.
- **Impact:** the evidence says the new head, but the images come from older code. The result still says `passed`.
- **Fix:**
  - Assert `source.sourceHead === runnerHead`, `!source.sourceDirty` and `!runnerDirty`, and also check `src`/`convex` in the runner's dirty check.
  - Add SHA-256 hashes of `components.js` and `index.html` to the evidence.

**2. Medium (phone view strip): the selected view can sit off-screen.** `globals.css:234` and `collection-view-tabs.tsx:108`
- **Verified:** `.moving-view-items` sets `grid-auto-columns: 100cqw`, so a phone shows exactly one view name at a time. The selected view is only scrolled into view when the Views chooser closes (line 108).
- **Trigger:** a saved selection that isn't the first view, or a selection changed by code (Discard, Save as, restoring from storage).
- **Impact (inferred):** the strip shows a view that isn't selected. The current view's name and its "modified" dot are hidden on phone.
- **Fix:** add an effect on `selected?.id` that scrolls only the strip sideways (set the strip's `scrollLeft` to the trigger's `offsetLeft`).

**3. Medium-low: the section strip's scroll can move the whole page.** `move-workspace-tab-list.tsx:52-54, 102`
- **Verified:** `scrollIntoView({block:"nearest"})` runs on mount and whenever `activeValue` changes. It scrolls every scrollable parent, including the page, up and down as well as sideways.
- **Trigger:** a strip that isn't sticky and is outside the viewport when it mounts or changes. Examples: the inventory task tabs, settings sub-panels or the Item sheet after back-navigation restores the scroll position, or a tab chosen from the URL hash.
- **Impact (inferred):** the page jumps, which fights scroll restoration and anchor links.
- **Fix:** scroll only the strip sideways (`strip.scrollTo({left})`), and skip the scroll on first mount unless the tab came from a user action.

**4. Low-medium (test gaps): the new tests don't cover several claimed behaviours.**
- `moving-section-contents.test.tsx:17` covers only uncontrolled Tabs with manual activation. It does fail on the old code, so it is a real test. Missing:
  - a controlled `value` + `onValueChange` spy;
  - nested Tabs, checking that choosing in the inner chooser leaves the outer value unchanged.
- `collection-presentation.test.tsx:23` sets `innerWidth=390`, but jsdom does not apply `md:hidden`. So the test proves the Options sheet logic, not that the controls switch at the phone breakpoint. It also doesn't check that every column and description appears in the sheet.
- Whether the row checkbox reads `aria-checked=true` after typing "Lamp" depends on the fixture's row order. I couldn't confirm it without running the test.

**5. Low (capture probes under-assert the fix record's claims).** `capture-offline-components.mjs:134-155`
- Verified gaps:
  - `labels.length > 1` instead of the expected count for each route, and links aren't checked for uniqueness.
  - Only the last Contents link is clicked.
  - Nothing checks that the desktop Contents stays sticky, although the fix record claims it.
  - Nothing checks that the visual sits inside the "Guide context" aside.
- The page-position check (`y` between -1 and 1000 in a 1000px-tall viewport) is sound; I don't consider it a false positive.
- **Fix:**
  - Assert the per-route counts and that hrefs are unique.
  - On desktop, scroll by about 1500px, then check that the Contents `nav` sits about 16px from the top.
  - Check that the visual's element is inside the aside.

**6. Low (Tabs wrapper).** `ui/tabs.tsx:21-26`
- Every Tabs is now controlled internally. This is fine for existing behaviour; Radix also skips a change to the same value, so the early return matches it.
- `select` is rebuilt on every render, so the context value changes every time. Wrap it in `useCallback`.
- If a caller switches from controlled to uncontrolled, the tab falls back to an outdated `localValue`. This is an edge case.
- Nested Tabs resolve correctly. `rg` found no raw use of `TabsPrimitive.Root` outside the wrapper, so the selection context and Radix's own context always come from the same element.

**7. Low (public reader).** `public-page-chrome.tsx:145-146`
- **Verified:** the aside has `border-t`, and its first child adds another `border-t pt-4`, giving a doubled rule on desktop.
- Several bands have a Contents label but no heading. Examples: AI "Connection principles", "Workspace features" and the other card-grid bands. Clicking those links lands on a `<section>` with no name.
- **Fix:** give each `PublicBand` an `aria-label` or a visually hidden heading built from its `label`.

**8. Info (inventory).** The status cell now shows only `InlineSelectCell`; the colour of `StatusBadge` is gone. Check that "missing" and "damaged" still stand out in the table, either in Indicators or in the select's styling.

## Preservation

| Item | Status | Where |
|---|---|---|
| Clear filters | Still available | `inventory-table.tsx:1216-1220, 1248` |
| Add and Bulk paste | Reached through the named task tabs | `inventory-table.tsx:1136` |
| Review flag when its column is hidden | Behaves consistently, because cards render the visible cells and the flag is filtered on `getIsVisible()` | `data-table.tsx:670` |
| Group and reversible Sort on phone | Kept on the main bar | |
| Phone Options | Holds Table/List/Grid, density, and each column with its description; works on the same mounted table | |
| Exact timestamps | Kept in a popover and in `dateTime` | |
| Single history kind | Gets filter chips | |
| AI glyph and Revoke label | Corrected | |
| Ten real routes | All have a label and a stable ID; no unlabelled `PublicBand` remains (grep); expected counts match the test | |
| DOM order | Contents, then article, then aside | |
| Sticky desktop Contents | Present in source | `lg:sticky lg:top-4` |
| Public header | Not sticky | |

I found no feature removed.

## Offline fixture

- **next/image shim:** refuses any image other than `/icon.svg` and embeds the exact SVG locally. This fits `BrandMark`, its only user.
- **Substitutes:** the query, auth and navigation stand-ins are confined to the esbuild namespace for the separate output folder. No app auth code changed.
- **Links:** the fragment exemption only allows `#id` links that point at an element that exists. `next/link` stand-ins become `href="#"` (length 1), so they are still blocked. Both `click` and `auxclick` are caught.
- **Network:** blocked by the page's CSP plus an HTTP(S) block in the browser context.
- **Writes:** must be zero; mutations and actions are refused.
- **Disclosures:** the zero header offset and the Latin devtools fonts are both stated.
- **New images:** saved to `06-pattern-fixes`. The old evidence is annotated as `actualSurface: "Setup"`, not accepted as the approval form.
- I found no bypass, and no probe that passes falsely. The one real problem is the metadata pairing in defect 1.

## mcp-media-ingress fixture

- This is a test-only change; the production policy in `mcp-server/media-ingress.mjs` is unchanged.
- The key new check is meaningful: a regular file reached through a junction or directory symlink must fail with the error saying it resolves outside the allowed roots. That error can only come from comparing real paths, not from `lstat`.
- The alias itself is refused under either classification (link or directory). The refusal is what matters, so this is fine.
- Platform risks:
  - On Windows, `/dev/zero` only tests a missing path, so the device check is really POSIX-only.
  - Rejecting a direct file symlink is not covered on Windows.
  - If the cleanup guard throws, it would hide the original assertion failure. In practice that can't happen.
- `fs.rm` removes junctions without following them. The fixture's "verified cleanup" is a guard on the path; nothing confirms the directory is gone afterwards.
- The coverage ledger and briefs are planning documents only.

## Scores (source only)

| Area | Score |
|---|---|
| Preservation | 8.5 |
| Correctness | 7.5 |
| Accessibility and semantics | 7.5 |
| Test meaningfulness | 6.5 |
| Evidence integrity | 6.5 |
| Scope discipline | 8.5 |
| **Overall** | **7.5** |

**Disposition:** acceptable as source with corrections. Nothing blocks source acceptance. Defect 1 should be fixed before the planned captures count as evidence.

Runtime, responsive rendering, print and taste all remain null. I make no claim about the whole site.

```json
{
  "authorModel": "codex gpt-6.1-sol high",
  "reviewerModel": "claude-opus-5-5",
  "blindLabel": "W",
  "head": "82bf06a211486f81f749dfeab195c452ab4ebe55",
  "base": "e39a165b7a5dba04dad3caa0026a1dcbd6bad251",
  "evidenceType": "source-only",
  "sourceRubric": {"preservation": 8.5, "correctness": 7.5, "accessibilitySemantics": 7.5, "testMeaningfulness": 6.5, "evidenceIntegrity": 6.5, "scopeDiscipline": 8.5, "overall": 7.5},
  "runtime": null, "responsive": null, "print": null, "taste": null,
  "blockers": [],
  "preCaptureRequired": ["Capture runner must assert provenance.sourceHead===runnerHead, a clean src/convex/tools tree, and hash the bundle (capture-offline-components.mjs:18-21)"],
  "findings": [
    {"rank": 1, "severity": "medium", "file": "design-council/tools/capture-offline-components.mjs", "line": 18, "summary": "Bundle and runner head are not cross-checked; a capture can be paired with a stale bundle"},
    {"rank": 2, "severity": "medium", "file": "src/components/collection-view-tabs.tsx", "line": 108, "summary": "Phone strip shows one view at a time but only reveals the selected view after the chooser closes"},
    {"rank": 3, "severity": "medium-low", "file": "src/components/move-workspace-tab-list.tsx", "line": 53, "summary": "scrollIntoView on mount and on value change can scroll the whole page vertically"},
    {"rank": 4, "severity": "low-medium", "file": "tests/unit/moving-section-contents.test.tsx", "line": 17, "summary": "No controlled or nested Tabs test; phone Options test cannot prove CSS breakpoint switching"},
    {"rank": 5, "severity": "low", "file": "design-council/tools/capture-offline-components.mjs", "line": 140, "summary": "Reader probes do not assert route counts, uniqueness, sticky Contents or visual placement"},
    {"rank": 6, "severity": "low", "file": "src/components/ui/tabs.tsx", "line": 22, "summary": "select is not memoized; stale localValue on controlled-to-uncontrolled switch"},
    {"rank": 7, "severity": "low", "file": "src/components/public-page-chrome.tsx", "line": 146, "summary": "Doubled top border; Contents targets without headings have no accessible name"},
    {"rank": 8, "severity": "info", "file": "src/components/inventory-table.tsx", "line": 920, "summary": "Status colour semantics dropped from the status cell"}
  ],
  "limits": ["No TypeScript, lint, tests, build or browser run at this head", "Existing PNGs ignored; they show older source", "New tests and capture runner are unexecuted", "Authenticated shell, print, spatial/load/move-day families and whole-site acceptance not covered", "Scott overrides; Opus is final tastemaker once visual evidence exists"],
  "filesChanged": false
}
```

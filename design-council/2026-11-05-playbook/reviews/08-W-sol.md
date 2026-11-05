Candidate **W: request changes to evidence tooling; withhold acceptance**.

Reviewed only committed changes from `e39a165b7a5dba04dad3caa0026a1dcbd6bad251` to **`82bf06a211486f81f749dfeab195c452ab4ebe55`**. HEAD, branch, and clean tree matched at both start and end. No files changed or prohibited processes run.

1. **P2 — Phone capture queries controls that are now hidden.**  
   [capture-offline-components.mjs:109](/C:/Users/accou/.t3/worktrees/AssistWithMoving/design-assistwithmoving-d3ead6c9063dcef0/design-council/tools/capture-offline-components.mjs:109), repeated at line 119.

   **Trigger:** Run the 390px Inventory capture with Options closed. The runner queries the accessible “List” button, but the toolbar group now has `hidden md:inline-flex`; the sheet’s buttons are unmounted while closed.

   **Impact:** Source indicates these queries will time out, preventing completion of the phone probes and subsequent reader captures. This is an inferred execution failure, not an observed run.

   **Fix:** Open Options and scope the selected-view assertion to its dialog, then close it before capturing. Repeat after Discard, and also assert the rendered List surface.

2. **P2 — Reader navigation probe can pass without navigation.**  
   [capture-offline-components.mjs:149](/C:/Users/accou/.t3/worktrees/AssistWithMoving/design-assistwithmoving-d3ead6c9063dcef0/design-council/tools/capture-offline-components.mjs:149).

   **Trigger:** The last section already begins within the viewport before its Contents link is clicked.

   **Impact:** Its bounding box satisfies the assertion even if fragment navigation is prevented. The recorded claim of successful local navigation would exceed the proof. Only the final destination is exercised.

   **Fix:** Assert the resulting URL hash matches the destination, establish a distinct initial scroll position, and verify the target’s resulting visibility. Exercise every Contents destination, including keyboard activation where claimed.

3. **P2 — Exact-head metadata is recorded but not enforced.**  
   [capture-offline-components.mjs:17](/C:/Users/accou/.t3/worktrees/AssistWithMoving/design-assistwithmoving-d3ead6c9063dcef0/design-council/tools/capture-offline-components.mjs:17).

   **Trigger:** Invoke the current runner against an older `output/moving-council` bundle.

   **Impact:** The runner can report `result: "passed"` with different `sourceHead` and `runnerHead`. The separate fields disclose the mismatch, but nothing prevents stale artifacts from receiving a passing result.

   **Fix:** For frozen-candidate evidence, fail before launching Chromium unless the bundle’s source HEAD matches the expected candidate and its source is clean. Hash the generated HTML/bundle and include those hashes alongside the runner hash.

Preservation is broadly supported **in source**: Add and Bulk paste retain their named tabs and original workflows; comparison cells retain editable Status/Disposition controls; selections, search and table state remain outside the new Options sheet. The five disposition groups wrap. Record kind chips, semantic exact timestamps and metadata timestamps are present. The ten actual reader routes retain article content and supplied visuals while adding explicit labels, IDs and the requested DOM order.

Two bounded gaps remain:

- Inventory’s existing custom List/Grid cards do not consume table column visibility. The new Options test uses the generic collection renderer and checks the reopened checkbox, not the resulting field visibility. It does not establish Inventory consumer completeness. This is a retained integration limitation, not a newly introduced card regression.
- The Tabs context correctly supplies explicit selection to the nearest provider. Controlled and uncontrolled selection paths appear sound; nested providers should isolate setters. However, uncontrolled chooser highlighting/descriptions still depend on the separately supplied `activeValue`. The new manual-activation test covers panel selection and returned focus, but not nested isolation, controlled refusal, or reopened chooser selection state.

The offline substitutions remain confined to the separate bundle; no application authentication change appears in this diff. Actual route imports, local SVG embedding, mutation/action refusal, CSP, HTTP request interception, fragment exceptions, zero authenticated-header offset and Latin devtools-font limitations are explicit. The Approve probe now asserts both selected state and visible form. Historical evidence correctly identifies its Setup image limitation, and new captures target `06-pattern-fixes`. These are source facts—not executed guard or rendering proof.

The media-ingress fixture correction is reasonable and preserves meaningful security assertions: a regular child reached through a directory alias must still fail canonical-root containment; alias rejection and POSIX direct-file-symlink rejection remain. Production policy is unchanged. Windows junction support remains a platform dependency. On Windows, `/dev/zero` normally exercises missing-file rejection rather than actual device rejection. Cleanup is constrained in source and awaited; successful cleanup has not been observed at this HEAD.

```json
{
  "authorModel": "Codex gpt-6.1-sol high",
  "reviewerModel": "Codex gpt-6.1-sol high",
  "blindLabel": "W",
  "evidenceType": "SOURCE_ONLY",
  "base": "e39a165b7a5dba04dad3caa0026a1dcbd6bad251",
  "head": "82bf06a211486f81f749dfeab195c452ab4ebe55",
  "branch": "design/assistwithmoving-council-2026-11-05",
  "cleanTreeStart": true,
  "cleanTreeEnd": true,
  "sourceRubric": {
    "scale": "0–10; higher is stronger source support, not runtime acceptance",
    "preservation": 8,
    "stateAndFocus": 8,
    "semanticStructure": 8,
    "testCoverage": 7,
    "evidenceTooling": 6,
    "overallSource": 7.4,
    "runtime": null,
    "responsiveRendering": null,
    "print": null,
    "taste": null
  },
  "blockers": [
    "Closed-Options List queries block the phone capture sequence",
    "Reader navigation assertion permits a false positive",
    "Capture preflight does not reject mismatched bundle and candidate heads"
  ],
  "disposition": "Request evidence-tool corrections; withhold acceptance",
  "limits": [
    "No TypeScript, tests, lint, build, browser or fixture execution performed",
    "Reported syntax and diff checks were not independently rerun",
    "Existing PNGs were not used for current visual claims",
    "Fresh captures remain blocked by host coordination, not passed",
    "Same-model review does not satisfy the different-model review gate",
    "Many page families and spatial/load/move-day studies remain unfinished",
    "Authenticated-shell, full-check and print proof remain outstanding",
    "No whole-site acceptance; Scott overrides and Opus retains final AI taste judgment once visual evidence exists"
  ],
  "filesChanged": false
}
```

Candidate U needs two bounded fixes. HEAD matched `5da80247cd768f745b838584098d9e11c54cb772` at start and end; the worktree remained clean.

1. **P2 — Review can move focus outside the visible viewport.**  
   Connection details render after the entire matrix, but the review effect focuses their heading with `preventScroll: true`. When those details are below the viewport, Review reveals them without bringing them into view, leaving keyboard focus offscreen.  
   Source: [ai-connection-manager.tsx:245](C:/Users/accou/.t3/worktrees/AssistWithMoving/design-assistwithmoving-d3ead6c9063dcef0/src/components/ai-connection-manager.tsx:245).  
   **Fix:** allow normal focus scrolling or explicitly scroll the revealed detail into view. This is a source-derived behavior, not a rendered observation.

2. **P2 — The offline navigation boundary remains escapable.**  
   The `next/link` shim produces ordinary navigable anchors. Clicking retained links such as API docs leaves the fixture and, when served over HTTP, issues a navigation request. `connect-src 'none'` does not block document navigation. This weakens the stated offline boundary; it does not bypass application authentication.  
   Source: [build-offline-components.mjs:21](C:/Users/accou/.t3/worktrees/AssistWithMoving/design-assistwithmoving-d3ead6c9063dcef0/design-council/tools/build-offline-components.mjs:21).  
   **Fix:** intercept fixture link navigation and show an explicit local “destination outside this fixture” notice.

Retention is otherwise sound in the reviewed source. All seven AI sections and existing fields/actions remain reachable; mounted panels preserve drafts. The matrix uses server abilities and grant scopes, distinguishes expired/revoked approvals, preserves consent wording, and retains named revocation confirmation. Saved views retain create/apply/update/rename/delete operations, session fallback, fixed built-in baselines, and implicit-column normalization. Measurement reversion and the persistent related-history live region match their intended source behavior.

No backend, schema, application-authentication, or access-policy changes appear in the diff. The harness’s auth/query substitutions are confined to its separate bundle, and mutation/action shims reject calls. Its provenance explicitly disclaims authenticated-shell and live-data proof. The fixture supplies only two abilities, so it cannot establish five-column matrix rendering.

Reported checks were accepted without rerunning them: TypeScript, focused lint, and seven affected suites/59 tests passed. The reported full suite remains **not green**: Windows symlink EPERM and a load-planner timeout, although the latter subsequently passed in isolation.

```json
{
  "exactHead": "5da80247cd768f745b838584098d9e11c54cb772",
  "implementationBase": "a7185089b824024195caa537683449bc8d59933e",
  "authorModel": "Codex gpt-6.1-sol high",
  "reviewerModel": "Codex gpt-6.1-sol high",
  "blindLabel": "U",
  "evidenceType": "source-only",
  "headVerifiedAtStartAndEnd": true,
  "filesChanged": false,
  "differentModelReview": false,
  "sourceRubric": {
    "scale": "0-10; reviewer-defined source assessment only",
    "permissionAndCapabilityTruth": 9,
    "actionFieldAndDraftRetention": 9,
    "collectionViewState": 9,
    "accessibilityAndFocusStructure": 7,
    "measurementAndHistoryState": 9,
    "offlineEvidenceBoundary": 7
  },
  "overallSourceScore": 8.3,
  "disposition": "revise",
  "blockers": [
    "U1: reveal reviewed connection details within the viewport",
    "U2: prevent navigation outside the offline fixture"
  ],
  "backendSchemaAccessChanges": false,
  "validation": {
    "testsBuildNextBrowserRunByReviewer": false,
    "reportedAffectedChecks": "passed",
    "reportedFullSuite": "not green",
    "harnessBuiltOrCaptured": false
  },
  "visualLimits": {
    "renderedPolish": null,
    "responsiveRendering": null,
    "renderedAccessibility": null,
    "authenticatedShell": null,
    "print": null,
    "wholeSiteTaste": null,
    "aestheticApproval": null,
    "previousHomeScreenshotsUsed": false
  },
  "authority": "Scott overrides; Opus is final AI tastemaker once visual evidence exists."
}
```

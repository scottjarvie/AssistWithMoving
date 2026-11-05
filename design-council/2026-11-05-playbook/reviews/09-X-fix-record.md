# Candidate X correction record

Independent review: `a8d4cf9780214cc06bca1690dbac7cb4829f9097`, base `61a0d709234d737c319dbb7f2e824f551929057f`. Author and reviewer: Codex gpt-6.1-sol high; independent context, same model. Original source-only verdict **changes requested** is preserved verbatim in `09-X-sol.md` and scores.json. No numerical score was supplied, so none is invented.

## Corrections implemented in source

1. **Filtered empty-state truth.** QueueCollection derives one client-filter predicate for both removable controls and the empty headline. Search/facets, excluded loaded records, or remaining older pages use “No matching loaded records.” “Nothing needs you” and “No completed handoffs yet” are reserved for unfiltered, exhausted emptiness of those views.
2. **Pending-save focus lifetime.** Every explicit composer opening/dismissal advances a lifetime and clears the previous focus target. A submitted save captures that lifetime and its exact draft. Success closes/targets Search only when the submitting lifetime is still current. A late result after dismissal records the success and clears only the submitted draft; it neither closes a newer opening nor installs a future close target. Ordinary dismissal returns to Add handoff.

## Written regression additions — not executed

- Unmatched searches in Needs You and All Done retain the accurate filtered headline.
- A retained zero-match facet does not claim an empty Queue, and removing the last facet while older pages remain still avoids that global claim.
- Deferred save → dismiss → resolve → reopen → ordinary close restores Add handoff focus.
- Deferred save → dismiss → reopen → resolve leaves the newer dialog open and its subsequent close restores Add handoff focus.
- The existing successful-save Search-focus and rejected-save/draft tests remain.

No current TypeScript, Vitest, lint, build, browser, capture, fixture build, install, Convex runtime or account/network action was admitted or run. Only source reads/edits and git diff --check were used. Last executed green full suite remains 61a0d70: 222 files /1,396 tests. These fixes are not independently re-reviewed or behaviorally accepted.

No new judge was started; the single fresh review requested for this useful cut is complete. No repeated same-head review, timer or automatic wake was created. HOST/SITE claims remain NONE/yielded. Different-model acceptance, Opus/Scott taste, current-head checks/capability probes and actual desktop/phone/keyboard/print evidence remain outstanding. Many page families and uncovered-family studies remain unfinished. No push, PR, merge or deploy.

**Candidate X: changes requested, source-only.**

1. **[P2] Filtered results can falsely report an empty Queue.** At [queue-collection.tsx:87](C:/Users/accou/.t3/worktrees/AssistWithMoving/design-assistwithmoving-d3ead6c9063dcef0/src/components/queue-collection.tsx:87), the empty headline depends only on the selected view. With real Needs You items loaded, entering an unmatched search produces “Nothing needs you”; All Done similarly reports “No completed handoffs yet.” This misstates the underlying work. Use “No matching loaded records” when filters exclude existing records, and reserve empty-Queue claims for unfiltered emptiness. Source-observed logic; rendered behavior inferred, not executed.

2. **[P2] Closing during a pending save leaves stale focus state.** At [queue-experience.tsx:623](C:/Users/accou/.t3/worktrees/AssistWithMoving/design-assistwithmoving-d3ead6c9063dcef0/src/components/queue-experience.tsx:623), success sets `savedComposer.current`, which only `onCloseAutoFocus` clears. Closing remains enabled while saving. If the dialog finishes closing before the request succeeds, no subsequent close callback consumes that flag. The next ordinary composer close incorrectly focuses Search instead of Add handoff. Scope the flag to the current dialog lifetime and handle success after dismissal explicitly. Add a deferred-save regression covering close → resolve → reopen → close. Source-observed lifecycle; focus outcome inferred, not browser-verified.

The reviewed source preserves the three paginated reads, owner-readiness gate, deduplication, older paging, activity access, mutation arguments and error handling. Completion mapping and manual week refresh are explicit. Static reading identified no definite compile error. Written tests cover useful consumer behavior but do not cover these two triggers; they remain unexecuted.

```yaml
blindLabel: X
exactHead: a8d4cf9780214cc06bca1690dbac7cb4829f9097
base: 61a0d709234d737c319dbb7f2e824f551929057f
branch: design/assistwithmoving-council-2026-11-05
authorModel: Codex gpt-6.1-sol, high (recorded)
reviewerModel: Codex gpt-6.1-sol, high (actual)
rubric: source-only correctness, preservation, contracts, snapshots, drafts, focus, written regressions
disposition: changes_requested
cleanTreeStart: true
cleanTreeEnd: true
filesChanged: false
checksRun: false
visual: null
responsive: null
print: null
finalTaste: null
```

This independent **same-model** review does not satisfy the different-model gate. Different-model acceptance, Opus/Scott taste decisions, current-head native checks and capability probes, and authenticated desktop/phone/keyboard/print proof remain open under actual HOST/SITE admission. Historical **222 files / 1,396 tests** applies only to `61a0d70`.

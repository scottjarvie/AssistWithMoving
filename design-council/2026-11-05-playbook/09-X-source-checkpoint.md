# Candidate X — Queue collection integration (source checkpoint)

Author: Codex gpt-6.1-sol, high. Source batch resumed from c92ea37 under Scott/Vin Chief's explicit source-yield lift. No HOST or SITE runtime admission was taken. This record describes implementation and written tests, not executed behavior or design acceptance.

## Resulting source

- Both existing Queue routes still use QueueExperience and QueueDesk. The shared collection is now wired into QueueDesk.
- Six real views project the same four stored/effective states: Needs You, Waiting for your AI, Working, Done this week, Everything, All Done. Everything omits the existing optional state argument; Done this week requests Done and filters recorded completion dates locally. No fifth state, new endpoint or authority is introduced.
- All three paginated reads, current/delegated owner resolution, deduplication, state discovery paging, older handoff/capture buttons, connection explanation and selected canonical activity remain. Canonical completion dates are mapped; capture completion stays unknown, never inferred from updatedAt.
- The collection adds search over real text, four counted facets, removable chips, clear, state/kind grouping, reversible sorting, Table/List/Grid, density, table columns and named browser-local view CRUD. Preferences and named views are scoped by household/move/owner. Owner filters use IDs, so similarly named people are not merged; Owner is not offered as a grouping category.
- Answer drafts remain above the collection and thread. A stable contextual field handles Table and card answers without recreating the cell renderer on every keystroke. Capture adapters retain their capture-workspace flow. Exact item/version, owner, idempotency, cancellation and error/toast paths remain in the existing controller.
- A compact Add handoff opens a labelled dialog. Its direction draft survives closing and refused saves. The complete guidance and save target remain one labelled step away. Successful save returns focus to Search; ordinary close returns to Add handoff.
- A successful answer/cancel focuses persistent Search. Closing a thread otherwise returns to the connected opener, with Search as fallback. Full thread context, activity, result references, saved-work/capture links and cancel action remain.
- Done this week starts Monday in the browser time zone. The evaluation time is disclosed; selecting the view or pressing Refresh week updates it. No midnight timer is introduced, and no automatic freshness claim is made. Undated and older terminal records remain in All Done/Everything.
- Shared selected-view support and initial-group support were saved at c92ea37 and are included in the requested review cut. They retain existing defaults for other consumers. Implicit-visible columns are normalized in Queue snapshots.

## Preservation of other authors' work

No changes to convex/, schema, permissions, consent wording, grant setup/revocation, package/dependency files, install hooks, generated API, environment bindings or any other worktree. The #234 source clone and #239 hook work remain untouched. The new Queue reads call existing functions with their existing owner/access resolution; existing mutation bodies remain byte-for-byte apart from surrounding UI integration. No push, PR, merge or deployment.

## Written regression work — NOT RUN

- Existing Queue card/thread assertions updated for explicit List choice, six real views and the labelled composer; four stored states and every original workflow remain tested.
- New actual Queue consumer cases cover Table input identity/focus/exact version, composer close/refusal/save, Everything and both older-page callbacks, presentation-only Discard, named view restoration after remount, owner-scope draft retention, Options presentation changes plus counted facets, and disclosed completion-window refresh.
- Pure view tests cover Monday/Sunday/undated/future completion dates, Everything's optional state and strict saved-view validation.
- A new controller harness checks all three query arguments, the existing scope-readiness skip, true versus unknown completion dates, and exact existing mutation owner/item/version/idempotency arguments. It does not claim real authentication, backend execution or subscription proof.
- One source-contract assertion now checks state: requestedState instead of the old state: activeState spelling. Production access/security assertions are not weakened.

No TypeScript, Vitest, lint, build, browser, Next, capture, fixture build, install, Convex runtime or account/network actions were run for this batch. git diff --check passed. Last executed green full suite remains **61a0d70: 222 files /1,396 tests**, and applies only to that checkpoint.

## Review and remaining proof

One fresh independent source review is requested for the useful cut after 61a0d70, including c92ea37's previously unwired/shared additions. The reviewer must report actual model, exact head and source-only limits. No repeated same-head review or new taste score is requested. A same-model independent Codex review does not satisfy the final different-model or Opus taste gates.

HOST remains NONE; SITE remains yielded under the existing priority hold. Native verification and new visual evidence require actual admission. The historical gallery is preserved; no fabricated Queue image or new visual round is added. Many other page families, the uncovered spatial/load/move-day studies, full current checks, authenticated/phone/print evidence, different-model acceptance and Scott's picks remain unfinished.

## Independent source result and bounded corrections

X returned changes requested at a8d4cf9: misleading filtered-empty headlines and a pending-save/dismiss/reopen focus race. Both are corrected in source with additional written regressions, not run or re-reviewed. The original exact-head verdict and same-model limits remain in reviews/09-X-sol.md and scores.json; details are in reviews/09-X-fix-record.md. No new review or runtime admission was started.

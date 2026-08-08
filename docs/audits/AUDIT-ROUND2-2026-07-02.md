# Audit remediation — Round 2 work package (2026-07-02)

**You need zero prior context to execute this file. Read this intro, then work the items top to bottom.**

## Background

On 2026-07-01 a six-agent audit of PRs #89–#119 produced `AUDIT-2026-07-01.md` (repo root, 32 findings). A worker agent then fixed **all of it** across six merged PRs (#120–#125, Linear MOVE-364…369 under epic MOVE-363). Six independent verification agents then re-graded every fix against current main (commit `67da3ec`): **every original finding is DONE — do not redo any of them.** The full test suite passes (813 tests / 154 files) and `tsc --noEmit` is clean at that commit.

This file is what's left: **new bugs introduced by the round-1 fixes, residuals the verifiers found next to them, and small polish.** Each item below is self-contained: current file:line, why it matters (with enough mechanism context to work cold), exact fix, and the test to add.

## Ground rules (read before coding)

- **Start state:** `git fetch origin && git checkout main && git pull` — main moves fast here; never build on a stale checkout. Expected baseline is `67da3ec` or later. Working tree should be clean apart from the two untracked audit `.md` files — leave those untracked, never commit them.
- **Historical branching/PR record:** this completed package used two PRs and
  Linear MOVE-370. That id is provenance, not a current instruction or gate.
  Future current work is scoped and handed off through `docs/tracker/` Cards
  and owner-approved Work Orders, with GitHub carrying implementation proof.
- **Merging a PR to main = production deploy** (Vercel + prod Convex fine-crocodile-51). Standing instruction from Scott: merge your own PRs once green AND verified — don't ask — but never run destructive operations against prod data.
- **Convex/agent rules:** any error an agent can reach through the OAuth MCP gateway (`convex/mcp.ts` + `convex/mcpTools*.ts` and everything they call) must be `throw new ConvexError(...)` (import from `"convex/values"`) — plain `Error` gets redacted to an opaque "Tool execution failed". Plain `Error` is fine on the REST surface (`convex/restApi.ts`), where it becomes a 400 via `errorStatus`.
- **Testing bar per PR:** unit tests for each behavioral change (named per item below), full `npm test` + `npx tsc --noEmit` green. For UI-visible changes, a browser smoke check via the Claude-in-Chrome extension against Scott's logged-in Chrome on localhost:3827 (`preview_start`/curl hit the auth wall — don't bother). If you changed any Convex function, push to the dev deployment first with `npx convex dev --once` (dev: gregarious-goldfinch-763) or the UI crashes with "Could not find public function".
- If a historical item is revisited and turns out to be wrong, do not force it;
  record the finding in the current repo-owned Card or Work Order. Do not start
  work outside the approved current scope.

---

## PR A — backend/REST

### 1. MEDIUM — `POST /moves/setup` still has the archive bypass that PR #122 fixed on PATCH
**File:** `convex/restApi.ts:7095` (`setupMovePatch`)
**Context:** PR #122 fixed `PATCH /api/v1/moves/:moveId` so `status:"archived"` is rejected (archiving must go through the app flow, which sets `archivedAt` — `convex/moves.ts:391-392`) and an invalid status returns a clean 400 instead of deleting the required `status` field. But the sibling route `POST /moves/setup` (update-existing path) still does `patch.status = parseMoveStatus(body.status) ?? "planning"`, and `restMoveStatuses` (`convex/restApi.ts:140`) includes `"archived"`. Two bugs: an agent can archive a move with no `archivedAt` bookkeeping (move vanishes from all lists with no archive record), and any typo status silently coerces to `"planning"` (silent data change).
**FIX:** In `setupMovePatch`, route status through the same rules PR #122 established in `buildMovePatch` (`convex/lib/moveFields.ts:450-462`): if `body.status !== undefined`, parse it; unparseable → `throw new Error("status must be one of planning|active|completed.")`; parsed `"archived"` → `throw new Error("Archiving a move isn't supported via this endpoint — archive it in the app.")`; otherwise assign. Better: call `buildMovePatch` for the overlapping fields so the two routes can't drift again — look at how `movePatch` (`convex/restApi.ts:8058`) consumes it with a plain-Error factory and mirror that.
**Test:** in `tests/unit/rest-api.test.ts`, POST /moves/setup with `status:"archived"` → 400 with the archive message; with `status:"bogus"` → 400 with the enum message; with `status:"active"` → succeeds.

### 8. LOW — `patchText` coerces non-strings into garbage strings
**File:** `convex/lib/moveFields.ts` (`patchText`, used by `buildMovePatch`)
**Context:** PR #122 extracted `buildMovePatch` shared by REST PATCH and the OAuth gateway. Its `patchText` helper does `String(value)`, so a client sending `origin: 123` or `origin: {}` now stores `"123"` / `"[object Object]"`. Before the refactor, REST ran `asString()` which treated non-strings as absent.
**FIX:** In `patchText`, when the value is not `undefined`/`null` and `typeof value !== "string"`, throw via the injected error factory (`"<field> must be a string."`). `null` keeps meaning "clear" where it already does.
**Test:** in the moveFields or rest-api test file: PATCH /moves with `origin: 123` → 400; `origin: "123 Main St"` → stored.

### 9. LOW — REST create-move still accepts a non-positive weight allowance
**File:** `convex/restApi.ts:1594` (create-move path)
**Context:** PR #122 unified `moveLevelWeightAllowanceLb` semantics on PATCH (must be > 0, or null to clear) across REST/gateway/stdio. The **create** path was out of scope and still stores any finite number, including 0 and negatives, which then feed weight-allowance math in the UI.
**FIX:** Apply the same rule at :1594: if provided and not a finite number > 0, `throw new Error("moveLevelWeightAllowanceLb must be a positive number.")`.
**Test:** create-move with `moveLevelWeightAllowanceLb: -500` → 400; with `2000` → stored.

### 10. LOW — REST string-typed prices silently wipe the stored price
**File:** `convex/restApi.ts:9081-9096` (`saleListingPatchFromBody`)
**Context:** PR #124 added price validation (`assertRestPriceCents`) for the four sale-listing price fields. But `optionalNumber` (`convex/restApi.ts:8789-8791`) coerces any non-number — e.g. `"officialPriceCents": "500"` — to `undefined` **before** the validator runs, and an explicit-undefined patch deletes the stored field. So an agent sending a stringified number silently wipes the price instead of getting an error.
**FIX:** In `saleListingPatchFromBody`, for each of the four price keys (`officialPriceCents`, `soldPriceCents`, `suggestedPriceLowCents`, `suggestedPriceHighCents`): when `body.X !== undefined && body.X !== null && typeof body.X !== "number"`, `throw new Error("X must be a number of cents.")` before the `optionalNumber` call.
**Test:** in `tests/unit/rest-api.test.ts` (or sale-listings tests): PATCH listing with `officialPriceCents: "500"` → 400; with `500` → stored.

### 11. LOW — Hard-delete photo prune can mark an in-flight upload "complete" one photo early
**File:** `convex/lib/hardDelete.ts:214-222`
**Context:** PR #124's queue scrub prunes a deleted unit's photo ids from live queue entries' `mediaPhotoIds`, lowers `expectedMediaCount` to the new array length, and flips `mediaUploadState` `uploading→complete`. If an entry expected 3 photos, 2 landed, and 1 of those 2 belonged to the deleted unit, the scrub sets `expectedMediaCount = 1` and marks it complete while the 3rd photo is genuinely still uploading — the entry becomes agent-claimable one photo early and the late photo lands on a claimed entry.
**FIX:** Lower expectation by the number pruned rather than to the array length: `expectedMediaCount = Math.max(newMediaPhotoIds.length, (entry.expectedMediaCount ?? 0) - prunedCount)`, and only flip `uploading→complete` when `newMediaPhotoIds.length >= that new expectation`. Keep everything consistent with `isMediaUploadPending` (`convex/lib/ingestionQueue.ts:88-105`: pending = state "uploading" OR count < expected).
**Test:** extend `tests/unit/hard-delete.test.ts`: entry with expected 3, 2 attached, 1 pruned → expectation 2, state stays "uploading"; entry with expected 2, 2 attached, 1 pruned → expectation 1, flips complete.

### 12. LOW — `list_queue` queued counts exclude expired-claimed entries + a dead filter
**File:** `convex/mcpToolsQueue.ts:187-198`
**Context:** PR #122 made `runnableOwners.queuedCount` come from a dedicated `by_move_status_order` query with `status=="queued"` (fixing the zero-count-under-filter bug). But entries whose claim expired have DB status `"claimed"` while `effectiveStatus(entry, now)` treats them as queued and `claim_queue` will hand them out — so they're invisible in the count. Also the `effectiveStatus(entry, now) === "queued"` filter at :198 is now dead code (always true for rows fetched with status "queued").
**FIX:** Additionally scan `status=="claimed"` rows for the move (same index) and include those with `claimExpiresAt < now` in the per-owner counts; delete the dead filter at :198 (or repurpose it on the combined set).
**Test:** unit test in the mcp queue tests: one queued + one expired-claimed entry for the same owner → `queuedCount: 2`; an unexpired claimed entry → not counted.

### Docs (fold into PR A)
- `docs/api-and-mcp.md`: add an "Update a move" curl subsection for `PATCH /api/v1/moves/:moveId` — body fields (`title, status[planning|active|completed], origin, destination, dateStart, dateEnd, distanceMiles|null, travelMinutes|null, notes, documentationProfileTypes[], moveLevelWeightAllowanceLb|null`), note null-clears, note archived is blocked. Every comparable endpoint already has one — copy the house style.

---

## PR B — frontend

### 2. MEDIUM — Stale deferred-failure flag flips a fully-completed capture to "failed" after a manual retry
**File:** `src/components/media-upload-provider.tsx` (deferral mechanism ~:200-239, `retry()` ~:383-397)
**Context:** PR #121 made failure-marking sibling-aware: when one upload job of a multi-photo capture fails while siblings are live, the "failed" rollup is *deferred* (`deferredFailedEntryIdsRef`, a Set of entryIds) and flushed by the last job to finish (`flushDeferredFailureIfTerminal`). Correct design — but the flag isn't cleared when the user manually retries the failed job. Repro: entry expects 2 photos; job A errors terminally while B uploads → A's failure deferred; user taps retry on A; B succeeds (flush skipped, A live); A succeeds → `appendMedia` marks the rollup complete (2/2) → the flush then finds the stale flag, sees no live siblings, and overwrites the complete rollup with `failed`. Impact is UI-only (claimability unaffected — `isMediaUploadPending` is false for both states) but the queue shows a spurious failed/retry chip on a fully-uploaded capture.
**FIX:** Make the deferral attributed: replace `deferredFailedEntryIdsRef = useRef(new Set<string>())` with `useRef(new Map<string, Set<string>>())` (entryId → failed job ids). Defer branch: add `job.id` to the entry's set. In `retry()`'s `setJobs` callback: delete the retried `job.id` from its entry's set (drop the entry key when empty) — a retried job's prior failure no longer stands; if the retry fails again, the catch re-adds it. `flushDeferredFailureIfTerminal` fires only when the entry's set is non-empty (dismissed/aborted jobs keep their ids, so "one of N dismissed, rest succeed" still correctly ends failed).
**Bonus (same file, fold in):** on a finalized-photo retry, `runJob`'s first patch (~:247) briefly resets to `uploading/0%` before the `finalizedPhotoId` branch re-patches to `finalizing/100` — skip the reset when `job.finalizedPhotoId` is set.
**Test:** in `tests/unit/media-upload-provider.test.tsx`: 2-photo entry, A errors while B live, retry A, resolve B then A → assert `setMediaUploadState` **never** called with `failed` (and the rollup ends complete).

### 3. LOW/MEDIUM — Unhandled promise rejections from the inline queue action buttons
**File:** `src/components/ingestion-queue-list.tsx` — `void saveInstructions(...)` at :676 and `void changeStatus(...)` at :790, :800, :813, :831
**Context:** PR #123 made `saveInstructions` and `changeStatus` **rethrow** after toasting an error — necessary so the detail modal (`queue-entry-detail-sheet.tsx`) can keep itself open on failure. But the five inline (non-modal) callers still fire-and-forget with `void fn(...)`, so any failed inline resolve/requeue/discard/restore/save now produces an unhandled promise rejection — console error in prod, red overlay in Next dev, noise in error reporters. The user-facing toast still shows.
**FIX:** Change the five call sites to `fn(...).catch(() => {})` with a one-line comment: `// errors already toasted inside; the rethrow exists for the modal path`. (Alternative — returning a boolean instead of throwing and checking it in the sheet — is fine too, but the `.catch` version is the minimal diff.)
**Test:** in `tests/unit/ingestion-queue-list-tabs.test.tsx`: click inline "Mark resolved" with the mutation mocked to reject once → assert `toastError` fired; vitest fails on unhandled rejections by default, so the test passing IS the assertion.

### 4. LOW — Blanking the weight field rewrites confidence for a value that never saved (and can strip the weight entirely)
**File:** `src/components/item-detail-sheet.tsx` — value-changed clauses ~:766-779, `clearActualWeight` condition ~:750
**Context:** PR #120 correctly made confidence writes conditional on "checkbox changed OR value changed". But "value changed" is computed as `parsedActualWeightLb !== displayedWeightLb`, which is true when the user **blanks** the field (parsed = undefined) — yet an absent value is never written (the `!== undefined` guard skips it). Net: blank the field, save → old weight persists but a fresh `weightConfidence` write is emitted. Worse variant: estimate checkbox ON + field blanked + item had `actualWeightLb` → the `clearActualWeight: true` at ~:750 still fires with no replacement `estimatedWeightLb`, so the item ends with **no weight at all** and `weightConfidence: "low"`.
**FIX:** Gate each value-changed clause on the parsed value being present: `(parsedActualWeightLb !== undefined && parsedActualWeightLb !== displayedWeightLb) || ...` — mirror for the dims clauses (~:770-773) and volume (~:774-778). And add `parsedActualWeightLb !== undefined &&` to the `clearActualWeight` condition at ~:750 so blanking can't delete an actual weight without a replacement. (Blanking then stays a silent no-op, which is pre-existing behavior — a real "clear weight" feature is out of scope.)
**Test:** extend `tests/unit/item-detail-sheet-tabs.test.tsx`: item with `actualWeightLb: 40`, blank the weight field, save → patch contains NO `weightConfidence`, NO `clearActualWeight`, NO weight fields.

### 5. LOW — Server should normalize confidence when an agent writes a bare actualWeightLb
**File:** `convex/items.ts` `update` (~:1188-1193)
**Context:** Agents can set `actualWeightLb` via `update_item`/REST without touching `weightConfidence`. If the item's confidence was estimate-tier (`low|medium|high`), the item detail sheet's checkbox then initializes CHECKED (estimate wins), and any later save demotes the agent's actual measurement back to an estimate (`clearActualWeight` fires). Contradictory state shouldn't be creatable.
**FIX:** In the `update` mutation's patch builder: when `args.actualWeightLb !== undefined && args.actualWeightLb !== null && args.weightConfidence === undefined`, also set `patch.weightConfidence = "actual"`. (This is a Convex function change — remember `npx convex dev --once` before browser-testing.)
**Test:** unit test on the patch builder or an integration-style test: update with only `actualWeightLb: 50` on an item with `weightConfidence: "medium"` → stored confidence becomes `"actual"`.

### 6. TRIVIAL — Upload timeout copy promises a retry that already happened
**File:** `src/components/media-upload-provider.tsx:73-78` (`friendlyUploadError`)
**Context:** Round 1 (following the original audit's instruction — the instruction was wrong) set the "timed out" message to "Upload timed out. It will retry automatically." But `friendlyUploadError` renders only on the **terminal** error path, after automatic retries are exhausted, next to a manual retry chip.
**FIX:** Change to `"Upload timed out. Check your connection and tap retry."` Update the copy assertion in the provider tests if one exists.

### 7. TRIVIAL — Missing one-line retryability test for the stall timeout
**File:** `tests/unit/media-upload-retry.test.ts` (~:49)
**Context:** The stall-watchdog fix relies on the timeout error being retryable (plain Error, no permanent-needle match) — verified by code tracing but never pinned by a test.
**FIX:** Add: `expect(isRetryableUploadError(new Error("Upload timed out. Check your connection."))).toBe(true);`

### 13. LOW — Queue-sharing copy is wrong for move-only helpers + missing server-side auth tests
**Files:** `src/components/move-participants-manager.tsx` (share-your-queue block ~:540, `canShareMyQueue` ~:380-384); `convex/moveParticipants.ts` (`setMyQueueDelegation` :482-598)
**Context (decision already made — implement, don't ask):** PR #123's owner-consent model works for household members, but a **move-only** participant (an invited helper without household membership) sees no one to share with — `listForMove` deliberately filters the roster to self for move-only non-managers (`convex/moveParticipants.ts:211-215`, an anti-email-enumeration privacy wall). The wall wins; we're not weakening it. Two things to do:
(a) **Copy:** in the participants manager, when the viewer is a move-only non-manager (roster length ≤ 1 excluding self, or use the existing access-kind signal if exposed), render a short explainer instead of an empty share section: "Queue sharing is managed by the household — ask a move manager to set up delegation for you." Keep the existing behavior for household-backed viewers.
(b) **Tests:** `setMyQueueDelegation` is the most security-sensitive new mutation from round 1 and has no server-side tests. Add unit tests for its authorization branches (see :482-598): rejects agents (no signed-in user), rejects self-delegation, rejects a participantId from another move/household, rejects a bare targetUserId that isn't an active participant or active household member of this move's household, and only ever adds/removes the **caller's** userId.

---

## Explicitly NOT in scope (round-1 verifiers cleared these — don't touch)
- All 32 original audit findings: verified DONE at `67da3ec`.
- The double confirmation (inline message + toast) on modal directions-save — cosmetic, accepted.
- The photo-picker dialog skipping its close animation, and its per-open URL refetch — accepted trade-offs of the remount design.
- The leaving-inventory transport field unmounting when cleared before save — accepted quirk of the chosen gate.
- The one-batch staleness window in `jobsRef` — self-heals via the cron; accepted.
- `scrubPlanningSuggestionReferences` O(move) scan — fine at current scale.
- `setMyQueueDelegation`'s participant-row insert path — chased and verified safe (kill-switch cannot be bypassed: `agentAccessDisabled` ORs the membership-level flag; roles can't elevate). Item 13(b) just adds the missing tests around it.

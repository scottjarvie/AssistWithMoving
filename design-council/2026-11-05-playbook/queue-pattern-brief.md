# Queue pattern implementation brief

Source preparation during the runtime hold; no Queue implementation or rendering acceptance is claimed here. The decided collection/thread pattern governs, so no alternative-design round is needed.

## Existing contract to preserve

QueueExperience owns the paginated canonical, capture-adapter and legacy-capture reads, current user/delegated owner scope, current-state filtering, connection status, selected handoff activity, and all mutation/version/idempotency handling. The server list functions already accept an optional state; Everything may omit that filter without changing access policy. The server still checks owner/move permissions and projects expired claims into their effective state. Preserve all three reads, deduplication and older-page access.

Keep four stored/effective states: needsYou, working, waitingForAi, done. Needs you can be emphasized as a flag in the view without migrating stored states. Preserve Cancel's terminal Done history, retry detail, claim identity/expiry, linked work, result references, capture compatibility links, copy/manual handoff paths elsewhere, and all attribution. No new execution or automatic claim is implied by saving a directive.

## Decided collection surface

Use real view tabs for Needs you, Waiting on AI, AI working, Done this week, Everything, plus All Done so older terminal outcomes and undated captures remain available. Done this week must use canonical completedAt: shapeQueueItem already supplies it, although the current client mapper drops it. Capture adapters provide only createdAt/updatedAt, so do not treat their update timestamp as a completion date. Disclose that undated captures stay under All Done/Everything.

Retain owner selection. Shared collection search, counted facets, Group, Sort, Table/List/Grid, density, table columns and browser-local named views should operate over the loaded record model. Counts say loaded; filters never imply a global total from one page. Keep separate older-handoff and older-capture controls outside client pagination. Do not invent bulk commands: only expose actions that existing item operations actually support with their current confirmations and version handling.

Candidate columns/facets come from actual QueueDeskItem fields: directive, effective state, source, owner, question/current step, updated date, claim/expiry, failure and linked result. Detail remains one labelled step away, preserving context and full original text. A compact composer and the existing AI-access explanation stay available without dominating the list.

## Answer in the row; thread on desktop, answer first on phone

Only canonical handoffs in needsYou can use the existing provideInput path. A row answer uses that same item/version and retains its draft if sorting/grouping/presentation changes. Keep capture response guidance and Open capture workspace; never send a capture adapter through the canonical mutation.

The item surface retains context, exact question, response, current/waiting/done outcome, linked work, failure/retry, attributed dated activity, older activity and cancel. On phone put the exact question and response before longer context. Desktop places the same input inside the thread. Saved drafts and query lifetimes stay above presentation changes. No mutation is exercised in synthetic captures.

## Next verification

Real tests must cover inline and sheet response behavior, draft retention, owner/version correctness, Everything's existing optional-state reads, truthful completion-date filtering, legacy captures, empty/loading states and older pagination. Render actual Queue components with fictional fixtures after explicit runtime admission. Existing owner/access/service tests remain unchanged unless a concrete defect requires a fix. Full pattern, rendering and council acceptance are still pending.

## Initial implementation checkpoint

Canonical Needs you rows now accept an answer using the existing callback/item/version, without opening the sheet. Drafts live above the row and sheet and survive state navigation; a refused save retains the draft. Capture adapters retain their separate workspace flow. The detail question and answer precede optional context in document order. Queue glyphs are authored Moving SVG and status tones use semantic tokens; compact Save/Manage actions retain phone targets. Three new behavior tests and the original Queue suite passed in the 158-test checkpoint. The collection toolbar/views, thread composition, explicit post-action focus and rendered verification remain future work, so Queue is not declared complete.

## Phase-two source integration (unverified)

The shared collection is wired into QueueDesk with six real views, counted facets, named browser-local views, grouping/sort, Table/List/Grid and phone Options. Canonical completion dates support the disclosed week view; undated captures remain in All Done/Everything. The compact composer retains its draft, while shared answer state stays above row and thread. Older paging, activity, owner/access and exact write paths remain. New consumer and controller regressions are written but not run. See 09-X-source-checkpoint.md for the precise source/result boundary. HOST/SITE remain NONE. The green 222-file/1,396-test result belongs only to 61a0d70.

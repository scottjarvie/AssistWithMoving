# AWL-0019 Moving implementation plan

Status: Round A input; **not release clearance or search-completeness proof**.
Base: `4e6f9ec45394709e0e0a8b5b32efc753f7f924c0` (`origin/main`, fetched by
host handoff, `startedFromOrigin:true`). Sole Moving owner; existing worktrees
untouched. Host path resolves to `/home/jarvie/code/_worktrees/_t3/`.

## Coverage and matching ledger

| Surface/family | Current authorized fields and matching | Disposition |
| --- | --- | --- |
| Website inventory | Per-field lowercase infix over name, code, nickname, description, subcategory, room, category, disposition, status, visible owner name/role, box codes, resource/zone names; saved filters and owner filters | Preserve; uncapped `fetchMoveSignalData` hydration and independent facets require separate reviewed retrieval work |
| Website box lookup, movable units, space organizer | Existing local specialized matchers | Preserve; no claim of canonical parity |
| Canonical OAuth item | Joined lowercase infix name/room/category/description, 120 recent move rows, deleted excluded after read | First repair bounded-result metadata; resumable scan proposed below |
| Canonical box | Joined lowercase infix code/label/nickname/room/description, 120 recent move rows, archive excluded after read | Same |
| Canonical space | Joined lowercase infix name/aliases/kind/notes, active move index, 120 rows | Same |
| Canonical planning: decision/estimate/planResult/sourceCheck | Native searchText token search for nonempty query; otherwise recent move/kind index; archive excluded afterward | Retain native semantics; privacy/progress and installed-engine continuation review gate |
| Canonical Queue | Joined lowercase infix directive/summary/resultSummary/requiredAction; move+caller owner index and work predicate | Preserve own-only canonical reach, not website manager reach |
| Website Queue | Native directive search, owner/state filters, live role/effective-state checks and native cursor | Preserve sparse continuation; distinct matcher and authority |
| Legacy OAuth inventory | normalized-name substring plus room/category/disposition/review filters; 1000 recent candidates, READ_LIMIT array | Preserve array shape; additive paged companion requires review, not silent replacement |
| API-key HTTP/stdio inventory | REST item list plus adapter infix name/description/room/destinationRoom/category on returned page | Preserve filters/catalog; adapter forwarding of REST cursor is follow-up |
| Photos/media, transport/people, typed finders, public catalogs | Existing detail/typed retrieval only | No new broad search, media fields or permissions |

`photo` is currently accepted by the shared reference validator but never visited
by search. Report it as unsupported rather than pretend it was searched.
Substring examples: `test` in `latest`; preserve Unicode lowercasing, punctuation,
combining characters and existing joined-field versus per-field distinctions.
Native planning token matching must not be substituted for infix matching.

## Authority and cursor design

Canonical transport injects verified issuer/subject/clientId into internal
queries. `requireMcpMove` -> `requireMcpGrant` -> `activeGrantsForUser` checks
durable effective policy and current move membership/role/API permission before
retrieval. `aiGrants.ts` maps effective access revision to grant.version;
underlying connection access revisions cover reductions, inherited restriction
initialization, pause/revoke/expiry/reconciliation. Membership, move participation,
role and lifecycle must additionally enter any future cursor binding; grant
revision alone does not cover them. API keys retain their independent resolver.

First reversible change: repair canonical bounded-window reporting without
changing retrieval/matching, grants, ordering, schema or writers. Count whether
each visited source window filled **before** archive/text filtering. No public
denied-work counts. A full window means possibly incomplete, including exactly
120 rows; no extra probe or invented exact total. Existing offset cursor remains
explicitly only a position within the recomputed bounded pool, not continuation
of the underlying corpus. Reject unsafe numeric offsets/limits. Report visited
and unsupported kinds, pool pagination separately from corpus completeness.

Round A proposal for replacement (not activated by this patch): source-native
bounded traversal for item/box/space/own Queue, query-independent authorized
partitions, stable family order, with no global chronology claim. Native planning
requires distinct token continuation and archive/privacy engine proof. Cursor
envelope version binds principal/client, effective grant revision, live access
fingerprint (ABA limitation), move/kinds/query normalization/mode/size/schema.
Use existing server sealing or server-owned state; do not ship editable done/seen
fields or a digest presented as integrity. Reject offset cursors explicitly on
that future version, retain unreturned overflow, permit empty nonterminal pages.
Do not introduce projection or source writer changes before this review.

## Writer and readiness ledger

This first patch reads source rows; no projection, backfill or writer changes.
Existing item normalizedName writers include website `items`, REST, legacy OAuth,
canonical complete-result writes, imports/intake/AI approvals and merges. Planning
`searchText` is built by planning upserts. Boxes/spaces/Queue read current source.
Before a derived index: enumerate these plus archive/restore/delete, relationship
reparent/merge, parent privacy and all import writers with file-level evidence;
dual-write, version coverage, bounded idempotent checkpoints, text-version gate,
tombstones, reconciliation and rollback must pass independent review. No nonempty
index readiness inference. No derived index is proposed for activation here.

## Frozen first-patch budgets and fixture protocol

Retain existing maximum 120 returned candidates/family, eight implemented
families (960), 50 response records, one query invocation, zero action fanout,
zero retries and zero blob downloads. No additional database read for reporting.
These are candidate bounds, **not** bounds on Convex's filtered source work,
stored field bytes or full response bytes. Existing Queue `.filter().take()`
and native search engine costs require installed-engine evidence. Input hardening
uses 240 query UTF-16 code units and 80 cursor characters (matching the transport); offsets must be safe
nonnegative integers. Source/string and response-byte budgets remain an exact
release-design gate; do not claim A8 compliance from row limits.

Targeted convex-test regressions: rare/zero hits among a full window, mixed kinds
where one fills, exactly-at-cap conservatism, short windows, archive-heavy windows,
unsupported photo, offset overflow, foreign move/grant denial and own Queue vs
foreign terms. These are local tests, not real-backend proof.

Live protocol, pending supported sandbox/auth: marked synthetic 100/2000/10000
records; disclosure of text bytes, permitted/foreign/archived distributions;
selective hit beyond120/1000, >1024 common native hits, sparse/no-match, Unicode,
paired forbidden-token corpora, changed authority/query/cursor, full lifecycle.
Freeze numerical row/byte/fanout/traversal budgets and baseline-derived latency
threshold **before candidate benchmark**. Run 5 warmups then 30 measured requests
per workload/head with same cache protocol, report p50/p95/p99 and sample caveat;
full traversal ground truth separately. Server metrics/request IDs unavailable
unless existing backend tooling provides them. No benchmark has run.

## Release DAG and gates

1. Draft plan/diff to HQ; independent actual-plan Round A, then Round B exact-head
   review and real synthetic authenticated round trips. No delegates from owner.
2. Local `npm run check` (includes lint/bindings/Convex typecheck/typecheck/tests)
   and build; targeted tests after fixes. No workflow/runner changes.
3. Existing sandbox launcher is record-only; `dev:backend` explicitly refuses
   source push as coordinator-owned. No local env files or dependencies admitted
   in this fresh checkout initially. Require coordinator-owned supported backend
   binding + existing test-auth routes; no provisioning or impersonation.
4. Backup proof is unresolved: no current backup receipt found in inspected
   release guidance. Source-only patch needs no backfill, but future schema/data
   release must name the actual supported backup/recovery receipt and dry-run.
5. Draft stays draft until HQ coordinates exact-head review/clearance. Ready once,
   executed Required CI at exact SHA (draft skips are not success), manual guarded
   merge only with HQ clearance. This task does not merge/deploy.
6. `vercel.json` uses `convex deploy --cmd 'npm run build'`: compatible backend
   first, then frontend from main; no branch production push. Installed index
   readiness, bundle SHA, frontend SHA and live proof separately recorded.

## Named unresolved exceptions (owner: HQ + Moving implementation)

All are **blocked**, not accepted limitations: canonical complete continuation
and bound cursors; native planning archive/progress noninterference; installed
engine >1024 traversal; website all-move hydration/facets; legacy array continuation;
REST/stdio same-authority parity; field/response/traversal byte budgets; real test
auth/backend bundle and metrics; backup/recovery evidence. Existing finders remain
available. This partial patch does not fulfill the whole Card or waive A1–A9.

## First-patch local checkpoint

Implemented only bounded-window metadata and internal input hardening, with
unchanged source retrieval, matching, ordering, authority and writers. Planning
native coverage is always unverified for a nonempty query, independent of its
raw archived-match count. There is no new cursor integrity or complete traversal
claim. The original larger indexing/search implementation remains open.

Local cloud setup, lint, bindings freshness (177 modules), backend and application
TypeScript, contract drift (32 routes/7 enum baselines), state-publication guard,
release doctor and production build passed. Lint has five unchanged-file warnings.
The final targeted foundation suite passed 7 tests, including exactly120 versus
119 source rows. Full unit suite is **not passing**: before recovery it reported
the unchanged upload-buffer memory assertion failing; recovery lost its final
terminal summary. A focused rerun reproduced that failure at
`tests/unit/ai-upload-routes.test.ts:202` (3,327,430 bytes vs 1,572,864 bound).
The relay, proxy, test and lockfile have zero diff from base; exact-base execution
was not performed. No unrelated test was relaxed. Full suite was not replayed.

Artifacts are in
`/home/jarvie/code/_campaigns/awl-0019-search-indexing/sites/moving/`:
`checks.md`, `targeted-final.log`, `relay-focused.log`, `build.log`, and `plan.md`.
No installed-backend, latency, backup, auth, index-readiness or live-proof success
is inferred from these local checks. Keep the PR draft; no ready transition,
production/schema/backfill activation, merge or watches by this worker.

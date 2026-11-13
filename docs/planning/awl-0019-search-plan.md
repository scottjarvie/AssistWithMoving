# AWL-0019 Moving implementation plan

Status: Round A narrow source patch Pass; broader plan Fix remediation includes
an internal item-only source prototype. **No exact-head release clearance or
installed search-completeness proof.**
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

### Round A next slice: frozen internal item prototype

M-A1/M-A3 source design: add `searchItemPagePrototype` as an **internal mutation**
in mcpPlanning, with no transport registration/read switch. Add a source-only
`itemSearchContinuations` table, unique by existing connection ID in application
logic. One replaceable row per credential, containing no item text/results. A new
start supersedes that connection's previous traversal; each successful step
atomically advances revision. Handle has only state ID + safe integer revision;
all positions, cumulative counters, request binding and terminal state live on
server. No seal/secret or mcpOperations reuse. Reject stale, forged extra fields,
foreign connection, expiry, changed semantics/authority and terminal replays.

Binding includes normalized issuer, subject/client, current connection/grant IDs,
effective grant version/scopes/move limits/expiry, live move lifecycle/household,
effective role/accessKind and membership/participant ID/role/status/agent switch.
Time-based grant expiry is enforced every page before state access. Live authority
resolution is in the same atomic mutation as source read/state update (no action
fanout). Nonrevisioned membership has disclosed ABA: identical restored effective
authority between calls is indistinguishable, but never widens current access.

Privacy correction to this proposed slice: mixed active/deleted source bytes can
affect range-page progress even without text filtering. Add ordinary source index
`items.by_move_active_updated(moveId, deletedAt, updatedAt)` and require exact
`moveId` + missing `deletedAt` **before** pagination. This equals existing item
lifecycle semantics, including legacy missing optional fields. No projection or
new source fields/writer dual-write/backfill script is needed: the native index
tracks every insert/patch/delete. Its installed readiness must be independently
verified before the optional lane can be exposed; no unbounded fallback.
Read that active range descending, with no text postfilter in candidate selection;
live deletion guard still precedes matching. Native cursor remains exclusively
server-owned. Keep joined lowercase
infix name/room/category/description, fixed `items` family and optional legacy
room/category/disposition/needsReview equality filters. At most pageSize source
rows, not enough-survivor loops; all matches from that source page fit output.
Empty nonterminal pages keep a handle. Native continuation failure is an explicit
restart error, never completeness. Relevance/native planning is unaffected.

Numerical prototype budgets, frozen before implementation/measurement: query240
code units (transport existing); pageSize1..50/default25 (existing canonical);
native maximumRowsRead=pageSize, maximumBytesRead=256KiB; existing Convex document
limit allows one boundary document of up to1MiB, so reserve1.25MiB source-read
allowance per step, not a strict256KiB claim. Stored source-value JSON UTF-8 is
also checked against1.25MiB (metric excludes engine overhead). Traversal stops
after10000returned source rows,400steps or16MiBsource-value JSON, whichever first;
last step may cross byte budget by one bounded page. Nonterminal exhaustion at
that boundary is `budgetLimited`, not complete; retain existing finder. 15minute
absolute state lifetime; row binding<=8KiB, native cursor<=8KiB, combined state
JSON<=24KiB; opaque request cursor<=256bytes. One state read/write + bounded
authority reads, zero related-record hydration, blob reads, child calls/retries.
Response160KiB cap; titles160/summary240code units per result, explicit truncation.
Source strings retain full matching semantics; summaries bounded only on output.
Oversize state/row/response fails explicitly, no silent text clipping for matching.

One state per existing connection caps repeated-start storage; expired state is
replaced on next use, with no new cron or user-content cleanup. Retired connection
state retention follows credential retention (no user text); global historical
credential growth remains existing authority storage, not caller-chosen search
session growth. Mutation serialization rejects concurrent replay. Native cursor
is not a frozen snapshot: edits may move records across it, producing repeats or
skips; IDs allow consumer dedup, no stored seen list. Completeness is only native
end of this live traversal, no universal concurrent-edit guarantee.

This is reversible SOURCE preparation authorized after Round A, not permission to
install the table/functions, activate a frontend, or claim live engine proof.
Baseline latency/engine budgets remain runtime gates; no candidate benchmark has
been judged. Rollback keeps existing endpoints/indexes; discard/ignore prototype
state rather than delete sources or run fallback collection.

Campaign budget correction: Convex PaginationOptions explicitly says
maximumRowsRead/maximumBytesRead are NOT enforced for text-search queries. This
prototype uses ordinary range pagination only; these options are not evidence for
native planning token-search bounds, parent/authority reads or whole-call bounds.
Postretrieval JSON-byte checks measure returned values only, not engine work.
Installed engine and complete authority-read accounting remain separate gates.

Successful-path source accounting: requireMcpMove uses user/connection/owner/grant,
move, subject user, resolved move/membership/participant (9 point/unique lookups);
prototype connection and full live resolution add4; continuation lookup adds1.
Thus14point/unique lookups plus one range page (<=50returned source rows) and one
state insert/replace, zero parent/reference hydration or child actions. Duplicate
unique rows fail closed; errors abort the transaction. Those are source-level
counts, not measured installed syscall/DB-byte counters. No hard whole-call byte
claim follows from source-page options: authority rows are read before that page,
and engine/platform transaction limits may reject large authority or source rows.
No application retry or collecting-to-fill loop is present. Byte-budget rejection
is unavailable/restart, never a completeness result.

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

### M-A4 concrete transport and writer ledger (source references)

| Door/adapter | Current query/filter/mode | Resolver/shape/next step |
| --- | --- | --- |
| `inventory-table.tsx` -> `items.facetedListForMove` + `src/lib/inventory-filters.ts:109` | Whole move hydration in `items.fetchMoveSignalData`; per-field infix incl visible owner/box/resource/zone signals, saved and owner filters | `requireMovePermission`; UI array/facets unchanged; signal fields are NOT silently included in canonical item text |
| `movable-units-table.tsx:329` -> `src/lib/movable-units.ts:327,417,646` | Joined searchText incl name/code/nickname/room/destination/status/assignment label/followups; stat filters | Existing visible hydrated units; preserve specialized fields and local sorting |
| `src/lib/space-organizer.ts:141,181` | Joined name/code/label/description/room/destination/status for boxes/items | Existing visible source adapters; do not claim parity with inventory per-field phrases |
| `box-lookup.tsx` | Route code/box lookup; contents membership filtering at276, not a substitute whole-move finder | Existing box queries/role shaping; retained typed lookup |
| `/mcp`: `httpRoutes/mcp.ts` search_move_records -> `mcpPlanning.searchMoveRecords` | Current joined item/box/space/own Queue, token-native planning; kinds/limit/offset pool | Verified principal + `requireMcpMove`; current records envelope unchanged except earlier metadata repair |
| Internal `mcpPlanning.searchItemPagePrototype` | Item name/room/category/description joined infix; optional room/category/disposition/review equality; active source range + opaque state | Same context/inventory authority; no public registration, no catalog/power added; exact-head review before any adapter |
| `/mcp/connect`: `mcp.ts:169` -> `mcpToolsWrite.searchInventory:118` | normalizedName substring, room/category/disposition/review; recent1000 ->200 array | Verified legacy caller, legacy grant gate and `requireMoveForSubject`; preserve200-result array and1000window, do not replace with prototype envelope |
| REST: `restApi.ts:3063 routeItems` GET move/items | collect source move then status/disposition filters; safeItem fields -> existing paginate; lifecycle uses `!deletedAt` (distinct zero-value edge) | `authenticateApiKey` + key-specific policy/move/role/visibility; different credential model; uncapped source collection remains pending |
| `/api/mcp` route -> stdio registry `assistwithmoving-mcp.mjs:1283` -> `assistwithmoving-api.mjs:540` | search_inventory fetches REST page then per-field infix name/description/room/destinationRoom/category; status/disposition/limit | API-key HTTP/stdio same registry, not canonical OAuth; adapter currently doesn't accept/forward cursor. Additive forwarding needs explicit REST/source continuation review, not an assertion that offset REST is complete |
| Website Queue `queue.ts:245–325` | Native directive search owner/state filters then effective-state and canView checks | Household managers/ordinary roles distinct. Denied-owner pre-match/progress audit and native budget enforcement remain separate M-A2/M-A3 gaps |

No broad search expansion for other typed/public/media catalogs. Unsupported
same-query parity is explicit per row above; existing specialized capabilities
remain obligations. No shared matcher may change joined versus per-field phrases,
normalized-name legacy mode, native token/relevance, Unicode or scoped signals.

Source freshness for the active item index is engine-maintained for **all** item
writes, with no derived text field or extraction status:

| Writer path | Source lifecycle/search dependencies |
| --- | --- |
| `items.create:902` / `update:1060` / `batchUpdate:1382` / `setDisposition:1558` | Name/normalizedName/room/category/description/status/review; ordinary source index updates atomically |
| `items.adminArchiveItems:1640`, `archive:1663`, `remove:1713`, `markTrashed:1767` | deletedAt or physical source deletion; entry immediately leaves active range when source mutation commits |
| `mcpPlanning` inventory upsert around1544+, `saveInventory`, `saveCompleteResult` | Canonical create/edit plus version/replay/source provenance; no separate projection writer |
| `mcpArchive.ts:79–91` | Item archive/restore toggles deletedAt; active range membership updated by engine; planning archive remains distinct |
| `mcpToolsWrite.upsertItems:256`, item edits around882 | Legacy create/edit; existing normalizedName maintained; preserve old matching contract |
| `restApi.routeItems:3063`, `routeBatchUpsertItems:3284`, item builders5550/5697/8127/8198 and patches3124/3336/5666/6364/6380 | REST create/edit/import/batch/compatibility; source index sees every source change without a search-specific hook |
| `aiTextIntake.approveMany:203` -> item insert411; `aiPhotoIntake.approveMany:237` -> insert414 | Approval promotes intake to actual item; rejected pending suggestions do not enter the item range |
| `plannedItems.convertToOwned:325–350` | Planned item only becomes source item on conversion; planned-item catalogs not falsely included |
| `seed.ts` | Existing synthetic seed insert; not run here and not an authorized real-data migration |

Relationship/signal dependencies for future website projection: boxItems pack/
unpack/unassign/restore (`mcpToolsWrite.packBoxes`, `boxes`, REST assignment routes),
box rename/archive, movePeople owner rename/delete, transport resource/zone rename/
reparent/delete, and photo privacy/attachment/deletion all change hydrated UI
signals in `items.fetchMoveSignalData`. They do NOT change the canonical four text
fields; no signal projection/read switch is implemented. Their complete writer/
parent invalidation plan is still required before deriving those UI signals.
Move/household membership/participant/privacy downgrade is live authority, checked
on every prototype call; cursor binding changes invalidate continuation. No
source merge path is newly added; any existing merge/batch flow mutating these
source rows is covered by engine index maintenance, not a handwritten writer list.

Readiness: source schema optional preparation -> independent schema/actual-diff
review -> coordinator-supported isolated install with index-ready receipt and
real-auth fixture -> no-missing/duplicate source-vs-index ID reconciliation under
edit/archive/restore/delete -> exact-head runtime review -> separately approved
public adapter. Until then prototype has no public consumer. Backfill N/A for
derived data (none); native index population/readiness still requires proof.

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

## Round A implementation checkpoint (supersedes first-patch-only scope)

M-A1: server-owned, versioned, expiring item-only continuation implemented as
internal mutation with strict request shape, no public read switch. Binding
contains effective connection/grant policy and live membership/participant
authority. Synthetic replay, cross-client/grant, query/filter/page-size, expiry,
pause/revoke, role/kill-switch and forged done/seen/position vectors added.
Normalized-equivalent queries intentionally share a binding. Complete source
fields use one shared canonical item matcher. Old arrays/native/offset modes
remain unchanged. New starts supersede the credential's old state; there is no
arbitrary client-provided initial position. A correct state handle/version for
the same current authority never grants extra access and advances only the
server's actual source position. Failed validation or response budgets roll back
the entire mutation, including state updates.

M-A1 privacy refinement: source schema adds an ordinary active-lifecycle range
index to exclude deleted text/size before range pagination. Live guard retained.
This is additive source preparation only; no deployment, schema installation or
population activated. State table and index need independent actual-diff review.
One immutable-source query page yields no unreturned overflow; all permitted
matches fit the response bound. Empty nonterminal pages survive. Native range
end is explicitly scoped and never `corpusComplete:true`; concurrent edit skips/
repeats remain disclosed. A 10000-source-row budget can terminate with every ID
returned yet no end observed: still budgetLimited, never inferred complete.

M-A2 remains separate: existing native planning stays on approved finder with
unverified metadata; no token/relevance rewrite or claim that native pagination
options enforce scan/byte budgets. Website Queue denied-owner progress remains
unproved and unchanged.

M-A3: numerical ordinary-range, returned-value, state, response, row/step/time,
fanout/retry budgets and successful-path authority-read ledger now frozen above.
They are not measured whole-call/native engine enforcement. No baseline/candidate
latency claim; real-auth installed-engine page/authority/reference accounting and
baseline latency thresholds remain exact runtime gates. No transactionLimits
assertion is used as evidence of native text-search enforcement.

M-A4: concrete transport/matcher/filter/resolver/shape and source-writer ledger
added. Active source index is engine-maintained across every source writer; no
derived text/backfill/dual-write needed. UI signal dependencies and uncapped REST
and UI hydration are still future substantive work, not counted as fixed.

Local targeted vectors include135items with selective beyond120 hit, sparse and
terminal pages, source edit/archive/restore/delete, large body/name matching with
bounded snippets, and identical full response envelopes after only deleted terms
and sizes change. Additional100/2000/10000marked synthetic items are traversed
against complete authorized ID sets under convex-test. These tests prove local
source/control logic, **not actual installed engine, auth, index population,
whole-call bytes or native text-search >1024 behavior**. No full suite replay;
the first patch's upload-memory check gate remains unresolved. M-A5 runtime and
exact-head independent release gates remain intact, with HQ retrieving the
existing supported runtime/test-auth prerequisites.

Current local source checks: bindings177fresh; strict Convex/root TypeScript and
changed-file lint passed. Targeted foundation+inventory-filter+catalog tests25/25
passed (including100/2000/10000fixtures). Focused authority extension passed for
foreign-household and participant kill-switch. Catalog truth test also exposed
the first patch's phrase “other three public doors”; wording corrected to “other
public doors”, preserving the four-door truth without changing any catalog.
No full suite or build replay at the prototype head; earlier full-suite/upload
failure and earlier build receipt remain pinned to the first-patch checkpoint.

# Moving stateless MCP foundation

Status: released in production with one complete authenticated loop driven by the
official MCP TypeScript SDK. That harness is not an AI product; no named AI
client has completed the lifecycle. Corrected 2026-08-17 — an earlier revision of
this line called the SDK harness a "named client".
Product owner: Scott Jarvie
Executor: Codex
Tracker: `MOV-0028`, `MOV-WO-005`

## Outcome

Assist With Moving gives a signed-in person's chosen AI a useful, durable first
loop without turning the product into a generic database API. The AI can orient
to the move, find only the records needed, inspect private evidence through a
sanctioned media tool, and save a complete result spanning rooms, inventory,
decisions, estimates, plan sections, and source checks. The normal move
workspace shows those saved results.

The product remains the durable workspace. The AI reasons and proposes work;
the person retains authority over the move. Queue remains the person-facing
handoff desk and keeps its four states and its existing grant boundary.

## Canonical and compatibility doors

| Door | Authentication | Transport | Purpose |
| --- | --- | --- | --- |
| `https://movingmanifest.com/mcp` | Clerk OAuth bearer + product grant | Stateless MCP 2026 with stateless 2025 compatibility | Canonical grant-gated move workflow, including canonical Queue transitions |
| `https://movingmanifest.com/mcp/connect` | Clerk OAuth bearer | Persisted legacy gateway | Compatibility for clients using the older 29-tool OAuth catalog |
| `https://movingmanifest.com/api/mcp` | `mmk_` API key | Stateless HTTP | Existing granular API-key automation, including scoped Queue tools |
| `npx assistwithmoving-mcp` | `mmk_` API key | stdio | Existing local/API-key automation |

`/mcp/connect` is not a second name for the new catalog. It intentionally
proxies the older Convex gateway at `/mcp/legacy` so already-connected clients
do not silently receive a different tool set. New clients should use `/mcp`.

## Workflow tool contract

The canonical OAuth resource exposes exactly the tools in
`STATELESS_MOVING_TOOL_NAMES` (`convex/httpRoutes/mcp.ts`). Each is gated by one
of the five product grant scopes in `convex/lib/aiGrants.ts`, so `tools/list`
advertises only what the person approved. The authoritative per-tool scope map is
`MOVING_TOOL_SCOPES`; the full published catalog with purposes is in
[`docs/api-and-mcp.md`](../api-and-mcp.md) and on `llms-full.txt`.

`describe_connection` needs no scope and is always available, so a connection
with no grant can still learn what it may do and where the person changes that.
Under `moving.context.read`, `moving.evidence.read`, and `moving.work.write`:

1. `get_move_brief` — first call; lists bounded accessible moves or returns one
   move's route, locations, counts, review attention, saved planning records,
   and the signed-in person's Queue summaries.
2. `search_move_records` — bounded search across items, boxes, spaces,
   decisions, estimates, plan results, source checks, and Queue summaries.
3. `get_move_records` — batch hydration of up to 25 selected records with
   role-based value and research visibility.
4. `get_evidence_media` — private move photos as native MCP image content.
5. `save_move_context` — replay-safe route/timing/note corrections plus room or
   location upserts.
6. `save_inventory` — bounded inventory creation and optimistic corrections
   with estimates, confidence, review flags, and source provenance.
7. `save_planning_record` — granular creation or correction of a decision,
   estimate, readable plan result, or source check.
8. `save_complete_result` — preferred happy path; atomically saves a readable
   result and its related rooms, inventory, decisions, estimates, plan
   sections, and source checks in one operation. With `completeQueueItem` it
   also closes the handoff, when the grant carries `moving.queue.work`.

Under `moving.queue.work` (implemented in `convex/mcpQueueWork.ts`):

9. `list_queue_work` — only the handoffs the person left **Waiting for your AI**
   on one move, each with the version to claim it with. Needs you items wait on
   the person and are deliberately omitted.
10. `claim_queue_work` — takes one waiting handoff under a 15-minute lease.
11. `release_queue_work` — returns a claim to Waiting for your AI with a reason.
12. `ask_queue_question` — moves a claimed handoff to **Needs you** with the
    smallest exact question, rather than guessing.
13. `complete_queue_work` — marks a claimed handoff **Done** with its result.

Under `moving.archive`:

14. `archive_move_records` — reversible archive and restore for belongings,
    boxes, rooms, and planning records, with a per-record result. The only
    destructive-sounding verb an AI is given, and it deletes nothing.

The catalog is deliberately workflow-shaped. It does not expose raw tables,
arbitrary Convex calls, account administration, membership changes, exports,
publishing, billing, or destructive deletion.

## Identity, tenant, and authority boundary

- The resource verifies the OAuth access-token signature, exact Clerk issuer,
  expiry, `at+jwt` type, subject, and OAuth client identifier before starting
  the MCP handler. Clerk's production dynamic-registration tokens currently
  omit `aud` even when the request includes the RFC 8707 `resource` parameter;
  when Clerk does include `aud`, Moving accepts only the exact `/mcp` resource
  or the token's own Clerk client id and rejects any unrelated audience.
- The server derives the Clerk subject and OAuth client id from the verified
  token. Tool arguments never choose a user or household.
- Every move read and write resolves current household or move-only access
  through Moving's shared access policy and honors the connected-agent kill
  switch.
- Sensitive item research and value fields use the existing role visibility
  policy.
- A missing bearer receives a real RFC 9728 protected-resource challenge. The
  public discovery document contains configuration, never private move data.
- Agent-facing domain failures use `ConvexError` with a stable machine code,
  plain-language message, and recovery instruction.

## Write safety and provenance

- Every write takes an `operationId`; a seven-day receipt stores a canonical
  request hash keyed by person, OAuth client, tool, and operation.
- An exact retry returns the original durable result with `replay: true`. Reuse
  of the same operation id for changed content fails with
  `IDEMPOTENCY_CONFLICT`.
- New inventory uses a client-stable `createKey`. Corrections require the
  current `expectedUpdatedAt`. Planning corrections require `expectedVersion`.
- Planning stable keys are namespaced to the verified OAuth client so two
  chosen AIs cannot accidentally overwrite each other's result.
- Saved planning records show `Your AI via MCP`, the client id, operation id,
  version, and timestamps. Audit events record the person, client, reason, and
  affected record counts.
- Source checks preserve `checked`, `blocked`, `gated`, `failed`, and
  `notRelevant`; a blocked website is not rewritten as a successful check.

## Queue boundary

Queue authority is a separate approval, not a separate door. Two cases:

- **With `moving.queue.work`,** the canonical stateless surface runs the full
  loop: list only actionable granted work, claim it under a lease, release it,
  ask the smallest **Needs you** question, and complete it — plus the one-call
  `save_complete_result` + `completeQueueItem` finish. Implementation is
  `convex/mcpQueueWork.ts`, reusing the existing `queueService` primitives
  rather than a second lifecycle. A failed transition never discards a saved
  result; it reports the partial truth.
- **Without it,** at `moving.context.read` / `moving.work.write` only, the
  surface may still read the person's Queue summaries and link a completed
  result to a Queue item for human inspection. Linking stores the complete
  planning-record reference and attributable Queue activity, makes the result
  readable as **Linked move work** in the normal handoff detail, and records
  `transition: none` explicitly. The state is left to the person because they
  did not approve Queue work.

Corrected 2026-08-17: an earlier revision of this section said canonical OAuth
"does not claim, release, answer, fail, or complete Queue work" and that those
transitions "remain on the scoped API-key surface". That was true before
`MOV-WO-010`; `convex/mcpQueueWork.ts` closed it.

## Human visibility

The move overview includes **Saved work**. It reactively shows current
decisions, estimates, plan results, and source checks written through MCP,
including status, source link where applicable, provenance label, and version.
This is the normal web reflection of an AI write; a person does not need an MCP
client to inspect what was saved. A linked Queue handoff also shows the result
summary and planning-record label without converting Waiting for your AI into a
false Working or Done state.

## Boundedness

- Accessible move list: at most 50.
- Brief record counts: at most 200 rows per core kind, with `atLeast` truth.
- Search: at most 120 candidates per requested kind, cursor paging, maximum 50
  returned rows.
- Batch read: at most 25 records.
- Evidence media: at most 8 images.
- Write batches: at most 100 inventory rows or locations, and at most 100
  planning rows in one complete result.
- HTTP request body: at most 512 KiB.

## Capability truth

### Current after protected release and exact deployment proof

- Anonymous `/mcp` requests receive OAuth discovery rather than an API-key
  error.
- Modern and legacy stateless clients discover the exact catalog in
  `STATELESS_MOVING_TOOL_NAMES`, filtered to the current grant, without a server
  session id.
- Isolated synthetic owner flows can orient, create a multi-record complete
  result, replay without duplicates, search it, and make an optimistic granular
  correction.
- Saved MCP planning records appear in the signed-in move workspace.
- Older `/mcp/connect`, `/api/mcp`, and stdio clients keep their existing doors.

### Current after official-SDK production acceptance

The client in this acceptance was the official MCP TypeScript SDK — a harness,
not an AI product. An earlier revision of this heading called it a "named
client"; corrected 2026-08-17. Named-client proof is still outstanding
(`MOV-0035`).

- A retained non-privileged Moving-only test identity completed real Clerk
  sign-in and consent, official-SDK token exchange, discovery of all eight tools
  in the catalog as it stood on that date,
  brief/search/read, one-call result save, idempotent replay, granular
  correction, hydration, updated brief, normal Move-overview reflection,
  refresh revocation, temporary client deletion, sign-out, and hard purge.
- The production Clerk token shape and verifier are covered with absent,
  resource, client-id, wrong, and expired audience regression cases.

### Partial / Unknown after that proof

- Private evidence uses the existing authenticated image action, with protocol
  coverage and existing image-action tests. A named client rendering a real
  private image remains separate proof.
- A second simultaneous client, disconnect/reconnect in a named client product,
  and cross-client stable-key isolation remain separate proof.
- Shared development Convex cannot be used as disposable proof when another
  lane has schema/data not represented by this branch; isolated `convex-test`
  is authoritative for this foundation's synthetic lifecycle.

### Closed since this document was written

- **A distinct chosen-AI grant for canonical OAuth Queue transitions** was listed
  here as **Later**. It shipped under `MOV-WO-010`: five product scopes in
  `convex/lib/aiGrants.ts`, the `aiGrants` / `aiGrantActivities` records, and the
  Queue tools in `convex/mcpQueueWork.ts`. It is deployed — the live branded
  `/.well-known/oauth-protected-resource/mcp` document carries
  `productGrantRequired`, the five `moving.*` scopes, and the four-door block.
  Moved out of **Later** on 2026-08-17.

### Later

- Additional complete-result templates only when real move workflows show a
  repeated need; the first catalog should not become raw CRUD by accumulation.

## Proof ladder

1. Typecheck and focused protocol/data tests.
2. Full lint, typecheck, test, build, tracker, philosophy, and contract checks.
3. Protected PR review and exact-head CI/preview.
4. Merge to `main`, production deployment receipt, public discovery/challenge,
   public docs, signed-out privacy, and `/updates` verification.
5. Named-client authenticated proof only through the retained Moving test
   identity and mandatory cleanup path in
   `docs/operations/mcp-production-acceptance.md`.

## Released evidence

- Protected PR `#180` passed Required CI, the informational full 1,040-test job,
  and Vercel preview on exact head `74cd6e9`, then merged at
  `0a5e0eb9a771b2c13f16bcef5adc6c4e13c8507c`.
- Post-merge Actions run `31652048912` passed both jobs on that exact merge.
- Production deployment `dpl_AxReSqDrxvy6vMoL13Q5PYumxmPz` reached Ready. The
  configured Vercel build ran `convex deploy` before the Next build.
- Public `/mcp` returns the exact RFC 9728 challenge and resource metadata;
  `/mcp/connect` and `/api/mcp` retain separate 401 boundaries; `/mcp/guide`
  and `/ai.txt` return 200; signed-out `/app/moves` redirects to sign-in without
  private data.
- `npm run mcp:doctor` passed ten discovery checks without registration, token
  exchange, tool calls, or move access. An official TypeScript SDK client
  reached production and stopped at the expected `invalid_token` challenge.
- PR `#182` repaired the provider-observed no-`aud` DCR token shape, merged as
  `d0c0a83b3a6bf01289b1fb0dd472203fc6d20ac1`, passed post-merge Actions run
  `31660891558`, and deployed Ready as
  `dpl_6ZZ6e3Ma3DDGF66x9FMZhMrpREPF` at `2026-08-13T02:29:04Z`.
- At `2026-08-13T02:35:41Z`–`02:36:21Z`, the official TypeScript SDK completed
  the retained-account production workflow: eight tools, the correct move,
  two spaces, one inventory item, five supporting records plus one complete
  result, idempotent replay, three-record search/hydration, and a confirmed
  version-two correction.
- The normal Move overview showed the result, decision, estimate, plan and two
  FMCSA source checks with `Your AI via MCP` provenance. Refresh revocation
  succeeded; both temporary OAuth applications were deleted; the session was
  signed out; and the marked move plus every linked Move/MCP/Queue record was
  hard-purged. Only the approved empty test identity remains.
- Private-image rendering, a second simultaneous named client,
  disconnect/reconnect in a client product, and canonical OAuth Queue
  transitions remain Partial / Unknown rather than inferred.

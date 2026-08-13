# Moving stateless MCP foundation

Status: released in production; named-client authenticated proof remains partial
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
| `https://movingmanifest.com/mcp` | Clerk OAuth bearer | Stateless MCP 2026 with stateless 2025 compatibility | Canonical eight-tool move workflow |
| `https://movingmanifest.com/mcp/connect` | Clerk OAuth bearer | Persisted legacy gateway | Compatibility for clients using the older 29-tool OAuth catalog |
| `https://movingmanifest.com/api/mcp` | `mmk_` API key | Stateless HTTP | Existing granular API-key automation, including scoped Queue tools |
| `npx movingmanifest-mcp` | `mmk_` API key | stdio | Existing local/API-key automation |

`/mcp/connect` is not a second name for the new catalog. It intentionally
proxies the older Convex gateway at `/mcp/legacy` so already-connected clients
do not silently receive a different tool set. New clients should use `/mcp`.

## Workflow tool contract

The canonical OAuth resource exposes exactly eight tools:

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
   sections, and source checks in one operation.

The catalog is deliberately workflow-shaped. It does not expose raw tables,
arbitrary Convex calls, account administration, membership changes, exports,
publishing, billing, or destructive deletion.

## Identity, tenant, and authority boundary

- The resource verifies the OAuth access-token signature, issuer, expiry,
  `at+jwt` type, and exact `/mcp` audience before starting the MCP handler.
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

The canonical stateless surface may read the signed-in person's Queue summaries
and may link a completed result to a Queue item for human inspection. It does
not claim, release, answer, fail, or complete Queue work. Those transitions
remain on the scoped API-key surface until Moving has a separately proven
chosen-AI grant. Linking a result records `transition: none` explicitly.

## Human visibility

The move overview includes **Saved work**. It reactively shows current
decisions, estimates, plan results, and source checks written through MCP,
including status, source link where applicable, provenance label, and version.
This is the normal web reflection of an AI write; a person does not need an MCP
client to inspect what was saved.

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
- Modern and legacy stateless clients discover the exact eight-tool catalog
  without a server session id.
- Isolated synthetic owner flows can orient, create a multi-record complete
  result, replay without duplicates, search it, and make an optimistic granular
  correction.
- Saved MCP planning records appear in the signed-in move workspace.
- Older `/mcp/connect`, `/api/mcp`, and stdio clients keep their existing doors.

### Partial until named-client proof exists

- Clerk authorization and production audience validation are implemented and
  covered with locally signed resource-bound tokens. A named third-party MCP
  client's real OAuth consent, refresh, disconnect, and reconnect flow requires
  a sanctioned disposable account and is separate proof.
- Private evidence uses the existing authenticated image action, with protocol
  coverage and existing image-action tests. A named client rendering a real
  private image remains separate proof.
- Shared development Convex cannot be used as disposable proof when another
  lane has schema/data not represented by this branch; isolated `convex-test`
  is authoritative for this foundation's synthetic lifecycle.

### Later

- A distinct chosen-AI grant for canonical OAuth Queue transitions.
- Named-client compatibility receipts and client-specific setup screenshots.
- Additional complete-result templates only when real move workflows show a
  repeated need; the first catalog should not become raw CRUD by accumulation.

## Proof ladder

1. Typecheck and focused protocol/data tests.
2. Full lint, typecheck, test, build, tracker, philosophy, and contract checks.
3. Protected PR review and exact-head CI/preview.
4. Merge to `main`, production deployment receipt, public discovery/challenge,
   public docs, signed-out privacy, and `/updates` verification.
5. Named-client authenticated proof only through a sanctioned disposable
   identity and cleanup path; absence of that path is reported, not inferred.

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
- No named third-party client completed OAuth consent, refresh,
  disconnect/reconnect, an authenticated tool call, or private-image rendering.
  Those paths remain Partial until a sanctioned disposable account exists.

# Assist With Moving — Bring Your AI MCP/OAuth alignment

**Status:** evidence-backed product and delivery plan  
**Prepared:** 2026-08-16  
**Repository baseline:** `origin/main` at `1d0b76d` (originally audited at
`8a06430340e82000d6c9edc97882a233b12043f2`; reverified 2026-08-16 after the
`AssistWithMoving` rename PR `#192`, the OAuth consent-name fix PR `#193`, and
the support-path PR `#194`)  
**Tracker owner:** `MOV-WO-010`

This plan adapts the adopted **Bring Your AI: MCP and OAuth Standard** to
Moving's actual product. The standard is the reusable connection pattern; this
document supplies Moving's workflow, records, authority boundary, current
evidence, and ordered delivery program. The standard's current draft receipt is
[assistwithlife PR #16](https://github.com/scottjarvie/assistwithlife/pull/16).

Planning truth is not release truth. Nothing in this document changes a
provider, registers a client, grants access, deploys software, or upgrades an
unproved client or capability to Current.

> **Implementation status — 2026-08-16.** The audit below describes the state
> this plan was written against. `MOV-WO-010` has since been executed in
> source: see the "What was built" section at the end. Every Partial finding
> below is now closed in the repository and still unproved in production. The
> outstanding provider and real-client steps are in
> `moving-bring-your-ai-provider-actions.md`.

> **Attribution correction.** The "Client ID Metadata Documents first, DCR only
> as fallback" rule is Moving's own decision, recorded here and adopted by
> `MOV-0032`. The family standard at its current revision does not require it —
> its only registration sentence is permissive ("dynamic registration may be
> enabled during soft-launch client testing when it is needed"). Earlier drafts
> of this document, and of five sibling products' alignment documents,
> attributed the rule to the standard. The rule is a good one and worth pushing
> back into the standard; it should not be described as already being in it.

## Product and chosen-AI split

> Assist With Moving is the person's durable private move workspace: it keeps
> move state, people, places, belongings, evidence, decisions, estimates,
> plans, handoffs, permissions, provenance, and reviewed results. The person's
> chosen AI interprets evidence, researches, compares, estimates, plans, drafts,
> and follows up within the authority the person grants.

Moving does not become the assistant, and a Queue instruction does not become
permission. The person remains the authority. Acting with a mover, marketplace,
employer, insurer, government office, or other outside party remains outside
this Work Order.

## Evidence-backed audit

### Current

- The branded `https://movingmanifest.com/mcp` route proxies to a canonical,
  stateless Streamable HTTP surface. Each request re-verifies OAuth and the MCP
  handler is created in stateless compatibility mode.
- Anonymous production discovery returned HTTP 401 on 2026-08-16 with an RFC
  9728 `WWW-Authenticate` challenge pointing to
  `/.well-known/oauth-protected-resource/mcp`. The live resource document named
  the exact `/mcp` resource and Clerk authorization server.
- The consent screen's human-readable `resource_name` now comes from
  `product.name` at all three emitters (PR `#193`), so the branded name a person
  approves matches the product. The `resource` identifier is unchanged, so
  already-registered OAuth clients are unaffected. The `/mcp` proxy is stateless
  and no longer forwards `mcp-session-id`; only the persisted `/mcp/connect`
  door still does.
- Eight canonical tools implement a coherent move workflow: brief, bounded
  search, batch record hydration, protected evidence retrieval, move-context
  save, inventory save, planning-record save, and one-call complete-result save.
- Identity is derived from a verified Clerk token. The person, client id, and
  accessible move are resolved server-side; tool input cannot select an
  arbitrary user or household.
- Writes use bounded schemas, operation ids, replay receipts, optimistic
  versions, stable keys, client attribution, source status, and ordinary Move
  and Queue UI reflection.
- Completed `MOV-WO-006` and `MOV-WO-008` preserve an official MCP SDK
  production lifecycle using a marked synthetic move, including consent/token
  exchange, result save and correction, UI reflection, refresh revocation,
  temporary DCR-client cleanup, session cleanup, and fixture purge.

### Partial

- OAuth currently advertises only identity scopes (`openid profile email`).
  Those scopes authenticate the person; they do not express or enforce separate
  Moving read, private-evidence, write, Queue-work, or archive authority.
- There is no owner-visible product grant that binds one OAuth client to
  selected move data, permitted operations, expiry, last use, and immediate
  revocation. The current `/settings/ai-connections` page explains hosted OAuth
  but manages only fallback API keys.
- Revoking a refresh token or deleting a provider client was proved in the
  synthetic run, but the resource server verifies short-lived access tokens
  offline. Moving has no product grant to check on every discovery/tool call,
  so person-initiated immediate OAuth revocation is not yet proved.
- The live authorization-server metadata advertises Dynamic Client
  Registration. No Client ID Metadata Document-first path is advertised or
  proved, and DCR is still the observed default rather than a compatibility
  fallback.
- The canonical tools can read the person's Queue summary and link a saved
  result, but cannot list only actionable AI work, claim/release it, ask the
  smallest Needs you question, or complete it under a distinct chosen-AI grant.
- Inline private-evidence code exists, but a real named AI product has not
  proved protected media rendering. Simultaneous-client isolation, named-client
  reconnect, stale-tool recovery, and mobile setup also remain unproved.
- Public/setup source names Claude, ChatGPT, and Codex as examples. Existing
  proof is an SDK harness plus temporary clients, not a complete lifecycle in
  any of those products. Grok, Hermes, and other conforming clients are likewise
  intended candidates, not supported-client claims.

### Later or outside this Work Order

- Permanent delete, export, publishing/sharing, member management, and broad
  external-action handoffs are not initial canonical OAuth authority.
- The 29-tool persisted `/mcp/connect` catalog and the larger API-key/stdio
  automation catalog remain compatibility surfaces. This Work Order does not
  collapse them into `/mcp`, market their catalogs as equivalent, or remove
  them before migration evidence exists.
- A complete document-memory/evidence-packet system, provider integrations,
  booking, purchasing, messaging, signing, paying, and autonomous work remain
  separate product programs.

## Surface inventory and truth boundary

| Door | Current role | Alignment decision |
|---|---|---|
| `/mcp` | Canonical stateless OAuth, eight move-workflow tools | Keep as the branded Bring Your AI door and align its grants, client identity, Queue workflow, setup, and proof |
| `/mcp/connect` | Persisted legacy OAuth catalog for existing connections | Compatibility only; do not call it an alias or use it as proof for `/mcp` |
| `/api/mcp` | Remote `mmk_` API-key automation surface | Keep key-only and separately scoped; never advertise OAuth discovery here |
| `mcp-server/` | Local stdio/HTTP client over the REST API and `mmk_` key | Keep as a headless/local fallback with its own catalog and proof |

## Target person → Queue → AI → saved-work loop

1. The person creates or selects a private move and saves a bounded Queue
   handoff with purpose, evidence, redaction, expected result, and review rule.
2. A connected AI calls the work-list tool. Moving returns only actionable work
   inside that client's current product grant.
3. The AI gets one bounded Move brief with route, places, relevant belongings,
   decisions, saved work, linked evidence, freshness, uncertainty, and next-step
   guidance. It does not receive a raw move dump.
4. The AI retrieves linked private photos or files through a protected batch
   evidence tool rather than scraping the signed-in site or storage host.
5. The AI reasons, researches, compares, estimates, or plans in its own
   environment. Sources are recorded as checked, blocked, gated, failed, or not
   relevant instead of silently disappearing.
6. The normal path saves one complete reviewed result—readable narrative,
   decisions, estimates, plan sections, inventory/location updates, source
   checks, provenance, and Queue result—in one idempotent approval.
7. Precise follow-up tools correct or extend the saved work without replacing
   the whole result. Queue claim, release, Needs you, and Done transitions occur
   only when the grant contains Queue-work authority.
8. Moving shows the result, evidence, AI/client, grant, timestamps, changes,
   unresolved questions, and history in the ordinary product. Revoking the
   connection blocks the next discovery and tool call while preserving
   attribution.

## Target tool families

The implementation should reuse the strong canonical eight-tool foundation,
not replace it with database CRUD. `MOV-0033` owns the exact catalog and a
compatibility plan before any rename or removal.

| Family | Required outcome | Existing foundation |
|---|---|---|
| Work discovery | List actionable work waiting for this AI and grant | Queue summaries exist; actionable granted work does not |
| Bounded brief | Return one move/work brief before creation or editing | `get_move_brief` is Current |
| Search and hydrate | Find before creating duplicates; batch only selected records | `search_move_records` and `get_move_records` are Current |
| Protected evidence | Batch-return private photos/files as native MCP content with clear fallbacks | `get_evidence_media` exists; real-client media proof is Partial |
| Complete save | Save a source-backed move result and its Queue linkage in one approval | `save_complete_result` is Current without Queue transition |
| Follow-up | Correct/extend selected context, inventory, decisions, estimates, plan sections, and Queue state | Granular saves exist; granted Queue actions do not |

New canonical names should follow the family domain-prefix convention where
current clients accept it. Existing names remain available until a dated
compatibility matrix and reconnect proof establish a safe transition. Tool
count is an outcome of the workflow, not a goal.

## Product grants, consent, and scopes

OAuth proves identity; a Moving grant decides product authority. Each active
grant must bind:

- the verified person and OAuth client identity;
- one household and selected move(s), derived and validated server-side;
- allowed product scopes and any evidence/sensitive-data ceiling;
- issued, approved, last-used, expires, revoked, and revoker facts;
- the client metadata/DCR provenance and current status; and
- an append-only, human-readable activity and result trail.

Initial canonical scopes:

| Scope | Authority | Does not imply |
|---|---|---|
| `moving.context.read` | Bounded route, places, records, decisions, saved work, and allowed Queue summaries | Private evidence, writes, Queue transitions, export, sharing, delete |
| `moving.evidence.read` | Selected private move evidence needed for the approved work | Upload, public sharing, export, unrelated evidence |
| `moving.work.write` | Idempotent context, inventory, decision, estimate, plan, source, and complete-result saves | Queue claim/completion, archive, member management, outside action |
| `moving.queue.work` | List, claim, release, ask Needs you, attach result, and complete only the person's selected handoffs | Wider move write authority or authority created by Queue text |
| `moving.archive` | Reversible archive/restore for explicitly supported records | Permanent delete, account deletion, export, publishing |

The product enforces a ceiling even when an authorization-server token contains
broader or identity-only scopes. Omitted scopes deny the operation. Revocation
and expiry are checked on every tool discovery and call.

## Client identity and registration

1. Prefer a Client ID Metadata Document: an HTTPS client id resolves to signed
   or otherwise validated metadata under the current MCP/OAuth requirements.
   Validate exact redirects and declared capabilities, bind the metadata digest
   to the product grant, cache briefly, and fail closed on mismatch.
2. Use DCR only when a conforming client cannot use Client ID Metadata Documents
   and the provider path supports a safe compatibility registration.
3. Label the registration method in connection/activity UI and receipts. A DCR
   client is not automatically a trusted named product.
4. Preserve PKCE, exact resource indicators, short-lived access tokens, refresh
   rotation/revocation, and cleanup. Do not weaken provider policy to make a
   client pass.
5. If Clerk cannot support the metadata-first path directly, stop at the
   smallest provider/architecture decision. Do not silently make DCR permanent
   or change provider configuration under this documentation plan.

## Human connection experience

The canonical `/settings/ai` experience should let a person:

- see the exact `/mcp` URL and honest Current/Partial label;
- choose a move and narrow scopes before consent;
- review active and expired OAuth connections plus fallback keys separately;
- see client identity, registration method, scopes, selected moves, last use,
  recent activity, expiry, and warnings;
- revoke access and see the next call fail without deleting past attribution;
- copy a manual Queue brief when connected work is unavailable; and
- recover from stale tools by disconnecting/reconnecting without losing saved
  move work.

`/ai`, `/ai.txt`, `/mcp/guide`, `llms.txt`, and `llms-full.txt` must derive their
current catalog and first-call/save/media/recovery guidance from the shipped
contract. Exact setup steps and “supported” language appear only after a named
client completes the lifecycle in `MOV-0035`.

## Failure modes this program must prevent

- identity-only OAuth being mistaken for product read/write permission;
- Queue intent silently expanding authority;
- revoked connections remaining usable until a token naturally expires;
- DCR becoming the undocumented default when metadata documents should lead;
- cross-owner, cross-move, or cross-client record disclosure;
- approval fatigue from tiny writes instead of one complete save;
- private media scraped through normal web fetch or blocked storage URLs;
- retries duplicating inventory, decisions, plan sections, sources, or results;
- lost source status, dates, grant, client, AI, or operation provenance;
- stale tool catalogs after deployment or compatibility-door confusion; and
- claiming Claude, ChatGPT, Codex, Grok, Hermes, or another client from an SDK
  harness, a discovery response, or a successful token exchange alone.

## Ordered delivery and proof

`MOV-WO-010` groups the actual missing system:

1. `MOV-0032` — current Streamable HTTP/protected-resource alignment, Client ID
   Metadata Document-first identity, and DCR fallback compatibility.
2. `MOV-0023` — narrow Moving grants, consent, activity, expiry, and immediate
   revocation.
3. `MOV-0033` — granted Queue → brief/evidence → one-call result → follow-up
   workflow with no raw CRUD.
4. `MOV-0034` — canonical `/settings/ai`, manual fallback, activity/revoke, and
   synchronized human/AI documentation.
5. `MOV-0035` — repeatable SDK plus real-client lifecycle, cross-owner refusal,
   revoke/reconnect/stale-tool recovery, mobile/desktop setup, and exact cleanup.

Proof remains layered: source/local tests; isolated synthetic lifecycle;
protected PR/CI; exact deployment/provider; anonymous public discovery;
authenticated product lifecycle; named-client product lifecycle; independent
audit. A lower layer never substitutes for a higher one.

At least one real compatible AI product must complete connect → consent → tool
list → bounded read → evidence → complete save → follow-up → UI reflection →
revoke → reconnect → cleanup before the whole Bring Your AI connection becomes
Current. Each additional named client receives its own evidence row; untested
clients remain Unknown and are described only by the capability requirement:
remote Streamable HTTP MCP plus compatible OAuth.

## What was built — 2026-08-16

Implemented on `claude/mov-wo010-bring-your-ai` from `origin/main` `ee16bd4`.
Each of the seven Partial findings above, and what closed it:

| Partial finding | What closed it | Still unproved |
|---|---|---|
| Identity-only OAuth scopes | Five product scopes in `convex/lib/aiGrants.ts`, each with its does-not-imply boundary as product copy, advertised in the protected-resource document as the product ceiling | A live token exchange carrying them |
| No product grant object | `aiGrants` binds one OAuth client to selected moves, chosen scopes, an approval, a consent snapshot frozen at approval time, an expiry, last use, and revocation; `aiGrantActivities` keeps the owner-readable trail | Production grant data |
| No immediate revocation | `convex/lib/mcpGrantAccess.ts` re-reads the grant on every discovery and every call, so a revoked connection is refused while its token is still valid | The live revoke → refuse round trip |
| DCR-default with no CIMD path | `convex/lib/mcpClientIdentity.ts` prefers a metadata document, requires it to name its own URL, validates redirects, binds its digest to the grant, and refuses rather than downgrades on failure | Clerk enabling the metadata-document path |
| No Queue claim/release/complete/needs-you tools | `convex/mcpQueueWork.ts` adds five tools under `moving.queue.work` over the existing `queueService` primitives, plus a one-call finish on `save_complete_result` | A named client running the loop |
| Unproved private media delivery | The lifecycle harness returns inline bytes scoped to the item the photo is attached to, with no storage link | Real bucket delivery inside a real AI product |
| No named-client proof | A scripted nine-step harness with an evidence matrix that labels itself harness proof | Every named client, which stays Unknown |

Two decisions worth recording because they were not in the plan:

- **`describe_connection` is always available and carries no scope.** Filtering
  the catalog by grant meant a person with no grant saw an opaque protocol
  failure, because a server with no tools has no `tools` capability. One
  scope-free tool that explains the connection and points at `/settings/ai` is
  a better answer than either an empty catalog or a fake one.
- **A grant binds to the first client that uses it.** This is what makes
  "revoke this AI" mean one connection rather than all of them, and it is why a
  second AI arriving on the same sign-in is refused rather than sharing the
  first one's authority.

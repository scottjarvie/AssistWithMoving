---
id: MOV-WO-010
title: Bring a chosen AI into a private move with scoped, revocable OAuth
execution: active
audit: not-audited
cards: MOV-0032 MOV-0023 MOV-0033 MOV-0034 MOV-0035 MOV-0038
created: 2026-08-16
updated: 2026-08-17
proposed-by: Codex
approved-by: Scott Jarvie
approval-evidence: "Bring Your AI implementation program charter, assist-with-life/planning/mcp-program-2026-08.md, which places Moving in Wave 1 as a gateway retrofit with the full tool inventory and names the staged implementation sequence this Work Order already carried"
executor: Claude Fable 5
---

## Goal

Let a person connect one compatible chosen AI to exactly the private move
context they approve, hand it one Queue job with linked evidence, receive one
durable source-backed result and precise follow-up, see the connection and its
activity, and revoke it immediately—with Client ID Metadata Documents first,
DCR only as fallback, and named-client claims only after real lifecycle proof.

## Why this bundle exists

Moving already has a strong canonical stateless MCP and a proven SDK lifecycle.
The remaining gap is one connected product system: product-level grants and
consent, metadata-first client identity, granted Queue work, protected evidence,
human connection/revoke controls, and real-client proof. Splitting those into
unrelated protocol, UI, Queue, or docs tasks would leave the person without a
trustworthy end-to-end connection.

## Current truth

`/mcp` is a live stateless Streamable HTTP resource with protected-resource
discovery, the exact `STATELESS_MOVING_TOOL_NAMES` catalog — fifteen grant-gated
workflow-native tools (corrected 2026-08-17; "eight" was the count before this
Work Order added the five Queue tools, `describe_connection`, and
`archive_move_records`) — server-derived person/move identity,
bounded evidence reads, replay-safe complete-result saves, provenance, and
normal Queue/Move reflection. Official SDK production acceptance and cleanup
are preserved in `MOV-WO-006` and `MOV-WO-008`.

The seven gaps this Work Order was written to close are closed **in source**.
A product grant now decides authority and is re-read on every discovery and
every call; five scopes carry published does-not-imply boundaries; Client ID
Metadata Documents lead with dynamic registration as a labelled fallback;
canonical OAuth can list, claim, question, and complete Queue work; archive is
reversible and separate; `/settings/ai` is a real grant manager; and a scripted
nine-step harness runs the whole lifecycle with marked synthetic records.

**Provider truth, CONFIRMED 2026-08-17:** Clerk production Dynamic Client
Registration is live fleet-wide; DCR is the approved soft-launch client-identity
path for Moving; Client ID Metadata Documents are **deferred by decision**, not
blocked or awaiting a provider ticket. Provider action 1 in
`docs/planning/moving-bring-your-ai-provider-actions.md` is closed as deferred.
Client identity is no longer a reason a real-client lifecycle cannot run.

The connection is still **Partial**, and deliberately so, for exactly one reason:
**no named AI product has completed the lifecycle.** Every client stays Unknown.

**Correction, 2026-08-17.** This paragraph previously also said "Nothing here is
deployed." That is false. PRs `#196`–`#201` merged and production carries this
work: the live branded `/.well-known/oauth-protected-resource/mcp` document
serves `productGrantRequired`, the five `moving.*` scopes, `grantBoundaryVersion`
`2026-08-16`, the grant-manager URL and the four-door block; `POST /mcp` returns
a 401 whose `resource_metadata` points at that branded route; and
`POST /api/mcp?key=mmk_...` returns 401 `query_credentials_rejected` with rotate
guidance. Verified by read-only probe on 2026-08-17. Deployment is no longer a
gap; the real-client run is.

The remaining outside-the-repository steps are written up in
`docs/planning/moving-bring-your-ai-provider-actions.md`; the evidence and
target contract remain in
`docs/planning/moving-bring-your-ai-mcp-oauth-alignment.md`.

This Work Order is **Active**. Scott approved execution under the family
program charter
(`assist-with-life/planning/mcp-program-2026-08.md`, Wave 1 gateway retrofit).
Approval covers software inside this repository. It is still not permission to
change Clerk, provider settings, accounts, secrets, billing, DNS, or production
data; those steps are written up for Scott to run separately.

## Sequence

1. `MOV-0032` — align current Streamable HTTP and protected-resource discovery,
   prefer Client ID Metadata Documents, keep DCR as compatibility fallback, and
   preserve a safe door/tool migration path.
2. `MOV-0023` — enforce narrow Moving read/evidence/write/Queue/archive grants,
   consent, expiry, activity, and immediate revocation on every discovery/call.
3. `MOV-0033` — complete actionable Queue → bounded brief/evidence → one-call
   saved result → precise follow-up under the product grant, without raw CRUD.
4. `MOV-0034` — ship canonical `/settings/ai`, connection/activity/revoke UI,
   manual Queue fallback, and synchronized human/AI setup documentation.
5. `MOV-0038` — deliver private move photos as real bytes within a server
   ceiling, stepping down before dropping, and name every omission.
6. `MOV-0035` — prove the SDK and at least one real compatible AI product through
   the full lifecycle, then update client-specific truth and clean every fixture.

The sequence is deliberate: client identity and transport establish who is
connecting; product grants establish what is allowed; domain tools use that
authority; the human experience exposes it; lifecycle proof decides what may be
called Current.

## Dependencies

- Completed stateless foundation and SDK proof in `MOV-WO-005` and
  `MOV-WO-006`.
- Completed Queue-result linkage and normal UI reflection in `MOV-WO-008`.
- Canonical four-state Queue foundation, move access resolvers, private evidence
  actions, planning records, idempotency receipts, and retained test runbooks.
- Adopted Bring Your AI standard plus Moving's Project Philosophy and alignment
  plan; target-repository evidence controls every capability claim.
- Normal protected GitHub/CI and Convex-before-Vercel release path for software.

## Exclusions

- No raw database CRUD, unbounded export, generic task runner, built-in AI,
  autonomous background assistant, or portfolio-wide grant.
- No permanent delete, account deletion, public publishing, share-link/member
  management, payments, bookings, signing, messaging, marketplace action, or
  provider/vendor integration in the canonical first connection.
- No external-action handoff system; `MOV-0036` preserves that later outcome.
- No removal or silent catalog merge for `/mcp/connect`, `/api/mcp`, or stdio
  without explicit migration and reconnect proof.
- No real user/move data, provider/account/security-policy change, secrets,
  billing, DNS/domain cutover, or unsupported client promise.

## Stop rules

- Stop at the smallest exact decision if Clerk or the deployed authorization
  path cannot support Client ID Metadata Documents, narrow product consent, or
  immediate revocation without a provider/account/security-policy change.
- Stop for MFA, identity ambiguity, access expansion, production data, secrets,
  billing, DNS/domain, irreversible migration, or outside-world action.
- Do not weaken token, redirect, resource, tenant, evidence, Queue, or cleanup
  boundaries to make a client connect.
- Split unrelated findings into follow-up Cards; do not turn this into API-key
  parity, a whole-app permission rewrite, or a generic MCP platform.

## Human gates

Scott approved execution through the family program charter. Inside an approved
order, routine architecture, schema, UI, test, docs,
PR, preview, synthetic-fixture, and release decisions belong to the executor.
A separate decision remains required for provider configuration, account/access
expansion, secrets, billing, DNS/domain, real production data, permanent delete,
or any outside-world action.

## Verification

### Source and isolated lifecycle

- Current MCP protocol/transport, protected-resource, Client ID Metadata
  Document, DCR fallback, redirect/resource/token, CORS, and stale-registry tests.
- Product-grant tests for scope separation, selected moves/evidence, expiry,
  immediate revocation, cross-owner/move/client refusal, and non-leaking errors.
- Queue → brief/evidence → complete save → follow-up/Done scenarios with stable
  ids/keys, idempotency, optimistic conflict, source/provenance, and no raw dump.
- `/settings/ai`, manual fallback, docs generation/drift, mobile/desktop,
  keyboard/focus, no-JavaScript/plain-text, and signed-out privacy tests.
- Full lint, typecheck, unit/contract suite, production build, tracker and
  Project Philosophy synchronization, and `git diff --check`.

### Protected release and live proof

- Protected PR/CI, exact Convex/Vercel deployment, public anonymous challenge,
  metadata, docs, and signed-out refusal are recorded separately.
- One marked non-privileged identity and removable move prove client metadata or
  documented DCR fallback, consent/scopes, exact tools, bounded read, protected
  evidence, complete write, follow-up, normal UI, immediate revoke refusal,
  reconnect/stale-tool recovery, and cross-owner refusal.
- Every temporary client, token/grant, session/device, move, Queue item, media,
  planning/source record, and credential is removed; re-query proves absence.
- Claude, ChatGPT, Codex, Grok, Hermes, and other clients each remain Unknown
  until their own product lifecycle passes. SDK proof never substitutes.
- Release notes, tracker, Project Philosophy, `/ai`, `/ai.txt`, `/mcp/guide`,
  llms guides, and settings truth are synchronized to the exact evidence.

## Independent audit

Not audited. A separate AI must assess the completed Cards, lifecycle receipts,
cleanup, and claim truth before this Work Order can record Passed.

## Execution evidence

The 2026-08-16 audit used fresh `origin/main` `8a064303`, current source, the
adopted family standard, Project Philosophy, tracker, Queue/auth/identity
models, all four agent doors, existing release receipts, and read-only
production anonymous discovery.

Implementation followed on branch `claude/mov-wo010-bring-your-ai` from
`origin/main` `ee16bd4`. Repository evidence:

- new `convex/lib/aiGrants.ts`, `convex/lib/mcpClientIdentity.ts`,
  `convex/lib/mcpGrantAccess.ts`, `convex/aiGrants.ts`, `convex/mcpQueueWork.ts`,
  `convex/mcpArchive.ts`; `aiGrants` and `aiGrantActivities` tables, with move
  purge coverage extended so a purged move leaves no grant activity behind;
- fifteen canonical tools, filtered at discovery by the person's current grant,
  plus an always-available `describe_connection` so a person with no grant gets
  a sentence rather than a protocol failure;
- `/settings/ai` grant manager with `/settings/ai-connections` redirecting;
  `/ai`, `/ai/start`, `/mcp/guide`, `ai.txt`, `llms.txt`, and `llms-full.txt`
  regenerated from the shipped contract with every named-client claim removed;
- `tests/unit/mcp-product-grants.test.ts` (34 tests) and
  `tests/unit/mcp-lifecycle-harness.test.ts` (`npm run proof:mcp-lifecycle`);
- full lint, typecheck, unit suite, build, tracker verification, and Project
  Philosophy synchronization green.

No provider, account, secret, deployment, client registration, token, or
production data was changed. The Clerk metadata-document enablement, the
ordered Convex-before-Vercel deployment, and the named-client lifecycle are
prepared and unrun.

## Deploy readiness — ready for production deploy, awaiting Codex

Verified 2026-08-16 from a clean worktree at `origin/main` `118f91c`, with npm
and `package-lock.json`, no `.env.local`, and no deployment contacted.

- `npm run lint` 0 errors (1 pre-existing unused-var warning);
  `npm run typecheck` clean — which is also the Convex-functions compile proof,
  since `convex/_generated` is committed and `tsc` covers all 212 files under
  `convex/`; `npm run test` 198 files / 1125 tests pass; `npm run build`
  succeeds and emits `/settings/ai`.
- The schema delta production will receive is **purely additive**: two new
  tables (`aiGrants`, `aiGrantActivities`) and eight indexes. Live production is
  commit `d8ed8fe` per the v0.6.0 completeness ledger; diffing
  `convex/schema.ts` from there to `origin/main` is **127 lines added and 0
  removed** (`git diff --numstat d8ed8fe origin/main -- convex/schema.ts`,
  re-run 2026-08-17): 117 for the two grant tables, plus 10 for two
  compatibility fields on `moves` and their comment. **Correction,
  2026-08-17:** this entry said "117 lines" and "No existing table gains a field
  at all." Both were wrong. The pre-existing `moves` table gains
  `nextItemCodeSeq` and `nextBoxCodeSeq`, both `v.optional(v.number())`
  (`convex/schema.ts`). Because they are optional, the conclusion still holds —
  no required-field trap, no backfill, existing rows untouched — but the fields
  are real and they matter: they exist so documents left behind by an unmerged
  perf branch still validate. See
  [`docs/operations/convex-legacy-code-seq-cleanup.md`](../../operations/convex-legacy-code-seq-cleanup.md),
  which had this right all along, and
  `docs/planning/moving-bring-your-ai-provider-actions.md`, which correctly says
  127. (A separate earlier draft counted `movePlanningRecords` and
  `mcpOperations` as new. They are not — `694d7d8` is an ancestor of the live
  commit and both tables are already in production.)
- `npm run mcp:doctor` and `npm run mcp:doctor:legacy` both return 10 pass / 0
  warn / 0 blocked / 0 fail against production today. They are read-only
  discovery probes and were run as a pre-deploy baseline, so after the deploy
  they are a regression check rather than proof of the new work.
- **One defect found and fixed before it could break the deploy.** The branded
  `/.well-known/oauth-protected-resource/mcp` route served only
  `["openid","profile","email"]` and no grant block, while the document carrying
  the five `moving.*` scopes, `productGrantRequired`, and the four-door block
  existed only on the Convex gateway — which no client ever fetches, because the
  `/mcp` proxy rewrites the 401 `resource_metadata` to point at the branded
  route. Deploying as-is would have shipped the grant system with its scopes
  invisible to every client, and the documented post-deploy check would have
  failed. Both documents now build from one shared source
  (`protectedResourceMetadataBody`), and
  `tests/unit/mcp-endpoint-separation.test.ts` locks the contract.

The copy-paste deploy procedure, including the `CONVEX_DEPLOY_KEY`-in-
`.env.local` trap, the environment table, post-deploy verification, and the
rollback note, is section 2 of
`docs/planning/moving-bring-your-ai-provider-actions.md`.

## History

- 2026-08-16 · Scott via coordinator task — requested a visible substantial
  Moving MCP/OAuth alignment program using the adopted Bring Your AI standard,
  with workflow-native tools, Current/Partial/Later truth, metadata-first client
  identity, DCR fallback, and no unproved named-client claim.
- 2026-08-16 · Codex — audited fresh main without touching the dirty active
  checkout, wrote the Moving-specific alignment plan, and proposed this grouped
  Work Order. Execution remains unapproved.
- 2026-08-16 · Scott via the Bring Your AI program charter
  (`assist-with-life/planning/mcp-program-2026-08.md`) — approved execution.
  Moving is a Wave 1 gateway retrofit. Execution moved Proposed → Active and
  `MOV-0032`, `MOV-0023`, `MOV-0033`, `MOV-0034`, `MOV-0035` moved to Doing.
  Provider-dashboard and real-client steps stay outside the repository and are
  written up for Scott to run.
- 2026-08-16 · Claude Fable 5 — verified repo-side deploy readiness from a clean
  `origin/main` worktree. Found and fixed the branded protected-resource
  metadata serving three scopes and no grant contract, which would have made the
  documented post-deploy check fail; enumerated the additive two-table schema
  delta against the live commit; corrected the runbook's deploy ordering, which
  told Codex to run `npx convex deploy` by hand when `vercel.json` already
  deploys Convex inside the Vercel build; and captured the live 401 challenge
  verbatim so the post-deploy check compares against a real response rather than
  a described one. **Ready for production deploy — awaiting Codex.**
- 2026-08-17 · Claude Fable 5 — recorded the confirmed provider truth (Clerk
  production DCR live fleet-wide, DCR the approved soft-launch path, Client ID
  Metadata Documents deferred by decision) across `MOV-0032`, `MOV-0035`, this
  Work Order's Current truth, and the provider-actions runbook, where step 1 is
  now closed as deferred rather than outstanding. Then inspected the shipped
  implementation against the family standard and found the recorded media gap
  was mis-stated: private-media byte delivery is **real in source** and reuses
  the web app's own server-side object read (`photos.getDisplayUrlForSubject`
  → Cloudflare Images or a Backblaze B2 signed URL, fetched server-side, no
  storage link ever returned). Only the test harness stubbed the network. The
  genuine gap was that delivery was unbudgeted and failure-opaque, so a real
  batch of photos could fail the whole call and a missing photo told an AI
  nothing. That is closed by `MOV-0038`: server-enforced per-image and batch
  ceilings, an automatic step down to a smaller variant before a photo is
  dropped, and a ranked, plain-language reason for every omission. No new
  credential or environment variable is introduced, so the deploy contract in
  the runbook is unchanged. No provider, secret, deployment, or production data
  was touched.
- 2026-08-17 · Claude Opus 5 — documentation reconciliation against `origin/main`
  `ab6652b` and read-only live probes. This Work Order's own Current truth said
  "Nothing here is deployed"; that was false — PRs `#196`–`#201` merged and
  production serves the grant block, verified on
  `/.well-known/oauth-protected-resource/mcp`. The Deploy readiness section said
  the schema delta was 117 lines and that "No existing table gains a field at
  all"; the real numbers are 127 lines and two optional fields on `moves`, which
  is what `docs/operations/convex-legacy-code-seq-cleanup.md` and
  `docs/planning/moving-bring-your-ai-provider-actions.md` said all along. Both
  corrected in place with the diff command that produces the number. The stale
  eight-tool count was corrected to the fifteen names in
  `STATELESS_MOVING_TOOL_NAMES`, and a required-CI gate
  (`tests/unit/mcp-doc-tool-catalog.test.ts`) now derives the catalog from source
  so no document can disagree with it again. `MOV-0023` and `MOV-0034` closed;
  `MOV-0033`, `MOV-0035` and `MOV-0038` deliberately left open. **The Partial
  label on the connection is unchanged and correct: no named AI product has
  completed the lifecycle.** No product code, authority model, tool catalog,
  scope, provider setting, secret, deployment, or production data was touched.

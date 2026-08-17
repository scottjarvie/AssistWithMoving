---
id: MOV-WO-010
title: Bring a chosen AI into a private move with scoped, revocable OAuth
execution: proposed
audit: not-audited
cards: MOV-0032 MOV-0023 MOV-0033 MOV-0034 MOV-0035
created: 2026-08-16
updated: 2026-08-16
proposed-by: Codex
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
discovery, eight workflow-native tools, server-derived person/move identity,
bounded evidence reads, replay-safe complete-result saves, provenance, and
normal Queue/Move reflection. Official SDK production acceptance and cleanup
are preserved in `MOV-WO-006` and `MOV-WO-008`.

The whole Bring Your AI lifecycle is **Partial**. OAuth uses identity-only
scopes; DCR is the observed registration path; no product grant or immediate
revocation check exists; `/settings/ai-connections` manages fallback keys but
not OAuth clients; canonical OAuth cannot transition Queue work; and no named AI
product has proved connect through revoke/reconnect/cleanup. The evidence and
Moving-specific target contract are recorded in
`docs/planning/moving-bring-your-ai-mcp-oauth-alignment.md`.

This Work Order is **Proposed**, not permission to change Clerk, provider
settings, accounts, production data, or deploy software. The Cards remain
Backlog until Scott approves execution as Ready.

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
5. `MOV-0035` — prove the SDK and at least one real compatible AI product through
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

Scott must move this Work Order from Proposed to Ready before implementation.
Inside an approved Ready order, routine architecture, schema, UI, test, docs,
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

No implementation has started. The 2026-08-16 audit used fresh `origin/main`
`8a064303`, current source, the adopted family standard, Project Philosophy,
tracker, Queue/auth/identity models, all four agent doors, existing release
receipts, and read-only production anonymous discovery. No provider, account,
secret, deployment, grant, client registration, token, or production data was
changed.

## History

- 2026-08-16 · Scott via coordinator task — requested a visible substantial
  Moving MCP/OAuth alignment program using the adopted Bring Your AI standard,
  with workflow-native tools, Current/Partial/Later truth, metadata-first client
  identity, DCR fallback, and no unproved named-client claim.
- 2026-08-16 · Codex — audited fresh main without touching the dirty active
  checkout, wrote the Moving-specific alignment plan, and proposed this grouped
  Work Order. Execution remains unapproved.

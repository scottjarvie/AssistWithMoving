---
id: MOV-WO-006
title: Run the retained-account production MCP acceptance loop
execution: active
audit: not-audited
cards: MOV-0029
created: 2026-08-12
updated: 2026-08-12
approved-by: Scott Jarvie
approval-evidence: "explicit retained Moving production test identity and live MCP/UI acceptance authorization in coordinator task 019ff621-54b9-78f0-a51d-dd20fb0cb247"
executor: Codex
---

## Goal

Prove that a chosen AI can use Moving's real production OAuth MCP to read the
correct synthetic move, save source-backed complete work, correct it, and make
the result visible in the normal Move overview, with repeatable cleanup.

## Current truth

The retained Clerk identity exists and its isolated synthetic move is clearly
marked. Real consent produced a correctly signed Clerk `at+jwt` whose production
shape has no `aud`; the released exact-audience verifier rejected it. Refresh
revocation succeeded and no MCP tool reached data. The repair and its focused
regression tests are in progress through the normal protected path.

## Included scope

- Exact production Clerk issuer and retained non-privileged test identity.
- Canonical `https://movingmanifest.com/mcp` official-SDK OAuth flow.
- Read brief/search, one-call source-backed result, replay, granular correction,
  hydration, updated brief, and normal UI reflection.
- Safe verifier repair revealed by the run, protected CI/deployment, and durable
  Current/Partial/Later truth.
- Token/client/session/grant revocation and hard purge of all marked move data.

## Sequence

1. Create and label the isolated retained identity and synthetic move.
2. Exercise real OAuth consent and diagnose any released-path failure before
   permitting MCP writes.
3. Repair a verified in-scope defect through focused tests and a protected
   release.
4. Rerun the source-backed MCP workflow and verify normal UI reflection.
5. Revoke/delete connection state, purge marked records, and publish exact
   evidence and remaining gaps.

## Dependencies

MovingManifest production Clerk and Convex/Vercel deployment, the canonical
stateless MCP, the official TypeScript MCP SDK, the normal Move overview and
hard-purge workflow, and the repo-owned protected release path.

## Exclusions

Real household data, Scott's account, other users, elevated roles, private-media
proof, Queue transitions, multi-client access, provider policy, secrets,
billing, DNS, and unrelated product work.

## Validation approach

1. Lock the actual Clerk production token shape in focused issuer/signature,
   type, expiry, client-id, and audience-shape regression tests.
2. Pass full local gates and protected PR/CI/deployment.
3. Run an official SDK against the public canonical endpoint under the retained
   test identity and save a real source-backed move result idempotently.
4. Verify the result, source checks, status, and `Your AI via MCP` provenance in
   the normal Move overview.
5. Revoke/delete temporary connection state, hard-purge the marked move, and
   prove the marker is absent.

## Stop rules

Stop for any unexpected access to another household, a need for a provider or
security-policy change, an unremovable fixture, real data, billing, secrets,
DNS, or an irreversible outside-world action. Routine code, test, protected PR,
CI, deployment, marked production proof, and exact cleanup remain authorized.

## Human gates

Scott has already authorized the retained non-privileged identity, real
production sign-in/consent, marked synthetic move work, normal protected
release, and full cleanup. No further human action is required unless a stop
rule is reached.

## Execution evidence

- Moving MCP Test was created only in MovingManifest production Clerk with no
  elevated role; its randomized bootstrap password was discarded.
- Official-SDK consent and token exchange succeeded against the real production
  authorization server and canonical resource.
- The released endpoint rejected the provider-issued no-`aud` access token
  before any MCP data call; refresh-token revocation returned success.
- The focused compatibility test now covers absent, resource, client-id, wrong,
  and expired audience shapes while retaining the other token checks.
- Protected release, successful tool/UI receipt, and final cleanup are pending.

## Verification

Active. Local focused verifier proof passes. Protected release, authenticated
workflow, normal UI reflection, and final cleanup receipts remain next.

## Independent audit

Not yet audited. Completion of this Work Order will not imply a separate
independent review.

## History

- 2026-08-12 · Scott via coordinator task — authorized the retained test
  identity and live production MCP/UI acceptance with full fixture cleanup.
- 2026-08-12 · Codex — created the isolated identity and move, reproduced the
  production no-`aud` incompatibility, revoked the refresh token, and began the
  protected compatibility repair.

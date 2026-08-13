---
id: MOV-WO-007
title: Release the Assist With Moving rebrand and first-run repair
execution: active
audit: not-audited
cards: MOV-0030
created: 2026-08-13
updated: 2026-08-13
approved-by: Scott Jarvie
approval-evidence: "coordinator task 019ff621-54b9-78f0-a51d-dd20fb0cb247 requested the Moving rebrand/first-run pass and escalated the live blank Assist-domain sign-in"
executor: Codex
---

## Goal

Make the next ordinary visit feel like one coherent Assist With Moving product:
a usable sign-in entry, correct visible identity, a simple empty workspace, an
honest Queue entrance, and a recommended hosted MCP setup path.

## Current truth

The public Assist domain currently reaches the application, but production
Clerk rejects its origin because the authenticated application is still bound
to `movingmanifest.com`. Source-level identity and first-run repairs are in
progress; protected deployment and live verification remain pending.

## Included scope

- Public pages, metadata/PWA identity, auth framing, signed-in shell, Queue
  connection explanation, AI/MCP setup, shared views and printable packets.
- Reversible source redirect from the Assist entry hosts to the currently valid
  Clerk-bound compatibility host, preserving full path and query.
- Unit, integration, browser, responsive, protected CI/deployment, live
  first-run, and release-truth proof.

## Exclusions

Clerk application/domain changes, DNS, OAuth resource migration, API-key or MCP
identifier changes, real household data, another user's account, billing,
security-policy changes, and unproved future capabilities.

## Sequence

1. Reproduce and diagnose the ordinary production sign-in failure.
2. Repair the entry path and align visible product identity and first-run copy.
3. Validate source, desktop/mobile browser behavior, and protected CI.
4. Deploy normally and verify the canonical Assist entry in a real browser.
5. Publish exact release and tracker truth.

## Dependencies

The existing Moving production Clerk application, Vercel routing, protected
GitHub release path, normal signed-in workspace, Queue, and hosted OAuth MCP.

## Validation approach

1. Reproduce the exact live browser failure and record its console cause.
2. Lock host redirect behavior and brand metadata with focused tests.
3. Exercise public, sign-in, signed-in empty workspace, Queue, AI Connections,
   MCP guide, and Updates at representative mobile and desktop sizes.
4. Merge through protected CI, verify the exact production deployment, then
   rerun ordinary sign-in using only the retained empty test identity.
5. Publish a complete release ledger and Current/Partial/Later truth.

## Stop rules

Stop for a true Assist-domain Clerk/OAuth cutover, DNS or provider identity
change, real data, another user, secrets, billing, or a product-direction choice.
Routine source repair, protected CI/deploy, empty-account sign-in, and read-only
first-run validation remain authorized.

## Human gates

Scott has authorized source repair, protected release, and ordinary production
sign-in with the retained empty test identity. A true Clerk/domain/OAuth
cutover remains a separate provider and product decision.

## Execution evidence

- Live Chrome reproduced `assistwithmoving.com/sign-in` with zero controls and
  Clerk's production-origin rejection for the non-bound host.
- Source redirect, visible identity, and hosted-OAuth-first setup are implemented
  with focused redirect tests. Protected and production proof remain active.

## Verification

Active. Local checks and browser proof are in progress.

## Independent audit

Not yet audited. Completion does not imply a separate independent review.

## History

- 2026-08-13 · Scott via coordinator task — reported the blank Assist-domain
  sign-in as a first-run blocker and authorized in-scope repair and live proof.
- 2026-08-13 · Codex — reproduced the Clerk origin rejection, chose the
  reversible compatibility redirect, and began the coherent identity and
  first-run implementation.

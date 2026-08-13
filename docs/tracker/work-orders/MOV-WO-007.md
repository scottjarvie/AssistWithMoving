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

The public Assist domain now preserves the requested path and enters through
the Clerk-bound `movingmanifest.com` compatibility host. PR `#184`, post-merge
Actions run `31747746115`, production deployment
`dpl_EUR93mXnmoi6PgLGsnts7fwA6uAW`, and an ordinary retained-account browser
run verify the working sign-in, empty workspace, Queue, and hosted-OAuth-first
AI Connections path. No provider/domain cutover or real move data was used.

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
  with focused redirect tests.
- PR `#184` merged as `d1f7364ad000f4193b6a966e4c8f4c06a423e1fd`;
  both required checks passed in post-merge run `31747746115`, including 1,046
  unit tests.
- Production deployment `dpl_EUR93mXnmoi6PgLGsnts7fwA6uAW` reached Ready at
  `2026-08-13T21:56:23.554Z` from the exact merge.
- The live Assist sign-in returned 307 with the Queue return URL intact. Its
  destination rendered the Assist With Moving title, two inputs, Google and
  password controls, and no Clerk origin error.
- The retained empty identity reached the normal `/app`, `/app/queue`, and
  `/settings/ai-connections` paths. No move or Queue fixture was created or
  read; the UI showed Create your first move, No active move, and recommended
  hosted MCP OAuth with API keys as fallback.
- A one-time impersonation URL appeared in internal browser automation output.
  It was not preserved or repeated: the ticket was consumed, the exact active
  device/session was revoked through Clerk, the Devices table returned None,
  the product returned to signed-out state, and the temporary tabs were closed.

## Verification

The product repair is complete across source, local checks, protected CI, exact
production deployment, anonymous sign-in controls, retained empty-account first
run, and session cleanup. The prepared v0.5.0 release record remains active
until it passes its own protected publication and `/updates` verification. A
true Assist-domain Clerk/OAuth cutover, live authenticated mobile proof, and
every-browser sign-in remain unproved and are not implied.

## Independent audit

Not yet audited. Completion does not imply a separate independent review.

## History

- 2026-08-13 · Scott via coordinator task — reported the blank Assist-domain
  sign-in as a first-run blocker and authorized in-scope repair and live proof.
- 2026-08-13 · Codex — reproduced the Clerk origin rejection, chose the
  reversible compatibility redirect, and began the coherent identity and
  first-run implementation.
- 2026-08-13 · Codex — merged and deployed PR `#184`, completed the ordinary
  retained-account first-run proof, revoked the temporary session, and prepared
  the exact Current/Partial/Later release record for protected publication.

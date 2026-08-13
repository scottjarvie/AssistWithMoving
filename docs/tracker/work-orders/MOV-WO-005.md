---
id: MOV-WO-005
title: Deliver the first durable chosen-AI move loop
execution: complete
audit: not-audited
cards: MOV-0028
created: 2026-08-12
updated: 2026-08-12
approved-by: Scott Jarvie
approval-evidence: "explicit stateless Moving MCP foundation and protected-release authorization in coordinator task 019ff621-54b9-78f0-a51d-dd20fb0cb247"
executor: Codex
---

## Goal

Give a signed-in person's chosen AI a safe, useful first workflow for move
context, rooms/locations, inventory/evidence, decisions, estimates, planning
results, and source checks, with durable web-visible results and honest
Current/Partial/Later truth.

## Current truth

The complete bounded foundation is released in production through protected PR
`#180` at merge `0a5e0eb`. Official SDK protocol discovery, OAuth-token checks,
tenant boundaries, replay-safe writes, bounded search, optimistic correction,
web reflection, local and protected gates, Convex/Vercel deployment, and public
discovery/refusal/docs/privacy proof pass. A named-client authenticated receipt
remains separate and unproved. Canonical OAuth still cannot transition Queue
work.

## Included scope

- Canonical stateless OAuth transport with resource-bound token verification,
  real protected-resource discovery, modern MCP, and stateless legacy protocol.
- Bounded brief/search/batch/media reads and replay-safe context, inventory,
  granular planning, and complete-result writes.
- Durable planning records, audit/provenance, source truth, normal web reflection,
  compatibility routing, setup/agent docs, tests, protected PR, deployment, and
  release evidence.
- Existing Queue summaries may be read and complete results linked, but Queue
  state transitions remain outside this Work Order.

## Sequence

1. Orient to philosophy, tracker, auth/tenant model, schema, routes, MCP/API
   surfaces, deployment, and current repository state.
2. Define the product-native tool and compatibility contract.
3. Implement transport, data, tools, UI reflection, docs, and durable tracker
   truth.
4. Exercise protocol, authorization, isolated synthetic lifecycle, full local
   gates, and any sanctioned real client path.
5. Publish through a protected PR, verify exact CI/deployment/public behavior,
   and record remaining proof gaps without inference.

## Dependencies

Current Moving access policy, Clerk issuer configuration, Convex deployment,
existing private-image action, existing API-key/stdio MCP, repo-owned tracker,
and configured protected GitHub/Vercel release path.

## Exclusions

Production move data, real-user mutations, secrets, billing, DNS, provider
policy, account/access expansion, canonical OAuth Queue transitions, and
unrelated product roadmap work.

## Stop rules

Stop for a real-account consent prompt without a disposable test path, provider
or security-policy mutation, production-data action, destructive migration,
irreversible outside-world action, or a material product choice not settled by
the Project Philosophy. Routine code, test, PR, CI, preview, and deployment
coordination remain in scope.

## Validation approach

1. Official SDK protocol discovery proves the exact catalog on modern and
   stateless legacy requests.
2. Locally signed JWT tests prove issuer, expiry, token type, and exact audience;
   anonymous requests prove the RFC 9728 challenge and public metadata.
3. `convex-test` seeds one synthetic owner, household, and move, then proves
   orientation, complete-result create, exact replay, no duplicates, search,
   optimistic correction, provenance, and audit receipts.
4. Component and source-contract tests prove saved results appear in the normal
   web UI and old/new doors stay distinct.
5. Full local gates, protected CI, exact deployment, public discovery/docs,
   signed-out privacy, and named-client proof are reported separately.

## Human gates

No Scott action is required for the released foundation. A sanctioned
disposable production-matched identity and cleanup path are required before
named-client authenticated production mutation or private-media proof.

## Execution evidence

- Isolated branch `codex/stateless-moving-mcp-foundation` began from current
  clean `main` at `148032a`; no unrelated work was overwritten.
- The complete repository suite passes: 187 test files and 1,040 tests,
  including modern/legacy stateless discovery, RFC 9728 anonymous discovery,
  resource-bound OAuth verification, private-evidence role denial, Queue-link
  ownership, cross-client correction denial, and a complete isolated synthetic
  move lifecycle with exact replay and correction.
- `npm run lint`, `npm run typecheck`, and `npm run build` pass. The lint output
  retains one pre-existing Cloudflare worker warning and no errors.
- Tracker generation/verification, philosophy synchronization, MCP contract
  drift checks, and `git diff --check` pass.
- A real local Chromium session rendered `/mcp/guide` at desktop and 390-pixel
  phone widths with the exact eight-tool catalog and Current/Partial/Later
  boundaries. The page returned 200; local hot-reload cross-origin socket noise
  was development-only and did not affect the page.
- Protected PR `#180` passed Required CI and the informational full 1,040-test
  job on exact head `74cd6e9`, then merged at
  `0a5e0eb9a771b2c13f16bcef5adc6c4e13c8507c`.
- Post-merge Actions run `31652048912` passed Required CI and the full suite on
  the exact production merge.
- Vercel Production deployment `dpl_AxReSqDrxvy6vMoL13Q5PYumxmPz` reached
  Ready for the exact merge. Its configured build ran `convex deploy` before
  the Next build, so the Convex schema/functions and web release share the
  same release receipt.
- Public proof returned 401 plus the exact RFC 9728 resource metadata from
  `/mcp`; 200 from the protected-resource document, `/mcp/guide`, and `/ai.txt`;
  the expected separate 401 refusals from `/mcp/connect` and `/api/mcp`; and a
  307 sign-in redirect with no private body from `/app/moves`.
- `npm run mcp:doctor` passed all ten discovery checks without registration,
  token exchange, tool calls, or move access. An official TypeScript SDK client
  reached production and stopped at the expected `invalid_token` challenge.
- No production move data, real-user mutation, real-account consent, secret,
  billing, DNS, provider-policy, or access-expanding action was used.

## Verification

Completed across focused official-SDK, OAuth/JWT, isolated Convex lifecycle, UI
component and route-separation tests; full repository gates; protected CI and
deployment; and public anonymous/signed-out proof. Named-client authenticated
proof remains a separate optional layer.

## Independent audit

Not yet audited. Completion of implementation does not imply a separate review.

## History

- 2026-08-12 · Scott via coordinator task — approved the complete bounded
  foundation, safe isolated synthetic proof, and normal protected release.
- 2026-08-12 · Codex — completed the design and first working implementation,
  with focused protocol/auth/data proof passing.
- 2026-08-12 · Codex — completed all local code, test, build, contract, and
  desktop/mobile guide proof; protected release proof is next.
- 2026-08-12 · Codex — merged protected PR `#180`, verified exact-head and
  post-merge CI, exact Convex/Vercel production deployment, public endpoint and
  privacy behavior, and an official SDK anonymous-client challenge; completed
  the Work Order with the named-client authenticated boundary still explicit.

---
id: MOV-WO-008
title: Release and prove the Queue-linked canonical MCP path
execution: complete
audit: not-audited
cards: MOV-0031
created: 2026-08-13
updated: 2026-08-14
approved-by: Scott Jarvie
approval-evidence: "coordinator task 019ff621-54b9-78f0-a51d-dd20fb0cb247 requested a production Queue and canonical MCP integration goal with retained-account proof and exact cleanup"
executor: Codex
---

## Goal

Prove one useful path in which an ordinary person creates a private move and
Queue handoff, a chosen AI reads the bounded owner-scoped context and saves a
source-backed result through canonical OAuth MCP, and both Queue and the normal
Move overview render the durable result without inventing Queue authority.

## Current truth

The first production loop exposed the unusable single-owner default and missing
Queue-side result. PR `#186` repaired both and deployed from merge `147cff4`.
The retained-account rerun then proved the production OAuth MCP read/save path,
the linked Queue and Saved work rendering, idempotent replay, unchanged Queue
state, and complete removal of the marked client, session, move, Queue, MCP, and
planning fixtures.

## Included scope

- Single-owner Queue first-run scope and handoff composer readiness.
- `save_complete_result` linkage to the exact personal Queue item.
- Attributable linked-result activity with no Queue transition.
- Queue detail rendering and direct navigation to Saved work.
- Focused tests, protected CI/deployment, live retained-account proof, complete
  fixture/client/session cleanup, tracker and release truth.

## Exclusions

Canonical OAuth Queue claiming or completion, Queue-capable grant changes,
Clerk/DNS/OAuth policy changes, another user's Queue, real household data,
private-media acceptance, billing, and provider-secret mutation.

## Sequence

1. Reproduce the ordinary production first run and create one marked move plus
   Waiting for your AI handoff through the UI.
2. Register one temporary public PKCE client and use the real canonical MCP to
   read the move/handoff and save/replay a source-backed result linked by the
   returned Queue ID.
3. Verify the source repair with focused unit/integration tests, then the full
   repository gates and protected checks.
4. Verify production Queue detail, Queue activity, and Overview Saved work in a
   normal browser after the exact deployment.
5. Revoke/delete every temporary token, grant, client, browser session/device,
   Queue/MCP receipt, and marked move record; retain only the approved identity.

## Dependencies

The released four-state Queue, canonical stateless OAuth MCP, durable planning
records, normal Move overview, retained non-privileged production test identity,
protected GitHub checks, and merge-triggered Vercel plus Convex deployment.

## Stop rules

Stop for real move data, another user, a persistent provider default, DNS,
secrets, billing, OAuth/Clerk policy, or an irreversible external action. The
marked test account, temporary sessions/clients, protected release, and exact
cleanup are routine under Scott's standing soft-launch policy.

## Human gates

Scott has authorized the marked retained-account run, short-lived clients and
sessions, exact cleanup, and routine protected release work. Any Clerk/DNS/OAuth
policy change or use of real move data would require a separate decision.

## Execution evidence

- Production first sign-in reached the branded Assist With Moving workspace and
  created the marked long-distance move without errors.
- The initial Queue required a manual My Queue selection even though no other
  owner existed; after selection the person saved one Waiting for your AI
  directive through the normal UI.
- The real eight-tool OAuth MCP read the exact move route and personal Queue
  item, saved six planning/source records through one complete-result call,
  replayed idempotently, and returned `queue.transition: none` with MCP
  provenance. Refresh revocation succeeded and the exact DCR client was deleted.
- The initial normal Saved work overview rendered the result and both checked
  FMCSA sources, while Queue detail rendered no linked result. That exact live
  finding defined the bounded source repair in PR `#186`.
- PR `#186` merged as `147cff46eaf971b3629d5b9e625e668c3a2d2b0b`.
  Post-merge Actions run `31768988479` passed Required CI and all 1,050 tests;
  GitHub deployment `5900338675` reported the exact production commit Ready.
- The post-fix production OAuth client discovered all eight canonical tools,
  read the exact owner-scoped move and Queue directive, saved the marked
  source-backed result, replayed the operation idempotently, and returned
  `queue.transition: none` with `Your AI via MCP` provenance.
- Normal Queue detail rendered **Linked move work**, the exact result title,
  **Open saved work**, and attributable Waiting-for-your-AI-to-same-state
  activity. The Move overview rendered the same decision, estimate, plan, two
  FMCSA source checks, and MCP provenance.
- Refresh revocation succeeded, the exact temporary OAuth client was deleted,
  the product session was signed out, Clerk showed no device, the short-lived
  password was removed, and the marked move was hard-purged. Both Your moves
  and Queue were rechecked with the move, directive, and result markers absent.

## Verification

Complete. Source tests, protected PR checks, exact-merge production deployment,
authenticated OAuth MCP use, normal Queue and Move UI reflection, session/client
cleanup, and permanent fixture purge have separate receipts. Canonical OAuth
still does not claim or complete Queue work, and private media, another client
product, mobile, and multi-owner acceptance were not exercised.

## Retained state and next safe action

Fixture residue is empty: no synthetic move, Queue, MCP, planning, source-check,
OAuth client, grant, token, product session, Clerk device, or password remains.
The only retained provider state is the ordinary Moving test identity and its
verified test-only alias. Future unattended sign-in is still **Partial** because
production offers no email-code factor for the alias and the sanctioned browser
automation surface could not write a password to the unlocked vault.

When another live acceptance is needed, use supported Clerk impersonation after
its allowance resets or an owner-approved password-manager write path. Do not
weaken Clerk policy. Create a newly marked move, rerun the bounded OAuth
MCP-to-Queue/UI path, and repeat the exact purge and absence checks.

## Independent audit

Not yet audited.

## History

- 2026-08-13 · Codex — completed the first production loop, isolated the two
  integration defects, and began the bounded repair without changing providers.
- 2026-08-14 · Codex — released PR `#186`, completed the post-fix production
  OAuth MCP-to-Queue/UI loop, removed every marked synthetic record and
  temporary connection, and closed execution without broadening Queue authority.

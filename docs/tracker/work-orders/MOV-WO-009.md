---
id: MOV-WO-009
title: Make the first private move useful without setup ceremony
execution: ready
audit: not-audited
cards: MOV-0007 MOV-0003 MOV-0006
created: 2026-08-14
updated: 2026-08-14
approved-by: Scott Jarvie
approval-evidence: "portfolio reset in coordinator task 019ff621-54b9-78f0-a51d-dd20fb0cb247 prioritizes core first-use/private workspace and Queue before MCP expansion, design foundations, stats, or admin"
---

## Goal

Let a newly signed-in person create one small private move, understand the
minimum useful context, leave one Queue handoff, and return to the same durable
workspace on phone and desktop without advanced setup, inaccessible recovery
copy, or undersized first-use controls.

## Current truth

The branded sign-in, empty workspace, Queue, AI Connections, production private
move, canonical MCP result, Queue link, Move overview, and exact cleanup all
have retained receipts in completed Work Orders. Do not rerun that acceptance.
The remaining first-use gap is person-first: normal UI creation of the smallest
useful private move and Queue handoff without requiring MCP, packet, provider,
admin, or deep inventory setup. Root error copy still sends people to Linear,
and representative first-use controls remain below the 44px interaction floor.

## Sequence

1. Lock the smallest normal UI journey from the empty workspace to one private
   move, route/room or belongings context, and one Queue handoff.
2. Fix the root error recovery language in `MOV-0003` with a reachable product
   path and safe diagnostic code.
3. Apply the bounded first-use hit-area treatment in `MOV-0006` without
   loosening dense planning screens globally.
4. Exercise the journey with the retained non-privileged test identity and
   clearly marked removable data on phone and desktop.
5. Repair only reproducible blockers, pass normal protected checks, deploy,
   verify the exact changed path, then purge the fixture and revoke the session.

## Dependencies

- Completed branded sign-in and empty-workspace release (`MOV-WO-007`).
- Completed Queue and linked-result foundation (`MOV-WO-003`, `MOV-WO-008`).
- Canonical Project Philosophy sections for private-by-default workspace,
  person/workspace/chosen-AI responsibility, first-run, and Queue vocabulary.
- Existing retained non-privileged Moving test identity and documented cleanup
  path; no new provider default is required.

## Exclusions

No packet/claims/PCS workflow, broad sharing-role matrix, full deletion
orchestration, all-route accessibility audit, admin/stats, `/me`, light mode,
performance PR resurrection, MCP protocol expansion, canonical OAuth Queue
transitions, provider policy, DNS, billing, or real move data.

## Stop rules

Stop for another person's data, an irreversible production-data action, Clerk
or OAuth policy, DNS, secrets, billing, or a product choice that changes the
minimum first-move experience. Split unrelated defects into focused Cards; do
not turn this into a complete product audit.

## Verification

- Focused unit/component contracts for empty-state creation, return path, Queue
  handoff, error recovery, and 44px first-use targets.
- Normal lint, typecheck, test, build, tracker, and protected PR checks.
- Phone and desktop browser proof of sign-in return, private move creation,
  minimal context, Queue handoff, reload/return, safe error recovery, and no
  page-level overflow on changed routes.
- Exact production deployment identity plus marked fixture/session purge and
  absence checks; no reuse of completed MCP acceptance as substitute evidence.

## Human gates

Scott's reset explicitly approves this first priority and its routine protected
soft-launch proof. Return only for real data, identity/provider policy, secrets,
DNS, billing, irreversible action, or a product decision that changes what the
minimum useful move should contain.

## Execution evidence

Not started. The completed evidence baseline is preserved in `MOV-WO-007` and
`MOV-WO-008`; this Work Order begins only at the remaining person-first gap.

## History

- 2026-08-14 · Scott via coordinator reset — approved core first-use/private
  workspace and Queue as the first tranche; Codex removed completed MCP/brand
  work and broad audit ceremony from the scope.

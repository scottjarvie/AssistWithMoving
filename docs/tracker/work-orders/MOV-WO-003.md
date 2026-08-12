---
id: MOV-WO-003
title: Build and prove Moving's complete Queue foundation
execution: active
audit: follow-up-needed
cards: MOV-0008 MOV-0027 MOV-0024 MOV-0026
created: 2026-08-09
updated: 2026-08-12
approved-by: Scott Jarvie
approval-evidence: "explicit complete Queue foundation authorization in coordinator task 019fe207-1ff7-7a62-a4ab-a2775634d0a1"
executor: Codex
---

## Goal

Deliver the trustworthy design-independent Queue model, behavior, ownership,
history, failure/recovery, data lifecycle, and least-privilege OAuth/API-key
agent boundary required for Moving's real workflows, then prove it through the
normal software release path. Preserve specialized domain statuses and hand the
real contract to Claude Design without inventing the final UI.

## Current truth

The design-independent implementation exists on protected
`codex/queue-foundation` PR #175. A read-only contract audit found household-wide
Queue export and agent inheritance of human manager recovery; this first
remediation tranche isolates exports, contains the bypass, and holds canonical
OAuth registration until distinct chosen-AI grants exist. Provider, marked-data,
and independent-review proof remain under Card `MOV-0026`; final UI design is
intentionally separate.

## Included scope

- `MOV-0008` — canonical Queue model, transitions, adapter, queries, commands,
  and backend contract.
- `MOV-0027` — scoped API-key REST/stdio MCP Queue boundary and honest OAuth hold.
- `MOV-0024` — activity, retries/failures, leases/expiry, exports, retention,
  bounded queries, and lifecycle proof.
- `MOV-0026` — protected release, provider/live evidence, and independent audit.

Card `MOV-0025` is the next Claude Design/UI tranche and is deliberately not in
this Work Order.

## Execution state

Active. Audit/reconciliation, first-tranche authority repairs, refreshed local
and CI proof, and the protected PR are complete for this tranche. Provider
deployment, marked-account proof, and independent audit remain. The shared dev Convex
deployment has unrelated active performance-branch synthetic schema state;
Card `MOV-0026` records that limitation without turning it into a Scott gate.

## Sequence

1. Audit Core, product truth, workflows, tenancy, agents, and live signed-out seams.
2. Implement model, adapters, services, lifecycle, API-key agent boundary, and
   an honest OAuth hold pending distinct AI grants.
3. Run focused then full local checks and regenerate tracker readers.
4. Publish by protected PR, prove providers/live marked scenarios, then audit.

## Dependencies

Configured PR CI/Convex/Vercel. A safe marked test account/key is used only if
already available for post-deploy private-flow proof.

## Exclusions

Final route/page/card/navigation/brand design, production-data backfill, real-user
data access, provider settings, broad agent writes, Linear, purchases, publishing,
and unrelated app work.

## Stop rules

Stop for missing protected publication access, irreversible production migration,
real-user data, MFA/secrets, provider billing/domain changes, or a material UX
choice. Never substitute direct main or the state-only lane.

## Validation approach

1. Run Queue unit, in-memory integration, authorization, REST/MCP contract,
   failure/retry, stale-version, idempotency, export, and capability tests.
2. Run tracker validation, lint, typecheck, full unit suite, build, and relevant
   browser/static checks.
3. Publish only through a short-lived protected software PR and configured CI.
4. Verify exact Convex schema/cron acceptance, Vercel deployment, live REST/MCP
   discovery, and safe marked-account person↔AI scenarios.
5. Record independent audit separately from execution and keep final UI proof in
   the later Claude Design Work Order.

## Verification

Focused tests plus lint/typecheck/full unit/build/tracker checks locally;
configured CI/codegen/deploy; live REST/MCP discovery; safe marked-account
person↔AI scenarios; and a separate Core/Project Philosophy audit.

## Human gates

No Scott action is currently required. Final Claude UI is a later product-design
gate; no production data or broad access decision is requested.

## Execution evidence

- Core v1.6.3 and Project Philosophy 1.3.1 fully reconciled.
- Existing capture, AI job, review, upload, export, plan, sale, access, and data
  rights workflows inventoried in the Queue design handoff.
- Live signed-out `/queue` 404 and `/app/queue` Clerk redirect verified on
  2026-08-09; authenticated/private behavior remains unverified.
- Targeted Queue/REST/API-key/role/export/MCP tests pass locally, including 49
  focused export/authority/capability regressions and direct API-client transport proof.
- The complete repository suite passes 1,006 tests. Lint, typecheck, production build, contract
  drift, philosophy synchronization, and tracker verification pass locally.
- A full-suite run exposed missing Queue move-purge coverage; Queue activity and
  items were added to the verified purge cascade, and the full suite then passed.
- Local Convex codegen succeeded. A development push correctly stopped on an
  unrelated active performance-branch field in shared synthetic dev data; no
  concurrent data or schema was overwritten.
- Release audit repaired optional-expiry selection, authorization-before-replay,
  expired-lease history, strict result/retry bounds, active owner assignment,
  personal-only Queue export, agent manager-bypass containment, and an honest
  hold on canonical OAuth Queue registration.
- Ready protected PR #175 contains the focused package. After concurrent `main`
  movement, the branch was rebased onto `e59e31f`, the unrelated MOV-0023 trust
  card was preserved, the Queue agent card moved to MOV-0027, and all local
  release checks passed again.

## Independent audit

Follow-up needed. A separate reviewer found export isolation and agent authority
gaps; after this remediation tranche, an independent reviewer must re-evaluate
the final PR/deployment against Core §4 Queue semantics, §5 agent boundaries,
§7 history, §8 privacy, §14 bounded queries, §16 publication controls, and
Moving's Project Philosophy.

## History

- 2026-08-09 · Scott Jarvie — authorized the complete autonomous Queue
  foundation retrofit through the coordinator task.
- 2026-08-09 · Codex — activated the bounded backend/agent/data-lifecycle tranche,
  separated final Claude UI design, and recorded the exact protected-release
  access blocker.
- 2026-08-11 · Codex — resumed in a writable manual worktree, preserved and
  reconciled the exact Queue package, fixed release-audit defects, and completed
  the expanded local verification gates.
- 2026-08-11 · Codex — opened ready PR #175 and reconciled it losslessly with
  the concurrent Core/trust publication before protected CI and review.
- 2026-08-12 · Codex — recorded audit follow-up and implemented the smallest
  export/authority/OAuth truthfulness remediation tranche without final UI scope.

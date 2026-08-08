---
id: MOV-WO-001
title: Install and prove Moving's durable state path
execution: active
audit: not-audited
cards: MOV-0001 MOV-0002
created: 2026-08-08
updated: 2026-08-08
approved-by: Scott Jarvie
approval-evidence: "portfolio rollout authorization in coordinator task 019fe207-1ff7-7a62-a4ab-a2775634d0a1"
executor: Codex
---

## Goal

Install the Core v1.6.2 tracker and fail-closed state-publication boundary,
remove mandatory Linear gates, prove software still deploys normally, and
prove one useful direct-main state closeout skips only the application build.

## Current truth

Execution is active under explicit portfolio authorization. Initial tracker
state is traveling inside the normal software/configuration PR because its
generator, validators, workflows, package scripts, and Vercel configuration
must exist before a state-only publication can be trusted.

## Sequence

1. Audit repository, branch, protections, workflow, Vercel linkage, philosophy,
   and coordination instructions without overwriting dirty work.
2. Install the Moving-specific tracker, validators, exact classifiers, workflow
   split, Vercel ignore command, and Core v1.6.2 alignment through a PR.
3. Prove full CI and a normal Vercel deployment for the software merge.
4. Update these Cards and Work Order with exact evidence, regenerate readers,
   locally validate, and publish one useful state-only commit to main.
5. Prove lightweight Actions, an ignored zero-build Vercel record, and the
   previous successful deployment retaining the live alias.

## Dependencies

- Readable canonical Assist With Sites Core v1.6.2 or newer.
- GitHub owner authentication and existing repository access.
- Vercel Git integration providing exact head and last-successful SHA history.

## Exclusions

- No product feature, schema, auth, MCP, queue, or visual-app redesign.
- No Linear query, reconnection, or workflow dependency.
- No broad protection bypass or bypass for another contributor.

## Stop rules

- Stop at sign-in, MFA, identity ambiguity, provider access expansion, or an
  irreversible dashboard confirmation that cannot be safely verified.
- Build normally on any classifier uncertainty; never coerce an ignore result.
- Do not call the fast lane established until all three provider gates agree.

## Verification

- Tracker source/render parity, schema, ids, links, JavaScript, responsive
  layout contract, and Project Philosophy digest.
- Accepted state fixture plus rejected software, mixed, deletion, rename,
  malformed, multiple-commit, missing-history, and unmarked fixtures.
- Full repository lint, typecheck, tests, build, PR checks, deployment record,
  state Actions run, provider ignore log, and live-alias identity.

## Human gates

Scott's rollout and Linear-policy authorizations are already recorded. A new
gate is required only for identity/MFA, durable access expansion, broad bypass,
or an irreversible provider confirmation.

## Execution evidence

Pending PR, CI, deployment, state commit, and provider receipts.

## History

- 2026-08-08 · Codex — moved Proposed → Ready → Active under the coordinator's
  explicit portfolio rollout authority; implementation and proof are underway.

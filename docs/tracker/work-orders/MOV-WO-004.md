---
id: MOV-WO-004
title: Make Moving's Queue visible and usable
execution: complete
audit: follow-up-needed
cards: MOV-0025
created: 2026-08-12
updated: 2026-08-12
approved-by: Scott Jarvie
approval-evidence: "explicit Queue UI and safe synthetic proof authorization in coordinator task 019ff621-54b9-78f0-a51d-dd20fb0cb247"
executor: Codex
---

## Goal

Turn the released four-state Queue foundation into a useful Moving-native
handoff desk without waiting for unrelated roadmap work. Preserve selected-move
context, phone use, capture evidence, household isolation, chosen-AI authority,
and honest current capability boundaries.

## Current truth

The global and move-scoped Queue routes are released through protected PR
`#177` at merge SHA `835c696`. They share a field-desk/route-note experience,
the existing navigation entries remain product-native, canonical handoffs and
legacy captures appear under the exact four person-facing states, and the
screen exposes directive, next step, result, attributable activity, connection
truth, and loading/empty/error behavior.

A Clerk-backed read-only browser probe reached the marked development account,
observed 41 synthetic move rows, and performed zero mutations. The shared
development Convex deployment cannot safely take the Queue source because an
unrelated performance lane's marked synthetic row has a field not yet present
on `main`; this Work Order does not overwrite that lane or fabricate proof.
Production-authenticated mutation, revocation, and cleanup remain unproved
until a disposable production-matched identity/key and approved cleanup route
exist; real-user data is excluded.

## Included scope

- `MOV-0025` — global and move-scoped Queue screen, existing navigation entry,
  exact four states, directive composer, handoff/capture cards, detail/activity,
  Needs You response, cancel outcome, bounded pagination, connection clarity,
  and loading/empty/denied/error/retry states.
- Local responsive, accessibility, long/dense-state, and behavior proof.
- Protected PR, configured CI/review/deployment, signed-out/public verification,
  and safe marked authenticated proof where the existing environment permits it.

## Sequence

1. Prove the existing marked development identity read-only without touching data.
2. Implement the product-native Queue composition on the released foundation.
3. Run focused state/anatomy tests, visual and accessibility checks, then full
   repository validation.
4. Publish through a protected PR, independently review, merge only when green,
   and record deployment/public/private proof as separate evidence layers.

## Dependencies

Released Queue foundation, current selected-move context, existing global and
move operations navigation, configured GitHub/Vercel release path, and only
already-approved synthetic test access.

## Exclusions

New Queue backend authority, schema migration, provider/auth policy, secrets,
billing, DNS, real-user data, generic task-management features, unrelated
roadmap work, and product-specific stateless-MCP philosophy changes.

## Stop rules

Stop for MFA/sign-in that cannot use an existing test route, ambiguity about a
production target, real-user data, non-recoverable deletion/migration, secret or
provider-policy changes, or a material product direction outside this Queue
handoff. Ordinary review, CI, preview, and protected deployment are not gates.

## Validation approach

1. Component tests prove exact labels, state-specific anatomy, connection truth,
   directive submission, person response, activity attribution, loading, and
   empty behavior.
2. Browser proof checks phone/desktop layout, keyboard use, accessibility, long
   text, dense history, and the route-level denied/error recovery presentation.
3. Lint, typecheck, full unit tests, build, tracker checks, philosophy sync, and
   contract drift pass before publication.
4. GitHub review/CI, Vercel/Convex release evidence, public/signed-out behavior,
   marked authenticated multi-client proof where safe, and an independent audit
   are reported independently rather than inferred from one another.

## Verification

Focused Queue UI tests, temporary deterministic visual fixtures that never ship,
full local gates, protected review/CI, exact-SHA deployment, public routing, and
safe marked authentication with zero real-user access.

## Human gates

No Scott action is currently required. A production-matched disposable test
identity/key and already-approved cleanup route would be required before any
production-authenticated mutation/revocation/cleanup proof.

## Execution evidence

- Isolated branch `codex/queue-product-experience` started from current `main`;
  the unrelated dirty primary checkout remains untouched.
- Read-only marked-development authentication passed: 41 synthetic moves were
  visible and no mutation was issued.
- Shared development Convex push failed closed on the unrelated synthetic
  `nextItemCodeSeq` field; no data or deployed functions were overwritten.
- Thirteen focused Queue UI/error component tests and 45 focused
  Queue/authority/error tests pass on the replacement exact head.
- The replacement full local run passed 1,031 of 1,033 tests across 185 files;
  the unrelated move-list and load-planner tests that exceeded their parallel
  timeouts both pass in a 33-test isolated rerun. Protected CI remains the
  authoritative complete replacement-head gate.
- Deterministic rendered phone (390 px) and desktop (1366 px) fixtures had zero
  axe violations and no horizontal overflow; the fixtures were removed before
  publication and never shipped.
- Lint passes with one pre-existing Cloudflare worker warning; typecheck,
  production build (37 routes), tracker generation/verification, Project
  Philosophy synchronization, contract drift, and diff checks pass.
- Protected PR `#177` merged at `835c696`; exact-head Required CI, the
  informational unit job, and Vercel preview were green before merge.
- Post-merge CI run `31641046075` passed both Required CI and the informational
  full suite on exact merge SHA `835c696`.
- Vercel recorded successful Production deployment `5877388826` for exact
  merge SHA `835c696`; the configured build runs `convex deploy` before the
  Next.js build.
- Live signed-out proof returns a Clerk redirect for `/app/queue`, exposes no
  private data, keeps `/queue` as an intentional 404, and preserves the public
  MCP endpoint's refusal/discovery behavior.

## Independent audit

The first independent review found four in-scope usability/correctness gaps,
all repaired before merge:

- the specialized capture workspace and its evidence/retry/delete actions are
  reachable again alongside the canonical Queue;
- capture-owner scope is applied by an indexed query before pagination;
- canonical and capture pagination remain live with `usePaginatedQuery` rather
  than freezing earlier pages; and
- an open detail resolves from the latest item/version instead of a stale
  object snapshot.

The first exact-head rereview then found three more in-scope gaps, also repaired:

- owner-scoped pagination now merges the indexed owner stream with a separate
  indexed creator/undefined-owner stream, preserving legacy captures without
  post-pagination filtering;
- Queue connection status counts only active, unexpired keys with both
  `queue/read` and `queue/write` whose move restriction, live creator access,
  and own/delegated Queue authority match this move and selected person; and
- canonical activity is reactively paginated with an explicit older-activity
  action rather than silently truncating at 50 entries.

Focused regression tests cover all seven review findings.

The second exact-head rereview found five further pagination/status/composer
gaps, also repaired before merge:

- every Convex-native paginated query forwards split/page-status metadata and
  honors `endCursor`, preserving reactive page splitting;
- each selected person-facing state is queried independently and automatically
  advances past empty filtered pages before claiming the state is empty;
- both membership and per-move AI-access kill switches are honored exactly;
- current and legacy capture rows use independent native cursors and merge by
  timestamp in the client instead of using a lossy half-page allocation; and
- the directive composer is disabled for Everyone's Queue and passes the exact
  selected `ownerUserId` for a personal/delegated Queue.

Focused regression proof covers all twelve review findings. A final independent
review process inspected the replacement exact head but did not return a final
report within the approved timebox. The protected release therefore proceeded
on the completed review history, exact-head regressions, green CI, and exact-SHA
deployment evidence; `audit` remains `follow-up-needed` rather than being
overstated as passed.

## History

- 2026-08-12 · Scott via coordinator task — approved the Queue UI and safe
  synthetic/authenticated proof lane through normal protected release.
- 2026-08-12 · Codex — established the first authenticated read-only proof,
  preserved the incompatible shared-development lane, and began implementation.
- 2026-08-12 · Scott via coordinator correction — kept the separate portfolio
  stateless-MCP philosophy direction out of this product Work Order and tracker.
- 2026-08-12 · Codex — completed the first independent review, repaired all four
  findings, and added focused regression proof before exact-head rereview.
- 2026-08-12 · Codex — completed the first exact-head rereview, repaired its
  three findings, and retained the protected merge gate for a clean rereview.
- 2026-08-12 · Codex — completed the second exact-head rereview, repaired its
  five findings, and kept publication closed pending a clean replacement review.
- 2026-08-12 · Codex — timeboxed the final silent review process as directed,
  merged protected PR `#177` after all configured checks passed, verified the
  exact-SHA Production deployment and signed-out boundary, and left the
  production-authenticated lifecycle and final audit as explicit follow-up.

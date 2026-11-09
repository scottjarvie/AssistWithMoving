# AWL-0016 — release handoff

Scott approved shipping PR #249 after the Claude `claude-opus-5-5` re-check of
`aa91fb23862e59608087c29e996b171a14fdc826` passed all findings and lessons 15–17.
The re-check reported 1,572 passing tests, including one flaky test that passed
on rerun. Scott authorized the following three final corrections in one commit,
then normal checks and backend-first release. PRs #234 and #245 are excluded.

## Final corrections

- A person answering a flagged `claimed` capture without `claimExpiresAt` puts
  it back in `queued`. The regression verifies a fresh AI claim can pick it up.
- Website `submitResult` refuses questions on resolved/discarded captures before
  changing their data. Both terminal states are tested for unchanged records.
- Queue count coverage excludes a partner-owned modern capture created by the
  querying person and a legacy capture created by the partner.

## Lesson 17 real-token evidence

The existing development Clerk credential and configured test identity were
verified against Moving’s isolated Sandbox issuer. A temporary native session
was created via the Clerk session API, its default session JWT read without a
custom template, and the session revoked. Only the following claim names were
retained: `aud`, `exp`, `fva`, `iat`, `iss`, `nbf`, `sid`, `sts`, `sub`, `v`.
The audience was `convex`; `azp`, `client_id`, `scope` and `scp` were absent;
header `typ` was not `at+jwt`. The existing website fixture matches exactly.
No real token, identity, session identifier or claim values are in this record.
This verifies a real development-issued native session token; it does not claim
an authenticated browser flow or production token inspection.

## Release boundary

Local checks run under Moving’s MacBook slot. Focused regressions passed
(1 file / 28 tests), with root and strict backend TypeScript, five backend
configuration tests, bindings, API policy and generated-doc checks. Lint has
zero errors and the existing image-worker warning. The first full attempt was
interrupted before its summary and had a load-planner component timeout; the
complete single-worker run then passed: 226 files / 1,575 tests, zero failures. The final suite result and
exact source head are recorded on PR #249. After green CI, inspect the production
target and backend dry run, refuse every index deletion, deploy the backend,
then merge and wait for Vercel. The schema change is additive and all historic
Queue state/origin compatibility is read-time. There is no record migration or
backfill to dry-run or execute; no migration counts are invented.

Post-release backend, Vercel and live Queue/MCP receipts belong in PR #249’s
release comment, pinned to the shipped source/merge revisions. Until those
receipts exist this file is a release handoff, not a claim that shipping passed.

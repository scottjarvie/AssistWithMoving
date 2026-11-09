# AWL-0016 — Moving builder evidence

Source base: `fe226dee8ddc683074106f93a70074e817e2c5f3`.
Authority: Life build brief approved 2026-11-09, Core 1.24.0 section 4.
Builder: Codex `gpt-6.1-sol`, high effort, MacBook Pro.
Delivery boundary: draft PR only. No production sign-in, deploy, merge, or data writes.

## Implementation

Personal `queueItems` carry `addedBy`, optional validated `fromRecord`, attributed suggestions with lettered options/evidence, person decisions, archive state and append-only history. Existing canonical items were person-created and default to `person`; old Needs You rows project to Waiting on AI with an input flag. No data migration runs or is required.

Moving has personal Queues with explicit run delegation and person-manager recovery. Unaccepted suggestions remain private to their owner, including against household managers and delegated runners. Accepted work follows existing Queue visibility. The new Propose suggestions power is enabled by default under full access and can be narrowed independently of requested work.

The canonical OAuth, legacy OAuth and API-key HTTP/stdio catalogs route to shared Queue services. AI add without explicit classification is refused. Open ideas cannot be claimed, completed, linked as work, or accepted/dismissed by an AI. Legacy capture adds require origin and an operation id; AI ideas go to canonical suggestions, requested captures keep their domain payload.

Record-level inventory, photo, planning and Layout drafts stay on their records as AI proposals. Their payloads, approval history, partial Layout operation indexes and existing generation paths are preserved. API approval/rejection of record proposals is person-only; compatibility tools return a clear refusal. No domain proposal is migrated or aliased into Queue work.

## Evidence boundaries

- Backend behavior uses `convex-test` with synthetic identities and records, including actual canonical protocol calls, legacy mutations, REST requests and the adapter shared by hosted API-key MCP and stdio.
- UI images use running React presentation components in a local Vite harness with synthetic data and no backend. They are not authenticated Local Live or end-to-end Sandbox proof.
- The original Queue before images were captured before editing. A compositing artifact appeared in the original phone capture, so the comparison baselines were re-rendered from the unchanged fetched source. Original captures are retained locally in the ignored `.tmp/awl-0016` directory. The record-label baseline is also rendered from fetched source.
- [01 Desktop](01-desktop-before-after.png), [02 Phone](02-phone-before-after.png), [03 Suggestions](03-suggestions-before-after.png), [04 Record proposal](04-record-before-after.png).

## Auditor focus

Review the shared transaction guards, conditional suggestion power on the single add tool, carried-access scope projections, legacy capture conversion, owner privacy, and input flags across claim expiry and completion. Exact counts use complete owner-scoped reads; list results are bounded/paginated. Very large Queues may eventually need transactional counters for Convex read limits.

Historical capture rows did not retain a reliable creator-type field: unlike canonical directives, their precise person-versus-AI origin cannot be reconstructed without inventing evidence. They remain unchanged and carry no invented AI label. New AI captures preserve explicit origin and actor label.

No named external AI client, signed-in production flow, production migration, merge or deployment is proved by this evidence. Ship remains with the campaign's later audit/release instruction.

## Validation record

The synthetic component harness is stopped after capture. Local runtime admission uses the MacBook run-slot directories; the slot is released at the end of each verification batch. Final command outcomes and source head are recorded in the PR description rather than inferred from the screenshots.

Final checks: full offline suite 225 files / 1,552 tests passed; after the final privacy/replay/URL-state fixes, focused regression suite 8 files / 91 tests passed. Root and strict Convex TypeScript passed; five backend-configuration tests passed; all 159 offline bindings, 100 generated API tool decisions and the Project Philosophy reader verified. Lint passed with zero errors and one existing image-worker warning. No production or native client run.

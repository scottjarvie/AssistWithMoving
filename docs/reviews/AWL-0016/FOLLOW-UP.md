# AWL-0016 — follow-up to the first Moving audit

Audit: Claude `claude-opus-5-5`, PR #249 at `8822cd775fe5c8a49fd735a8074ce5c57edcc9c4`.
Builder: Codex `gpt-6.1-sol`, high effort, MacBook Pro. Draft PR only; no merge,
deployment, production sign-in or production data changes.

| Finding | Fix and regression evidence |
| --- | --- |
| Flagged claimed captures are stuck | Capture list filters, counts, editability and detail actions now follow `needsInput`, including while the stored status is `claimed`. The person sees the question in Needs action and can answer, resolve or discard. The component regression exercises Answer and Discard; backend coverage verifies person resolve/discard and flag removal. Asking/answering still preserves the lifecycle state. |
| Manager Archive regressed | A website person with the existing manager role can archive another member's accepted work. Open/unaccepted suggestions remain owner-only. Archive keeps state/history; help text and the error fallback now say archive. The privacy test adds positive manager archive and replay assertions while retaining its negative suggestion checks. |
| Old Needs you lane copy | Canonical tool descriptions, plain-text guides, capabilities, OpenAPI prose, README, API guide and the MCP guide describe raising an independent Needs your input flag with state unchanged. Legacy storage values and compatibility URL paths remain supported. |
| Questions can overwrite another AI's capture claim or closed records | Capture claims now retain the verified OAuth connection identity. Results/questions refuse another connection's claim, including a different AI belonging to the same person, and refuse resolved/discarded captures. Reclaim must happen before taking over an expired claim. Raising a question clears the connection marker with the other claim fields. Identified clients cannot claim ownership of an older, unmarked live claim; they must wait for expiry and reclaim it. |
| Move brief misses flagged Answered/capture records | A separate indexed flag read covers all Queue lifecycle states, plus personal modern/legacy capture ranges. The bounded brief explicitly signals truncation. Regression includes flagged Answered work and a flagged claimed legacy-owner capture. |
| Canonical suggestion cursor missing | The canonical protocol schema accepts `cursor` and bounded `limit`. Actual MCP protocol calls traverse two suggestion pages without repetition. |
| Shared inventory From context rejected | Context records in the same visible household/move no longer have to be created by the Queue owner. Queue-to-Queue references retain their owner check. Regression keeps a partner-created room link while retaining the private foreign-Queue refusal. |
| Queue-page capture count reads the whole move | Count input reads use the modern owner index and the legacy creator/undefined-owner index. Other household members' captures are outside those ranges. Nav remains on its dedicated indexed, fail-soft badge query. |
| Capture suggestion attribution | Capture-tool work ideas retain the current connection's display label. The regression verifies the registered client name, not a generic Connected AI label. |
| Missing Propose suggestions refusal tests | Added actual legacy add, capture-tool and API-key REST refusal tests. Each also proves that requested work still succeeds after Propose suggestions is removed. Existing AWL-0015 security tests remain unchanged. |
| Variable-size dismissal index keys | Full directive/reason text was replaced by a SHA-256 fingerprint of their trimmed JSON pair. Both dismissal indexes contain the fixed 64-character ASCII fingerprint, not either text field. Maximum-length multibyte input and normalization/repeated-dismissal behavior are tested. Original text remains on the item. |
| Lesson 15 — narrowed reach on new reads | Moving's reach unit is the move. Canonical and API-key paths retain their current grant checks; persisted legacy Queue reads now recheck the current connection before reading or paginating. Tests narrow to one of two moves and exercise open/dismissed/withdrawn/accepted records, reasons, counts, detail/history reads and pagination. |
| Lesson 16 — real website person session | Every public Queue function uses the existing person-session guard before its permission/data work. Both public capture actor helpers do likewise, covering list, create, edit, media, status, claim and result actions. Tests refuse AI-token-shaped identities on all affected public reads and writes, even with a session-shaped sid, and retain successful person reads/decisions. AI tools remain separate and grant-checked. |

## Authentication finding

`convex/auth.config.ts` trusts `CLERK_JWT_ISSUER_DOMAIN` with the `convex` audience.
That is issuer/audience authentication, not proof of a website person session.
The canonical MCP verifier uses the same Clerk issuer. Whether a particular
issued OAuth JWT currently carries the Convex audience was not tested against
production; the public functions now refuse an AI identity if one reaches them.

The frontend uses `ConvexProviderWithClerk`. The installed adapter uses a native
session token when its audience is `convex`, with a legacy JWT-template fallback
otherwise. A fallback token without session proof fails closed under the reused
person guard; no Clerk configuration is changed here. The deployed session shape
and authenticated full-app behavior were not observed during this draft build.

The reused `requirePersonConnectionManagement` check requires a session-bound
`sid` and refuses OAuth/client/scope markers. Public Queue reads previously
checked only the user/role; their new session guard closes the direct-Convex
route around the tool grants and person-only decisions. The API-key settings
functions touched by this PR already had this guard; they needed no additional
change. Internal MCP/REST functions intentionally use their verified principal
or key and current grant, rather than a website session.

## Index-key choice and compatibility

The [published Convex limits](https://docs.convex.dev/production/state/limits)
were checked. They do not specify a separate byte ceiling for ordinary index
keys. The new lookup avoids relying on a variable text key: the fingerprint is
always 64 ASCII bytes, with only move/owner IDs and status/timestamp alongside
it. This is a source/test result, not a claim that a production index build ran.

No data migration is introduced. AI work suggestions are new in this unshipped
PR, and every new one records its fingerprint. Capture connection identity is
optional for compatibility; older unmarked live claims fail closed for an
identified OAuth client until reclaimed. No old claim or data is rewritten.

## Verification and UI proof

Final offline suite: **226 files / 1,569 tests passed**. Focused audit regressions:
**3 files / 45 tests passed**. Root TypeScript, strict Convex backend TypeScript,
five backend configuration tests, 159 offline bindings, the 100-tool generated
AI policy check and generated Project Philosophy check passed. Lint passed with
zero errors and the one existing image-worker warning. Existing AWL-0015 security
tests are unchanged. The pushed head is pinned in the PR and close-out report. All fixtures are marked
synthetic. Screenshots use running application components with mocked data and
no backend; they do not prove an authenticated full-app or external-client run.

Numbered comparisons: [08 Desktop](08-audit-desktop-before-after.png),
[09 Phone](09-audit-phone-before-after.png),
[10 Archive help](10-audit-handoff-before-after.png),
[11 MCP guide](11-audit-guide-before-after.png). The after captures had no page
errors; the desktop and 390px phone capture views had no horizontal overflow.
The browser and preview server were stopped, and Moving's run slot was released.

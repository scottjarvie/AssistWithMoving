# Production MCP acceptance account

This runbook is the narrow, repeatable live-proof lane for Moving's canonical
OAuth MCP. It does not authorize testing with a real household, Scott's
account, another user's account, or another Assist product's Clerk instance.

## Retained identity

- Clerk application: **MovingManifest**
- Clerk environment: **production**
- Display name: **Moving MCP Test**
- Primary email: `moving-mcp-e2e+production@example.com`
- Verified test-only alias: `jarvie+assistwithmoving-mcp-test@gmail.com`
- Role: ordinary signed-in person; no organization, admin, staff, or other
  elevated role

No password is retained. The verified alias is a reusable identifier, not a
credential, and production currently does not offer an email-code factor for
that address. A future unattended run therefore still needs either a password
stored through an owner-approved secret manager path or a newly available
Clerk impersonation allowance. Never store a password, ticket, or token in the
repository, tracker, test output, or handoff. The retained Clerk identity and
its verified test-only alias are the only durable provider state; the account
must never receive real household or move information.

## Generate a future one-time sign-in when Clerk permits it

1. Open Clerk Dashboard → **MovingManifest** → **production** → **Users**.
2. Search for `moving-mcp-e2e+production@example.com` and open **Moving MCP
   Test**.
3. Choose **Actions → Impersonate user**.
4. Use the resulting one-time Moving sign-in in the isolated acceptance
   browser. Do not copy the ticket into source, logs, tracker records, or chat.

This dashboard path is the only retained sign-in recipe. A one-time ticket,
browser session, password, OAuth access/refresh token, dynamic OAuth client,
consent grant, API key, or Queue claim is never durable test setup.

If Clerk reports that the environment's impersonation allowance is exhausted,
stop before creating a password unless a supported secret-manager write path
is available and authorized. Do not change production sign-in factors or other
Clerk policy merely to automate acceptance.

When automating the dashboard path, never print or persist the new tab's full
URL. Bind it by tab id/title, consume it immediately, and sanitize query strings
from all inspection output. If a ticket URL appears in any automation output,
treat it as an incident: do not repeat it, consume it, revoke the exact resulting
device/session through Clerk, confirm the user's Devices table returns none,
and close the temporary tabs before continuing.

## Marked acceptance loop

1. Create one move whose title begins `E2E PROD MCP acceptance` and use only
   obviously synthetic origin, destination, rooms, inventory, and planning
   content.
2. Register a temporary OAuth client with a name beginning `E2E PROD Moving MCP
   acceptance`; use PKCE and the canonical resource
   `https://movingmanifest.com/mcp`.
3. Create one personal Queue handoff through the normal move UI. The MCP brief
   must return that exact owner-scoped Queue ID and directive.
4. Prove the real workflow, not raw CRUD: list and read the move brief, search,
   save a source-backed complete result linked with `relatedQueueItemId`, replay
   the same operation id, hydrate the saved records, and read the updated brief.
5. Open the normal move overview and verify **Saved work** shows the MCP result,
   source checks, status, and `Your AI via MCP` provenance. Open the Queue
   handoff and verify **Linked move work** shows the same result plus attributable
   activity while the state remains **Waiting for your AI**. Canonical OAuth did
   not claim or complete Queue work.

FMCSA sources are suitable for this removable scenario because they exercise
real source URLs without introducing private data. Source checks must record
what was actually verified and must never claim a blocked or failed check
succeeded.

## Mandatory cleanup after every run

1. Revoke the refresh token and access token where supported, then delete the
   exact temporary OAuth client and confirm no matching consent/client remains.
2. Sign out and close the temporary MCP callback, consent, and Moving browser
   sessions. Retain no token, ticket, client secret, API key, or grant.
3. Archive and then hard-purge the exact marked move through the normal Moving
   UI. Hard purge removes that move's inventory, spaces, planning records,
   source checks, MCP operation receipts, Queue rows/activities, and other
   move-scoped fixtures, including the personal handoff and linked-result
   activity.
4. Return to **Your moves** and verify the marker is absent. The retained test
   account must contain no Move, MCP, or Queue fixture after the run.

Do not broaden cleanup to another user or household. If a marked fixture cannot
be proven removable, stop the run with the artifact still clearly labeled and
report the exact cleanup blocker.

## Proof reporting

Keep these layers separate: local tests, protected PR/CI, deployed release,
OAuth consent/token exchange, authenticated MCP reads and writes, normal UI
reflection, token/client/session revocation, and fixture purge. Private-media,
multi-client isolation, Queue transitions, or another client product remain
unproved unless that exact scenario was exercised.

## Latest retained-account receipt

The 2026-08-14 post-fix run completed after protected PR `#186`:

- release: merge `147cff46eaf971b3629d5b9e625e668c3a2d2b0b`, post-merge
  Actions run `31768988479` with Required CI and 1,050 tests passing, and exact
  production deployment `5900338675` successful at `2026-08-14T04:10:43Z`;
- authenticated workflow: a fresh public PKCE client using the official MCP
  TypeScript SDK discovered all eight canonical tools, read the exact move and
  personal Queue directive, saved and hydrated one source-backed complete
  result, and replayed the same operation idempotently;
- normal UI: Queue detail rendered the exact linked result, direct Saved work
  path, MCP attribution, and an unchanged Waiting for your AI state; the Move
  overview rendered the same decision, estimate, plan, and two FMCSA checks;
- cleanup: refresh revocation succeeded, the exact client was deleted, the
  product session was signed out, Clerk showed no device, the short-lived
  password was removed, and the exact marked move was hard-purged. Your moves
  and Queue were rechecked with all move, directive, and result markers absent.

Only the non-privileged identity and verified test-only alias remain. A durable
reusable password could not be placed in the unlocked Bitwarden browser vault
through the sanctioned automation surface, so future unattended sign-in is
still **Partial**. No Clerk policy was weakened to bypass that boundary.

### Prior 2026-08-13 receipt

The 2026-08-13 run completed after protected PR `#182` deployed the production
token-shape repair:

- release: merge `d0c0a83b3a6bf01289b1fb0dd472203fc6d20ac1`, Actions
  run `31660891558`, Production deployment
  `dpl_6ZZ6e3Ma3DDGF66x9FMZhMrpREPF` Ready at `2026-08-13T02:29:04Z`;
- authenticated workflow: official TypeScript SDK, all eight canonical tools,
  correct marked move, one complete result with two spaces, one inventory item,
  one decision, one estimate, one plan section, two checked FMCSA sources, and
  one readable top-level result;
- write safety: the complete-result retry returned `replay: true`; the granular
  decision correction produced `confirmed` version 2; search and hydration
  returned the saved records;
- normal UI: **Saved work** showed the result, estimate, plan, both source
  checks, and corrected decision with `Your AI via MCP` provenance;
- cleanup: refresh revocation succeeded, both temporary DCR clients were
  deleted, the browser session was signed out, the exact marked move was hard
  purged with every linked Move/MCP/Queue record, and the marker was absent from
  both **Your moves** and Queue afterward.

Only the labeled test identity and its empty minimal Moving identity scaffold
remain. Private-image rendering, simultaneous multi-client isolation,
disconnect/reconnect inside a named client product, and canonical OAuth Queue
transitions were not exercised.

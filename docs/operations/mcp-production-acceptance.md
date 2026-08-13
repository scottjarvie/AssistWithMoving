# Production MCP acceptance account

This runbook is the narrow, repeatable live-proof lane for Moving's canonical
OAuth MCP. It does not authorize testing with a real household, Scott's
account, another user's account, or another Assist product's Clerk instance.

## Retained identity

- Clerk application: **MovingManifest**
- Clerk environment: **production**
- Display name: **Moving MCP Test**
- Email: `moving-mcp-e2e+production@example.com`
- Role: ordinary signed-in person; no organization, admin, staff, or other
  elevated role

The randomized bootstrap password was discarded and must not be stored in the
repository, a password manager, test output, or a handoff. The retained Clerk
identity and its minimal empty Moving user/household membership scaffold are
the only durable test state. The account must never receive real household or
move information.

## Generate a future one-time sign-in

1. Open Clerk Dashboard → **MovingManifest** → **production** → **Users**.
2. Search for `moving-mcp-e2e+production@example.com` and open **Moving MCP
   Test**.
3. Choose **Actions → Impersonate user**.
4. Use the resulting one-time Moving sign-in in the isolated acceptance
   browser. Do not copy the ticket into source, logs, tracker records, or chat.

This dashboard path is the only retained sign-in recipe. A one-time ticket,
browser session, password, OAuth access/refresh token, dynamic OAuth client,
consent grant, API key, or Queue claim is never durable test setup.

## Marked acceptance loop

1. Create one move whose title begins `E2E PROD MCP acceptance` and use only
   obviously synthetic origin, destination, rooms, inventory, and planning
   content.
2. Register a temporary OAuth client with a name beginning `E2E PROD Moving MCP
   acceptance`; use PKCE and the canonical resource
   `https://movingmanifest.com/mcp`.
3. Prove the real workflow, not raw CRUD: list and read the move brief, search,
   save a source-backed complete result, replay the same operation id, make one
   optimistic granular correction, hydrate the saved records, and read the
   updated brief.
4. Open the normal move overview and verify **Saved work** shows the MCP result,
   source checks, status, and `Your AI via MCP` provenance.

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
   move-scoped fixtures.
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

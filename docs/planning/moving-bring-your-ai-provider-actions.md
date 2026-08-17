# Assist With Moving — Bring Your AI provider actions

**Status:** outstanding outside-the-repository steps for `MOV-WO-010`
**Prepared:** 2026-08-16
**Owner:** Scott (decisions), Codex (browser-driven provider work)

Everything in `MOV-WO-010` that could be built inside this repository is built
and tested. What remains needs a provider dashboard, a signed-in browser, or a
real AI product — none of which an implementation agent may reach on its own.
This file is the exact list, written so it can be run without re-deriving any
context.

Until these are done, the Bring Your AI connection stays **Partial** in the
tracker, the Project Philosophy ledger, `/ai`, and `/settings/ai`. That is the
honest state, and no surface in this repository claims otherwise.

---

## SEND TO CODEX — 1. Enable the Client ID Metadata Document path in Clerk

**Why:** Moving now prefers a Client ID Metadata Document and treats Dynamic
Client Registration as a labelled fallback. The resource advertises
`client_id_metadata_document_supported: true` at
`/.well-known/oauth-protected-resource/mcp`. The authorization server has to
actually support it, or the preference is advertised and unreachable.

**Steps:**
1. Sign in to the Clerk dashboard for the **production** Assist With Moving
   instance (the one behind `movingmanifest.com`).
2. Find the OAuth / MCP application settings and check whether Client ID
   Metadata Documents are available. Clerk shipped this in beta on 2026-08-06;
   **it may need Clerk support to enable it on the instance** before the toggle
   appears. If it is not available, stop and report that — do not work around it.
3. If available: enable it, **click Save**, then reload the page and confirm it
   is still enabled. Clerk's OAuth settings have silently reverted without an
   explicit Save before.
4. Confirm Dynamic Client Registration remains **enabled** as the fallback. Do
   not disable it — existing connections and clients that cannot publish a
   metadata document depend on it.
5. Capture the authorization-server metadata afterwards:
   `curl -s https://<clerk-issuer>/.well-known/oauth-authorization-server | jq`
   and record whether a metadata-document field is advertised alongside
   `registration_endpoint`.

**Do not:** change any other Clerk policy, factor, redirect, or scope
configuration to make a client connect.

**Report back:** whether the path is available, whether it needed Clerk
support, and the exact metadata document before and after.

---

## SEND TO CODEX — 2. Deploy in the correct order and prove anonymous discovery

**Why:** Convex carries the schema and the MCP handler; Vercel carries the
routes and the new `/settings/ai` screen. Deploying Vercel first would serve a
page whose backend does not exist yet.

**Steps:**
1. Deploy **Convex first**, then Vercel. This adds two tables (`aiGrants`,
   `aiGrantActivities`) and three indexes; it changes no existing table's
   required fields, so it is additive and safe to roll forward.
2. Run the existing read-only discovery proof: `npm run mcp:doctor`. Expect a
   401 with an RFC 9728 `WWW-Authenticate` whose `resource_metadata` points at
   `https://movingmanifest.com/.well-known/oauth-protected-resource/mcp`.
3. Fetch the protected-resource document and confirm it now lists the five
   product scopes alongside the identity scopes, `productGrantRequired: true`,
   and the four-door block.
4. Run `npm run mcp:doctor:legacy` and confirm `/mcp/connect` still behaves as
   before. The legacy door must not have moved.
5. Confirm `/api/mcp` still advertises **no** authorization server.

**Report back:** the four responses, and any difference from the expected shape.

---

## SEND TO CODEX — 3. Prove one real AI product through the nine-step lifecycle

**Why:** This is the only thing standing between **Partial** and **Current**.
The scripted harness (`npm run proof:mcp-lifecycle`) exercises every code path
and proves nothing about any real client. Until a named product completes this,
every client stays **Unknown**, and `/ai` describes the requirement rather than
naming a product as supported.

**Preparation, which is already done:**
- The nine steps and their acceptance are encoded in
  `tests/unit/mcp-lifecycle-harness.test.ts`. Use its evidence matrix as the
  script to follow.
- `/settings/ai` is where the person approves the grant. There is no product
  consent step inside Clerk — Clerk proves identity, Moving decides authority.

**Steps, using one clearly marked synthetic account and one removable move:**
1. Sign in as the synthetic person. Create a move whose title starts with a
   clear synthetic marker. Add one belonging and attach one private photo.
2. Open `/settings/ai`. Approve a grant for **that move only**, with
   `moving.context.read` and `moving.queue.work` at first. Screenshot the
   consent summary.
3. In the real AI product, add `https://movingmanifest.com/mcp` as a remote MCP
   server. Record which registration path it used and whether it self-registered.
4. List tools. Confirm only the granted tools plus `describe_connection` appear —
   `save_inventory`, `get_evidence_media`, and `archive_move_records` must be
   absent.
5. Ask it to read the move brief and list Queue work. Confirm no other move
   appears.
6. Return to `/settings/ai`, widen the grant to include
   `moving.evidence.read` and `moving.work.write`. Reconnect. Confirm the new
   tools appear and the photo comes back as a viewable image **inside the AI
   product** — this is the media step the harness cannot prove.
7. Have it claim the Queue handoff and finish it with one
   `save_complete_result` including `completeQueueItem: true`. Confirm the
   result and the Done state appear in the ordinary Moving UI with the AI
   attributed.
8. Revoke the grant in `/settings/ai`. Ask the AI to read the move again in the
   same session. Confirm it is refused immediately, and that the saved result
   and activity are still readable in Moving.
9. Approve a fresh grant, reconnect, confirm recovery. Then delete every
   synthetic record, grant, client, and the test identity, and re-query to prove
   absence.

Repeat for a second client if access allows. **A passed client proves only
itself.**

**Report back:** a filled evidence matrix per client with product name and
version, platform, registration path, and a note on any step the product could
not complete. Then `MOV-0035` can record the result and the public surfaces can
be updated — and only then.

---

## SEND TO CODEX — 4. Mobile and desktop setup check

Record separately whether the tested client can *add* a connection on mobile or
only *use* one added on desktop. A mobile client using an existing connection is
not proof that a person can set one up there, and the setup docs must say which
is true.

---

## Not requested, and deliberately so

- No change to the live domain, the `mmk_` key prefix, the storage bucket, or
  any Clerk/OAuth resource identifier.
- No removal or merge of `/mcp/connect`, `/api/mcp`, or the stdio package.
- No production data, billing, DNS, or secret is touched by any step above.

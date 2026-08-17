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

## CLOSED — DEFERRED — 1. Enable the Client ID Metadata Document path in Clerk

**Do not run this step.** Provider truth confirmed 2026-08-17: Clerk production
**Dynamic Client Registration is live fleet-wide**, DCR is the **approved
soft-launch client-identity path** for Moving, and Client ID Metadata Documents
are **deferred by decision** — not blocked, not awaiting Clerk support, not
pending a ticket. Nothing about a real-client lifecycle waits on this.

What that means for the shipped code, which is unchanged and correct: the
metadata-document path in `convex/lib/mcpClientIdentity.ts` stays implemented
and fail-closed, `client_id_metadata_document_supported` stays advertised as an
honest *preference*, and a client that uses DCR is accepted and labelled
`dynamicClientRegistration` on its grant. When the deferral is lifted, the
steps below are the ones to run.

**Deferred steps, kept for when the decision changes:**
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

**Status:** deferred 2026-08-17. Step 3 below does not depend on it; a real
client self-registering through DCR is the approved path and is enough.

---

## SEND TO CODEX — 2. Deploy in the correct order and prove anonymous discovery

**Why:** Convex carries the schema and the MCP handler; Vercel carries the
routes and the new `/settings/ai` screen. Deploying Vercel first would serve a
page whose backend does not exist yet.

**Package manager: `npm`** (the repository is locked with `package-lock.json`).
Do not substitute pnpm, yarn, or bun — the lockfile is the install contract.

### 2a. Work from a clean deploy worktree

The main checkout usually carries unrelated work in progress, and its
`.env.local` points Convex at a personal **dev** deployment. Deploying from it
risks shipping uncommitted files or targeting the wrong backend.

```bash
cd /Users/scottjarvie/IDE/AssistWithMoving
git fetch origin
git rev-parse --short origin/main          # note this SHA; call it <sha7>
git worktree add .claude/worktrees/deploy-<sha7> origin/main
cd .claude/worktrees/deploy-<sha7>
npm ci
```

A fresh worktree has **no `.env.local`**, and that is deliberate. Keep it that
way until the deploy step itself.

> ### The trap: `convex deploy` from a dev checkout IS a production deploy
>
> This is the most dangerous thing in this document. Verified against the
> installed CLI (`convex 1.43.0`) — quoting `npx convex deploy --help`:
>
> > The target deployment is chosen like this:
> > • If the `CONVEX_DEPLOYMENT` environment variable is set (typical during
> > local development), the target is **the project's default production
> > deployment**.
>
> Read that twice. `CONVEX_DEPLOYMENT=dev:gregarious-goldfinch-763` in
> `.env.local` does **not** mean `convex deploy` goes to dev. It means the CLI
> knows which *project* you are in and then deploys to that project's
> **production**. There is no confirmation prompt.
>
> **`convex deploy` has no `--prod` flag.** Do not go looking for one and do not
> add one — its absence is not a safety feature, it is because production is
> already the default. The `--prod` flag exists on *other* subcommands, which is
> exactly what makes this easy to get backwards.
>
> The Convex CLI also reads `CONVEX_DEPLOY_KEY` out of `.env.local` itself, and
> that value **overrides your shell environment** — so exporting a dev key does
> not save you either.
>
> Checked on 2026-08-16: `AssistWithMoving/.env.local` contains **no
> `CONVEX_DEPLOY_KEY`** and sets `CONVEX_DEPLOYMENT=dev:gregarious-goldfinch-763`.
> The file is not in version control and can change — re-check before deploying.
>
> **Pre-flight, both commands, before any Convex write:**
>
> ```bash
> # Which deployment is this project's PRODUCTION? --prod is required.
> # Without it this reports your DEV deployment and tells you nothing useful.
> npx convex dashboard --no-open --prod
>
> # What exactly would be pushed? Prints the configuration, deploys nothing.
> npx convex deploy --dry-run -v
> ```
>
> If the dry run shows anything you did not expect — a table you did not intend
> to add, a function you did not intend to change — stop.

**Nothing in the verify chain below touches any deployment.** `convex/_generated`
is committed, so no codegen network call is needed, and `tsc --noEmit` typechecks
all 212 files under `convex/` from source. Verified locally at `origin/main`:

```bash
npm run lint        # 0 errors (1 pre-existing unused-var warning)
npm run typecheck   # clean — this is the Convex-functions compile proof
npm run test        # 198 files / 1125 tests pass
npm run build       # succeeds; emits /settings/ai
```

> Run the test suite on an otherwise-idle machine. Several component tests use a
> 5s timeout and will fail spuriously in the dozens if a heavy build is running
> in parallel. A clean run is 198/198.

### 2b. Environment variables

No **new** environment variable is introduced by this change. The grant system
reads its configuration from the database, not from env. Confirm the existing
values are already present before deploying:

| Variable | Set in | Status |
| --- | --- | --- |
| `CONVEX_DEPLOYMENT` / deploy key | Convex CLI environment, at deploy time only | existing |
| `NEXT_PUBLIC_CONVEX_URL` | Vercel (Production) | existing |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Vercel (Production) | existing — the `/mcp` proxy needs it to reach the gateway |
| `CONVEX_HTTP_ACTIONS_URL` | Vercel (Production) | existing |
| `NEXT_PUBLIC_APP_URL` | Vercel (Production) | existing — must be `https://movingmanifest.com`, or the metadata advertises the wrong origin |
| `CLERK_JWT_ISSUER_DOMAIN` | Vercel (Production) + Convex | existing |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Vercel (Production) | existing |
| `CLOUDFLARE_IMAGE_DELIVERY_URL` / `CLOUDFLARE_IMAGES_ACCOUNT_HASH`, or `B2_ENDPOINT` + `B2_BUCKET_NAME` + `B2_APPLICATION_KEY_ID` + `B2_APPLICATION_KEY` | Convex (Production) | existing — `get_evidence_media` fetches photo bytes server-side through the **same** display path the web app uses. If the site shows photos today, this is already correct; nothing new is required. `npm run doctor:storage` checks it. |

`npm run doctor:vercel-env` and `npm run doctor:convex-env` check these without
deploying.

### 2c. Deploy — Convex first, then Vercel (one command does both, in order)

**Read this before typing anything.** Convex must land before Vercel, because
the app reads tables the schema has to already contain. This repository already
guarantees that ordering — you do not arrange it by hand. `vercel.json` sets:

```json
"buildCommand": "npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL"
```

So a production Vercel build **deploys Convex first**, waits for it to succeed,
then runs `npm run build` with `NEXT_PUBLIC_CONVEX_URL` injected from the
deployment it just made. If the Convex deploy fails, the build fails and no new
frontend is promoted. That is the correct ordering, enforced by the build itself.

```bash
# One command. Convex deploys inside this build, before Next.js builds.
npx vercel deploy --prod
```

Do **not** run a separate `npx convex deploy` first. It is redundant, and — per
the trap box above — it would deploy straight to production from your local
machine with no prompt, which is exactly the accident this path avoids. Vercel
holds the production `CONVEX_DEPLOY_KEY` in its own environment.

If you want to inspect the target and the pending change first, both of these
are read-only:

```bash
npx convex dashboard --no-open --prod   # names the PRODUCTION deployment
npx convex deploy --dry-run -v          # prints what would be pushed
```

**Schema delta this applies — purely additive.** Live production is commit
`d8ed8fe` (recorded in `docs/releases/v0.6.0-completeness-ledger.json` as
production deployment `5909128548`, state `success`, 2026-08-14). Diffing
`convex/schema.ts` from `d8ed8fe` to `origin/main` gives **127 lines added and
0 removed** (117 for the two grant tables, 10 for the `moves` compatibility
fields and their comment described below):

| Table | Indexes | From |
| --- | --- | --- |
| `aiGrants` | `by_owner_status_updated`, `by_owner_updated`, `by_owner_client_status`, `by_household_updated` | #196 |
| `aiGrantActivities` | `by_grant_created`, `by_owner_created`, `by_move_created`, `by_expires` | #196 |

That is **two new tables and eight indexes**.

> **Correction to an earlier draft of this document.** A previous revision listed
> `movePlanningRecords` and `mcpOperations` as new, for "four tables and sixteen
> indexes". They are not new. Commit `694d7d8` is an ancestor of the live commit
> (`git merge-base --is-ancestor 694d7d8 d8ed8fe` succeeds), and
> `git show d8ed8fe:convex/schema.ts` already defines both tables. They are
> already in production. Only the two grant tables are new.

Three new union validators land with them — `movingGrantScope`,
`mcpClientRegistrationMethod`, `aiGrantActivityType`. Validators are type
definitions; they touch no stored row.

The pre-existing `moves` table also gains two **optional** fields,
`nextItemCodeSeq` and `nextBoxCodeSeq`. They are compatibility surface, not new
product state — nothing reads or writes them. See the note below.

**Verdict: safe to deploy over live data with no migration.** Nothing is
removed, renamed, or retyped. The only pre-existing table that changes is
`moves`, and it gains two optional fields — never a required one, which is the
classic trap that breaks existing rows. Both new tables start empty, so there is
nothing to backfill.

**Deploy blocker cleared — schema validation on `moves`.** Before this change, a
`convex` push failed schema validation on the development deployment:
`Object contains extra field 'nextItemCodeSeq' that is not in the validator`.
The cause was an abandoned performance branch (`8ebdc13`, never merged to
`main`) that had been pushed to the shared development deployment and wrote
code-reservation counters onto move documents; dropping the branch orphaned the
fields. Because Convex validates every document in a table on every push, one
orphaned field fails the whole deploy.

Re-declaring both counters as optional clears it without touching a single
document. **Production was never at risk** — the counters were never on `main`,
so the production validator never declared them, and Convex refuses writes
carrying fields the deployed validator does not declare. Production rows
therefore cannot hold them. A read-only confirmation is in the runbook.

Only three development documents carry the fields, all E2E or debug fixtures.
Removing the fields later requires clearing those documents first:
`docs/operations/convex-legacy-code-seq-cleanup.md`.
`tests/unit/moves-legacy-code-seq.test.ts` fails if they are removed early.

### 2d. Post-deploy verification

```bash
# 1. The canonical door still challenges correctly.
npm run mcp:doctor
# Expect: 10 pass, 0 warn, 0 blocked, 0 fail.

# 2. The legacy door has not moved.
npm run mcp:doctor:legacy
# Expect: 10 pass, 0 warn, 0 blocked, 0 fail.
```

Both scripts are the same probe (`scripts/mcp-oauth-discovery-proof.mjs`) aimed
at different doors — `mcp:doctor` at the canonical `/mcp`, `mcp:doctor:legacy`
at the compatibility `/mcp/connect`. Neither needs an environment variable, a
secret, or a live local deployment: they read public endpoints over the network
and nothing else. The script states its own no-mutation guarantee, and it holds
— it sends one unauthenticated `initialize` that is rejected at the auth gate,
then plain GETs for discovery documents. No registration, no token exchange, no
tool call, no move data.

**Ten checks, and what green proves:** the door returns 401 unauthenticated;
the challenge carries a `resource_metadata` URL; that document's `resource`
matches the door you probed; an authorization server is named; and Clerk
advertises `registration_endpoint`, `authorization_endpoint`, `token_endpoint`,
PKCE `S256`, and `none` for token-endpoint auth. The tenth check is scopes, and
it requires exactly `openid profile email` — which is the whole correct answer,
not a limitation to work around.

Both doctors were green against production **before** this deploy (10 pass / 0
warn / 0 blocked / 0 fail, run 2026-08-16), so they are a regression check —
they prove the OAuth handshake did not break.

> **Do not check `scopes_supported` for the five `moving.*` scopes.** An
> earlier version of this runbook did, and it was wrong: it would report a
> correct deploy as a failure. RFC 9728 `scopes_supported` lists what a client
> may *request of the authorization server*. Clerk is that authorization
> server and can only issue `openid profile email`; it cannot mint product
> scopes. Our authority model is deliberate — product permission lives in the
> person's grant record, never in the token — so a `moving.*` scope in that
> list would be both unrequestable and a misdescription of how Moving decides
> what an AI may do. Seeing exactly `["openid","profile","email"]` is the
> correct result.

The metadata body still carries the grant contract, just not in
`scopes_supported`:

```bash
curl -s https://movingmanifest.com/.well-known/oauth-protected-resource/mcp \
  | jq '{scopes_supported, x: ."x-assistwithmoving"}'
```

Expect the three identity scopes, and the five product scopes present as a
namespaced vendor hint — `productScopes` — alongside
`productGrantRequired: true`, `grantManager:
"https://movingmanifest.com/settings/ai"`, and the four-door block:

```json
{
  "scopes_supported": ["openid", "profile", "email"],
  "x": {
    "productGrantRequired": true,
    "grantManager": "https://movingmanifest.com/settings/ai",
    "productScopes": [
      "moving.context.read",
      "moving.evidence.read",
      "moving.work.write",
      "moving.queue.work",
      "moving.archive"
    ]
  }
}
```

> **What this deploy actually has to prove.** Before 2026-08-16 the branded
> Next.js route served no grant block at all, while the richer document lived
> only on the Convex gateway — which a client never fetches, because the
> `/mcp` proxy rewrites the 401 to point at the branded route. The grant
> contract existed in the backend and was invisible in production. Both
> documents are now built from one shared source
> (`protectedResourceMetadataBody` in `src/lib/mcp-oauth.ts`, sourcing the
> product scope list from `convex/lib/aiGrants.ts`) and are guarded by
> `tests/unit/mcp-endpoint-separation.test.ts`.

**The three checks that prove this deploy, in order of what they establish:**

1. **The 401 challenge with branded `resource_metadata`** — the curl below.
   This proves a client can discover how to sign in, and that it will read
   *our* metadata rather than the gateway's.
2. **The grant-filtered tool list** — after approving a grant at
   `/settings/ai`, a connected AI's `tools/list` must show only the tools
   whose scope that grant includes, and must shrink when the grant is
   narrowed. This is the real proof of the authority model, because it is
   enforced from grant records rather than from anything in the token.
3. **`npm run mcp:doctor` green** — 10 pass / 0 warn / 0 blocked / 0 fail, as
   a regression check on the handshake.

Confirm the 401 challenge itself is intact. An MCP client's very first move is
an unauthenticated `initialize`; if this stops returning a well-formed
challenge, no client can discover how to sign in, and the failure is silent
from the app's side.

```bash
curl -s -D - -o /dev/null -X POST https://movingmanifest.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
  | grep -iE '^(HTTP/|www-authenticate)'
```

Expect exactly this shape (verified against live production 2026-08-16, and it
must be unchanged after the deploy):

```
HTTP/2 401
www-authenticate: Bearer realm="assistwithmoving", error="invalid_token", error_description="A valid Assist With Moving OAuth token is required.", resource_metadata="https://movingmanifest.com/.well-known/oauth-protected-resource/mcp"
```

The response body is:

```json
{"error":"invalid_token","error_description":"A valid Assist With Moving OAuth token is required."}
```

Two things must hold: the status is `401` (not 200, 405, or 500), and
`resource_metadata` points at **`movingmanifest.com`**, not at a `.convex.site`
host. If it points at the Convex host, the `/mcp` proxy rewrite has broken and
clients will read the gateway's copy of the metadata instead of the branded one.

Finally, confirm `/api/mcp` still advertises **no** authorization server:

```bash
curl -s https://movingmanifest.com/.well-known/oauth-protected-resource/api/mcp | jq '.authorization_servers'
# Expect: []
```

And confirm `/settings/ai` loads for a signed-in person.

### 2e. If verification fails

The schema delta is purely additive, so a rollback is a **Vercel** action, not a
Convex one:

1. Roll back the Vercel deployment to the previous production build (Vercel
   dashboard → Deployments → previous → Promote to Production). The site returns
   to its prior behaviour immediately.
2. **Leave the Convex schema in place.** The two new tables are unread by the
   previous frontend and hold no data yet; removing them is riskier than keeping
   them and gains nothing. There is no "roll back Convex" step, and you should
   not invent one — a schema rollback is the only genuinely destructive action
   available here.
3. Report which check failed and its exact response body.

**Report back:** the doctor summaries, the full protected-resource document, the
401 challenge headers, and any difference from the expected shape.

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
   server. It will self-register through Dynamic Client Registration — that is
   the approved path (confirmed 2026-08-17), so a `dynamicClientRegistration`
   label on the resulting grant is a pass, not a fallback to explain away.
   Record the registration path anyway; it belongs in the matrix.
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

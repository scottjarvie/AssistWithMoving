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

> **The trap that silently deploys to production.** The Convex CLI reads
> `CONVEX_DEPLOY_KEY` out of `.env.local` on its own, and that value **overrides
> your shell environment**. A `prod:`-prefixed key sitting in `.env.local` makes
> every Convex command target production — including ones you thought were
> local, like `convex codegen` or `convex dev`. A clean shell does not protect
> you.
>
> Checked on 2026-08-16: `AssistWithMoving/.env.local` contains **no
> `CONVEX_DEPLOY_KEY`** and sets `CONVEX_DEPLOYMENT=dev:gregarious-goldfinch-763`.
> So the trap is not currently armed in this repository — but re-check before
> deploying, because the file is not in version control and can change.
>
> Before any Convex command that could write, confirm the target:
> ```bash
> npx convex dashboard --no-open     # prints the deployment it would act on
> ```
> If that does not name the production deployment when you intend production —
> or does name it when you do not — stop and fix the environment first.

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

`npm run doctor:vercel-env` and `npm run doctor:convex-env` check these without
deploying.

### 2c. Deploy — Convex first, then Vercel

```bash
# 1. Convex. Confirm the target first.
npx convex dashboard --no-open
npx convex deploy

# 2. Only after Convex reports success, Vercel.
npx vercel deploy --prod
```

**Schema delta this applies (purely additive — verified by diffing
`convex/schema.ts` across every commit since the live deploy; zero lines were
removed and no existing table gained a required field):**

| Table | Indexes | From |
| --- | --- | --- |
| `aiGrants` | `by_owner_status_updated`, `by_owner_updated`, `by_owner_client_status`, `by_household_updated` | #196 |
| `aiGrantActivities` | `by_grant_created`, `by_owner_created`, `by_move_created`, `by_expires` | #196 |
| `movePlanningRecords` | `by_move_updated`, `by_move_kind_updated`, `by_move_stable_key`, `by_household_updated`, plus search index `search_move_records` | `694d7d8` |
| `mcpOperations` | `by_actor_client_tool_operation`, `by_move`, `by_expires` | `694d7d8` |

That is **four new tables and sixteen indexes**, not two tables and three
indexes as an earlier draft of this document said. Production predates the
grant system *and* the durable planning loop, so both land together. New union
validators (`movingGrantScope`, `mcpClientRegistrationMethod`,
`aiGrantActivityType`, `movePlanningRecordKind`, `movePlanningRecordStatus`,
`moveSourceCheckStatus`) are additive type definitions and touch no stored row.

Every table is new, so there is no backfill and no existing document needs to
change. Existing rows are untouched by this deploy.

### 2d. Post-deploy verification

```bash
# 1. The canonical door still challenges correctly.
npm run mcp:doctor
# Expect: 10 pass, 0 warn, 0 blocked, 0 fail.

# 2. The legacy door has not moved.
npm run mcp:doctor:legacy
# Expect: 10 pass, 0 warn, 0 blocked, 0 fail.
```

Both doctors were green against production **before** this deploy, so they are a
regression check, not a proof of the new work. What proves the new work is the
metadata body:

```bash
curl -s https://movingmanifest.com/.well-known/oauth-protected-resource/mcp | jq
```

Expect `scopes_supported` to contain the three identity scopes **and all five
product scopes**:

```
"openid", "profile", "email",
"moving.context.read", "moving.evidence.read",
"moving.work.write", "moving.queue.work", "moving.archive"
```

and an `x-assistwithmoving` block with `productGrantRequired: true`,
`grantManager: "https://movingmanifest.com/settings/ai"`, and the four-door
block, alongside `client_id_metadata_document_supported: true`.

> **This is the check that would have failed.** Before 2026-08-16 the branded
> Next.js route served only `["openid","profile","email"]` and no grant block,
> while the richer document lived only on the Convex gateway — which a client
> never fetches, because the `/mcp` proxy rewrites the 401 to point at the
> branded route. The five scopes existed in the backend and were invisible in
> production. Both documents are now built from one shared source
> (`protectedResourceMetadataBody` in `src/lib/mcp-oauth.ts`, sourcing the scope
> list from `convex/lib/aiGrants.ts`) and are guarded by
> `tests/unit/mcp-endpoint-separation.test.ts`.

Confirm the 401 challenge itself is intact:

```bash
curl -s -i -X POST https://movingmanifest.com/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | head -20
```

Expect `HTTP/2 401` and a `WWW-Authenticate: Bearer ... resource_metadata="https://movingmanifest.com/.well-known/oauth-protected-resource/mcp"` header.

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
2. **Leave the Convex schema in place.** The four new tables are unread by the
   previous frontend and hold no data yet; removing them is riskier than keeping
   them and gains nothing.
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

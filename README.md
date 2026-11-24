# Assist With Moving

Assist With Moving is a durable move-planning workspace shared by a person and
their chosen AI. It keeps move context, places, decisions, belongings,
evidence, estimates, plans, source checks, transport details, and useful
results together as the move changes. A chosen AI can connect through bounded
MCP or API tools while the person remains the authority.

**Public entry:** https://assistwithmoving.com

**Authenticated compatibility host and MCP:** https://movingmanifest.com

The repository, package, and code identifiers are now `AssistWithMoving`. Several
technical names deliberately still read `movingmanifest`, because renaming them
is a live-infrastructure change rather than a code change:

| Still `movingmanifest` | Why |
|---|---|
| `movingmanifest.com` (+ `clerk.` / `images.` / `www.`) | The authenticated and MCP/OAuth host; a domain cutover is separately approved |
| `mmk_` API key prefix | Every issued agent key starts with it; changing it invalidates live keys |
| Clerk instance and OAuth resource ids | Registered agent clients are bound to them |
| `movingmanifest-pics` B2 bucket | Holds every uploaded photo |
| Vercel project (and its `*.vercel.app` preview hosts) | Renaming changes preview URLs and deploy config |

The public and signed-in product identity is Assist With Moving; the public entry
redirects to the existing authenticated host until a separately approved
provider/domain cutover.

`MOVINGMANIFEST_*` environment variables are now `ASSISTWITHMOVING_*`. The old
names are still read as a fallback, so existing agent configs and deployment
environments keep working until they are updated.

The canonical product identity, responsibility boundaries, domain model, design direction, capability truth and family alignment live in [Assist With Moving — Project Philosophy](docs/planning/assist-with-moving-project-philosophy.md).

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js (App Router) + React, Tailwind, shadcn/ui |
| Backend / DB | [Convex](https://convex.dev) (queries, mutations, schema, crons) |
| Auth | Clerk (users) + `mmk_` API keys / MCP OAuth (agents) |
| Hosting | Vercel — production deploys automatically on merge to `main` |
| Media | Backblaze B2 (+ optional Cloudflare image worker in `infra/`) |
| Tests | Vitest (unit) + Playwright (e2e) |

## Repository map

```
src/app/            Next.js routes, in three route groups:
  (marketing)/        public pages (features, faq, /mcp guide, /updates …)
  (auth)/             Clerk sign-in / sign-up
  (product)/app/      the signed-in product (moves, items, movable-units, boxes, queue …)
  api/mcp, mcp/       remote MCP endpoint + OAuth discovery routes
src/components/     React components (ui/ = shadcn primitives)
src/lib/            shared client/server helpers (move links, sorting, labels, geometry …)
convex/             the backend: one module per feature (items.ts, boxes.ts,
                    moves.ts, photos.ts, queue.ts …); schema.ts is the DB schema;
                    http.ts routes HTTP, restApi.ts + restApiActions.ts are the
                    API-key REST door; httpRoutes/mcp.ts + mcpPlanning.ts are
                    canonical stateless OAuth; mcp*.ts retain the legacy catalog
convex/lib/         helpers that hold most of the rules: access and roles
                    (moveAccess, roles, aiGrants, carriedAccess, apiKeyAuth),
                    photo visibility and delivery, upload sessions, Queue
                    service, publishing checks, connector instructions
                    (mcpConnector/)
convex/rest/        REST handlers split out of restApi.ts (documentation profiles)
shared/             limits and policy shared by the site, backend and stdio server:
                    media and upload limits, AI connection policy, API tool access, the
                    moving_ tool-name prefix (moving-mcp-tool-names.mjs)
mcp-server/         standalone stdio MCP server (npm package) that talks to the
                    REST API with an mmk_ API key
scripts/            local Live/Sandbox launchers, doctor checks, smoke tests,
                    contract checks, tracker build
tests/              unit/ (Vitest, named after the feature), e2e/ (Playwright,
                    local only), helpers/ and fixtures/
docs/               Project Philosophy, API/MCP guide, tracker, audits, planning,
                    original build spec (historical)
.claude/hooks/      cloud-session setup hook and its contract test
infra/              Cloudflare image worker
patches/            patch-package patches applied on install
```

To find a feature, start from its route under `src/app/(product)/app/`, follow
the `api.<module>.<function>` calls into `convex/<module>.ts`, then into the
`convex/lib/` helper it uses; its tests are usually `tests/unit/<feature>*.test.ts`.

| Feature | Screens and data | Backend and agent entry points |
|---|---|---|
| Movable Units | `/app/movable-units` and `/app/moves/[id]/load-plan`; `boxes`, `boxItems`, `items` | `boxes.ts`, `items.ts`, screen rules in `src/lib/movable-units.ts`; REST `/moves/{id}/movable-units`, OAuth `save_inventory` |
| Capture | `/app/moves/[id]/capture`; `ingestionQueueEntries` | `ingestionQueue.ts`, Queue adapters in `queue.ts`; legacy `capture_to_queue` |
| Queue / Needs your input | `/app/queue` and `/app/queue/suggestions`; `queueItems`, `queueActivities` | `queue.ts`, `lib/queueService.ts`, canonical `mcpQueueWork.ts`, legacy `mcpToolsCanonicalQueue.ts` and `mcpToolsQueue.ts`; REST `/moves/{id}/queue/{id}/needs-you`, OAuth `ask_queue_question` |
| Spaces & Transport | `/app/spaces-transport`; `moveSpaces`, `transportResources`, `transportZones`, `transportTrips`, `tripSpaces` | `spaces-transport-page.tsx`; REST move routes `/spaces`, `/transport-resources`, `/transport-zones` |
| Layout plan | `/app/moves/[id]/plan`; `floorPlans`, `planLevels`, `planEntities`, `planPlacements`, `planOps`, `planProposals` | `floorPlans.ts`, `planOps.ts`, `src/components/layout-studio/`, `src/lib/plan-*`; REST `/plans` |
| Packets and sharing | `/app/moves/[id]/packets` and `/share/[token]`; `documentationProfiles`, `shareLinks`, `shareLinkComments`, `exportJobs` | `publicPackets.ts`, `documentation-packet-builder.tsx`, `public-share-viewer.tsx`; REST move routes `/documentation-profiles`, `/share-links`, `/exports` |

Convex calls using `(internal as any)` in `httpRoutes/mcp.ts`, `http.ts` and
`shareLinks.ts`, and the hand-typed `internalFunctions` in `restApi.ts`, can
bypass generated address checks. Trace these call sites when changing a registration.

**The MCP surfaces** (easy to confuse — check the right catalog before assuming
a capability is missing). Three code surfaces serve four public doors: `/mcp`,
`/mcp/connect`, `/api/mcp`, and the local stdio server.

1. **Canonical stateless OAuth** — `convex/httpRoutes/mcp.ts` +
   `convex/mcpPlanning.ts` + `convex/mcpQueueWork.ts`, served at
   `movingmanifest.com/mcp`. Its catalog is the exact
   `STATELESS_MOVING_TOOL_NAMES` array in `convex/httpRoutes/mcp.ts` — workflow-level tools covering a durable move brief, bounded
   search/read/media, move context, inventory, planning records,
   complete-result saves, the full Queue loop (list, claim, release, ask the
   smallest question, raising the Needs your input flag (state unchanged), complete), and reversible archive. Each tool is
   gated by product grant scopes in `convex/lib/aiGrants.ts`, so
   a connection is only shown what the person approved. Never retype this count;
   `tests/unit/mcp-doc-tool-catalog.test.ts` derives it from source.
2. **Legacy persisted OAuth** — `convex/mcp.ts` + `convex/mcpTools*.ts`
   (including `mcpToolsCanonicalQueue.ts`), served
   at `movingmanifest.com/mcp/connect`. It preserves the original catalog plus
   `describe_connection` and `reduce_connection` for already-connected clients.
3. **API-key HTTP/stdio** — `src/app/api/mcp/route.ts` and `mcp-server/`, using
   an `mmk_` key against REST. This is the granular automation surface. It has
   its own Queue tools under `queue/read` / `queue/write`; the canonical OAuth
   door has equivalents under the `moving.queue.work` grant scope. Both drive
   the same `queueService` primitives.

On every door `tools/list` publishes names with the `moving_` prefix, and the
old unprefixed names still work when called. See
[docs/api-and-mcp.md](docs/api-and-mcp.md) for details.
The evidence-backed path from today's foundation to the adopted family standard
is in the [Moving Bring Your AI MCP/OAuth alignment plan](docs/planning/moving-bring-your-ai-mcp-oauth-alignment.md).

## Project tracker

Current project work, approved scope, handoff, and completion evidence live in
the repo-owned [Assist With Moving tracker](docs/tracker/GUIDE.md). Its only
top-level concepts are Cards, Work Orders, and Guide; open the generated
[Kanban and Work Orders reader](docs/tracker/board.html) for the owner view.
Linear ids may appear as optional historical context, but Linear is not a gate
for intake, implementation, or normal progress.

## Local development

```sh
npm install
cp .env.example .env.local   # fill in real values — see comments in the file
npm run dev                  # Next.js on http://localhost:3827 (intentionally uncommon port)
npx convex dev               # pushes functions to the DEV Convex deployment; keep running
```

Convex has separate **dev** and **prod** deployments. Local work and e2e tests point at dev; prod is only touched by the Vercel deploy on merge to `main`. New/changed Convex functions must be pushed with `npx convex dev` (or `--once`) before the UI can call them, or you'll see "Could not find public function".

Secrets live in `.env.local` (never committed). `.env.example` stays placeholder-only.

### Local Live and Sandbox modes

```sh
npm run dev:live      # local code against the real account backend, port 3828 — changes are real
npm run dev:sandbox   # local code against the cloud dev backend grateful-jaguar-369 (synthetic, no provider keys), port 3827
npm run dev:backend   # push backend source to that Sandbox deployment only
npm run dev:status    # check both mode bindings without starting anything
```

Each mode reads its own sanitized `.env.local-live` / `.env.local-sandbox` (ignored by git), refuses any backend or Clerk identity other than the one bound in `scripts/local-development.json`, refuses server secrets, and refuses occupied ports. Both modes refuse to start when `NODE_ENV=production`, `VERCEL` or `CI` is set, and the in-app local auth path (`src/lib/localLiveAuth.ts`) only activates in development with an exact local binding, so hosted production always uses the normal Clerk proxy. Server APIs, media, MCP and provider actions return 503 locally. A banner shows which data the page is using.

Sandbox is the cloud development deployment `dev:grateful-jaguar-369` (`jarvie:movingmanifest:dev/sandbox`), created empty with only the public `CLERK_JWT_ISSUER_DOMAIN` (`https://glorious-swine-50.clerk.accounts.dev`). The earlier Mac mini native backend binding stays as `nativeSandbox` in `scripts/local-development.json` for `scripts/prepare-record-only-sandbox.mjs`. For sign-in and screenshots, see AGENTS.md.

## Checks and tests

```sh
npm run check         # the pre-merge gate: everything below except e2e and build, plus contract checks
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
npm run test          # vitest unit tests
npm run test:e2e      # playwright (needs dev server + dev Convex)
npm run verify:launch # all of the above + build, in sequence
```

`scripts/` also has environment "doctor" checks (`npm run doctor:all`, `doctor:storage`, `doctor:webhooks`, `mcp:doctor` …) that validate env vars, storage, webhooks, and MCP discovery without changing anything.

## Deploying

Merging to `main` on GitHub **is** the production deploy (Vercel builds and ships automatically, and prod Convex functions deploy with it). There is no separate release step — so `main` must always be green: run `npm run check` before merging. CI's unit-test job is informational, so the local check is the one that catches a failing test.

The AI merges and deploys routine work after previewing it locally ([Core Philosophy §16.6](https://github.com/scottjarvie/assistwithlife/blob/main/planning/assist-with-sites-core-philosophy.md#166-delivering-changes-localhost-first-then-merge)). Vercel builds only `main` and branches named `preview/*`; push to a `preview/` branch when a preview link is wanted. Draft pull requests skip the CI jobs until marked ready.

## Conventions

- Work happens on short-lived branches PR'd into `main`; branches are deleted after merge, and the repo keeps only `main` plus open PR branches (the older leftover branches on GitHub await Scott's cleanup decision).
- Cards and owner-approved Work Orders in `docs/tracker/` are the durable
  source for current work. GitHub PRs carry implementation review and evidence.
- Agent-facing Convex tools must throw `ConvexError` (plain `Error` may be redacted by an MCP transport).
- No fabricated demo data in the UI — real data or an honest empty/explainer state.

### AWL-0016 Queue contract

Requests made through your AI are ordinary Queue items, marked “added by your AI”. Your AI’s own work ideas are “AI suggestions”: hidden by default in the Queue, counted, and waiting for you to accept, edit first or dismiss. Needs your input is a flag on Waiting on AI, AI working or Answered; answering clears the flag without moving the item. Draft edits to Moving records stay on those records as AI proposals. Only you can accept or dismiss; your AI may withdraw its own suggestion before you act. You can turn off Propose suggestions without blocking requested work.

Canonical Queue additions: `add_queue_item`, `list_queue_suggestions`, `withdraw_queue_suggestion` (all `moving.queue.work`; unsolicited adds also require `moving.suggestions.propose`). API-key HTTP/stdio share these names with `queue/write`, `queue/read`, and removable `queue/suggest` on unsolicited adds. Legacy OAuth also exposes these; `capture_to_queue` requires explicit `addedBy` and `operationId`. Record-level generate/approve/reject tools keep their domain behavior; they are not Queue aliases.

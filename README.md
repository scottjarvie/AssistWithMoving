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
  (product)/app/      the signed-in product (moves, boxes, items, queue …)
  api/mcp, mcp/       remote MCP endpoint + OAuth discovery routes
src/components/     React components (ui/ = shadcn primitives)
src/lib/            shared client/server helpers (sorting, labels, geometry …)
convex/             the entire backend — one file per API namespace
                    (items.ts, boxes.ts, moves.ts …); schema.ts is the DB schema;
                    httpRoutes/mcp.ts + mcpPlanning.ts are canonical stateless
                    OAuth; mcp*.ts retain the legacy OAuth catalog
mcp-server/         standalone stdio MCP server (npm package) that talks to the
                    REST API with an mmk_ API key
scripts/            operational "doctor" checks, smoke tests, seeding
tests/              Playwright e2e + Vitest unit tests
docs/               Project Philosophy, API/MCP guide, audits, original build spec
infra/              Cloudflare image worker
patches/            patch-package patches applied on install
```

**The MCP compatibility doors** (easy to confuse — check the right catalog
before assuming a capability is missing):

1. **Canonical stateless OAuth** — `convex/httpRoutes/mcp.ts` +
   `convex/mcpPlanning.ts`, served at `movingmanifest.com/mcp`. It exposes eight
   workflow-level tools for a durable move brief, bounded search/read/media,
   move context, inventory, planning records, and complete-result saves.
2. **Legacy persisted OAuth** — `convex/mcp.ts` + `convex/mcpTools*.ts`, served
   at `movingmanifest.com/mcp/connect`. It preserves the older 29-tool catalog
   for already-connected clients.
3. **API-key HTTP/stdio** — `src/app/api/mcp/route.ts` and `mcp-server/`, using
   an `mmk_` key against REST. This is the granular automation surface and the
   only MCP surface with canonical scoped Queue transitions today.

See [docs/api-and-mcp.md](docs/api-and-mcp.md) for details.
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

## Checks and tests

```sh
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
npm run test          # vitest unit tests
npm run test:e2e      # playwright (needs dev server + dev Convex)
npm run verify:launch # all of the above + build, in sequence
```

`scripts/` also has environment "doctor" checks (`npm run doctor:all`, `doctor:storage`, `doctor:webhooks`, `mcp:doctor` …) that validate env vars, storage, webhooks, and MCP discovery without changing anything.

## Deploying

Merging to `main` on GitHub **is** the production deploy (Vercel builds and ships automatically, and prod Convex functions deploy with it). There is no separate release step — so `main` must always be green: lint, typecheck, unit tests, and build before merging.

## Conventions

- Work happens on short-lived branches PR'd into `main`; branches are deleted after merge. Long-lived experiments get an `archive/*` branch on GitHub.
- Cards and owner-approved Work Orders in `docs/tracker/` are the durable
  source for current work. GitHub PRs carry implementation review and evidence.
- Agent-facing Convex tools must throw `ConvexError` (plain `Error` may be redacted by an MCP transport).
- No fabricated demo data in the UI — real data or an honest empty/explainer state.

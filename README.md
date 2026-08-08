# MovingManifest

MovingManifest helps people plan and execute a move: capture belongings by photo, organize them into boxes and movable units, plan spaces and transport, and generate documentation packets (claims, employer, mover, military PCS). Its differentiator is **bring-your-own AI agent**: instead of a built-in AI, users connect their own assistant (Claude, ChatGPT, etc.) over MCP, and the agent does the heavy lifting — identifying items from photos, packing boxes, planning loads — through the same permissioned APIs a human would use.

**Production:** https://movingmanifest.com

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
                    mcp*.ts are the OAuth-gateway agent tools; lib/ = shared logic
mcp-server/         standalone stdio MCP server (npm package) that talks to the
                    REST API with an mmk_ API key — the second of two MCP surfaces
scripts/            operational "doctor" checks, smoke tests, seeding
tests/              Playwright e2e + Vitest unit tests
docs/               Project Philosophy, API/MCP guide, audits, original build spec
infra/              Cloudflare image worker
patches/            patch-package patches applied on install
```

**The two MCP surfaces** (easy to confuse — check both before assuming a capability is missing):

1. **Remote OAuth gateway** — `convex/mcp.ts` + `convex/mcpTools*.ts`, served at `movingmanifest.com/mcp/connect`. Users connect from claude.ai/ChatGPT via OAuth.
2. **Stdio server** — `mcp-server/`, installed locally, authenticates with an `mmk_` API key against the REST API.

See [docs/api-and-mcp.md](docs/api-and-mcp.md) for details.

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
- Agent-facing Convex tools must throw `ConvexError` (plain `Error` gets redacted to "Tool execution failed" by the MCP gateway).
- No fabricated demo data in the UI — real data or an honest empty/explainer state.

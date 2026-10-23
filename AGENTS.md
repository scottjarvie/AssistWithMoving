<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project orientation

- Start with [README.md](README.md) — product overview, stack, repo map, local dev, and conventions.
- Read [Assist With Moving — Project Philosophy](docs/planning/assist-with-moving-project-philosophy.md) before product, UX, architecture, public-copy, or roadmap decisions. It is the canonical product-specific companion to the family Core Philosophy.
- The repo-owned [project tracker Guide](docs/tracker/GUIDE.md), Cards and Work Orders are useful context when continuing tracked work. A direct request from Scott in chat authorizes ordinary work; a Work Order is optional context, not a gate. Linear is optional historical context only; never reconnect, query, or require it before implementation or ordinary progress.
- Working on the REST API or MCP tools? [docs/api-and-mcp.md](docs/api-and-mcp.md) is the authoritative guide. Check all three MCP surfaces before adding or assuming a capability: canonical stateless OAuth (`convex/httpRoutes/mcp.ts` + `convex/mcpPlanning.ts`), persisted legacy OAuth (`convex/mcp*.ts`), and API-key HTTP/stdio (`src/app/api/mcp/route.ts` + `mcp-server/`). Their four public doors (`/mcp`, `/mcp/connect`, `/api/mcp`, and stdio) intentionally have different catalogs and proof.
- Delivery follows [Core Philosophy §16.6](https://github.com/scottjarvie/assistwithlife/blob/main/planning/assist-with-sites-core-philosophy.md#166-delivering-changes-localhost-first-then-merge): preview on localhost (`npm run dev:live` for screen changes, `npm run dev:sandbox` for backend or schema changes), then the AI merges and deploys routine work itself. Stop and ask Scott only for money or billing, deleting real data, domains or DNS, secrets, or a change to who can access production data.
- Merging to `main` deploys production (Vercel + prod Convex). Keep `main` green: `npm run lint && npm run typecheck && npm run test` before merging. Vercel builds `main` and `preview/*` branches only (`scripts/vercel-ignore-build.mjs`).
- Agent-facing Convex tools must throw `ConvexError`, never plain `Error` (the MCP gateway redacts plain errors to "Tool execution failed").
- Delete branches after merge; this repo intentionally keeps only `main` plus short-lived PR branches.

- AI connections default to all current/future scopes and no end date. Use `effectiveScopes` / `effectiveExpiry` from `convex/lib/aiGrants.ts` everywhere; never authorize against a stored scope snapshot. The frozen legacy baseline must never grow. Person-chosen limits and revoked grants must survive reconnects. See `docs/api-and-mcp.md` for legacy provenance rules.

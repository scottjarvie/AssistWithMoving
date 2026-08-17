<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project orientation

- Start with [README.md](README.md) — product overview, stack, repo map, local dev, and conventions.
- Read [Assist With Moving — Project Philosophy](docs/planning/assist-with-moving-project-philosophy.md) before product, UX, architecture, public-copy, or roadmap decisions. It is the canonical product-specific companion to the family Core Philosophy.
- Read the repo-owned [project tracker Guide](docs/tracker/GUIDE.md) and the relevant Cards / Work Orders before continuing current work. Linear is optional historical context only; never reconnect, query, or require it before implementation or ordinary progress.
- Working on the REST API or MCP tools? [docs/api-and-mcp.md](docs/api-and-mcp.md) is the authoritative guide. Check all three MCP surfaces before adding or assuming a capability: canonical stateless OAuth (`convex/httpRoutes/mcp.ts` + `convex/mcpPlanning.ts`), persisted legacy OAuth (`convex/mcp*.ts`), and API-key HTTP/stdio (`src/app/api/mcp/route.ts` + `mcp-server/`). Their four public doors (`/mcp`, `/mcp/connect`, `/api/mcp`, and stdio) intentionally have different catalogs and proof.
- Merging to `main` deploys production (Vercel + prod Convex). Keep `main` green: `npm run lint && npm run typecheck && npm run test` before merging.
- Agent-facing Convex tools must throw `ConvexError`, never plain `Error` (the MCP gateway redacts plain errors to "Tool execution failed").
- Delete branches after merge; this repo intentionally keeps only `main` plus short-lived PR branches.

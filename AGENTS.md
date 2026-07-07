<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project orientation

- Start with [README.md](README.md) — product overview, stack, repo map, local dev, and conventions.
- Working on the REST API or MCP tools? [docs/api-and-mcp.md](docs/api-and-mcp.md) is the authoritative guide. Note there are TWO MCP surfaces with separate code: the OAuth gateway (`convex/mcp*.ts`) and the stdio/HTTP server (`mcp-server/`) — check both before adding or assuming a capability.
- Merging to `main` deploys production (Vercel + prod Convex). Keep `main` green: `npm run lint && npm run typecheck && npm run test` before merging.
- Agent-facing Convex tools must throw `ConvexError`, never plain `Error` (the MCP gateway redacts plain errors to "Tool execution failed").
- Delete branches after merge; this repo intentionally keeps only `main` plus short-lived PR branches.

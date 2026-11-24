<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project orientation

- Start with [README.md](README.md): product, stack, the repository map (where each feature lives), local dev and conventions.
- Read the [Project Philosophy](docs/planning/assist-with-moving-project-philosophy.md) before product, UX, architecture, public-copy or roadmap decisions. It is the product-specific companion to the family Core Philosophy.
- The [tracker Guide](docs/tracker/GUIDE.md), Cards and Work Orders are context for tracked work. A direct request from Scott in chat authorizes ordinary work; a Work Order is not a gate. Linear is history only; never reconnect, query or require it.
- REST API or MCP work: [docs/api-and-mcp.md](docs/api-and-mcp.md) is authoritative. Check all three MCP surfaces before adding or assuming a capability: canonical stateless OAuth (`convex/httpRoutes/mcp.ts` + `convex/mcpPlanning.ts`), persisted legacy OAuth (`convex/mcp*.ts`), and API-key HTTP/stdio (`src/app/api/mcp/route.ts` + `mcp-server/`). Their four public doors (`/mcp`, `/mcp/connect`, `/api/mcp`, and stdio) intentionally have different catalogs and proof.
- Delivery follows [Core Philosophy §16.6](https://github.com/scottjarvie/assistwithlife/blob/main/planning/assist-with-sites-core-philosophy.md#166-delivering-changes-localhost-first-then-merge): preview on localhost (`npm run dev:live` for screens, `npm run dev:sandbox` for backend or schema), then the AI merges and deploys routine work. Ask Scott only for money or billing, deleting real data, domains or DNS, secrets, or who can access production data.
- **Sign-in and screenshots:** Sandbox is `http://moving.localhost:3827` (cloud dev backend `grateful-jaguar-369`). The helpers are in your `assist-local-dev` checkout, not this repo: once per checkout `node <assist-local-dev>/screenshots/sandbox-profile.mjs <this checkout>`, then `npm run dev:sandbox` here and `node <assist-local-dev>/screenshots/shoot.mjs --base http://moving.localhost:3827 --site moving --label before --routes /app`, as the Clerk dev `+clerk_test` user, never Scott's account ([README](https://github.com/scottjarvie/assist-local-dev/blob/main/screenshots/README.md)).
- **Scott's real account** (testing only, read-mostly; writes use the test user): `node <assist-local-dev>/screenshots/shoot.mjs --live --checkout <this checkout>` reuses his saved session ([standard](https://github.com/scottjarvie/assist-local-dev/blob/main/docs/sign-in-and-screenshots.md#scotts-real-account-approved-15-nov-2026)).
- Merging to `main` deploys production (Vercel + prod Convex). Run `npm run check` before merging: it is the full local gate (lint, both typechecks, Convex bindings, launcher and contract checks, unit tests), and CI's unit-test job does not block a merge. Vercel builds only `main` and `preview/*` (`scripts/vercel-ignore-build.mjs`).
- Agent-facing Convex tools must throw `ConvexError`, never plain `Error` (the MCP gateway redacts plain errors to "Tool execution failed").
- Delete branches after merge; the repo keeps only `main` plus short-lived PR branches.
- **AI connection access:** never write code that lets an AI widen, resume, restore or rotate its own connection for more access; only a person session at https://movingmanifest.com/settings/ai can. Read [the agent rules for connection code](docs/api-and-mcp.md#agent-rules-for-connection-code) before touching grants, keys, `aiAccessOwners` or `reduce_connection`.

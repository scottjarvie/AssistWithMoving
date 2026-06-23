<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MovingManifest MCP/OAuth Guardrail

Hosted MCP clients must use `https://movingmanifest.com/api/mcp`; `/mcp` is the human setup page. If a hosted client is already on `/api/mcp` and `get_api_context` still returns `401 - Invalid API key format` after one refresh/reconnect, do not keep asking the user to reconnect. Treat it as a stale production backend or deploy mismatch: the live Convex REST backend is probably still running the API-key-only path.

Before declaring MCP/OAuth fixed, verify all of these:

- `GET https://movingmanifest.com/api/v1/me` rejects unauthenticated access with a message that mentions `OAuth access token`, not only `Use a Bearer API key.`
- `GET https://movingmanifest.com/api/mcp` returns the OAuth/API-key challenge.
- `GET https://movingmanifest.com/.well-known/oauth-protected-resource/api/mcp` points at `https://movingmanifest.com/api/mcp` and the Clerk production issuer.
- A real connector call to `get_api_context` succeeds.
- For box-intake changes, run `save_box_intake` with `dryRun: true` before a live write.

Run `npm test -- tests/unit/oauth-cutover-readiness.test.ts tests/unit/mcp-oauth-smoke-script.test.ts tests/unit/mcp-route-auth.test.ts tests/unit/mcp-client.test.ts tests/unit/mcp-capabilities.test.ts` after touching the MCP/OAuth path.

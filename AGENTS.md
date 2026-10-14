# Assist With Moving — project entrypoint

No Site Guide was found in the inspected checkouts. Use [README](README.md) for orientation; distinguish plans from implemented behavior.

For API or MCP work, read [the API/MCP guide](docs/api-and-mcp.md). The OAuth gateway and `mcp-server/` are separate implementations; inspect both before adding or claiming tools. Agent-facing Convex failures must use `ConvexError`; plain errors are redacted by the gateway.

Merging main can deploy both Vercel and production Convex. Follow the repository release checks (`lint`, `typecheck`, `test`) for software delivery; do not treat a local launcher or frontend refresh as backend deployment.

Checkout-specific local bindings and limits: [local runbook](docs/local-development.md). Preserve its pinned identity/backend and record-only guards.

Tracker records, where present, are optional coordination context, not a required approval or startup ritual. Scott’s current instruction supplies authorized scope.

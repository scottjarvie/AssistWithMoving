# Assist With Moving — project entrypoint

No Site Guide was found in the inspected checkouts. Use [project direction](docs/planning/assist-with-moving-project-philosophy.md) for orientation; distinguish plans from implemented behavior.

For API or MCP work, read [the API/MCP guide](docs/api-and-mcp.md). Inspect canonical stateless OAuth, persisted legacy OAuth and API-key HTTP/stdio implementations; their public doors have separate catalogs and proof. Agent-facing Convex failures must use `ConvexError`; plain errors are redacted by the gateway.

Merging main can deploy both Vercel and production Convex. Follow the repository release checks (`lint`, `typecheck`, `test`) for software delivery; do not treat a local launcher or frontend refresh as backend deployment.

[Tracker](docs/tracker/GUIDE.md) is optional coordination context, not a required approval or startup ritual. Scott’s current instruction supplies authorized scope.

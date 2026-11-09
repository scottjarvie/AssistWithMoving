# Lean CI (2026-11-09)

- **On every ready pull request:** `Required CI` (lint, Convex bindings, typecheck, contract and docs-truth tests, build) and `Unit tests (informational)`. Drafts skip both; a newer push cancels the older run.
- **On push to main:** nothing. Main only moves by merging a PR that already passed. Tracker state commits carry `skip-checks: true` and Vercel's ignore script validates them.
- **Docs-only PRs still run CI on purpose:** the docs-truth tests compare `docs/api-and-mcp.md`, `README.md` and `AGENTS.md` with the shipped MCP tool catalog.
- **By hand:** run either job at any branch head with `gh workflow run required-ci.yml --ref <branch>` (also works for drafts). Browser tests stay local: `npm run test:e2e`, or `npm run verify:launch` for the full release proof.

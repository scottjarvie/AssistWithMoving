# Baseline checks — 2026-11-05

Target: unchanged application source at `964eec223b8fb1ec3a3c8ff8926dd4c5806b2076`, before design edits. These results establish pre-existing conditions; they do not verify a redesign.

| Check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passed; 906 packages installed, both repository package patches applied. |
| `npm run lint` | Passed, exit 0; one existing `import/no-anonymous-default-export` warning at `infra/cloudflare/image-worker.js:69`. |
| `npm run typecheck` | Passed, exit 0. |
| `npm run test` | Running at the time of this record; already reported failures in `mcp-media-ingress.test.ts` (local file-root test) and `load-planner-board-tabs.test.tsx` (rough pasted list). No overall result yet. |
| `npm run build` | Running at the time of this record; Next.js 16.4.2 reported production compilation started. No overall result yet. |
| `npm run dev:status` | Ran successfully; both `.env.local-live` and `.env.local-sandbox` are missing. Authenticated preview readiness is unverified. |

Raw captures are kept locally as `baseline-{lint,typecheck,test,build}.log` and ignored by Git. Update this record with terminal results rather than treating a running check as passed.

Relevant bundled Next.js guidance was consulted under `node_modules/next/dist/docs/01-app/`: layouts/pages, CSS, fonts, and Playwright testing. No application code has been changed.

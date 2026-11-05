# Baseline checks — 2026-11-05

Target: unchanged application source at `964eec223b8fb1ec3a3c8ff8926dd4c5806b2076`, before design edits. These results establish pre-existing conditions; they do not verify a redesign.

| Check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passed; 906 packages installed, both repository package patches applied. |
| `npm run lint` | Passed, exit 0; one existing `import/no-anonymous-default-export` warning at `infra/cloudflare/image-worker.js:69`. |
| `npm run typecheck` | Passed, exit 0. |
| `npm run test` | Failed, exit 1; 212 test files passed, 2 failed; 1,330 tests passed, 2 failed (1,332 total). Duration 239.19 seconds. Details below. |
| `npm run test -- tests/unit/load-planner-board-tabs.test.tsx --maxWorkers=1` | Passed, exit 0; all 30 tests passed without changing source or test timeouts. Duration 62.44 seconds. The full-suite timeout did not reproduce in isolation. |
| `npm run build` | Passed, exit 0; Next.js 16.4.2 completed production compilation, TypeScript, and route generation. |
| `npm run dev:status` | Ran successfully; both `.env.local-live` and `.env.local-sandbox` are missing. Authenticated preview readiness is unverified. |

## Existing test failures

- `tests/unit/mcp-media-ingress.test.ts:141`: Windows returned `EPERM` when the test attempted to create a file symlink. The test failed in fixture setup, before its policy assertions. No application changes caused this failure.
- `tests/unit/load-planner-board-tabs.test.tsx:1300`: “creates boxes and loose movable items from a rough pasted list” exceeded the existing 5,000 ms test timeout in the full run. All 30 tests in this file passed in the focused recheck without changing source or timeouts. The original full-suite result remains failed; this recheck does not establish that the full suite is green.

Raw captures are kept locally as `baseline-{lint,typecheck,test,build}.log` and `baseline-load-planner-recheck.log`, ignored by Git. Update this record with terminal results rather than treating a running check as passed.

Relevant bundled Next.js guidance was consulted under `node_modules/next/dist/docs/01-app/`: layouts/pages, CSS, fonts, and Playwright testing. No application code has been changed.

## Portable fixture correction (verification pending)

The historical baseline failure is retained above. To run the same regular-file and canonical-root security assertions on oldwin without privileged file symlinks, the fixture now creates a directory junction on Windows and a directory symlink elsewhere. It rejects the alias itself and a regular child that resolves outside the allowed root; POSIX also keeps the original direct file-symlink assertion. Fixture setup is inside try/finally and cleanup validates the fresh temp path. Application ingress policy is unchanged. The next focused/full run must verify this fixture; no green check is claimed yet.

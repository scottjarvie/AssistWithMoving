# Project Pulse — accumulated lessons

Plain-English lessons about how MovingManifest works, written for the project
owner. Each pulse adds new lessons here and references old ones instead of
re-teaching them.

## two-doors-for-ai (2026-07-27)
**Takeaway:** AI assistants connect to MovingManifest through exactly two doors,
and they must never be mixed: `https://movingmanifest.com/mcp` (sign in with
your account — the recommended front door) and `/api/mcp` (a side door that
uses an `mmk_` API key, for headless automation only).
July's security work locked both doors: production sign-in configuration is
pinned (PR #146), keys in URLs are rejected with a migration message (PR #147),
and expired/revoked keys now behave as dead everywhere (PR #157).

## one-pipeline-deploys-everything (2026-07-27)
**Takeaway:** Pushing to `main` triggers one Vercel deploy that builds the
website AND deploys the Convex backend together (`vercel.json` runs
`npx convex deploy` around the build). Merged and deployed are effectively the
same event for this project — verified this pulse by finding PR #148's exact
doc text live on movingmanifest.com.

## squash-merge-hides-finished-branches (2026-07-27)
**Takeaway:** This repo squash-merges pull requests, so git itself cannot tell
that a merged branch is finished — it will look "unmerged" forever. Always
check the branch name against merged PRs before worrying about it (example this
pulse: `feat/move-398-dep-security` looked unmerged but is PR #149, merged
July 18).

## server-fast-browser-heavy (2026-07-27)
**Takeaway:** The server answers in 10–25 ms; every speed problem this project
has lives in the browser and the data layer instead. Pages ship large
JavaScript bundles (the sign-in vendor loads on every public page), and the
live-updating data queries re-read whole tables when anything changes. This is
where performance work pays off — not the server.

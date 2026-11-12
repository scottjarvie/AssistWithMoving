# Moving family chrome fixture · 2026-11-12

Run from the repo root with `node node_modules/vite/bin/vite.js --config tests/fixtures/family-chrome/vite.config.mts` and open localhost:3846. Stop the process after use. This fixture is never a production route.

The actual AccountMenu and FamilyRow components, Radix surfaces and production CSS are rendered with synthetic Clerk identity, Convex query and Next Link/router boundaries. No backend, credentials or personal data are used. Parameters: `theme=light` (otherwise dark), `role=admin` (otherwise unresolved/non-admin), `auth=loading|out`, `error` (sign-out rejection). Name is 60 characters and the email uses `.invalid`. Font delivery, provider integration and production authentication are outside this proof. The bottom tabs and footer utility text are representative fixture blocks, not an authenticated workspace.

Campaign captures and measurements live outside the repository under `/home/jarvie/code/_campaigns/awl-0018-0020/moving/rollout/`. Production still starts dark and no theme preference is added by this change; the fixture separately exercises the existing light tokens.

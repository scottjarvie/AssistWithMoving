# Project Pulse log

One entry per pulse. The next pulse covers everything after this entry's end
commit (`<from>..<to>` is exclusive of `<from>`).

## 2026-07-27 — pulse-2026-07-27.html
- **Range:** `a4be0ab..e8b1112` (June 29 – July 21 merges, plus the July 26–27
  audit of that work)
- **Headline:** Four weeks, 57 pull requests: the AI doors got locked, the app
  learned to handle big move lists, production verified current — and a
  performance fix plan now needs sign-off.
- **Decisions raised:** (1) approve the 8-package performance fix plan
  (`docs/audits/AUDIT-2026-07-26-PERF-FIX-SPEC.md`); (2) discard the superseded
  `docs/mcp-local-install-move-201` branch. How-tos: return checkout to main +
  cleanup, make unit tests blocking in CI, reconnect Linear.
- **Lessons added:** two-doors-for-ai, one-pipeline-deploys-everything,
  squash-merge-hides-finished-branches, server-fast-browser-heavy.

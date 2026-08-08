# Tracker implementation notes

The canonical operating contract is [GUIDE.md](GUIDE.md). This supporting
document records implementation facts; it is not a fourth tracker concept.

- Canonical sources: `cards/*.md`, `work-orders/*.md`, and `GUIDE.md`
- Metadata: `tracker.json`
- Generated readers: `board.html` and `guide.html`
- Zero-dependency generator: `scripts/tracker-build.mjs`
- Validator: `scripts/verify-tracker.mjs`
- Exact state contract: `scripts/lib/state-publication-contract.mjs`
- GitHub classifier: `scripts/classify-ci-change.mjs`
- Vercel classifier: `scripts/vercel-ignore-build.mjs`

`SYSTEM.md`, generators, validators, workflows, and configuration are software
and always use the normal PR/full-CI/deployment path. They are never accepted
by the state-only helper.

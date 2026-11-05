# Assist With Moving design council brief

Scott, 2026-11-05. Supplied in chat; governing source alongside `playbook.md`.

## Host and execution instructions

This machine (oldwin, Windows) does not have ~/.claude/skills/design-council or the pattern screenshots; the playbook's text descriptions govern. Save this message as design-council/2026-11-05-playbook/brief.md + playbook.md. Run judges via delegate_task (Codex gpt-6.1-sol high + claudeAgent claude-opus-5-5 high, read-only, blind labels); keep scores in design-council/<run-id>/scores.json. The project checkout you branched from is a PR-review clone used by another thread (MOVING-234): stay in your own worktree and never touch its branch. Browser/Next slots on this host go through normal host coordination: one heavy run at a time, low priority, and release promptly when asked — then KEEP GOING on code; a slot release is never the end of your goal.

## Brief

You are the lead of the Moving design council thread (Codex gpt-6.1-sol, reasoning high).
Roles: You (Sol) do most of the work: planning, prototypes and code. Bring in Claude Opus 5.5 to write bounded slices of code alongside you, and as the second judge. Opus is the final tastemaker among the AIs when judges split or a call is about taste. Scott overrides everything.
Read first: the playbook below; this repo's AGENTS.md and Site Guide (product truth), plus the family Core guide it links to.
Do, in order:
1. Short owner interview — only what the playbook can't answer (how Scott uses Moving, what it's mostly for, what he never uses). Overnight: write questions down, assume answers, keep going.
2. Page inventory → design-council/<run-id>/page-inventory.md: map every page to a playbook family (record, collection, activity, home, stats, admin, settings-AI, settings-data, learning-study, learning-reader, Queue list, Queue item); list site-specific pages separately (e.g. move plan/timeline, boxes/inventory, rooms, checklists).
3. Design system pass: tokens in line with §4 skeleton, keeping Moving's own flair (colour roles light/dark, type scale, spacing, chips, icons, illustration slot). Record in the site's design doc.
4. Build the decided patterns into every mapped page, desktop and phone, in Moving's nouns and branding. No A/B/C/D rounds for pages the playbook covers.
5. Explore only what the playbook doesn't cover: site-specific families get today's page + three genuinely different takes, judged blind by both judges, shown to Scott.
6. Hill-climb with both judges until target or round cap; fix only what fits §2. Never cheat by removing information or capability.
7. Gallery (Claude artifact if available, else self-contained HTML in the run folder): newest first, every round its own section, in-page lightbox with numbered images, today's page marked "now", last-updated stamp; update every round.
8. Record Scott's picks in the run brief.
Rules: capability probes and full check must pass. Every code change reviewed by a model different from its author (exact head, both model names). Localhost first; only VinReleases pushes/PRs/merges/deploys. Respect any backend-first UI hold (work locally, release nothing). No real user data in tests/fixtures; no secrets, DNS, billing, data deletion or access changes. Keep the thread on design.

## Overnight addendum (Scott, 2026-11-05)

Don't wait for interview answers (note "Questions for Scott", mark defaults "assumed"); move fast — the playbook decides most pages; use Codex for as much as possible, Opus only where taste is needed (taste calls, tie-breaks, second judge); illustrations and icons as Codex-written SVG in the site palette with currentColor/CSS tokens (dark-mode safe), no raster stock art; commit locally only; gallery link + one-line status at the top of design-council/<run-id>/STATUS.md after every round.

## Original worktree and delivery boundary

Work in this worktree on `design/assistwithmoving-council-2026-11-05`, branched from `origin/main`. Commit locally only; never push, open a PR, merge, or deploy. Upgrade every page and the design system to Scott's decided cross-site patterns in Moving's own branding, with nothing removed. Keep the full scope through continuations.

# Assist With Moving tracker guide

This repo-owned tracker is the durable owner-and-AI view of work for Assist
With Moving. It travels with every authorized clone. Markdown is canonical;
`board.html` and `guide.html` are generated zero-setup readers.

## The three concepts

- **Cards** preserve one outcome, why it matters, current truth, the next safe
  action, constraints, completion evidence, provenance, and dated history.
- **Work Orders** bundle a bounded tranche. Scott approves Proposed → Ready;
  an AI executes approved scope; another AI records the independent audit.
- **Guide** is this stable orientation. `tracker.json` and generated readers
  support these concepts without creating a fourth tracker.

## One-minute orientation

Open `board.html`. Start with **Needs You**, then scan **Doing** and **Next**.
Kanban shows motion; Work Orders show approved scope, derived Card progress,
execution evidence, and independent audit as separate facts.

Capability truth and workflow state are deliberately separate. **Current**
means verified evidence, **Partial** means useful foundations with a named gap,
and **Later** means not selected or not yet verified. Those labels live in the
Card or Work Order truth; moving something to Next or Doing never upgrades a
capability claim.

Cards use exactly `backlog`, `next`, `doing`, `needs-you`, or `done`. Work Order
execution uses `proposed`, `ready`, `active`, `complete`, or `superseded`.
Audit uses `not-audited`, `passed`, or `follow-up-needed`. Complete does not
mean independently audited. There is no automatic dispatch.

## Authority and handoff

The loop is **AI proposes; Scott approves scope; AI executes; a separate AI
audits**. Ordinary safe technical judgment belongs to the executor inside an
approved Work Order. `needs-you` is only for a consequential product, access,
money, security, production-data, identity, or irreversible choice, and its
Card must teach before asking.

Linear is not required for intake, approval, implementation, or normal project
progress. Old Linear ids may remain as optional historical evidence. Current
work, approval, handoff, and completion truth live in this repository's Cards,
Work Orders, and Guide; GitHub records code review and integration evidence.

## Durable authoring rules

- Cards live in `docs/tracker/cards/` with stable `MOV-####` ids.
- Work Orders live in `docs/tracker/work-orders/` with `MOV-WO-###` ids.
- Append dated attributed history; do not erase evidence or invent provenance.
- Specifications and requirements remain supporting documents linked by a Card
  or Work Order. They do not become a fourth tracker or replace the canonical
  outcome, scope, and evidence record.
- Run `npm run tracker:build && npm run tracker:verify` after state edits.
- Use **Copy as prompt** or **Copy whole work order** for cold-start handoff.

## Safe publication classes

Tracker generators, validators, scripts, workflows, dependencies, repository
instructions, app code, schemas, or Vercel configuration are software. They use
a branch, PR, full required CI, merge, and deployment proof.

Canonical tracker state and Project Philosophy content may use the narrow
direct-main route only after local validation. Stage only allowlisted state,
then run:

```text
git add docs/tracker/GUIDE.md docs/tracker/cards docs/tracker/work-orders docs/tracker/board.html docs/tracker/guide.html docs/tracker/tracker.json docs/planning/assist-with-moving-project-philosophy.md docs/planning/assist-with-moving-project-philosophy.html
npm run tracker:commit-state -- "Update Moving tracker state"
git push origin HEAD:main
```

The helper adds `skip-checks: true` as the final trailer. It rejects mixed or
uncertain paths. GitHub keeps required contexts visible but lightweight;
Vercel may ignore a build only after independently validating the complete
single-commit range. Missing history, renames, malformed input, software, or
validator failure builds normally. Never open a skipped-check PR.

## Moving-specific character

This tracker uses Moving's field-desk and route-note character: paper and ink,
route blue, safety orange, useful density, and calm operational language. It
does not borrow Music's Paper/Studio design or turn Moving into a generic
portfolio dashboard.

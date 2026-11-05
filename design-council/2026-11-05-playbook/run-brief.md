# Assist With Moving design council — 2026-11-05

Status: blocked on source-document intake after completing independent preparation; the full brief, overnight addendum, and cross-site design playbook have not yet been supplied in this conversation. No visual direction has been inferred in their place.

## Authorized scope

- Upgrade every page and the shared design system to Scott's decided cross-site patterns, in Moving's own branding.
- Preserve all existing features, content, routes, workflows, and compatibility behavior. Establish a source inventory before edits and verify preservation through implementation and runtime evidence.
- Codex `gpt-6.1-sol` leads and writes code. Claude Opus 5.5 is the second judge and final AI tastemaker. Availability of `claude-opus-5-5` through the Claude provider was verified; no review has yet taken place.
- Draw illustrations and icons as Codex-written SVG.
- Present work in a newest-first gallery.
- Work only in this worktree on `design/assistwithmoving-council-2026-11-05`. Commit locally only. Never push, open a PR, merge, or deploy. This explicit request overrides the repository's routine delivery defaults.
- Scott is asleep. Resolve ordinary choices with reasonable defaults, record questions here, and continue independent work.

## Intake

The requested `brief.md` and `playbook.md` will contain the actual supplied documents. They have deliberately not been fabricated from the shorter goal statement. Save the full brief and overnight addendum together in `brief.md`, and Scott's cross-site design playbook in `playbook.md`, when received.

## Baseline and evidence

- Baseline: `964eec223b8fb1ec3a3c8ff8926dd4c5806b2076` (local `origin/main` at intake); requested branch already points to it.
- Worktree was clean at intake.
- Read `README.md`, `AGENTS.md`, the tracker guide's orientation, and the product philosophy's identity, capability boundaries, language rules, and design implications.
- `baseline-inventory.json` records the Git baseline's page routes, special UI states, imports, redirects, and source blobs. Source facts are a preservation aid, not proof of runtime functionality or visual acceptance.
- Existing public shell: `public-page-chrome.tsx`; public mobile navigation: `public-nav.tsx`.
- Existing product shell: `app-shell.tsx`; global navigation: `workspace-nav.tsx`; selected-move state: `move-workspace-context.tsx`; move tabs: `move-workspace-tab-list.tsx`.
- Tokens are in `src/app/globals.css`. Light and dark tokens exist; root layout currently forces dark. Do not mistake existing token definitions for verified theme support.
- Existing navigation deliberately redirects several historical move pages. Preserve those paths and their destinations while upgrading active surfaces.
- Selected Moving brand masters already exist in `docs/design/assist-family-brand-2026-09-05/selected-assets/`: Scott-approved MV01-K kraft box with light flaps and a plug crossing the fold. The release record says favicon adoption shipped while headers and palette were preserved. Consult these actual assets alongside the incoming playbook rather than inferring branding solely from current header icons.
- Product layout deliberately keeps one `MoveWorkspaceProvider` mounted across navigation. Background media uploads also live above the shell so uploads survive navigation; preserve both lifetimes.
- Only `.env.example` is present in this worktree at intake. No local live or sandbox bindings are installed here. Public rendering and source/unit checks can proceed; authenticated runtime evidence will need an existing authorized local setup or a faithful isolated setup. Never substitute invented live records or bypass authentication.
- Dependency installation and baseline checks are recorded in `baseline-checks.md` as their results become available.

## Defaults and questions

1. **Missing source documents:** the promised next message has not arrived. Continue inventory and environment preparation; defer design decisions that depend on Scott's actual patterns. This is an intake dependency, not an interview question.
2. **Preservation default:** keep existing features, content, interactions, URLs, backend contracts, access checks, and print/export functionality. A visual redesign does not authorize removing a tool or changing data access.
3. **Brand default pending the playbook:** retain Moving's product identity and household-first, durable-plan story. Existing green/earth UI tokens and the philosophy/tracker's route-note references are evidence of current direction, not a substitute for Scott's incoming decisions.
4. **Gallery default pending the brief:** newest iteration first, with route/state coverage, viewport, theme, date, review verdict, and explicit verification gaps attached to each iteration. Do not label an unrendered or unreviewed page approved.
5. **Council default:** use the requested Claude Opus 5.5 model without silently replacing it; give each review the actual saved requirements and concrete rendered evidence when available. Codex implements corrections; the final taste verdict belongs to Claude.

## Intake dependency recheck

The full brief, overnight addendum, and cross-site playbook remained absent through the initial request and both subsequent goal-continuation turns. A worktree search found only this run's preparation documents and older design references; it did not find the promised documents. Both requested destination files were explicitly checked and are absent. Older branding references do not establish the missing cross-site patterns. Baseline check collection is complete; requirement-dependent implementation is blocked on delivery of those source documents. This is not a request for an interview or approval. No application source, backend contract, access policy, or package lock has been changed.

## Completion gates

- The actual brief, addendum, and playbook are saved and requirements traced to evidence.
- Every baseline page and shared state is accounted for; compatibility redirects and print layouts remain usable.
- All required design-system and page changes are implemented and rendered at the required sizes and themes.
- Existing functionality is preserved, with appropriate local automated and interaction checks.
- Claude Opus 5.5 council review is recorded and material findings resolved; final taste verdict is explicit.
- Newest-first gallery is available to Scott and accurately describes verification status.
- Appropriate lint, typecheck, tests, and build checks pass or unresolved failures are honestly recorded without claiming completion.
- All intended work is committed locally on the requested branch; no remote publication occurs.

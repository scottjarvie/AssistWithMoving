# Assist With Moving design council — 2026-11-05

Status: active. Scott supplied the full brief, overnight addendum and playbook; saved as `brief.md` and `playbook.md`. Text governs; no pattern screenshot package or design-council skill exists on oldwin.

## Authorized scope

- Upgrade every page and the shared design system to Scott's decided cross-site patterns, in Moving's own branding.
- Preserve all existing features, content, routes, workflows, and compatibility behavior. Establish a source inventory before edits and verify preservation through implementation and runtime evidence.
- Codex `gpt-6.1-sol` leads and writes code. Claude Opus 5.5 is the second judge and final AI tastemaker. Availability of `claude-opus-5-5` through the Claude provider was verified; no review has yet taken place.
- Draw illustrations and icons as Codex-written SVG.
- Present work in a newest-first gallery.
- Work only in this worktree on `design/assistwithmoving-council-2026-11-05`. Commit locally only. Never push, open a PR, merge, or deploy. This explicit request overrides the repository's routine delivery defaults.
- Scott is asleep. Resolve ordinary choices with reasonable defaults, record questions here, and continue independent work.

## Intake

The complete supplied documents are saved. The later overnight addendum governs the earlier request for Opus implementation slices: Codex writes code; use Opus for taste, second judging and cross-model code review. All judging uses `delegate_task`, high effort, read-only instructions and blind artifact labels. A Codex self-score never replaces different-model code review. Scott overrides both judges.

Stay in this worktree; never touch the source PR-review clone or MOVING-234. Only VinReleases publishes; this run commits locally. No real-data fixtures, secrets, DNS, billing, deletion or access changes. A backend-first hold remains a release hold, not an implementation stop.

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

## Questions for Scott

1. **How do you mainly use Moving? Assumed:** household moving, inventory/evidence, boxes, rooms and transport are frequent operational work; the changing move record remains the organizing context. Basis: Project Philosophy.
2. **Daily versus occasional pages? Assumed:** collections, capture, Queue and active move are frequent; packets, configuration and administration are occasional. Preserve every destination with labelled depth one step away.
3. **Which reminders do you never use? Assumed:** no reminder deserves the hero by default. Preserve existing reminders and readiness tools at named destinations; do not remove tools based on this unanswered question.
4. **Target and round cap? Assumed:** at most three scored rounds per uncovered family; target 8/10 overall from each judge and no unresolved preservation, capability, access or accessibility blocker. Scott may still pick a different take.

## Execution defaults

1. Implement decided families directly. Explore only spatial planning, load planning and move-day checklist: today's page (“now”) plus three different compositions each, judged with blind labels. Ordinary inventory, boxes and rooms extend the decided collection/record patterns.
2. **Preservation default:** keep existing features, content, interactions, URLs, backend contracts, access checks, and print/export functionality. A visual redesign does not authorize removing a tool or changing data access.
3. **Brand:** approved MV01-K kraft, warm paper/graphite, restrained safety orange and source/evidence blue. New icons/illustrations are Codex-written CSS-token SVG. Preserve approved brand masters.
4. **Gallery:** newest first, each round its own section, numbered images, in-page lightbox, last-updated stamp and explicit verification gaps. Mark today's page “now” in the reveal. Do not label an unrendered or unreviewed page approved. `STATUS.md` starts with the gallery link and one-line status after each round.
5. **Council default:** use the requested Claude Opus 5.5 model without silently replacing it; give each review the actual saved requirements and concrete rendered evidence when available. Codex implements corrections; the final taste verdict belongs to Claude.

## Readings, coordination and conflicts

- Read the linked current family Core v1.18.0 (2026-10-26), including the domain promise, truth boundary, design, phone, theme and density contracts. Its Queue lifecycle and whole-toolset grant direction differ from Moving's current verified contract. The direct playbook controls design; current backend contracts and Scott's no-access-change instruction control behavior. Do not silently migrate authority or stored states in a design run.
- Side navigation remains the desktop default; Top is an independent browser-local preference. Phone navigation stays automatic. Appearance defaults to System with Light/Dark overrides. Preserve route, provider lifetimes, selections, drafts and uploads across preference changes.
- One heavy Next/browser/check run at a time, low priority. Verify host ownership before starting; release promptly when asked and continue code. T3's coordination-title search returned no coordinator. Both local preview mode files are absent here. These are setup/verification gaps, not reasons to stop implementation.
- Full baseline inventory maps 50 page files and 10 shared states in `page-inventory.md`. Activity is a record region and Queue items are detail sheets today; no invented standalone routes or learning feature.
- Scores are stored in `scores.json`, naming exact artifact head, author/reviewer models, blind labels, rubric, objections and verdict. Every code commit needs a different-model exact-head review. Never replace a requested model silently.

## Scott's picks

No picks received in this run. The supplied playbook's decided patterns are adopted owner decisions, not new council votes. No AI verdict counts as Scott's pick.

## History

Initial source-document intake was blocked after independent preparation. Scott's full-message delivery resolved it. Baseline source remained unchanged during that wait; preparation commits were `7d1291f` and `3067727`.

## Completion gates

- The actual brief, addendum, and playbook are saved and requirements traced to evidence.
- Every baseline page and shared state is accounted for; compatibility redirects and print layouts remain usable.
- All required design-system and page changes are implemented and rendered at the required sizes and themes.
- Existing functionality is preserved, with appropriate local automated and interaction checks.
- Claude Opus 5.5 council review is recorded and material findings resolved; final taste verdict is explicit.
- Newest-first gallery is available to Scott and accurately describes verification status.
- Appropriate lint, typecheck, tests, and build checks pass or unresolved failures are honestly recorded without claiming completion.
- All intended work is committed locally on the requested branch; no remote publication occurs.

### Source resumption after c92ea37

Scott/Vin Chief explicitly lifted the source execution yield and superseded the earlier Codex 95% stop. No banked reset was used, no usage sampling claimed, and native HOST/SITE holds remain. The next coherent Queue collection source batch and written regressions are saved in 09-X-source-checkpoint.md. No current runtime PASS or whole-site completion is asserted. One fresh independent source review follows the frozen useful cut; no duplicate same-head loop.

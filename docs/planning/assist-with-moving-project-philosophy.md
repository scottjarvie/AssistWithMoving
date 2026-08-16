# Assist With Moving — Project Philosophy

> **Project philosophy status:** Canonical product identity and claim boundary
>
> **Document version:** 1.7.1
>
> **Document date:** 2026-08-14
>
> **Capability evidence last verified:** 2026-08-14 against protected PR `#180`
> and its production foundation, protected repair PR `#182`, production merge
> `d0c0a83`, Actions run `31660891558`, Production deployment
> `dpl_6ZZ6e3Ma3DDGF66x9FMZhMrpREPF`, and the complete retained-account
> OAuth/MCP/normal-UI/cleanup acceptance receipt in `MOV-WO-006`; plus Assist
> With Moving first-run PR `#184`, merge `d1f7364`, Actions run `31747746115`,
> production deployment `dpl_EUR93mXnmoi6PgLGsnts7fwA6uAW`, and retained empty
> account sign-in/session-cleanup receipt in `MOV-WO-007`; plus Queue-linked MCP
> PR `#186`, merge `147cff4`, post-merge run `31768988479`, production
> deployment `5900338675`, and the authenticated Queue/UI/cleanup receipt in
> `MOV-WO-008`
>
> **Authority-policy consistency audited:** 2026-08-09 against the complete
> family Core v1.6.3 and Scott's clarified person / product / chosen-AI boundary
>
> **Scope:** Product truth, language, trust, and design direction—not an
> implementation, rename, release, or deployment claim

> **Core alignment record**
>
> **Document:** Assist With Moving — Project Philosophy
>
> **Canonical:** `docs/planning/assist-with-moving-project-philosophy.md`
>
> **Family Core:** Assist With Sites — Core Philosophy v1.6.3 (2026-08-08),
> with Scott's controlling 2026-08-09 authority-boundary clarification
>
> **Aligned:** 2026-08-08 — repository implementation, public source claims,
> tracker, GitHub protection/workflow and Vercel integration reviewed against
> the complete v1.6.3 contract, including its clarified §16 operating contract
> and §17 setup, retrofit and agent-handoff structure; authority language
> re-audited 2026-08-09 without reclassifying implementation capability
>
> **Adopted:** the three-way promise and “your AI” language; shared route and
> truth-surface direction; the four-state Queue and bounded directive rule;
> the distinction between the platform's boundary and the person's freedom to
> direct their own AI; granular, revocable authority and attributable handoff;
> activity, provenance, identity, privacy and access rules; the accessible
> light/dark floor; website launch sequencing; Cards / Work Orders / Guide;
> and the exact fail-closed state-versus-software publication boundary
>
> **Deferred/gaps:** a verified granular chosen-AI grant and external-action
> handoff contract; canonical OAuth Queue transitions;
> `/me`; `/settings/ai`; `/settings/data`; `/delete-account`; full personal-data
> deletion; family navigation; Support Desk link; and first-class light mode.
> These are requirements or later work, not
> claims of current capability. No gap in this list is designated **Coming
> soon** without a separate approved delivery commitment.
>
> **Differs:** Moving keeps its purpose, household and
> move-centered objects, evidence-heavy record, domain workflows, information
> architecture, useful density, field-guide voice, brand system and
> moving-specific visual motifs. Its current scoped recipient workflow links
> are not renamed **Unlisted** because some permit bounded actions and may
> expire; the family
> **Unlisted** level remains a separate read-only, non-expiring-by-default
> destination. The current MovingManifest implementation name remains a
> compatibility fact until an authorized cutover.
>
> **Evidence:** Core commit `db658ab091bcfbb71f62db55d5b8b6d51b64e52f`
> with source SHA-256
> `6c354eb33422d6b48453c578b93d5a32551fbe3008ce58673a0f11437335a30c`;
> Scott's 2026-08-09 authority-boundary direction; repository baseline
> `4a3d9e7`; `docs/tracker/`; the software PR and live
> proof receipts recorded in Card `MOV-0001`; the dated adoption/contradiction
> matrix below; and the repository sources in
> [Operational references](#operational-references) and
> [Evidence references](#evidence-references)

**Adopted is an acceptance of the Core requirement, not proof that the product
implements it.** Implementation truth remains in the evidence-backed status
labels and repository references below.

The family Core is Moving's shared chassis and trust/operations contract, not a
product template. It standardizes dependable surfaces and conventions while
Moving owns its purpose, users, domain model, workflows, evidence model,
information architecture, density, content, voice, brand, palette, typography,
motifs and primary experience.

This Project Philosophy defines what Assist With Moving is, how it fits the
Assist family, and which claims its public and signed-in experiences may make. It
supersedes checklist-first or inventory-only positioning when that positioning
conflicts with this identity. The released public and signed-in experience now
uses **Assist With Moving**. `MovingManifest` remains an implementation and
compatibility name in technical URLs, code identifiers, existing keys, Clerk,
and OAuth resources. `assistwithmoving.com` is a public entry that temporarily
redirects to the authenticated `movingmanifest.com` host; no Clerk, OAuth, DNS,
or provider-domain cutover is implied. Release notes and provider runbooks
remain authoritative for delivery details.

The family Core is normative for shared trust, route, truth and operational
conventions. Where an older statement in this document conflicts in that shared
layer, the Core wins unless this document labels and justifies an
intentional Moving-specific difference. In a domain-specific area, the more
specific or expressive Moving direction remains authoritative unless it weakens
one of those shared guarantees. This document records product deltas and
evidence; it does not copy or publicly expose the private family contract.

Scott's 2026-08-09 clarification resolves one contradiction in the current
Core's older external-action wording. **“The platform does not act in the
outside world” means Moving does not independently contact people, make offers,
purchase, publish, or take another outside-world action. It does not mean a
person is forbidden from discussing or directing that work with their own AI.**
Moving controls only its own boundary: whether a particular AI may use Moving's
tools, retrieve selected Moving data, change a Moving record, publish, share or
export through Moving, or receive a recorded handoff carrying selected data and
a specifically approved external-action intent. This clarification is
controlling here and should be incorporated into a later family Core revision;
it does not claim that Moving has implemented that complete grant or handoff
model.

## Core v1.6.3 adoption and contradiction matrix

Core v1.6.3 organizes Moving's installed operating contract: §16.1 owns tracker
rules, §16.2 owns state-versus-software publishing and provider proof, and §16.3
owns launch posture. Section 17 applies those rules through new-project setup,
retrofit and agent-handoff packages; it is not a competing local policy or work
tracker. Scott's 2026-08-09 clarification changes one older authority
interpretation only: the platform's outside-action prohibition is not a rule
against what the person may ask their own AI to do.

The labels in this matrix are deliberately stricter than a feature inventory:

- **Current/verified** means supported by this checkout. It does not, by itself,
  prove production deployment or an authenticated real-user path.
- **In design / committed — Coming soon** requires approved, actively scheduled
  soft-launch work. None is assigned by this documentation-only revision.
- **Later** means required or desired direction without a verified delivery
  commitment.
- **Intentional product-specific difference** preserves a justified Moving
  behavior without redefining the family vocabulary.
- **Unknown** means this checkout cannot prove the operational or public state.

| Family concern | Evidence-backed Moving truth | Alignment label and decision |
|---|---|---|
| Person / Assist workspace / your AI | The released home, signed-in launchpad, `/ai` copy, scoped keys, canonical stateless OAuth MCP and compatibility/API-key surfaces separate the person's authority, Moving's durable record and the person's chosen AI. The first-run promise now leads with the changing move and durable context rather than inventory alone. | **Current/verified production foundation** at PR `#184` and `MOV-WO-007`. “Assist your AI, so it can assist you with moving” is current visible copy. The broader family sentence remains product guidance rather than an unverified capability claim. |
| Domain promise and objects | Moves, households, people, spaces, items, planned items, boxes, photos/evidence, transport resources/zones/trips, layouts, documentation profiles, exports, share links, and MCP-saved decisions, estimates, plan results and source checks are modeled in `convex/schema.ts`. These support a simple-to-complex direction, but general tasks, budgets and provider/vendor records are not complete first-class models. | **Current/verified repository foundation** for the named records; progressive composition and unscheduled extensions are **Later**. Moving's vocabulary is retained. |
| Product Queue versus internal Tracker | `/app/queue` and move Queue routes expose the capture/ingestion Queue. `docs/tracker/` now holds the separate repo-owned Cards / Work Orders / Guide package and generated owner readers. | The separation is **Current/verified in repository source**. The Queue is user product work; the Tracker is internal build coordination. Card `MOV-0001` records the completed same-SHA GitHub, Vercel and retained-production proof for the state fast lane. |
| Queue states | Canonical Queue records and the global/move Queue workspace use exactly **Needs you / Working / Waiting for your AI / Done**. Older capture records retain their source states and project into those four person-facing lanes for compatibility. | **Current/verified repository and released-source foundation.** The Queue remains a handoff desk; lease/retry/expiry are operational details, not extra person-facing states. |
| Directive authority | Capture instructions can be claimed by an authorized AI; tools enforce move/owner access and claims. A Queue item records intent but does not itself create a missing tool, data, operation or external-action grant. | **Owner clarification adopted now in product truth:** Moving checks authority separately from the instruction. Missing authority returns the smallest exact **Needs you** question. When a separately visible grant already names the AI, scope, permitted data, operation or external-action category, approval and duration, Moving may hand the approved context and intent to that AI and record the result. Complete implementation remains **Later**. |
| MCP and `/ai` | Source routes provide a canonical stateless OAuth `/mcp` with eight move-workflow tools, a persisted compatibility catalog at `/mcp/connect`, and separate API-key `/api/mcp` plus stdio. Public `/ai`, `/ai/start`, `/ai.txt`, `llms.txt` and `llms-full.txt` state the door and Queue boundaries; AI settings live at `/settings/ai-connections` and within `/settings`. | **Current/verified in production** for anonymous OAuth/resource discovery, exact door boundaries, public docs, signed-out privacy, and retained-account OAuth loops covering brief/search/read, one-call source-backed save, idempotent replay, granular correction, normal Move-overview reflection, exact Queue-result linkage without a Queue transition, refresh/client/session cleanup, and hard purge. PRs `#182` and `#186`, `MOV-WO-006`, and `MOV-WO-008` preserve the receipts. Private-media rendering, simultaneous multi-client isolation, reconnect in a named client product, and canonical OAuth Queue claiming/completion remain **Partial / Unknown**. Canonical `/settings/ai` is a **Later alignment gap**. Public pages must list only the catalog attached to their named door. |
| Activity and provenance | `auditLogs`, move/object queries, item activity UI, plan journals, API-key/agent write events, and MCP planning records preserve actor and time. Stateless MCP saves add client id, operation id, version, reason, source status, and replay receipts, and the web workspace shows “Your AI via MCP.” Coverage and human-readable before/after/evidence detail are not universal, and no complete external-action handoff/result receipt is verified. | **Current/verified partial repository foundation.** Complete “if an AI did it, the record says so,” including grant, handoff, result, failure or return, is **Later**. |
| Access and sharing | Clerk-backed household and move participants, roles, move restrictions, scoped/revocable API keys, documentation profiles and revocable `/share/<token>` links exist in source. They are foundations for collaboration-first owner, partner, move-only helper, chosen-AI and recipient-link roles, but the complete per-operation scenarios are not proven. New records do not share a single family visibility field, and current links may expire or permit selected recipient actions. | Private-by-default and collaboration foundations are **Current/verified partial**. The complete role contract, family **Private / Unlisted / Trusted / Public** vocabulary and shared-data screen are **Later**. Action-capable recipient links are an **intentional product-specific difference**, not “Unlisted.” |
| External conversations and action handoffs | A person may ask their own AI anything outside Moving. Moving neither controls those conversations nor polices the AI's overall behavior. Moving may control only whether its tools or data participate. No complete source-and-user-path proof establishes a grant that names actor, scope, permitted data, external-action category, approval, expiry/revocation and attributable handoff result. | The freedom/boundary distinction is **adopted product truth**. A granular external-action handoff is **Later / unverified**, not a current integration claim. Moving itself remains prohibited from independently taking the outside action. |
| Move Brief and document memory | A bounded MCP workflow brief now lists accessible moves or returns one move's route, spaces, counts, review attention, saved planning records and personal Queue summaries. Documentation profiles, evidence/photos, exports, recipient-safe fields and packet-oriented source also exist. No complete cross-domain Move Brief, original-artifact/version model, extracted-versus-confirmed facts, completed-form snapshot, requirements tracker or year-later packet-retrieval path is verified. | The bounded MCP brief and existing pieces are **Current/verified partial repository foundations**. The complete connected Move Brief and Document Memory / Move Evidence Packet are **Later / unverified** and must not be claimed as an official PCS, claims or provider integration. |
| Identity and deletion | Identity is site-specific Clerk. Settings can export JSON, stage deletion, anonymize the Convex profile, revoke keys/share links and disable memberships/grants. It does not prove Clerk identity deletion, attachment/Backblaze purge, or removal of all personal/content-bearing history; `/delete-account` is absent. | Per-site identity and export are **Current/verified**. Family-complete deletion and `/delete-account` are **Later gaps**. Never describe current anonymization as full account-data deletion. |
| Public truth and Coming soon | Source includes home, separate FAQ, `/ai`, `/ai.txt`, `llms.txt`, `llms-full.txt`, and `/updates`. PR `#184` aligned visible metadata, public copy, auth framing, app shell, packets and agent guides with Assist With Moving. The home page still does not contain the FAQ. | The named public identity and first-run routes are **Current/verified in production** at merge `d1f7364` and `MOV-WO-007`; other public claims still require their own environment/user-path proof. **Coming soon** is reserved for approved, scheduled soft-launch work; none is assigned here. |
| `/me`, `/admin`, and stats | A REST `/api/v1/me` context endpoint and an owner-gated app `/admin` surface exist. There is no family `/me` page; current admin source focuses operations and does not prove the family split between meaningful personal stats at `/me` and owner usage/operations stats at `/admin`, or every public-content maintenance job. | `/admin` is a **Current/verified source foundation** with **Unknown production proof**. Family `/me`, the personal/owner stats split and full admin destination are **Later**. |
| Support Desk | The family desk is deployed and answers at `https://assistwithlife.com/support`, and it recognizes Moving's registered source key `assist-with-moving` with its page-key allowlist. `src/lib/support.ts` owns that contract in this repository, and the public footer, FAQ, About, Privacy, `ai.txt`, `llms.txt` and `llms-full.txt` now send people and assistants there. | **Current/verified public support path.** The desk is the only support path: Moving publishes no support, contact or privacy email address and none is planned, so public copy and agent guides must state that direct email contact is not available. Desk-side triage, reply and status workflow remain the family product's truth, not Moving's claim. |
| Product identity and primary experience | The released Assist With Moving experience presents a household-first, evidence-rich moving workspace organized around a changing move rather than a generic family-site layout or feature checklist. | **Current/verified production identity and intentional product-specific difference** at PR `#184`; the shared chassis does not standardize Moving's objects, workflows, information architecture, content, density, voice or experience shape. Technical MovingManifest compatibility names remain deliberate. |
| Distinct design and light/dark access | The product has a distinct Moving earth/route aesthetic, accessible focus patterns, a responsive signed-in shell and light/dark token sets, but `src/app/layout.tsx` hard-locks the app to dark mode. The family contract names an Assist With Moving palette, but the shared chassis does not require visual homogenization. | Distinct design, phone shell and dark theme are **Current/verified foundations**. First-class accessible light mode is **Later**. Palette and typography remain product-design decisions; the philosophy reader's editorial route-note art direction is an **intentional product-specific difference**. |
| Dense information | REST lists are bounded and paginated; several signed-in views provide tables/cards, filters and responsive detail. The repository does not prove every dense collection uses indexed bounded access, table-default behavior or remembered views. | **Current/verified partial foundation; Later** safety and performance conformance. Moving's useful information density and view design remain product-specific. |
| Family navigation | No shared Assist With Life catalog row or fallback roster was found in the public shell. | **Later alignment gap.** |
| Cards / Work Orders / Guide | `docs/tracker/` contains Moving-specific Cards, canonical Work Orders, Guide, metadata, generated Kanban/Work Orders readers, exact state helper, GitHub classifier and Vercel classifier. README and AI instructions link the package. | **Current/verified repository source and provider proof.** These repository-owned records are the durable current-work truth; Linear is optional historical or portfolio context only and never a gate. Card `MOV-0001` preserves the exact proof that established the fast lane; configuration alone would not have done so. |
| Launch stages and later native guardrail | Both public entry and authenticated host are reachable, the ordinary sign-in and empty first run were verified with the retained test identity, and public copy says active development. Assist With Life listing, Tier A completion and deliberate public marketing were not proved. | **Current soft-launch foundation; Partial portfolio/public-launch proof.** The next stage is **big/public website launch** only after its separate gates. Native/app-store work remains a concise **Later** guardrail after substantial recurring website use. |

### What this matrix changes—and what it does not

The matrix resolves vocabulary and authority contradictions immediately in the
product truth. It does not pretend the routes, schema, UI, deletion workflow or
public site changed. A future implementation tranche must verify each gap in
the running target before moving its label to **Current/verified** or publishing
it as live.

## One-sentence identity

**Assist With Moving is a durable, user-controlled move-planning workspace
shared by you and your chosen AI, where the full changing plan can be organized,
remembered, understood, and steered over time.**

Inventory, packing, timelines, places, layouts, transport, vendors, costs,
paperwork, and move-day coordination are capabilities that can live on this
foundation. None of them alone is the product identity.

## Think of it as…

Think of it first as one place that keeps a household home move coherent from
the first possibility to the last loose end:

- **A decision table.** Work out whether, where, when, and how to move; compare
  places and property criteria; record what was chosen, why, and what would
  change the decision.
- **A living plan.** Turn goals into timing, phases, tasks, dependencies,
  questions, and risks that can change without forcing everyone to start over.
- **A map of places and belongings.** Connect origins, destinations, rooms,
  layouts, inventories, items, boxes, evidence, and what stays, goes, sells, or
  still needs a home.
- **A moving desk.** Keep estimates, costs, budgets, research, photos,
  documents, paperwork, and important proof close to the work they explain.
- **A coordination board.** Make it clear who is doing what, what is waiting,
  what needs the user, which deadline matters next, and what a household,
  colleague, helper, or vendor coordinator can see or change.
- **A return point, not a restart.** Come back after a day, a meeting, a changed
  date, or a different AI session and retrieve the full plan or a compact recap
  of what was decided, what changed, what is blocked, and what should happen
  next.

The same durable pattern can extend to an office relocation, business move,
temporary move, downsizing, or renovation-adjacent move without becoming a
collection of separate products. Those are legitimate compatible uses, not
equal starting points for first-time product priorities or the default public
story.

These facets define the product's intended shape. They do not claim that every
budget, vendor, task, communication, or collaboration workflow has shipped.
The dated [capability ledger](#capability-truth-and-ledger) governs what may be
presented as deployed **Current/verified**.

The simple promise becomes durable through four things working together:

- **Your chosen AI reasons and works.** It can research, compare, organize,
  draft, calculate, and carry out work you direct in its own environment.
  Moving does not control that conversation. Moving participates only when a
  separate grant allows that AI to use selected Moving tools or data.
- **Assist With Moving remembers the move.** It preserves structured context,
  instructions, decisions, evidence, history, open questions, and a current
  recap beyond one chat or AI session.
- **Assist With Moving organizes the work and provides moving tools.** It gives
  plans, places, tasks, belongings, costs, documents, timing, and coordination
  durable records, retrieval, queues, and understandable views.
- **You can see and steer it.** You can understand the evolving plan, correct
  it, choose who or which AI may observe or change each part, specifically
  approve a recorded external-action handoff when desired, and revoke that
  authority.

That is the bridge from a simple promise to the deeper model: your AI supplies
reasoning and authorized effort; Moving supplies durable move memory,
organization, tools, and visibility; you remain in control.

## What Moving is for—and what it is not

Moving is for keeping a real move understandable from its first possibility to
its last unresolved detail. It can hold the changing plan around places,
timing, tasks, belongings, costs, documents, decisions, people, and evidence
without reducing the project to any one of those parts.

### Primary starting point: a household home move

The primary first-time user is a person or household planning a move from one
home to another. This is the default product-prioritization lens and the public
homepage story.

A household home move is the strongest place to begin because it brings the
whole durable model into one recognizable project: consequential decisions,
multiple people and helpers, candidate and confirmed places, rooms and
belongings, changing dates, budgets and estimates, documents and evidence,
outside services, dependencies, and many loose ends that outlive any one
checklist or conversation. The person needs to understand and steer that
changing whole, not merely complete move-day tasks.

**Product-prioritization rule:** when first-time guidance, terminology,
defaults, examples, or competing feature choices require a primary user, start
with the household home move unless the product owner explicitly sets a
different priority. Do not make every move type compete equally in the opening
experience.

### Complexity grows with the move, not with setup

Assist With Moving must handle a small personal move and an evidence-heavy,
multi-party transition without forcing both people through the same setup. This
is one progressive model, not four editions or a maturity test:

1. **Simple move.** Start with origin, destination, a small inventory or a few
   boxes, one vehicle, and a basic pack → transport → check-off plan. A person
   can be useful immediately without creating vendors, roles, packets or every
   possible field.
2. **Coordinated household move.** Add a partner or household members, rooms and
   spaces, many items and boxes, multiple vehicles or trips, dates,
   assignments, dependencies, and one shared plan when the move needs them.
3. **Provider-assisted move.** Add movers, storage, shipping,
   landlords/agents, employers or other companies; keep the relevant contacts,
   quotes, agreements, handoffs and scoped evidence beside the work they
   affect. A provider does not receive household membership by default.
4. **Documented or claim move.** Add condition photos, inventory identifiers,
   receipts, forms, deadlines, policy or requirement checklists, and
   claim/reimbursement packets—for example a damage claim or military PCS
   documentation—when proof and later retrieval matter.

The person begins with only what is useful now. Additional people, providers,
evidence and controls appear as the move calls for them; skipped layers do not
block the core plan. The same records should compose across levels so growing a
move does not require migration to a separate “advanced” product or duplicate
its truth.

**Current truth:** households and move participants, items, boxes, photos,
transport resources/zones/trips, documentation profiles, exports and recipient
workflow links are **Current/verified repository foundations**. Their complete
progressive composition, provider model, Move Brief and document-memory flow
are **Later** until exact product paths are implemented and proven.

Business moves and office relocations are expected to be substantially similar
in the core model: they still have a move boundary, people and authority,
places, timing, work, belongings or equipment, costs, documents, evidence,
dependencies, history, and completion state. Temporary moves, downsizing, and
renovation-adjacent moves are compatible extensions for the same reason. Their
additional needs should extend common records and flexible details rather than
create separate products or narrow the long-term scope.

Its distinctive value is **continuity with control**. The plan can survive a
changed date, a revised destination, a different helper, a later AI session, or
a new piece of evidence. A person can return, understand what is true now,
inspect why it changed, and decide what should happen next.

Moving is not:

- a static checklist, inventory catalog, or one-time move-day tool;
- a replacement for the AI environment the person chooses;
- a vendor, marketplace, calendar, map, booking, payment, or communication
  provider merely because the user's AI may work with those services elsewhere;
- a credential vault for external providers or the user's AI;
- a monitor or governor of what a person discusses with or asks of their own AI
  outside the product;
- permission for any person or AI to use Moving tools or data, receive sensitive
  Moving context, change records, publish/share/export through Moving, or
  receive a Moving external-action handoff beyond an explicit grant; or
- proof that every facet described in this philosophy has shipped.

The human promise governs the product's direction. The dated
[capability ledger](#capability-truth-and-ledger) governs what may be described
as available now.

## Why not just ask your AI to build a quick feature?

Your AI can quickly make a packing checklist, comparison table, calculator,
inventory view, or small purpose-built app. That can be genuinely useful. The
difference is what happens after the immediate answer.

A real move is an evolving system: places affect timing; rooms organize
belongings; belongings affect packing and transport; plans depend on decisions;
costs depend on choices; evidence supports claims; and a changed date, property,
helper, or estimate can alter work elsewhere. A one-off page or chat result does
not naturally become the durable record of those relationships.

Assist With Moving gives the person's chosen AI a domain-shaped foundation:

- **durable structure, not scattered output:** move, place, room, item,
  transport, plan, task, decision, cost, document, evidence, and participant
  records can retain their relationships;
- **continuity with provenance:** important context can preserve source, actor,
  time, reason, and revision instead of disappearing into an old conversation;
- **resumable work:** the moving loop can return to the current state, save a
  useful result, expose blockers and the exact next step, and continue in a
  later AI session; and
- **human control:** the person can inspect the plan, correct it, and decide
  which person or AI may observe or change each part.

This is not an argument against asking your AI to build or calculate something.
It is the reason that useful output should return to an authorized, durable move
record instead of becoming another disconnected artifact. The
[capability ledger](#capability-truth-and-ledger) determines which parts of
that foundation are verified now and which remain in design or later.

## Why this instead of a conventional moving website?

Information sites, mover marketplaces, catalogs, file storage, quote forms, and
single-purpose moving utilities can each help with a slice of a move. Assist
With Moving is not defined by replacing all of them. Its enduring role is to
keep the person's own changing move coherent while their chosen AI reasons,
organizes, and performs authorized work in the environments available to it.

For a household home move, the same durable record can connect why a destination
was chosen, which date controls the plan, where an item belongs, how it will
travel, which estimate or document supports a decision, who is responsible, and
what should happen next. That inspectable continuation is different from merely
reading advice, finding a provider, uploading files, or completing one utility.

Coordination is deliberate rather than automatic. Moving's model separates
inviting a named person into the move with scoped access from sharing one
selected non-sensitive view through a revocable link. The repository contains
meaningful foundations for both paths, but the complete per-actor permission
experience and generalized bounded sharing remain partial or later as stated in
the [capability ledger](#capability-truth-and-ledger). Nothing private is shared
merely because it is useful to the plan.

### Marketing / PR takeaways

These lines express the durable product philosophy. Pair any feature-specific
version with current capability proof:

- **One changing move, one understandable record—not a pile of disconnected
  tools.**
- **Your AI can help do the work; Assist With Moving keeps the plan, evidence,
  decisions, and next step ready to understand and resume.**
- **When the place, date, cost, belongings, or people change, the move should
  remain traceable instead of forcing a restart.**

## The Assist family model

The plain-language promise above has a precise responsibility model. Assist
products separate three responsibilities:

- **Your AI reasons and does the work you direct.** It may help research
  choices, compare places, organize possessions, build a timeline, prepare
  questions, draft communications, identify risks, or carry out authorized
  work in other services available to it. The person's external conversation
  with that AI is not controlled or policed by Moving.
- **Assist With Moving supplies the durable moving layer.** It keeps structured
  move context, records, evidence, instructions, questions, queues, decisions,
  history, and views available beyond one chat or one AI session.
- **You remain the authority.** You choose the people and AIs involved, decide
  what each may observe or change, set practical review preferences, correct
  the record, revoke access, and make the consequential moving decisions.

The useful system is the combination. Your AI can reason across a large,
changing project without depending on one conversation. Assist With Moving
gives that work durable shape and gives you a legible plan you can inspect and
steer.

An AI may have capabilities in its own environment that Moving does not
operate. If you authorize it, your AI may browse, research, communicate, use a
calendar or map, request estimates, or arrange work elsewhere. Moving does not
inherit that outside access. Only information deliberately submitted through a
Moving interface becomes Moving data.

The inverse is equally important: the person's freedom to talk to their AI does
not give that AI access to Moving. Moving's settings and grants decide only
Moving-side questions: which AI may call which tools, retrieve which selected
data, receive sensitive context, create/update/delete which records,
publish/share/export through the product, or receive a recorded handoff with a
specifically approved external-action intent. If a Moving-side operation is not
allowed, Moving denies that tool, data or handoff operation. It does not tell
the person what they may discuss outside the product.

The Assist family name does not create a shared database or a universal grant.
Any connection between Moving and another Assist product must be explicit,
understandable, reviewable, and revocable. A connection must identify which
records or summaries may cross, in which direction, for which purpose, and
under whose authority.

## User-owned data and scoped authority

The person owns their moving data. Opening a move, joining a household, or
connecting an AI must never silently grant blanket authority over it.

Each person and each chosen AI independently receives explicit authority for a
selected move, area, record, data class and purpose. The following Moving-side
operations are separate grants:

- **retrieve or read** information;
- **add or create** new information;
- **update** existing information;
- **delete** information; and
- **promote, publish, share, or export** information when Moving supports that
  operation.

Receiving selected Moving data plus a recorded **external-action handoff** is a
separate authority category. It must name the intended outside action—such as
contacting one mover for one estimate—without giving Moving or the AI a general
licence to contact, offer, purchase, book, sign, pay, or publish.

Read is not write. Create is not update or delete. Permission to propose work
is not permission to accept it. Permission to update one move is not permission
to update another. Permission to share one packet is not permission to publish
the underlying private move.

Every grant should make eight facts visible:

1. **Actor:** which person or chosen AI receives the authority;
2. **Scope:** which move, area, record type, or record it covers;
3. **Permitted data:** which fields, files, evidence, sensitive categories or
   derived summaries may cross the boundary;
4. **Product operations:** which of read, create, update, delete, promote,
   publish, share or export are allowed;
5. **External-action category and intent:** whether a handoff is allowed and
   the exact outside action it may carry;
6. **Approval:** the owner approval or policy that applies to this operation or
   handoff, without treating a Queue item as silent authority expansion;
7. **Duration and status:** whether the grant expires, is active, or has been
   revoked; and
8. **Activity and result:** who granted or changed it, when it was used, what
   was handed off, and the attributable result, failure or return.

An AI cannot grant itself authority, inherit another actor's authority, or
expand a grant merely because it can see the workspace. Access should be
editable and revocable, and material reads and changes should preserve acting
identity, scope, time, and action in provenance or audit history.

A Queue directive or external conversation may express what the person wants;
neither silently expands the Moving grant. When the required grant is missing,
Moving uses **Needs you** to ask the smallest exact authority question. When it
already exists, Moving may make the specifically approved data-and-intent
handoff to that chosen AI and record actor, scope, approval, time, result and
any failure or return. Moving still does not perform the outside action itself.

Permission and operating policy are different:

- **Permission** answers whether the actor may perform an operation at all.
- **Operating policy** answers how already-permitted work proceeds—for example
  direct saving, a preview, batch review, or an explicit checkpoint.

Automation and review preferences never create permission. A retrieve-only AI
does not become able to update data because a user selected “automatic.” Within
a real update grant, however, the user may choose efficient direct saving
instead of requiring approval for every low-risk correction.

Identity remains site-specific. A Moving login, session, grant or deletion does
not silently sign the person into another Assist site, reach into another
site's records or delete another site's account.

The owner can view, correct, export and delete their own Moving data. Sensitive
data—addresses, access details, identity and financial documents, valuables,
photos, private communications and equivalent evidence—remains private by
default. It is excluded from public surfaces, generic sharing, collaborators
and AI handoffs unless the owner explicitly grants the relevant actor, scope,
data and operation. The current implementation is only a partial foundation
for that complete contract, as the matrix and ledger state.

The family deletion destination is removal, not deactivation or anonymization:
record deletion removes the record, its attachments and content-bearing
history, allowing only a minimal content-free tombstone when necessary; account
deletion removes the site-specific Clerk identity and associated personal data,
records, media objects, attachments, share links and AI grants across every
processor. The current source only proves a narrower export-plus-anonymization
workflow that revokes access paths and leaves shared household records. It is a
**Current/verified partial foundation**, not proof of family-complete deletion.

### Moving is collaboration-first

A household move is usually shared work. Moving should make collaboration
natural without making every participant equal, exposing the whole household,
or forcing a solo mover to configure a team. These roles describe the intended
plain-language contract:

| Role | Intended scope and typical safe actions | Visibility, revocation and attribution |
|---|---|---|
| **Household owner / organizer** | Owns the household boundary; creates and steers moves; invites or removes people; grants AI access; approves sensitive sharing, export and external-action handoffs. | Can review active people, AIs, keys and links. Revoking access ends future use without erasing attributed history. Ownership is not a licence to browse another person's unrelated private data. |
| **Household member / partner** | Shares the household and the moves explicitly available to them; may plan dates, rooms, boxes, assignments, transport or evidence only within granted data and operations. | Sees the shared plan plus their own private work—not another member's Queue or excluded sensitive fields. Every material action names the member or their separately authorized AI. |
| **Move-only helper or professional** | Walled to one named move and purpose—for example a family helper, mover coordinator, organizer or claims professional. May view or update only assigned areas, records and actions. | Cannot see other household moves or unrelated household data. The owner can narrow, expire or revoke the grant independently; actions remain attributed after revocation. |
| **Chosen AI** | Uses Moving only through the grant provided by the owner or an authorized participant: named move/records, permitted data, allowed operations, approval and duration. May receive a specifically approved external-action handoff. | Never inherits its person's full access automatically, another participant's access, or authority from Queue text alone. Moving records its tool use, changes, handoffs and results; revocation/expiry blocks later Moving access. |
| **Bounded share-link recipient** | Is not a member. Opens one deliberately selected recipient workflow or non-sensitive view and may take only the actions named on that link. | Sees no Queue, account, other move or unrelated household data. The link states audience, exposed fields, actions and expiry/revocation; access and changes are attributable where supported. |

The complete implementation must prove ordinary household scenarios, not only
permission tables:

1. invite a partner and let both people contribute to one shared move plan;
2. keep each person's excluded/private data and Queue work separate;
3. grant a helper or professional limited access to one move and no other
   household data;
4. revoke or expire person and AI access and prove later calls/actions fail
   while history remains understandable; and
5. send a bounded recipient workflow without creating membership or exposing
   unrelated household, move, account or sensitive data.

**Current truth:** memberships, named invitations, roles, move restrictions,
sensitive-field visibility, Queue delegation, scoped keys, private photo
defaults and bounded recipient links are **Current/verified repository
foundations**. The unified role experience, complete per-operation matrix and
all five end-to-end scenarios are **Partial / Later** and not live-proven.

### Two distinct sharing paths

Across the Assist family, access for a named participant and access to a
bounded shared view are separate foundations. Moving must make both prominent
and must never blur them. The family visibility vocabulary is **Private**
(default), **Unlisted** (read-only, long opaque link, no expiry unless the owner
revokes it), **Trusted** (a named signed-in account), and **Public** (rare and
deliberate).

1. **Invite a named person into the move or project.** A household member,
   family member, colleague, helper, or vendor coordinator may need durable
   access as an identified participant. The invitation must name the person,
   move, role, allowed areas, and permitted operations. Their access can be
   changed or revoked without changing anyone else's access.
2. **Share one bounded view without workspace membership.** The user may share
   a selected non-sensitive plan, checklist, item group, documentation packet,
   or other deliberately bounded view through a revocable link. The link must
   expose only the selected records and fields, identify any allowed recipient
   actions, and carry an expiry or clear revocation path. Receiving the link
   does not make someone a move participant or workspace member.

Moving's current `/share/<token>` links are **recipient workflow links**, not
the family **Unlisted** level. This is an intentional product-specific
difference: a mover, helper, claims recipient or household contact may need a
time-bounded packet and selected actions such as commenting or supplying
evidence. Those links may expire and must name their exact manifest and allowed
actions. A future link described as **Unlisted** must instead follow the family
meaning exactly: read-only, non-expiring by default, and live until the owner
revokes it. Both kinds remain private until deliberately created and neither
grants workspace membership.

Neither path grants the other. Inviting a person must not silently publish a
link, and opening a link must not silently create membership. Both paths are
explicit, revocable, and auditable: preserve who invited or shared, what scope
and operations were granted, when access began or ended, and material access or
changes. Nothing is shared automatically.

Neither path grants an AI access either. A collaborator's permission does not
become their AI's permission, and a share recipient's allowed action does not
become a general external-action handoff. Any AI access to participant or
shared data requires its own actor, data, scope, operation, approval and
duration. Sensitive fields remain excluded unless that grant names them.

The current repository has meaningful foundations for named household and
move-specific participants, roles, invitations, move restrictions,
sensitive-field visibility, scoped and revocable API keys, documentation
profiles, expiring and revocable share links, allowed link actions, access
metadata, owner kill switches, and audit events. It does not yet prove the
complete independent per-person and per-AI operation matrix, every participant
setup and revocation flow, or generalized bounded-link sharing for selected
plans, checklists, item groups, and other move views.

## Why the family and trust model matters

A move can outlast one conversation, one helper, one plan, and one AI session.
The family model keeps that change from turning into lost context or invisible
authority:

- the person can change AI environments without surrendering the durable move
  record;
- an AI can be useful without becoming the owner of the plan or its
  permissions;
- named participants and bounded links can support coordination without making
  private work public;
- changes, evidence, questions, and results can remain inspectable instead of
  disappearing into transcripts; and
- automation preferences can improve flow without silently expanding anyone's
  authority.

This is why durable memory and human control belong together. Continuity
without authority would be unsafe; authority without continuity would leave the
person repeatedly rebuilding the move. The detailed
[trust boundaries and non-goals](#trust-boundaries-and-non-goals) remain the
normative limits.

## How to use this document

The philosophical heart is intentionally first. Read through
[Why the family and trust model matters](#why-the-family-and-trust-model-matters)
to understand the product before entering the builder reference.

For focused work, use this reading map:

| Reader | Start with | Questions answered |
|---|---|---|
| Product owners | [One-sentence identity](#one-sentence-identity), [Think of it as…](#think-of-it-as), [Progressive complexity](#complexity-grows-with-the-move-not-with-setup), [Scope and non-goals](#what-moving-is-for-and-what-it-is-not), [Assist family model](#the-assist-family-model), [Shared authority](#user-owned-data-and-scoped-authority), [Collaboration](#moving-is-collaboration-first), and [Why trust matters](#why-the-family-and-trust-model-matters) | What Moving promises, how it grows without enterprise-first setup, who participates, who owns the data, and why continuity and authority stay together |
| Implementers | [Builder reference](#builder-reference-begins-here), [AI and queue](#how-your-ai-and-queue-work), [Move Brief](#the-move-brief-authorized-context-not-another-record), [Moving loop](#the-moving-loop), [Durable information model](#durable-information-model), [Document Memory](#document-memory-and-move-evidence-packets), [Visibility](#human-visibility-and-visualization), [Operational references](#operational-references), and [Maintenance](#maintenance-and-claim-verification) | What must persist, how work begins and resumes, where controls belong, how paperwork stays attributable, which implementation sources govern, and which claims require proof |
| AI workers and integration builders | [Builder reference](#builder-reference-begins-here), [AI and queue](#how-your-ai-and-queue-work), [Move Brief](#the-move-brief-authorized-context-not-another-record), [Shared authority](#user-owned-data-and-scoped-authority), [Collaboration](#moving-is-collaboration-first), [Moving loop](#the-moving-loop), and [Trust boundaries](#trust-boundaries-and-non-goals) | Where work may begin, what context may be retrieved, how queued handoffs and scoped tools work, and which participant, data and operation boundaries apply |
| User-facing writers and designers | [One-sentence identity](#one-sentence-identity), [Think of it as…](#think-of-it-as), [Scope and non-goals](#what-moving-is-for-and-what-it-is-not), [Why not a quick feature?](#why-not-just-ask-your-ai-to-build-a-quick-feature), [Why not a conventional site?](#why-this-instead-of-a-conventional-moving-website), [Capability ledger](#capability-truth-and-ledger), [Language rules](#language-rules), and [Design implications](#public-homepage-and-future-shell-implications) | How to explain the human promise and durable differentiation, what may be claimed now, which words to use, and how philosophy should shape the experience |

Anyone publishing a capability claim must read both
[Capability truth and ledger](#capability-truth-and-ledger) and
[Maintenance and claim verification](#maintenance-and-claim-verification).

## Builder reference begins here

The sections above define the human product philosophy. The sections below
translate it into durable operating models and claim boundaries for product,
design, engineering, and AI feature work:

- **AI and queue model:** where work starts, what crosses the connection, and
  what a resumable handoff preserves;
- **moving and information contracts:** how a move grows from simple to
  multi-party, how the Move Brief carries permitted current context, and how
  records, document memory, provenance, questions and completion remain
  coherent;
- **human visibility and capability truth:** what people must be able to
  understand and what may honestly be described as available; and
- **language, design, maintenance, and evidence:** how future work stays aligned
  with the philosophy without outrunning proof.

The builder reference is more detailed, not more authoritative. It must
implement the identity, scope, family model, user authority, and trust
principles above rather than reinterpret them.

## How your AI and queue work

Assist With Moving is not trying to replace the AI environment a person already
chooses. They may keep working in ChatGPT, Codex, Claude, OpenClaude, Gemini,
Hermes, or a future compatible system. No vendor is preferred, and naming one
here does not claim that its connection is currently shipped or verified.

The chosen AI remains the place for conversation, reasoning, research,
synthesis, and authorized outside work. Moving is the durable moving layer
beside it:

- **Durable move memory** keeps structured context, instructions, decisions,
  evidence, questions, history, and a current recap available beyond one AI
  session.
- **Scoped moving tools and records** let an authorized AI retrieve or change
  only the move, area, records, and operations the user has allowed.
- **A durable queue** carries requested and follow-up work forward when the
  person and AI are not working in the same live conversation.
- **A visual workspace** lets the person understand the plan, work state,
  questions, progress, and saved results without reading an AI transcript.

### The Move Brief: authorized context, not another record

The **Move Brief** is the compact, AI-readable current context for one move. It
is assembled from the durable record at retrieval time, so it does not become a
second source of truth or a stale exported summary. It should include only what
the requesting person or chosen AI is allowed to receive:

- origin, destination, current phase and timeline;
- people, roles, assignments and relevant providers;
- inventory, boxes, rooms/spaces, transport resources, trips and constraints;
- provider context, documentation requirements and permitted evidence;
- important decisions, their sources, freshness and unresolved uncertainty;
- open questions, blockers, deadlines and the exact next Queue work; and
- the active authority boundary: actor, permitted data and operations, any
  approved external-action handoff category, expiry and revocation state.

With the appropriate grant, the chosen AI can use the Brief to find missing
evidence, prepare a checklist or packet, organize permitted records, compare
options, and return attributed results. The person decides approvals,
submissions, money, signing and any external-action handoff. Moving records the
scope and activity; it does not submit a claim, send a form, hire a mover or act
as the mover.

The repository already verifies compact move-summary and context foundations.
A permission-filtered Brief containing the complete fields above, current Queue
work and document-memory recap is **Later / unverified**. Until proven, public
or AI-facing copy must describe the current summary tools precisely rather than
claiming the full Move Brief exists.

### Work can begin in either direction

1. **A — Start in the person's preferred AI environment.** The person and their
   AI reason or work there. When a compatible, authorized connection is
   available, the AI may retrieve relevant move context, use scoped Moving
   tools, and save durable records, evidence, questions, or results. The person
   can then inspect and visualize that durable state in Moving.
2. **B — Start in Assist With Moving.** The person creates a queue entry with
   the request, instructions, context, and allowed scope. A compatible,
   authorized AI can pick it up later, work through it, save the result or a
   question, and leave the exact continuation state for the person or a later
   AI session. The person does not need to keep one chat open for the work to
   remain understandable.

Neither direction makes the AI provider part of Moving or makes Moving the AI
provider. The connection is a scoped bridge between the user's chosen
environment and user-owned Moving data.

### The queue carries the handoff

The family destination uses exactly four user-facing states:

| Family Queue state | Meaning in Moving |
|---|---|
| **Waiting for your AI** | The directive has been accepted but the person's connected AI has not picked it up. Nothing is running. |
| **Working** | The person's AI has picked up the directive; show the current step and handoff identity. |
| **Needs you** | Work stopped on the smallest exact fact, file, decision or authority boundary only the person can resolve. |
| **Done** | A readable result or answered question is attached to the durable move record. |

No fifth user-facing state is part of the destination contract. Before an AI
is connected, a person may still leave a directive; it remains **Waiting for
your AI** and points to `/ai`. The current capture Queue's six stored states and
its To do / Review / Archive groupings are implementation facts, not synonyms
that may be marketed as family conformance.

**The directive alone must be enough.** A person can write what they want in
their own words without selecting a category or attaching evidence. Moving may
offer one-tap optional context—for this domain, a **move**, **room/space**, or
selected **belongings**—but missing context must not block submission.

**A directive is bounded intent, not blanket authority.** It records the
request, not a silent expansion of the person's AI grant. Moving may allow
only the tools, data and operations already covered by an explicit grant. A new
objective, destructive change, additional sensitive data, publish/share/export
operation, identity or access change, or external-action category needs its own
authority. Missing authority or genuinely unclear scope moves the item to
**Needs you** with the smallest exact question that unlocks it.

When a visible, unexpired grant already names the chosen AI, scope, permitted
data, operation or outside-action category and approval, the Queue may hand
that AI the specifically approved context and intent. The AI—not Moving—may
then act through capabilities in its own environment. The durable item records
the grant, actor, scope, approval and handoff time, followed by the result,
failure or return. A Queue item never makes Moving an autonomous task runner.

A person may also discuss or direct any work with their AI entirely outside
Moving, including work broader than their Moving settings permit. Moving does
not control or police that conversation or the AI's overall behavior. If the AI
then attempts a disallowed Moving tool, data or handoff operation, Moving denies
that operation at its own boundary.

A normal to-do item may say only what should happen. A durable AI work handoff
must preserve enough meaning for useful progress across AI sessions:

- **scope:** the move, area, records, people, places, or items involved;
- **request and outcome:** the original instruction and what useful completion
  should produce;
- **priority and time context:** what matters first, relevant dates, and how
  urgency was decided;
- **context and evidence:** notes, sources, photos, documents, earlier
  decisions, and uncertainty the work depends on;
- **authority:** the chosen AI, permitted scope and data, Moving operation or
  outside-action category, approval, and expiry/revocation state;
- **state and responsibility:** one of the four family states, plus who or which
  chosen AI last acted and when;
- **questions, blockers, and dependencies:** what prevents safe progress and
  what answer or event would unblock it; and
- **continuation and result:** the exact next step, saved outputs, material
  changes, any external-action handoff and its result/failure/return, and the
  compact continuation a later session should retrieve.

The Queue is a handoff, not an autonomous task runner. Nothing starts merely
because a directive was saved; the person's AI must pick it up. The Queue should
make interruption, questions, delegation, recovery, and resumption safer—not
turn the move into a longer checklist or imply that Moving itself is doing the
work.

**Current truth:** the repository verifies source foundations for
bring-your-own-AI access, compact move summaries and context, scoped API/MCP
operations, and a narrower per-user capture queue with instructions, media,
status, expiring claims, AI questions, summaries, and result references. It
does **not** yet prove a general move-wide work queue, scheduled or automatic
pickup, the complete two-direction experience above, or current compatibility
with every named AI environment. Those claims remain **Current/verified partial
foundations**, **Unknown**, or **Later** descriptions—not deployed-current
promises—until the dated
[capability ledger](#capability-truth-and-ledger) and end-to-end proof say
otherwise.

## The moving loop

A move should remain useful from the first idea through completion and later
reference. Its durable loop is:

1. **Frame the move.** For the primary home-move experience, record the
   household, current and future home, people and helpers, timing, constraints,
   goals, and what “done” means. A business, office, temporary, travel-related,
   downsizing, renovation-adjacent, or other move uses the same loop with the
   details appropriate to its shape.
2. **See the current state.** Retrieve the permission-filtered Move Brief or the
   relevant detailed context: decisions already made, active work, open
   questions, risks, dependencies, recent changes, authority and next actions.
3. **Add work and evidence.** Capture instructions, tasks, notes, questions,
   photos, documents, estimates, research, items, places, or other evidence
   with source and scope.
4. **Reason and act within authority.** Your AI may organize, research, compare,
   draft, calculate, or perform outside work you direct. Moving enforces only
   its own tool, data, record-operation and handoff boundary; it does not govern
   the AI's broader environment.
5. **Save the useful result.** Store structured records, the evidence and
   reasoning that matter, uncertainty, responsible actor, authority and time
   context, plus any handoff result, failure, return and follow-up—not merely a
   chat transcript.
6. **Review in proportion to risk.** Direct saves, previews, batch review, and
   explicit approval are operating choices inside granted permission. Higher
   consequence and lower confidence should create stronger checkpoints.
7. **Revise without erasing the story.** A changed date, destination, vendor,
   budget, disposition, or plan should preserve what changed, why, and what
   downstream work must be reconsidered.
8. **Resume, finish, and return later.** A person or later authorized AI should
   be able to continue from a compact Move Brief, drill into full history,
   close remaining work, and retain the useful record after move day for
   claims, reimbursement, tax source material, warranties and reusable lessons.

The queue is the durable front door for new work or instructions to your AI. It
coordinates work; it is not a gate that prevents the AI from making useful
progress elsewhere within its authority. A queue item may finish, ask a
question, wait on a dependency, split into more work, or produce records and
evidence.

The repository currently implements a narrower capture-and-ingestion queue with
instructions, media, claims, expiry, AI questions, summaries, and result links.
That is a strong foundation, not proof that the complete moving loop or a
general move-wide work queue has shipped.

## Durable information model

A move is a long-lived, changing project—not a static checklist. Moving should
preserve common structure where it helps comparison and retrieval, while
allowing flexible details for moves beyond the primary household home-move
experience. The household starting point must not hard-code one family
structure, residence type, or move path; compatible extensions should reuse the
same durable model rather than fork the product.

### Move and scope

The **move** is the primary durable project boundary. It carries identity,
purpose, status, time window, locations, participants, policies, and completion
state. A household or organization may contain multiple moves, but records must
not silently cross between them.

A move may contain areas such as planning, inventory, transport, documentation,
vendors, costs, or a room. These areas improve navigation and authority but do
not need to become rigid silos. Scope provenance should identify the household
or workspace, move, area, and relevant record.

### Planning records

The durable plan may include:

- milestones, dates, phases, and completion criteria;
- origin, destination, temporary, storage, route, and service places;
- home or property criteria and candidate places;
- tasks, owners, dependencies, blockers, and next actions;
- decisions, alternatives, reasons, assumptions, and later revisions;
- people, responsibilities, vendors, services, estimates, and appointments;
- rooms, spaces, possessions, boxes, inventories, and desired future items;
- transport resources, trips, capacities, load assignments, and exceptions;
- costs, budgets, quotes, payments, reimbursements, and financial risk;
- paperwork, photos, receipts, contracts, research, and other evidence;
- notes, questions, risks, policies, and instructions; and
- status, readiness, unresolved work, and completion state.

Not every move needs every record. Common fields should remain structured;
unusual details should remain possible without being forced into unsearchable
free text.

### Authoritative records, proposals, and views

Moving must distinguish:

- **authoritative records:** the user's current saved plan and facts;
- **observations and evidence:** dated source material that supports or
  challenges a record;
- **proposals:** suggested changes not yet promoted to the authoritative plan;
- **explanations:** reasoning or summaries that help a person understand; and
- **derived views:** timelines, readiness indicators, maps, budgets, layouts,
  and other visualizations calculated from traceable records.

An AI explanation should not silently become a trusted fact. A visualization
should not become a competing source of truth.

## Planning, change, provenance, and history

Moving plans change because the world changes. History is product value, not
database residue.

For a material choice or change, preserve as applicable:

- what was chosen or changed;
- the alternatives or prior value;
- why it was chosen;
- the source or evidence;
- the responsible person or AI;
- the observation time and the decision or update time;
- confidence, assumptions, and known uncertainty;
- the operating policy and review state;
- follow-up work and affected dependencies; and
- later revisions, supersession, or reversal.

A current-state recap should be compact enough for a person or AI to orient
quickly. It should name the move, current phase, important dates and places,
settled decisions, active tasks, blocked dependencies, open questions, recent
material changes, risks, and next actions. Drill-down should reveal the full
plan and evidence without forcing every detail into the recap.

The repository already records created and updated times across many objects,
acting users or API keys on selected records, research sources and check times,
move-scoped audit logs, AI review states, and reversible Layout Studio
operations. Those pieces do not yet form a complete first-class decision and
revision history across the whole move.

## Tasks, dependencies, questions, notes, and queues

### Tasks and dependencies

A task is a unit of moving work with an outcome, state, responsible actor,
timing, priority, scope, and next action. Tasks may depend on decisions,
evidence, other tasks, external events, or time. A dependency should explain
what is waiting and what would unblock it.

Tasks should support both planned work and work discovered during execution.
Completion should record the useful result rather than merely hiding the task.
The current repository does not provide a general first-class task and
dependency model; this is later product direction.

### Questions and notes

Questions and notes belong where they have meaning. They may attach to a move,
task, place, item, room, decision, vendor, cost, piece of evidence, or another
relevant record. A question should retain who asked, why it matters, who may
answer, status, answer or resolution, and any resulting work.

The repository currently derives structured unanswered move-readiness prompts,
stores notes on several record types, and lets capture-queue work return an AI
question. It does not yet prove a general attachable question-and-note system.

### Queue

The queue contains new work or instructions for your AI. Useful queue fields
include requester, owner, chosen AI, scope, permitted data, instructions,
evidence, Moving operation or external-action category, approval, expiry or
revocation, state, claim or lease, blockers, question, handoff/activity/result
references, and resume context.

Queue ownership and claim rules should prevent duplicate work without making
an abandoned claim permanent. Delegation to run another person's queue must be
explicit. An AI may continue useful unblocked work elsewhere rather than treat
an unanswered queue item as a stop for the entire move.

## Places, items, costs, and evidence

### Places

Places may include origins, destinations, candidate homes, temporary housing,
storage, rooms, yards, routes, pickup or drop-off points, and service
locations. A place should have stable identity even when its label, role, or
details change. Private addresses and access details require tighter visibility
than a general place name.

The repository currently supports origin and destination fields, structured
start and end locations, move spaces, transport-related spaces, and floor-plan
entities. It does not yet prove maps, geocoding, route services, live traffic,
property search, or a general place-candidate model.

### Items and inventories

Possessions and inventory may be owned, planned, packed, sold, donated, stored,
discarded, claimed, or moved by different methods. Their durable records may
include identity, quantity, condition, dimensions, weight, value, evidence,
room or space, owner, disposition, box, transport assignment, destination, and
review state.

The repository has substantial structured support for items, planned items,
boxes and contents, photos, rooms and spaces, disposition, sale preparation,
transport assignment, and layout placement. This foundation should be extended
rather than mistaken for the whole moving product.

### Costs and budgets

Moving costs may include estimates, quotes, deposits, purchases, services,
travel, storage, reimbursements, actual costs, and contingency. Preserve
currency, source, date, estimate range, status, responsible payer, related
vendor or task, and whether a figure is proposed, approved, paid, reimbursed,
or disputed.

The repository currently stores item values, replacement values, sale pricing,
planned-item estimated prices, and internal AI-job cost data. It does not yet
provide a general move budget, vendor estimate, quote comparison, payment, or
reimbursement model. Internal AI usage cost is not a user's moving budget.

### Evidence

Evidence may be a photo, file, receipt, contract, estimate, message, research
source, observation, or signed document. Preserve source, observed date,
capture or import method, relevant scope, visibility, and the record or
decision it supports.

Evidence can inform a fact without becoming the fact. A newer source may
supersede a conclusion while the older observation remains part of history.
Private evidence must not become public merely because a summary or packet is
shared.

### Document Memory and Move Evidence Packets

Paperwork-heavy moves need more than loose file storage. The future
**Document Memory / Move Evidence Packet** is a private, permissioned record
that helps the owner and their chosen AI prepare work now and explain a year
later what was filed, which evidence supported it, what changed and why.

Its connected parts are:

1. **Original artifact.** Preserve the supplied photo, PDF, document or
   externally referenced record with document type, issuer/source, relevant
   date, version or hash where practical, and retention/access state. The
   original stays distinguishable from summaries and extracted fields.
2. **Structured facts.** Store permitted user- or AI-extracted addresses,
   dates, inventory identifiers, claim numbers, amounts, requirements,
   deadlines and form answers. Each value says whether it is extracted,
   proposed or person-confirmed; extraction never silently becomes truth.
3. **Completed-form snapshot.** Preserve what the person actually approved or
   submitted at that time, with source, date and later revisions/corrections.
   An older answer may be compared or suggested, but never silently reused as
   current.
4. **Documentation / Evidence Packet.** Group the relevant inventory, condition
   photos, receipts, completed forms, source instructions and communication
   notes for one claim, reimbursement, move requirement or PCS need without
   exposing unrelated household material.
5. **Requirements and progress.** Show needed evidence, missing information,
   deadlines, state and the exact next step rather than treating a folder of
   uploads as complete.
6. **Provenance and retrieval.** Preserve who supplied, extracted, confirmed,
   approved or submitted each record; its source and time; what changed; and a
   bounded AI-readable recap that can feed the Move Brief.

With an explicit grant, the chosen AI may retrieve permitted records, identify
missing evidence, compare an old packet with a new requirement, prepare a
draft/checklist, organize data and save attributed results. The owner controls
read, create/update, deletion, export, sharing and any external submission
handoff. Moving does not itself submit claims or forms, guarantee acceptance or
compliance, provide legal/military advice, or claim an official military PCS,
employer, insurer, mover or government integration.

After move day, this record remains useful for damage claims, reimbursements,
tax preparation source material, warranties, later questions and lessons worth
reusing. Post-move continuity must preserve the evidence and decision story
without keeping data the owner has deleted or extending an expired grant.

**Current truth:** documentation profiles, private photos/evidence, exports,
recipient-safe fields and packet-oriented source are **Current/verified
repository foundations**. The full Document Memory model, structured
extraction/confirmation states, completed-form snapshots, requirements
tracking, permission-filtered recap and post-move retrieval scenario are
**Later / unverified**. They are philosophy direction, not a current feature or
official integration claim.

## Human visibility and visualization

The human workspace should answer these questions without technical knowledge:

1. Which move and area am I viewing?
2. Which named people and chosen AIs are participants in this move?
3. Which of them may receive which data and read, create, update, delete,
   promote, publish, share, export, or receive an external-action handoff here?
4. Which bounded share links exist, exactly what does each expose, when does it
   expire, and how can I revoke it?
5. What is the current plan, and how complete or ready is it?
6. What is active, waiting, blocked, or resumable?
7. What needs my judgment, information, or approval?
8. Where did an important fact or decision come from, and how fresh is it?
9. What changed or was handed off, who or what did it, under which approval,
   and what result, failure, return or affected record followed?
10. What risks, dependencies, deadlines, costs, or capacity limits deserve
   attention?
11. What can I correct, export, delete, undo, revoke, or recover?
12. Which paperwork requirements are complete or missing, which values are
    extracted versus confirmed, and what completed-form snapshot was actually
    approved or submitted?
13. After move day, what evidence, decision history, claim/reimbursement work,
    warranties and reusable lessons remain—and who may still retrieve them?

Useful views may include:

- a phase timeline with milestones, dependencies, and drift;
- a place and route view with privacy-aware detail;
- a room, box, and item hierarchy;
- a layout or placement plan;
- a transport and capacity plan;
- a budget and estimate comparison;
- a decisions-and-changes log;
- a work board showing active, waiting, blocked, and completed work;
- a permission-filtered Move Brief for the person or chosen AI;
- a Document Memory / Move Evidence Packet with requirements, provenance and
  exact next steps;
- a risk and readiness view; and
- a compact **current move recap** with drill-down.

Every visualization should reveal its move and area scope, source, calculation,
freshness, and uncertainty when those details affect interpretation. The
repository currently has summary, capacity, move-day checklist, documentation,
and Layout Studio foundations; it does not prove every view in this list.

Human control means more than confirmation dialogs. It requires understandable
scope, visible authority, status, provenance, correction paths, history,
export, deletion, and revocation. Preview and review should increase with risk
and uncertainty, while ordinary authorized work should remain efficient.
Control at Moving's boundary must not be described as control over the person's
external AI conversation: the product denies disallowed tool, data, record or
handoff operations and goes no further.

## Capability truth and ledger

Every material capability in planning or product-truth work must have exactly
one alignment status:

| Status | Meaning | Claim rule |
|---|---|---|
| **Current/verified** | Verified in the exact environment and user path being described; repository-only evidence is labeled as such | Present tense and active controls require current deployed proof |
| **In design / committed — Coming soon** | Approved and actively scheduled soft-launch work with a defined user outcome and owned delivery path | Must say **Coming soon** beside the unfinished capability; no fake or working-looking control |
| **Later** | A requirement, desired direction, partial foundation or unscheduled capability | Future direction only, never a near-term promise |
| **Intentional product-specific difference** | A justified Moving behavior that does not redefine a family term or weaken a family safety boundary | Name the difference and reason explicitly |
| **Unknown** | Available evidence cannot prove current implementation, deployment, configuration or user-path state | Do not make an availability claim; verify or omit |

If evidence is missing, stale, contradictory, or limited to local source code,
the public claim does not qualify as deployed **Current/verified**. If desired
work lacks an active delivery commitment, it is **Later**, not **Coming soon**.

### Dated repository evidence ledger

> **Time-sensitive evidence — verified 2026-08-07:** This table describes the
> checked-out repository at commit `0d30a9c`. It is not proof that the same
> capability is deployed, configured, reachable through a supported client, or
> usable by a real account in production.

| Capability area | Repository evidence | Honest product interpretation |
|---|---|---|
| Move projects | Structured move type, status, origin/destination, date range, notes, PCS fields, and archive state | **Current/verified repository foundation.** The graduated simple → coordinated household → provider-assisted → documented/claim composition and broader flexible project details are **Later** |
| Named participant access | Households, named invitations, household-backed and move-only participants, roles, sensitive-field visibility, and access disablement | **Current/verified repository foundation** for inviting identified people. The owner/member/helper/chosen-AI/link-recipient contract and invite, shared-plan, move-only, revoke and bounded-recipient scenarios are **Later / unverified** |
| Inventory and packing | Items, planned items, boxes, contents, spaces, photos, disposition, values, review flags, archive or soft-delete paths | **Current/verified repository foundation.** Inventory is a major capability, not the whole identity |
| Transport and layouts | Resources, zones, trips, trip spaces, capacity, assignments, floor plans, proposals, reversible plan operations, SVG snapshots | **Current/verified repository foundation.** Maps, live routing, booking and provider execution are **Later or outside Moving** |
| Evidence and documentation | Private photo records, research sources, documentation profiles, exports, recipient-safe fields and packet-oriented source | **Current/verified repository foundation.** Full Document Memory / Move Evidence Packets, extraction-confirmation states, completed-form snapshots, requirements progress and post-move retrieval are **Later / unverified**. Private evidence does not become shareable merely because a summary or packet exists |
| Questions, Move Brief and queue | Derived readiness questions; a bounded MCP move brief; compact move/context summaries; and a per-user four-state Queue with directives, evidence, claim expiry, delegation, AI question, summary, activity and result references | **Current/verified partial repository foundation.** The complete cross-domain Move Brief and attachable question system are **Later**; canonical OAuth Queue transitions remain held until a distinct chosen-AI grant is proven |
| History and provenance | Move-scoped audit logs, actor and API-key fields on selected records, timestamps, review states, research/source checks, MCP client/operation/version receipts, web-visible saved planning results, and plan operation inverses | **Current/verified partial repository foundation.** Complete dependency, revision and AI-activity coverage is **Later** |
| API and MCP source surfaces | Documented REST API; a canonical stateless OAuth resource in `convex/httpRoutes/mcp.ts` + `convex/mcpPlanning.ts`; a persisted compatibility gateway in `convex/mcp*.ts`; and a separate API-key HTTP/stdio registry in `src/app/api/mcp` + `mcp-server/` | **Current/verified production foundation** through merge `d0c0a83` for deployment, anonymous discovery/challenge, door separation, docs, consent/token exchange, exact move isolation, complete source-backed save, replay, correction, normal UI reflection, revocation and fixture cleanup. `MOV-WO-006` preserves the complete receipt. Private media, simultaneous multi-client isolation, reconnect in a named client, and canonical OAuth Queue transitions remain **Partial / Unknown** |
| Granular chosen-AI grants and external-action handoffs | Scoped API keys, OAuth/client foundations, Queue claims and selected audit fields exist, but no complete verified contract names actor, scope, permitted data, product operation or external-action category, approval, expiry/revocation and attributable result together | **Current/verified partial foundations; Later complete contract.** Do not claim that Moving can currently pass an approved external-action handoff or that every AI can receive one |
| Costs | Item and replacement values, sale prices and research, planned-item estimate, internal AI-job cost | **Current/verified partial foundation.** General move budgets, vendor quotes, payments and reimbursements are **Later** |
| Bounded link sharing | Documentation profiles plus move- or profile-scoped links with selected fields/actions, expiry, revocation, access metadata, and recipient comments | **Current/verified recipient-workflow foundation** and **intentional product-specific difference** from family Unlisted. General selected-plan, checklist, item-group and arbitrary-view links are **Later** |
| General tasks, dependencies, decisions, risks, vendors, and appointments | No complete first-class cross-move model verified | **Later** |
| Automatic import, calendars, maps, live providers, vendor communication, service arrangement, signing, buying, or booking | No qualifying repository and user-path proof verifies a Moving-operated integration or a granular chosen-AI handoff | **Later or outside Moving itself.** The owner may still direct their AI externally; that freedom is not a Moving capability claim |
| Cross-product Assist connections | No qualifying connection contract or user-path proof verified | **Later** and must be explicit, reviewable, and revocable |

No item in this philosophy is designated **In design / committed — Coming
soon**. Inclusion here or in another planning document is not an active
delivery commitment.

The source tree provides unusually concrete MCP evidence, so technical
documentation may describe those implementations precisely. Public copy must
still wait for current proof of the real endpoint, authentication, caller and
move isolation, supported-client setup, exact tool catalog, and an end-to-end
retrieve → work → save → human-inspection result.

## Trust boundaries and non-goals

Assist With Moving must never imply that it:

- stores passwords, browser cookies, browser sessions, or credentials for
  vendors, services, calendars, maps, marketplaces, or the user's chosen AI;
- secretly imports private data or watches external accounts;
- itself browses, researches, communicates with vendors, requests quotes,
  schedules appointments, or arranges services unless a separate
  Moving-operated integration has shipped and been verified;
- signs contracts, accepts legal terms, commits the user to a vendor, or
  provides legal, insurance, tax, real-estate, or safety guarantees;
- makes purchases, sends payments, books travel, reserves storage, or places
  orders in an external service;
- publishes or shares private moving data automatically;
- grants unrestricted access across people, moves, areas, records, or Assist
  products;
- lets a person or AI change, delete, promote, or publish information merely
  because that actor may retrieve it;
- treats a review or automation preference as permission;
- turns AI reasoning into an authoritative fact without appropriate scope,
  operation authority, evidence, provenance, and policy; or
- guarantees that an estimate, capacity calculation, inventory, route, plan,
  deadline, or checklist is complete or correct.

These boundaries apply to Moving, not to work the user authorizes their chosen
AI to perform elsewhere. Your AI may research, communicate, browse, or arrange
things through capabilities available in its own environment when you authorize
it. Moving does not store or inherit those credentials or sessions, does not
decide what the external AI may do, and does not represent that outside access
as a Moving integration.

People may discuss or direct their own AI however they want outside Moving,
including requests broader than Moving's settings allow. Moving neither
controls nor polices those conversations or the AI's overall behavior. It
controls only whether its own tools and data participate. If the owner has
disallowed a read, sensitive-data transfer, record change,
publish/share/export operation or external-action handoff, Moving denies that
operation; it does not forbid the external discussion.

Moving also does not independently contact people, make offers, purchase,
publish, book, sign, pay or take another outside-world action. A separately
authorized handoff does not change that boundary: Moving passes only the
approved data and intent to the named AI, and records the grant, actor, scope,
approval, time and later result, failure or return. The chosen AI performs any
outside action through its own environment and capabilities.

Moving may issue its own scoped credentials or use its own authorization flow
so an approved client can call Moving tools. That is different from collecting
a password for a mover, bank, marketplace, browser, calendar, or AI provider.
Moving authorization must derive and enforce the person, household, move,
area, record, and operation scope; preserve acting identity and provenance; and
support revocation.

Explicit sharing that is already supported must remain recipient-safe and
revocable. Future collaboration or promotion must begin private and require a
deliberate choice of audience, content, allowed actions, duration, and
revocation path. “Shared with my AI” never means “public.”

A named participant invitation and a bounded share link are not
interchangeable. A link must not silently create membership or inherit a
participant's broader access. Membership must not silently create a public
link. Removing one does not substitute for revoking the other; each access path
needs its own visible status, revocation control, and audit history.

## Language rules

Public and product language should:

- say **“your AI”** when referring to the AI the user chooses;
- say **“move,” “plan,” “work,” “queue,” “question,” “decision,” “evidence,”
  “history,”** and **“current recap”** instead of generic AI-platform jargon;
- use **“Move Brief”** only for the permission-filtered current context
  assembled for a person or chosen AI, never for a stale duplicate record;
- describe Moving as the durable place where the work lives, not as the AI
  itself;
- explain the person, AI, and Moving roles before naming protocols or technical
  setup;
- describe inventory, packing, layouts, transport, vendors, costs, paperwork,
  and move-day coordination as capabilities, not the entire identity;
- distinguish current, proposed, estimated, imported, observed, stale,
  superseded, and completed states;
- distinguish external user-authorized AI activity from a Moving-operated
  connection or integration;
- say plainly that the person may direct their AI outside Moving while Moving
  governs only access to its own tools, data, record operations and handoffs;
- describe an external-action handoff as a recorded, owner-approved transfer of
  selected data and intent to one named AI—not as Moving taking the action;
- name AI environments only as examples of user choice; never imply a preferred
  vendor or currently verified compatibility without exact proof;
- distinguish observing, searching, retrieving, and reading from creating,
  updating, deleting, promoting, and publishing;
- use **“invite”** for named participant access and **“share link”** for a
  bounded view that does not require workspace membership;
- distinguish **owner/organizer**, **household member/partner**, **move-only
  helper/professional**, **chosen AI**, and **share-link recipient** rather than
  flattening them into generic collaborators;
- lead first-time and public examples with a household home move; describe
  business, office, temporary, downsizing, and renovation-adjacent moves as
  compatible extensions, not equal opening personas or separate products;
- name what a link exposes—such as a selected plan, checklist, item group, or
  packet—rather than saying an entire move is “shared”;
- name the actual household, move, area, record, person or AI, and permitted
  data, operations, external-action category, approval and duration when
  describing access;
- label uncertainty, freshness, authority, and future capability status
  directly; and
- label document values **extracted**, **proposed**, **person-confirmed**, or
  **submitted snapshot** rather than presenting every parsed field as current
  truth; and
- use **“queue”** for a durable work handoff that preserves scope, instructions,
  priority, evidence, state, blockers, questions, and the exact next step—not as
  a blanket approval gate, a generic to-do list, or a synonym for every task.

Avoid **“agent”** in user-facing copy when **“your AI”** communicates the idea.
Technical documentation may retain established names such as API-key actor,
agent context, or MCP tool when compatibility or implementation precision
requires them.

Do not say **“automatic import,” “connected calendar,” “live map,” “vendor
booking,” “AI makes the arrangements,” “works with every AI,” “one click,”** or
name a specific client as currently supported without exact current proof.
Repository source, a route, a tool manifest, a mockup, or a plan is not enough
for a public availability claim.

The current implementation name **MovingManifest** remains in technical,
compatibility, historical, Clerk, OAuth, and delivery contexts. The visible
**Assist With Moving** identity and reversible entry-domain redirect are
shipped at PR `#184`; a Clerk/OAuth/DNS/provider-domain cutover is not.

## Public homepage and future shell implications

These are design constraints, not a UI specification or authorization to
change the application.

### Public homepage

- Lead with a person or household moving from one home to another and the
  durable, evolving plan they share with their AI. Make this primary user and
  use case unmistakable before broadening the story.
- State the family promise in Moving words: **“Assist your AI, so it can assist
  you with moving.”** Use the house sentence **“Assist you and your AI with
  every part of your move.”** at least once without flattening the stronger
  domain story around it.
- Immediately make the promise tangible through the decision table, living
  plan, map of places and belongings, moving desk, coordination board, and
  return point—not through an undifferentiated feature list.
- After the household home-move promise is clear, explain that the same durable
  model can support business moves, office relocations, temporary moves,
  downsizing, renovation-adjacent moves, and other compatible shapes. Present
  this as extensibility of one product, not a set of equal hero narratives or
  separate editions.
- Show a move as a changing project, not a one-time checklist or inventory
  catalog.
- Show that the same product can begin with two places, a few boxes and one
  vehicle, then progressively add household coordination, providers and
  evidence packets only when the move needs them.
- Bridge the promise to the Assist model: your chosen AI reasons and works;
  Moving provides durable move memory, organization, tools, and visibility; and
  you remain the authority.
- Explain the boundary in one direct contrast: people may direct their AI
  outside Moving as they choose; Moving controls only whether that AI may use
  selected Moving tools/data or receive a recorded approved handoff. Moving
  itself does not take the outside action.
- Explain both directions of work: save and retrieve durable move context from
  the person's preferred AI environment, or start in Moving with scoped queue
  instructions for an authorized AI to work through later.
- Offer “Let's get your AI set up on this” early, linking and exposing the
  copyable `/ai` URL. Keep `/ai` and its future `/ai.txt` twin strictly current;
  neither may list an aspirational tool.
- Show the moving loop before listing features.
- Demonstrate timeline, places, work, decisions, inventory, costs, evidence,
  and a current recap as one coherent system—even when future examples must be
  clearly illustrative.
- Explain user-owned data and actor-specific operation authority without
  depicting read access as blanket write authority.
- Show the two sharing paths separately: inviting a named person into the move
  with scoped permissions, and sending a revocable link to one selected
  non-sensitive view without granting membership.
- Use the visible alignment labels from [Capability truth and ledger](#capability-truth-and-ledger)
  when future work appears.
- Keep technical MovingManifest compatibility naming distinct from the shipped
  Assist With Moving product identity and from an unshipped provider/domain
  cutover.
- Use synthetic, clearly labeled illustrations. Do not show fake live maps,
  connected calendars, vendor conversations, bookings, cross-product data, or
  autonomous purchases.
- Put six to ten honest questions on the home page, even if `/faq` remains as a
  fuller destination. Include the Assist family row and Support Desk link only
  when their sources and destinations are real.
- Prefer an editorial field-guide character—route notes, annotated plans,
  packing labels, and a calm sense of forward motion—over chatbot, generic
  SaaS, or mover-clip-art styling.

### Future signed-in shell

- Default first-time guidance, examples, and move setup to a household home
  move while allowing the person to choose another move type and add flexible
  details without entering a separate product.
- Ask only for the simple move essentials first. Reveal participant, provider,
  transport, evidence and packet structure progressively; never make an
  evidence-heavy workflow the price of starting a small move.
- Center the selected move, current phase, recent material changes, and compact
  permission-filtered Move Brief.
- Make **Needs you**, **Working**, **Waiting for your AI**, and **Done** work
  immediately understandable. Resumability, blockers and the exact next step
  belong inside those states, not in additional state names.
- Treat the queue as the front door for instructions to your AI while keeping
  tasks, decisions, evidence, and records appropriately distinct. Each queue
  item should expose scope, intended outcome, priority, context and evidence,
  state, responsible actor, questions, blockers, and the exact next step.
- Keep selected move and area scope, acting identity, independently allowed
  data and operations, external-action handoff category and approval, expiry,
  and revocation controls visible.
- When a Queue item needs authority, ask the smallest exact **Needs you**
  question. When authority already exists, show the chosen AI, approved data
  and intent, handoff time, and later result/failure/return without inserting a
  redundant approval gate.
- Give **People with move access** and **Shared links** separate surfaces.
  People should show identity, role, scope, operations, and status; links should
  show the selected view, exposed fields, recipient actions, expiry, access
  history, and revoke control.
- Make owner/organizer, household member/partner and move-only helper roles
  understandable in ordinary Moving language. A helper's wall to one move and
  a link recipient's non-member status must be visible, not hidden in policy.
- Let questions and notes appear in the context of the move, task, place, item,
  decision, cost, vendor, or evidence they concern.
- Put source, date, freshness, author, authority, review state, and uncertainty
  near the information they qualify.
- Make changes and downstream consequences inspectable; expose history,
  reversal, or recovery only where the underlying capability supports it.
- Connect timeline, places, inventory, transport, costs, documents, and
  readiness through traceable views rather than duplicating truth.
- For document work, keep the original artifact, extracted/proposed facts,
  person-confirmed facts, completed-form snapshot, packet requirements and
  post-move history visibly distinct. Never make an old form answer look
  current merely because it is convenient to reuse.
- Keep manual human workflows complete. AI assistance should extend the
  workspace, not make a person's own plan inaccessible without an AI.
- Deny disallowed Moving operations at the product boundary without language
  that suggests Moving controls what the person may ask their AI elsewhere.
- Keep connection and capability status honest inside the product as well as on
  the public site.

## Shared chassis and launch truth

These dependable family surfaces sit around Moving's domain experience. They do
not replace the move model, prescribe a common product template, or authorize
implementation in this document.

### Shared routes and truth surfaces

The big/public-launch destination is `/`, `/updates`, `/mcp`, `/ai`, `/ai.txt`,
`/queue`, `/me`, `/settings/ai`, `/settings/data`, `/delete-account`,
`/s/<token>` when Unlisted exists, and `/admin`. Current MovingManifest aliases
and nested routes remain compatibility facts until an implementation plan adds
redirects and proves the destination. The home page, `/ai`, `/ai.txt` and
`/updates` are public truth surfaces: home copy may reserve space for a
committed unfinished Tier A feature only with **Coming soon**; `/ai`, `/ai.txt`
and `/updates` never stretch beyond what a person or their AI can use now.
Within that chassis, `/me` owns stats meaningful to the person; `/admin` owns
site usage, operations and owner-only stats. Moving decides which measures are
useful rather than inheriting generic dashboard metrics.

### Product Queue and project Tracker stay separate

The **Queue** belongs to the person using Moving. Its cards carry directives,
optional move/room/belongings context, results and questions between that person
and their AI.

The internal **Tracker** coordinates building Moving. Its only top-level
concepts are:

1. **Cards** — one outcome with why, current truth, next safe action,
   constraints, completion evidence and real provenance;
2. **Work Orders** — an owner-approved bounded tranche of Cards with execution
   status (**Ready / Active / Complete / Superseded**) separate from independent
   audit (**Not audited / Passed / Follow-up needed**); and
3. **Guide** — the stable one-minute explanation another person or AI needs to
   continue safely.

This repository now contains that tracker under `docs/tracker/`, linked from
README and AI instructions. Its `MOV-####` Cards and `MOV-WO-###` Work Orders
carry current scope, approval and handoff truth without requiring Linear.
Generated readers remain presentation, not a competing source. The tracker
must not grow an automatic dispatcher, agent roster, second roadmap database,
or a visual clone of another product's board.

### Website launch stages

1. **Soft website launch.** The real domain is online and honestly listed by
   Assist With Life while product work continues before active marketing.
   Active controls work; unfinished committed public features say **Coming
   soon**.
2. **Big/public website launch.** Tier A and the sentence-by-sentence honesty
   pass are verified. This is when deliberate public marketing begins.

Moving's public entry, authenticated host, ordinary sign-in and empty first run
are verified as a **soft-launch foundation** in `MOV-WO-007`. Assist With Life
listing, Tier A completion and deliberate public marketing remain unproved, so
the big/public launch stage is not claimed.

Native/app-store work remains **Later** and must not shape the website around a
hypothetical wrapper. Revisit privacy, deletion, review and distinct native
utility requirements only after substantial recurring website use justifies a
real native product decision.

## Operational references

This Project Philosophy guides the changing implementation and operating
sources below; it does not replace them or promote their plans to current
capability.

| Concern | Repository-owned reference | Role and truth boundary |
|---|---|---|
| Project orientation and delivery | [README](../../README.md) | Current stack, repository map, local checks and the merge-to-production convention |
| AI working instructions | [AGENTS.md](../../AGENTS.md) | Stable repository orientation, safety rules and canonical Project Philosophy discovery |
| API, MCP and authorization architecture | [API and MCP guide](../api-and-mcp.md) and [stateless foundation contract](moving-stateless-mcp-foundation.md) | Authoritative guide to the canonical stateless OAuth, persisted compatibility OAuth and API-key HTTP/stdio surfaces; claims still require exact running-path proof |
| Product and implementation intent | [MovingManifest AI build specification](../assistwithmoving_ai_build_spec.md) | Historical design and implementation direction; useful context, not proof that a capability is current |
| Audit and remediation evidence | [2026-07-26 performance fix specification](../audits/AUDIT-2026-07-26-PERF-FIX-SPEC.md) and the other files in `docs/audits/` | Dated findings and proposed or verified remediation; recheck the exact code and environment before relying on them |
| Release accounting | [v0.3.0 completeness ledger](../releases/v0.3.0-completeness-ledger.json) | Version-scoped release evidence, not a substitute for deployed or authenticated proof |
| Security, identity and deletion implementation | [permissions](../../convex/lib/permissions.ts), [API-key authorization](../../convex/lib/apiKeyAuth.ts), [account privacy](../../convex/accountPrivacy.ts), [Clerk request boundary](../../src/proxy.ts), and [account privacy UI](../../src/components/account-privacy-controls.tsx) | Current implementation evidence; the capability ledger records what remains partial or unknown |
| Project tracker | [Guide](../tracker/GUIDE.md), [generated owner reader](../tracker/board.html), Cards and Work Orders under `docs/tracker/` | Current repository source for scope, approval, handoff and evidence; Card `MOV-0001` records external fast-lane proof separately |

## Maintenance and claim verification

This document is stable product philosophy; its capability examples are a
dated evidence map and can drift.

Before changing a public page, onboarding flow, signed-in shell, product
description, AI setup guide, or integration guide:

1. classify every material claim with one of this document's five alignment
   statuses;
2. verify deployed **Current/verified** claims against the exact environment and relevant user
   path—not only source code, a merged pull request, provider configuration, or
   an older production observation;
3. attach an owner and active delivery reference to **In design / committed —
   Coming soon**;
4. default unverified, partial, or unscheduled claims to **Later** or omit them;
5. verify trust-sensitive wording against current authentication, data,
   tool/API, actor-scope, operation-permission, sharing, and provider behavior;
6. recheck every MCP door before claiming tool parity: canonical stateless
   OAuth, persisted compatibility OAuth and API-key HTTP/stdio intentionally do
   not share one registry;
7. update the capability evidence date, source commit, and evidence when status
   changes; and
8. keep the Markdown and HTML companion synchronized in the same commit.

Before naming MCP or a specific AI client as deployed **Current/verified**, prove the real endpoint,
authentication flow, caller and move isolation, exact documented tool list,
supported-client setup, and an end-to-end
context → work → save → human-inspection result. Before naming a provider-style
connection, prove consent, scope, credential handling, revocation, failure
behavior, freshness, and the exact user path. Before naming an external action,
prove the chosen AI, scope, permitted data, operation/action category, owner
approval, expiry/revocation, handoff receipt, attributable result or failure,
error handling, and recovery boundaries. Keep the proof explicit that Moving
passed an authorized handoff rather than taking the outside action itself.

Changes to the one-sentence identity, “Think of it as…” facets, Assist family
model, user-owned-data and scoped-authority principle, user authority,
cross-product boundary, or trust/non-goal boundaries require explicit
product-owner approval.
Evidence-led capability updates may change without redefining the philosophy.

## Document changelog

- **1.7.1 · 2026-08-14** — recorded the verified production path from an exact
  personal Queue directive through canonical OAuth MCP to linked Queue and Move
  overview results, while preserving the unchanged Queue state, chosen-AI
  attribution, bounded authority, and exact client/session/fixture cleanup.
- **1.7.0 · 2026-08-13** — recorded the shipped Assist With Moving identity and
  working first run after PR `#184`: the public entry preserves the requested
  route through the existing Clerk-bound host, visible public/signed-in/agent
  surfaces use the current product name, and AI Connections leads with hosted
  OAuth. The retained empty identity verified sign-in, workspace, Queue and AI
  setup; the temporary session was revoked. A Clerk/OAuth/DNS/provider-domain
  cutover, live authenticated mobile proof and every-browser proof remain
  Partial / Later rather than implied.
- **1.6.3 · 2026-08-13** — promoted the canonical OAuth move workflow to exact
  named-client production proof after PR `#182` repaired Clerk's observed
  no-`aud` DCR token compatibility. The retained-account official-SDK loop
  completed all eight tools, durable source-backed save, replay, correction,
  normal Move-overview reflection, grant/client/session cleanup, and hard purge.
  Private media, simultaneous multi-client isolation, client-product reconnect,
  and canonical OAuth Queue transitions remain Partial / Unknown.
- **1.6.2 · 2026-08-12** — recorded the first sanctioned Moving-only production
  test identity and real named-client consent/token exchange. The run exposed
  Clerk's no-`aud` DCR access-token shape before any MCP data write; `MOV-0029`
  owns the exact-issuer compatibility repair, protected release, complete
  tool/UI rerun, and cleanup proof. Private media remains Unknown.
- **1.6.1 · 2026-08-12** — replaced the stateless MCP candidate labels with
  exact protected-release evidence: PR `#180`, merge `0a5e0eb`, post-merge
  Actions run `31652048912`, Convex-backed Production deployment
  `dpl_AxReSqDrxvy6vMoL13Q5PYumxmPz`, public OAuth/resource and door-boundary
  proof, signed-out privacy, and an official SDK anonymous-client challenge.
  Named-client consent/refresh/private-media proof remains Partial / Unknown.
- **1.6.0 · 2026-08-12** — reconciled the released four-state Queue and the
  protected-release candidate for Moving's first stateless OAuth MCP: eight
  bounded workflow tools, server-derived identity, replay-safe complete-result
  saves, web-visible planning records, `/ai.txt`, distinct compatibility/API-key
  doors, and an explicit hold on canonical OAuth Queue transitions. Repository
  and isolated synthetic proof are labeled separately from production and
  named-client proof; the complete Move Brief and granular chosen-AI grant
  remain Partial/Later.
- **1.5.0 · 2026-08-11** — synthesized Scott's approved Moving direction into
  one connected product model: simple-to-complex progression; a
  permission-filtered Move Brief; collaboration-first owner, partner,
  move-only helper, chosen-AI and link-recipient roles; Document Memory / Move
  Evidence Packets; source/time/actor decision history; and post-move claims,
  reimbursement, tax-source, warranty and lessons continuity. Existing
  repository pieces remain labeled **Current/verified partial foundations**;
  the connected experiences remain **Later / unverified**. No Queue code,
  schema, workflow, provider, user data or production behavior changed.
- **1.4.0 · 2026-08-09** — applied Scott's clarified person / product /
  chosen-AI boundary throughout identity, Queue, grants, privacy, sharing,
  provenance, capability truth, trust, language and design guidance. Moving
  governs only its own tools, data, record operations and recorded handoffs;
  it does not police external conversations or independently act in the world.
  Added the complete authority dimensions and honest **Later / unverified**
  handoff label without changing Queue code, schemas, providers, data or public
  capability claims.
- **1.3.1 · 2026-08-08** — reattested Moving against Assist With Sites Core
  v1.6.3 and its source digest; aligned navigation to the clarified §16 tracker,
  publishing and launch contract and §17 setup, retrofit and handoff packages;
  reaffirmed Cards / Work Orders / Guide as durable current-work truth with
  Linear optional only; and reconciled the philosophy's fast-lane status with
  the completed provider receipts in Card `MOV-0001`. No tracker mechanics,
  application behavior or provider policy changed.
- **1.3.0 · 2026-08-08** — aligned to Assist With Sites Core v1.6.2;
  installed and linked Moving's repo-owned Cards / Work Orders / Guide tracker;
  adopted the exact fail-closed state-versus-software publication contract;
  made Linear optional historical context rather than a project gate; and kept
  provider proof explicitly pending until GitHub Actions, Vercel's zero-build
  record, and the retained live production deployment agree for one useful
  state commit.
- **1.2.0 · 2026-08-07** — renamed the product's canonical package from Core
  Philosophy to Project Philosophy under the Assist With Sites v1.5.0
  hierarchy; added the required reproducible alignment record and operational
  reference map; linked the canonical source from README and AI instructions;
  and retained the complete Moving-specific purpose, objects, workflows,
  evidence model, experience and design direction.
- **1.1.0 · 2026-08-07** — derived this product document explicitly from
  Assist With Sites Core Philosophy v1.4.4; added the evidence-backed adoption
  matrix; adopted the family Queue language and bounded directive rule; aligned
  capability labels, deletion truth, shared paths, tracker separation and
  website launch stages; framed the family layer as a shared trust/operations
  chassis rather than a product template; kept native review as a concise Later
  guardrail; and preserved Moving's domain model, recipient workflows,
  information architecture, density, voice and editorial art direction without
  claiming implementation changes.
- **1.0.0 · 2026-07-30** — established the initial canonical Moving product
  identity, household-home-move starting point, durable information model,
  authority boundaries, repository evidence ledger and synchronized HTML
  reader.

## Evidence references

The verified repository-foundation boundary in this revision was reconciled
against:

- `README.md`
- `docs/api-and-mcp.md`
- `convex/schema.ts`
- `convex/lib/permissions.ts`
- `convex/lib/roles.ts`
- `convex/lib/apiKeyAuth.ts`
- `convex/lib/queueAccess.ts`
- `convex/lib/ingestionQueue.ts`
- `convex/lib/audit.ts`
- `convex/audit.ts`
- `convex/accountPrivacy.ts`
- `convex/mcp.ts`
- `convex/mcpToolsQueue.ts`
- `convex/mcpToolsSetup.ts`
- `convex/mcpToolsWrite.ts`
- `mcp-server/capabilities.mjs`
- `mcp-server/movingmanifest-mcp.mjs`
- `src/app/(marketing)/page.tsx`
- `src/app/(marketing)/features/page.tsx`
- `src/app/(marketing)/ai/page.tsx`
- `src/app/(marketing)/ai/start/page.tsx`
- `src/app/(marketing)/privacy/page.tsx`
- `src/app/(marketing)/updates/page.tsx`
- `src/app/(product)/admin/page.tsx`
- `src/app/(product)/settings/page.tsx`
- `src/app/layout.tsx`
- `src/app/manifest.ts`
- `src/components/account-privacy-controls.tsx`
- `src/components/app-shell.tsx`
- `src/components/ingestion-queue-list.tsx`
- `src/components/public-page-chrome.tsx`
- `public/llms.txt`

These sources describe the checked-out implementation and its current
positioning. They do not prove production deployment, configuration, client
compatibility, or authenticated user behavior. When they conflict with this
document about product identity or language, this document governs identity;
when they contain newer capability evidence, reverify the claim and update this
document's dated ledger. Historical and machine-facing names must remain intact
until their own compatibility and cutover plans authorize change.

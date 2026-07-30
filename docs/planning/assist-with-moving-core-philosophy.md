# Assist With Moving Core Philosophy

> **Philosophy status:** Canonical product identity and claim boundary
>
> **Capability evidence last verified:** 2026-07-29
>
> **Scope:** Product truth, language, trust, and design direction—not an
> implementation, rename, release, or deployment claim

This document defines what Assist With Moving is, how it fits the Assist
family, and which claims its public and signed-in experiences may make. It
supersedes checklist-first or inventory-only positioning when that positioning
conflicts with this identity. The current repository and public pages still use
the MovingManifest name in many places; this philosophy does not claim that an
Assist With Moving rename, domain change, provider change, or production
cutover has shipped. Execution plans, roadmaps, release notes, and provider
runbooks remain authoritative for delivery status.

## How to use this document

Read the document in order when making a product-level decision. For focused
work, use this reading map:

| Reader | Start with | Questions answered |
|---|---|---|
| Product owners | [One-sentence identity](#one-sentence-identity), [Assist family model](#the-assist-family-model), [Shared authority](#user-owned-data-and-scoped-authority), and [Trust boundaries](#trust-boundaries-and-non-goals) | What Moving is, how responsibility is divided, who owns the data, and what the product must not imply |
| Implementers | [Shared authority](#user-owned-data-and-scoped-authority), [Moving loop](#the-moving-loop), [Durable information model](#durable-information-model), [Visibility](#human-visibility-and-visualization), and [Maintenance](#maintenance-and-claim-verification) | What must persist, how work resumes, where controls belong, and which claims require proof |
| AI workers and integration builders | [Assist family model](#the-assist-family-model), [Shared authority](#user-owned-data-and-scoped-authority), [Moving loop](#the-moving-loop), and [Trust boundaries](#trust-boundaries-and-non-goals) | What your AI does, how scoped tools may be used, and which move and operation boundaries apply |
| User-facing writers and designers | [Capability ledger](#capability-truth-and-ledger), [Language rules](#language-rules), and [Design implications](#public-homepage-and-future-shell-implications) | What may be claimed now, which words to use, and how the philosophy should appear in the experience |

Anyone publishing a capability claim must read both
[Capability truth and ledger](#capability-truth-and-ledger) and
[Maintenance and claim verification](#maintenance-and-claim-verification).

## One-sentence identity

**Assist With Moving is a durable, user-controlled move-planning workspace
shared by you and your chosen AI, where the full changing plan can be organized,
remembered, understood, and steered over time.**

Inventory, packing, timelines, places, layouts, transport, vendors, costs,
paperwork, and move-day coordination are capabilities that can live on this
foundation. None of them alone is the product identity.

## The Assist family model

Assist products separate three responsibilities:

- **Your AI reasons and does the work you direct.** It may help research
  choices, compare places, organize possessions, build a timeline, prepare
  questions, draft communications, identify risks, or carry out authorized
  work in other services available to it.
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

The Assist family name does not create a shared database or a universal grant.
Any connection between Moving and another Assist product must be explicit,
understandable, reviewable, and revocable. A connection must identify which
records or summaries may cross, in which direction, for which purpose, and
under whose authority.

## User-owned data and scoped authority

The person owns their moving data. Opening a move, joining a household, or
connecting an AI must never silently grant blanket authority over it.

Each person and each chosen AI independently receives explicit authority for a
selected move, area, or record. The following operations are separate grants:

- **retrieve or read** information;
- **add or create** new information;
- **update** existing information;
- **delete** information; and
- **promote or publish** information when Moving supports a trusted, reusable,
  shared, or public state.

Read is not write. Create is not update or delete. Permission to propose work
is not permission to accept it. Permission to update one move is not permission
to update another. Permission to share one packet is not permission to publish
the underlying private move.

Every grant should make five facts visible:

1. **Actor:** which person or chosen AI receives the authority;
2. **Scope:** which move, area, record type, or record it covers;
3. **Operations:** which of read, create, update, delete, and applicable
   promote or publish are allowed;
4. **Duration and status:** whether the grant expires, is active, or has been
   revoked; and
5. **History:** who granted or changed it, when, and what the actor did with it.

An AI cannot grant itself authority, inherit another actor's authority, or
expand a grant merely because it can see the workspace. Access should be
editable and revocable, and material reads and changes should preserve acting
identity, scope, time, and action in provenance or audit history.

Permission and operating policy are different:

- **Permission** answers whether the actor may perform an operation at all.
- **Operating policy** answers how already-permitted work proceeds—for example
  direct saving, a preview, batch review, or an explicit checkpoint.

Automation and review preferences never create permission. A retrieve-only AI
does not become able to update data because a user selected “automatic.” Within
a real update grant, however, the user may choose efficient direct saving
instead of requiring approval for every low-risk correction.

The current repository has meaningful foundations for roles, move-specific
participants, scoped and revocable API keys, move restrictions, sensitive-field
visibility, share-link actions, owner kill switches, and audit events. It does
not yet prove the complete independent per-person and per-AI operation matrix
described here, nor a complete setup, editing, revocation, promotion, and
publishing experience for every move area and record.

## The moving loop

A move should remain useful from the first idea through completion and later
reference. Its durable loop is:

1. **Frame the move.** Record the kind of move, people, places, timing,
   constraints, goals, and what “done” means. The shape may be household,
   business, temporary, travel-related, downsizing, renovation-adjacent, or
   something else.
2. **See the current state.** Retrieve a compact recap or the relevant detailed
   context: decisions already made, active work, open questions, risks,
   dependencies, recent changes, and next actions.
3. **Add work and evidence.** Capture instructions, tasks, notes, questions,
   photos, documents, estimates, research, items, places, or other evidence
   with source and scope.
4. **Reason and act within authority.** Your AI may organize, research, compare,
   draft, calculate, or perform authorized outside work while Moving enforces
   its own scoped data permissions.
5. **Save the useful result.** Store structured records, the evidence and
   reasoning that matter, uncertainty, responsible actor, time context, and
   follow-up—not merely a chat transcript.
6. **Review in proportion to risk.** Direct saves, previews, batch review, and
   explicit approval are operating choices inside granted permission. Higher
   consequence and lower confidence should create stronger checkpoints.
7. **Revise without erasing the story.** A changed date, destination, vendor,
   budget, disposition, or plan should preserve what changed, why, and what
   downstream work must be reconsidered.
8. **Resume and finish.** A person or later AI should be able to continue from a
   compact current-state recap, drill into full history, close remaining work,
   and retain the useful record after the move.

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
allowing flexible details for moves that do not fit a household template.

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
include requester, owner, scope, instructions, evidence, authority needed,
state, claim or lease, blockers, question, result references, and resume
context.

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

## Human visibility and visualization

The human workspace should answer these questions without technical knowledge:

1. Which move and area am I viewing?
2. Who and which chosen AIs may read here?
3. Which of them may create, update, delete, promote, or publish here?
4. What is the current plan, and how complete or ready is it?
5. What is active, waiting, blocked, or resumable?
6. What needs my judgment, information, or approval?
7. Where did an important fact or decision come from, and how fresh is it?
8. What changed, who or what changed it, and what was affected?
9. What risks, dependencies, deadlines, costs, or capacity limits deserve
   attention?
10. What can I correct, export, delete, undo, revoke, or recover?

Useful views may include:

- a phase timeline with milestones, dependencies, and drift;
- a place and route view with privacy-aware detail;
- a room, box, and item hierarchy;
- a layout or placement plan;
- a transport and capacity plan;
- a budget and estimate comparison;
- a decisions-and-changes log;
- a work board showing active, waiting, blocked, and completed work;
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

## Capability truth and ledger

Every user-facing capability must have exactly one public status:

| Status | Meaning | Claim rule |
|---|---|---|
| **Now** | Shipped in the environment being described and verified through the relevant user path | May use present tense and a direct action only after current proof |
| **Coming soon** | Approved and actively scheduled, with a defined user outcome and an owned delivery path | Must be labeled “coming soon”; no direct action, fake interaction, or implied availability |
| **Later** | A desired direction, exploration, partial foundation, or unscheduled capability | May appear only as future direction, never as a promise or near-term commitment |

If evidence is missing, stale, contradictory, or limited to local source code,
the public claim does not qualify as **Now**. If desired work lacks an active
delivery commitment, it is **Later**, not **Coming soon**.

### Dated repository evidence ledger

> **Time-sensitive evidence — verified 2026-07-29:** This table describes the
> checked-out repository at commit `3c28649`. It is not proof that the same
> capability is deployed, configured, reachable through a supported client, or
> usable by a real account in production.

| Capability area | Repository evidence | Honest product interpretation |
|---|---|---|
| Move projects | Structured move type, status, origin/destination, date range, notes, PCS fields, and archive state | **Repository-verified foundation.** Broader move shapes and flexible project details remain design direction |
| People and scope | Households, memberships, move-only participants, roles, invitations, sensitive-field visibility, access disablement | **Partial foundation.** Not the complete independent per-actor read/create/update/delete/promote/publish matrix |
| Inventory and packing | Items, planned items, boxes, contents, spaces, photos, disposition, values, review flags, archive or soft-delete paths | **Repository-verified foundation.** Inventory is a major capability, not the whole identity |
| Transport and layouts | Resources, zones, trips, trip spaces, capacity, assignments, floor plans, proposals, reversible plan operations, SVG snapshots | **Repository-verified foundation.** No claim of maps, live routing, booking, or provider execution |
| Evidence and documentation | Private photo records, research sources, documentation profiles, exports, recipient-safe fields, scoped and revocable share links | **Repository-verified foundation.** Sharing is explicit; nothing here supports automatic publication |
| Questions and queue | Derived readiness questions; a per-user capture queue with instructions, media, claim expiry, delegation, AI question, summary, and result references | **Partial foundation.** Not a general attachable question system or move-wide task queue |
| History and provenance | Move-scoped audit logs, actor and API-key fields on selected records, timestamps, review states, research checks, and plan operation inverses | **Partial foundation.** Not a complete decision, dependency, and revision history |
| API and MCP source surfaces | Documented REST API, a remote OAuth MCP gateway in `convex/mcp*.ts`, and a separate stdio/HTTP MCP server in `mcp-server/`, with scoped operations | **Repository-verified source surface only.** Reverify deployment, auth, client setup, exact tools, and end-to-end behavior before a public **Now** claim |
| Costs | Item and replacement values, sale prices and research, planned-item estimate, internal AI-job cost | **Partial foundation.** No general move budget, vendor quote, payment, or reimbursement system |
| Collaboration and publishing | Household access, move participants, documentation profiles, explicit scoped share links and revocation | **Partial foundation.** Broader collaboration is not automatic; public or reusable promotion needs explicit scope and authority |
| General tasks, dependencies, decisions, risks, vendors, and appointments | No complete first-class cross-move model verified | **Later** |
| Automatic import, calendars, maps, live providers, vendor communication, service arrangement, signing, buying, or booking | No qualifying repository and user-path proof verified | **Later or outside Moving itself** |
| Cross-product Assist connections | No qualifying connection contract or user-path proof verified | **Later** and must be explicit, reviewable, and revocable |

No item in this philosophy is designated **Coming soon**. Inclusion here or in
another planning document is not an active delivery commitment.

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

## Language rules

Public and product language should:

- say **“your AI”** when referring to the AI the user chooses;
- say **“move,” “plan,” “work,” “queue,” “question,” “decision,” “evidence,”
  “history,”** and **“current recap”** instead of generic AI-platform jargon;
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
- distinguish observing, searching, retrieving, and reading from creating,
  updating, deleting, promoting, and publishing;
- name the actual household, move, area, record, person or AI, and permitted
  operations when describing access;
- label uncertainty, freshness, authority, and future capability status
  directly; and
- use **“queue”** for new work or instructions to your AI, not as a blanket
  approval gate or a synonym for every task.

Avoid **“agent”** in user-facing copy when **“your AI”** communicates the idea.
Technical documentation may retain established names such as API-key actor,
agent context, or MCP tool when compatibility or implementation precision
requires them.

Do not say **“automatic import,” “connected calendar,” “live map,” “vendor
booking,” “AI makes the arrangements,” “works with every AI,” “one click,”** or
name a specific client as currently supported without exact current proof.
Repository source, a route, a tool manifest, a mockup, or a plan is not enough
for a public availability claim.

The current implementation name **MovingManifest** may remain in technical,
compatibility, historical, and delivery contexts until an approved product
cutover says otherwise. Do not describe **Assist With Moving** branding,
domains, redirects, OAuth identity, or provider configuration as shipped based
on this philosophy.

## Public homepage and future shell implications

These are design constraints, not a UI specification or authorization to
change the application.

### Public homepage

- Lead with the durable, evolving move plan shared by a person and their AI.
- Show a move as a changing project, not a one-time checklist or inventory
  catalog.
- Explain the Assist family model: your AI reasons, Moving remembers and
  organizes, and you remain the authority.
- Show the moving loop before listing features.
- Demonstrate timeline, places, work, decisions, inventory, costs, evidence,
  and a current recap as one coherent system—even when future examples must be
  clearly illustrative.
- Explain user-owned data and actor-specific operation authority without
  depicting read access as blanket write authority.
- Use a visible **Now / Coming soon / Later** ledger when future work appears.
- Keep current MovingManifest implementation naming distinct from an unshipped
  Assist With Moving product or domain cutover.
- Use synthetic, clearly labeled illustrations. Do not show fake live maps,
  connected calendars, vendor conversations, bookings, cross-product data, or
  autonomous purchases.
- Prefer an editorial field-guide character—route notes, annotated plans,
  packing labels, and a calm sense of forward motion—over chatbot, generic
  SaaS, or mover-clip-art styling.

### Future signed-in shell

- Center the selected move, current phase, recent material changes, and compact
  current-state recap.
- Make **active**, **waiting**, **blocked**, **needs you**, and **resumable**
  work immediately understandable.
- Treat the queue as the front door for instructions to your AI while keeping
  tasks, decisions, evidence, and records appropriately distinct.
- Keep selected move and area scope, acting identity, independently allowed
  operations, and revocation controls visible.
- Let questions and notes appear in the context of the move, task, place, item,
  decision, cost, vendor, or evidence they concern.
- Put source, date, freshness, author, authority, review state, and uncertainty
  near the information they qualify.
- Make changes and downstream consequences inspectable; expose history,
  reversal, or recovery only where the underlying capability supports it.
- Connect timeline, places, inventory, transport, costs, documents, and
  readiness through traceable views rather than duplicating truth.
- Keep manual human workflows complete. AI assistance should extend the
  workspace, not make a person's own plan inaccessible without an AI.
- Keep connection and capability status honest inside the product as well as on
  the public site.

## Maintenance and claim verification

This document is stable product philosophy; its capability examples are a
dated evidence map and can drift.

Before changing a public page, onboarding flow, signed-in shell, product
description, AI setup guide, or integration guide:

1. classify every material claim as **Now**, **Coming soon**, or **Later**;
2. verify **Now** against the exact deployed environment and relevant user
   path—not only source code, a merged pull request, provider configuration, or
   an older production observation;
3. attach an owner and active delivery reference to **Coming soon**;
4. default unverified, partial, or unscheduled claims to **Later** or omit them;
5. verify trust-sensitive wording against current authentication, data,
   tool/API, actor-scope, operation-permission, sharing, and provider behavior;
6. recheck both MCP implementations before claiming tool parity: the remote
   OAuth gateway in `convex/mcp*.ts` and the separate server in `mcp-server/`;
7. update the capability evidence date, source commit, and evidence when status
   changes; and
8. keep the Markdown and HTML companion synchronized in the same commit.

Before naming MCP or a specific AI client as **Now**, prove the real endpoint,
authentication flow, caller and move isolation, exact documented tool list,
supported-client setup, and an end-to-end
context → work → save → human-inspection result. Before naming a provider-style
connection, prove consent, scope, credential handling, revocation, failure
behavior, freshness, and the exact user path. Before naming an external action,
prove authorization, preview or confirmation policy, execution receipt, error
handling, and recovery boundaries.

Changes to the one-sentence identity, Assist family model, user-owned-data and
scoped-authority principle, user authority, cross-product boundary, or
trust/non-goal boundaries require explicit product-owner approval.
Evidence-led capability updates may change without redefining the philosophy.

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
- `convex/mcp.ts`
- `convex/mcpToolsQueue.ts`
- `mcp-server/capabilities.mjs`
- `mcp-server/movingmanifest-mcp.mjs`
- `src/app/(marketing)/page.tsx`
- `src/app/(marketing)/features/page.tsx`
- `src/app/(marketing)/ai/page.tsx`
- `src/app/(marketing)/privacy/page.tsx`

These sources describe the checked-out implementation and its current
positioning. They do not prove production deployment, configuration, client
compatibility, or authenticated user behavior. When they conflict with this
document about product identity or language, this document governs identity;
when they contain newer capability evidence, reverify the claim and update this
document's dated ledger. Historical and machine-facing names must remain intact
until their own compatibility and cutover plans authorize change.

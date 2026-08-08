# Assist With Moving — Project Philosophy

> **Project philosophy status:** Canonical product identity and claim boundary
>
> **Document version:** 1.3.1
>
> **Capability evidence last verified:** 2026-08-08 against `origin/main`
> commit `4a3d9e7` and the state-publication receipts described in the evidence
> record below
>
> **Scope:** Product truth, language, trust, and design direction—not an
> implementation, rename, release, or deployment claim

> **Core alignment record**
>
> **Document:** Assist With Moving — Project Philosophy
>
> **Canonical:** `docs/planning/assist-with-moving-project-philosophy.md`
>
> **Family Core:** Assist With Sites — Core Philosophy v1.6.3 (2026-08-08)
>
> **Aligned:** 2026-08-08 — repository implementation, public source claims,
> tracker, GitHub protection/workflow and Vercel integration reviewed against
> the complete v1.6.3 contract, including its clarified §16 operating contract
> and §17 setup, retrofit and agent-handoff structure
>
> **Adopted:** the three-way promise and “your AI” language; shared route and
> truth-surface direction; the four-state Queue and bounded directive rule;
> activity, provenance, identity, privacy and access rules; the accessible
> light/dark floor; website launch sequencing; Cards / Work Orders / Guide;
> and the exact fail-closed state-versus-software publication boundary
>
> **Deferred/gaps:** exact Queue vocabulary and route; `/ai.txt`;
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
> repository baseline `4a3d9e7`; `docs/tracker/`; the software PR and live
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
conflicts with this identity. The current repository and public pages still use
the MovingManifest name in many places; this philosophy does not claim that an
Assist With Moving rename, domain change, provider change, or production
cutover has shipped. Execution plans, roadmaps, release notes, and provider
runbooks remain authoritative for delivery status.

The family Core is normative for shared trust, route, truth and operational
conventions. Where an older statement in this document conflicts in that shared
layer, the Core wins unless this document labels and justifies an
intentional Moving-specific difference. In a domain-specific area, the more
specific or expressive Moving direction remains authoritative unless it weakens
one of those shared guarantees. This document records product deltas and
evidence; it does not copy or publicly expose the private family contract.

## Core v1.6.3 adoption and contradiction matrix

Core v1.6.3 reorganizes, but does not change, Moving's installed operating
contract: §16.1 owns tracker rules, §16.2 owns state-versus-software publishing
and provider proof, and §16.3 owns launch posture. Section 17 applies those
rules through new-project setup, retrofit and agent-handoff packages; it is not
a competing local policy or work tracker.

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
| Person / Assist workspace / your AI | The product philosophy, `/ai` copy, scoped keys and OAuth gateway separate the person's authority, Moving's durable record and the person's chosen AI. Older public copy still often says “AI assistant” and leads with inventory rather than the full three-way promise. | **Current/verified foundation; Later alignment gap.** Adopt “Assist your AI, so it can assist you with moving” and the house sentence “Assist you and your AI with every part of your move.” |
| Domain promise and objects | Moves, households, people, spaces, items, planned items, boxes, photos/evidence, transport resources/zones/trips, layouts, documentation profiles, exports and share links are modeled in `convex/schema.ts`. General tasks, budgets, vendor records and decision objects are not complete first-class models. | **Current/verified foundation** for the named records; unscheduled extensions are **Later**. Moving's vocabulary is retained. |
| Product Queue versus internal Tracker | `/app/queue` and move Queue routes expose the capture/ingestion Queue. `docs/tracker/` now holds the separate repo-owned Cards / Work Orders / Guide package and generated owner readers. | The separation is **Current/verified in repository source**. The Queue is user product work; the Tracker is internal build coordination. Card `MOV-0001` records the completed same-SHA GitHub, Vercel and retained-production proof for the state fast lane. |
| Queue states | Stored capture states are `queued`, `claimed`, `processed`, `needsInput`, `resolved` and `discarded`; current UI groups them as To do, Working, Review/Needs action and Done/Archive. | **Current/verified but nonconforming.** The family destination is exactly **Needs you / Working / Waiting for your AI / Done**. Backend and frontend retrofit is **Later**, not a documentation rename of current behavior. |
| Directive authority | Capture instructions can be claimed by an authorized AI; tools enforce move/owner access and claims. Older prose described broad authorized progress but did not state the family directive boundary. | **Family rule adopted now in product truth:** a directive authorizes only reversible, in-scope record changes it plainly requests. New objectives, destructive changes, publishing, purchases, identity/access changes and outside-world consequences return to **Needs you**. Implementation conformance beyond capture remains **Later**. |
| MCP and `/ai` | Source routes exist at `/mcp` with `/mcp/connect` alias and a separate API-key `/api/mcp`; public `/ai` and `/ai/start` pages exist. The repo serves `llms.txt`/`llms-full.txt`, not `/ai.txt`; AI settings live at `/settings/ai-connections` and within `/settings`. | **Current/verified source surfaces; Unknown production proof.** `/ai.txt` and canonical `/settings/ai` are **Later alignment gaps**. `/ai` must list only live, end-to-end-proven tools. |
| Activity and provenance | `auditLogs`, move/object queries, item activity UI, plan journals and many user/API-key/agent write events preserve actor and time. Coverage and human-readable before/after/evidence detail are not universal. | **Current/verified partial foundation.** Complete “if an AI did it, the record says so” coverage is **Later**. |
| Access and sharing | Clerk-backed household and move participants, roles, move restrictions, scoped/revocable API keys, documentation profiles and revocable `/share/<token>` links exist in source. New records do not share a single family visibility field, and current links may expire or permit selected recipient actions. | Private-by-default foundations are **Current/verified**. Family **Private / Unlisted / Trusted / Public** vocabulary and shared-data screen are **Later**. Action-capable recipient links are an **intentional product-specific difference**, not “Unlisted.” |
| Identity and deletion | Identity is site-specific Clerk. Settings can export JSON, stage deletion, anonymize the Convex profile, revoke keys/share links and disable memberships/grants. It does not prove Clerk identity deletion, attachment/Backblaze purge, or removal of all personal/content-bearing history; `/delete-account` is absent. | Per-site identity and export are **Current/verified**. Family-complete deletion and `/delete-account` are **Later gaps**. Never describe current anonymization as full account-data deletion. |
| Public truth and Coming soon | Source includes home, separate FAQ, `/ai`, `llms.txt`, and `/updates`. The home page does not contain the FAQ, `/ai.txt` is absent, and source presence does not prove live claims. | **Current/verified source foundation; Unknown deployment.** Public claims require an environment/user-path proof. **Coming soon** is reserved for approved, scheduled soft-launch work; none is assigned here. |
| `/me`, `/admin`, and stats | A REST `/api/v1/me` context endpoint and an owner-gated app `/admin` surface exist. There is no family `/me` page; current admin source focuses operations and does not prove the family split between meaningful personal stats at `/me` and owner usage/operations stats at `/admin`, or every public-content maintenance job. | `/admin` is a **Current/verified source foundation** with **Unknown production proof**. Family `/me`, the personal/owner stats split and full admin destination are **Later**. |
| Support Desk | No Assist With Life Support Desk link, Moving source key or page-key allowlist is present in the inspected public shell. The family desk itself is specified but not proven deployed. | **Later alignment gap.** Do not publish a pretend or dead support control. |
| Product identity and primary experience | This document defines a household-first, evidence-rich moving workspace organized around a changing move rather than a generic family-site layout or feature checklist. | **Intentional product-specific difference and controlling domain direction.** The shared chassis does not standardize Moving's objects, workflows, information architecture, content, density, voice or experience shape. |
| Distinct design and light/dark access | The product has a distinct MovingManifest earth/route aesthetic, accessible focus patterns, a responsive signed-in shell and light/dark token sets, but `src/app/layout.tsx` hard-locks the app to dark mode. The family contract names an Assist With Moving palette, but the shared chassis does not require visual homogenization. | Distinct design, phone shell and dark theme are **Current/verified foundations**. First-class accessible light mode is **Later**. Palette and typography remain product-design decisions; the philosophy reader's editorial route-note art direction is an **intentional product-specific difference**, not proof of app branding. |
| Dense information | REST lists are bounded and paginated; several signed-in views provide tables/cards, filters and responsive detail. The repository does not prove every dense collection uses indexed bounded access, table-default behavior or remembered views. | **Current/verified partial foundation; Later** safety and performance conformance. Moving's useful information density and view design remain product-specific. |
| Family navigation | No shared Assist With Life catalog row or fallback roster was found in the public shell. | **Later alignment gap.** |
| Cards / Work Orders / Guide | `docs/tracker/` contains Moving-specific Cards, canonical Work Orders, Guide, metadata, generated Kanban/Work Orders readers, exact state helper, GitHub classifier and Vercel classifier. README and AI instructions link the package. | **Current/verified repository source and provider proof.** These repository-owned records are the durable current-work truth; Linear is optional historical or portfolio context only and never a gate. Card `MOV-0001` preserves the exact proof that established the fast lane; configuration alone would not have done so. |
| Launch stages and later native guardrail | README names a production domain and public copy says active development, but this local review does not prove that the real site is currently reachable, listed by Assist With Life, Tier A-complete or deliberately marketed. | **Unknown current stage.** Prioritize **soft website launch → big/public website launch**. Native/app-store work is only a concise **Later** guardrail after substantial recurring website use, not a current product requirement or design driver. |

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
  draft, calculate, and carry out authorized outside work under your direction.
- **Assist With Moving remembers the move.** It preserves structured context,
  instructions, decisions, evidence, history, open questions, and a current
  recap beyond one chat or AI session.
- **Assist With Moving organizes the work and provides moving tools.** It gives
  plans, places, tasks, belongings, costs, documents, timing, and coordination
  durable records, retrieval, queues, and understandable views.
- **You can see and steer it.** You can understand the evolving plan, correct
  it, choose who or which AI may observe or change each part, and revoke that
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
- permission for any person or AI to observe, change, share, buy, book, sign, or
  publish beyond an explicit grant; or
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

Identity remains site-specific. A Moving login, session, grant or deletion does
not silently sign the person into another Assist site, reach into another
site's records or delete another site's account.

The family deletion destination is removal, not deactivation or anonymization:
record deletion removes the record, its attachments and content-bearing
history, allowing only a minimal content-free tombstone when necessary; account
deletion removes the site-specific Clerk identity and associated personal data,
records, media objects, attachments, share links and AI grants across every
processor. The current source only proves a narrower export-plus-anonymization
workflow that revokes access paths and leaves shared household records. It is a
**Current/verified partial foundation**, not proof of family-complete deletion.

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
| Product owners | [One-sentence identity](#one-sentence-identity), [Think of it as…](#think-of-it-as), [Scope and non-goals](#what-moving-is-for-and-what-it-is-not), [Why not a quick feature?](#why-not-just-ask-your-ai-to-build-a-quick-feature), [Why not a conventional site?](#why-this-instead-of-a-conventional-moving-website), [Assist family model](#the-assist-family-model), [Shared authority](#user-owned-data-and-scoped-authority), and [Why trust matters](#why-the-family-and-trust-model-matters) | What Moving promises, why it should endure beyond one output or utility, what belongs inside its scope, who owns the data, and why continuity and authority stay together |
| Implementers | [Builder reference](#builder-reference-begins-here), [AI and queue](#how-your-ai-and-queue-work), [Moving loop](#the-moving-loop), [Durable information model](#durable-information-model), [Visibility](#human-visibility-and-visualization), [Operational references](#operational-references), and [Maintenance](#maintenance-and-claim-verification) | What must persist, how work begins and resumes, where controls belong, which changing implementation sources govern, and which claims require proof |
| AI workers and integration builders | [Builder reference](#builder-reference-begins-here), [AI and queue](#how-your-ai-and-queue-work), [Shared authority](#user-owned-data-and-scoped-authority), [Moving loop](#the-moving-loop), and [Trust boundaries](#trust-boundaries-and-non-goals) | Where work may begin, how queued handoffs and scoped tools work, and which move and operation boundaries apply |
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
- **moving and information contracts:** how a changing move, its records,
  provenance, questions, and completion state remain coherent;
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

**A directive grants bounded authority, not blanket control.** It authorizes
the person's AI to make reversible, in-scope Moving record changes that the
words plainly request and that an existing grant permits. It does not authorize
a new objective, destructive work, publishing, purchases, identity or access
changes, or consequential action outside Moving. Crossing one of those
boundaries, or encountering genuinely unclear scope, moves the item to **Needs
you** with the smallest exact question that unlocks it.

A normal to-do item may say only what should happen. A durable AI work handoff
must preserve enough meaning for useful progress across AI sessions:

- **scope:** the move, area, records, people, places, or items involved;
- **request and outcome:** the original instruction and what useful completion
  should produce;
- **priority and time context:** what matters first, relevant dates, and how
  urgency was decided;
- **context and evidence:** notes, sources, photos, documents, earlier
  decisions, and uncertainty the work depends on;
- **state and responsibility:** one of the four family states, plus who or which
  chosen AI last acted and when;
- **questions, blockers, and dependencies:** what prevents safe progress and
  what answer or event would unblock it; and
- **continuation and result:** the exact next step, saved outputs, material
  changes, and the compact handoff a later session should retrieve.

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
2. Which named people and chosen AIs are participants in this move?
3. Which of them may read, create, update, delete, promote, or publish here?
4. Which bounded share links exist, exactly what does each expose, when does it
   expire, and how can I revoke it?
5. What is the current plan, and how complete or ready is it?
6. What is active, waiting, blocked, or resumable?
7. What needs my judgment, information, or approval?
8. Where did an important fact or decision come from, and how fresh is it?
9. What changed, who or what changed it, and what was affected?
10. What risks, dependencies, deadlines, costs, or capacity limits deserve
   attention?
11. What can I correct, export, delete, undo, revoke, or recover?

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
| Move projects | Structured move type, status, origin/destination, date range, notes, PCS fields, and archive state | **Current/verified repository foundation.** Broader move shapes and flexible project details are **Later** |
| Named participant access | Households, named invitations, household-backed and move-only participants, roles, sensitive-field visibility, and access disablement | **Current/verified repository foundation** for inviting identified people. The complete independent per-actor operation matrix and every participant-management flow are **Later** |
| Inventory and packing | Items, planned items, boxes, contents, spaces, photos, disposition, values, review flags, archive or soft-delete paths | **Current/verified repository foundation.** Inventory is a major capability, not the whole identity |
| Transport and layouts | Resources, zones, trips, trip spaces, capacity, assignments, floor plans, proposals, reversible plan operations, SVG snapshots | **Current/verified repository foundation.** Maps, live routing, booking and provider execution are **Later or outside Moving** |
| Evidence and documentation | Private photo records, research sources, documentation profiles, exports, and recipient-safe fields | **Current/verified repository foundation.** Private evidence does not become shareable merely because a summary or packet exists |
| Questions and queue | Derived readiness questions; a per-user capture queue with instructions, media, claim expiry, delegation, AI question, summary, and result references | **Current/verified partial foundation.** A family-conforming general Queue and attachable question system are **Later** |
| History and provenance | Move-scoped audit logs, actor and API-key fields on selected records, timestamps, review states, research checks, and plan operation inverses | **Current/verified partial foundation.** Complete decision, dependency, revision and AI-activity coverage is **Later** |
| API and MCP source surfaces | Documented REST API, a remote OAuth MCP gateway in `convex/mcp*.ts`, and a separate stdio/HTTP MCP server in `mcp-server/`, with scoped operations | **Current/verified source surface only; Unknown deployment.** Reverify deployment, auth, client setup, exact tools, and end-to-end behavior before a public availability claim |
| Costs | Item and replacement values, sale prices and research, planned-item estimate, internal AI-job cost | **Current/verified partial foundation.** General move budgets, vendor quotes, payments and reimbursements are **Later** |
| Bounded link sharing | Documentation profiles plus move- or profile-scoped links with selected fields/actions, expiry, revocation, access metadata, and recipient comments | **Current/verified recipient-workflow foundation** and **intentional product-specific difference** from family Unlisted. General selected-plan, checklist, item-group and arbitrary-view links are **Later** |
| General tasks, dependencies, decisions, risks, vendors, and appointments | No complete first-class cross-move model verified | **Later** |
| Automatic import, calendars, maps, live providers, vendor communication, service arrangement, signing, buying, or booking | No qualifying repository and user-path proof verified | **Later or outside Moving itself** |
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
- name AI environments only as examples of user choice; never imply a preferred
  vendor or currently verified compatibility without exact proof;
- distinguish observing, searching, retrieving, and reading from creating,
  updating, deleting, promoting, and publishing;
- use **“invite”** for named participant access and **“share link”** for a
  bounded view that does not require workspace membership;
- lead first-time and public examples with a household home move; describe
  business, office, temporary, downsizing, and renovation-adjacent moves as
  compatible extensions, not equal opening personas or separate products;
- name what a link exposes—such as a selected plan, checklist, item group, or
  packet—rather than saying an entire move is “shared”;
- name the actual household, move, area, record, person or AI, and permitted
  operations when describing access;
- label uncertainty, freshness, authority, and future capability status
  directly; and
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

The current implementation name **MovingManifest** may remain in technical,
compatibility, historical, and delivery contexts until an approved product
cutover says otherwise. Do not describe **Assist With Moving** branding,
domains, redirects, OAuth identity, or provider configuration as shipped based
on this philosophy.

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
- Bridge the promise to the Assist model: your chosen AI reasons and works;
  Moving provides durable move memory, organization, tools, and visibility; and
  you remain the authority.
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
- Keep current MovingManifest implementation naming distinct from an unshipped
  Assist With Moving product or domain cutover.
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
- Center the selected move, current phase, recent material changes, and compact
  current-state recap.
- Make **Needs you**, **Working**, **Waiting for your AI**, and **Done** work
  immediately understandable. Resumability, blockers and the exact next step
  belong inside those states, not in additional state names.
- Treat the queue as the front door for instructions to your AI while keeping
  tasks, decisions, evidence, and records appropriately distinct. Each queue
  item should expose scope, intended outcome, priority, context and evidence,
  state, responsible actor, questions, blockers, and the exact next step.
- Keep selected move and area scope, acting identity, independently allowed
  operations, and revocation controls visible.
- Give **People with move access** and **Shared links** separate surfaces.
  People should show identity, role, scope, operations, and status; links should
  show the selected view, exposed fields, recipient actions, expiry, access
  history, and revoke control.
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

This checkout does not prove Moving's current stage. A configured domain,
source route, merged commit or PWA manifest is not operational or public-launch
proof.

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
| API, MCP and authorization architecture | [API and MCP guide](../api-and-mcp.md) | Authoritative guide to the separate OAuth gateway and stdio/HTTP server; claims still require implementation and running-path proof |
| Product and implementation intent | [MovingManifest AI build specification](../movingmanifest_ai_build_spec.md) | Historical design and implementation direction; useful context, not proof that a capability is current |
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
6. recheck both MCP implementations before claiming tool parity: the remote
   OAuth gateway in `convex/mcp*.ts` and the separate server in `mcp-server/`;
7. update the capability evidence date, source commit, and evidence when status
   changes; and
8. keep the Markdown and HTML companion synchronized in the same commit.

Before naming MCP or a specific AI client as deployed **Current/verified**, prove the real endpoint,
authentication flow, caller and move isolation, exact documented tool list,
supported-client setup, and an end-to-end
context → work → save → human-inspection result. Before naming a provider-style
connection, prove consent, scope, credential handling, revocation, failure
behavior, freshness, and the exact user path. Before naming an external action,
prove authorization, preview or confirmation policy, execution receipt, error
handling, and recovery boundaries.

Changes to the one-sentence identity, “Think of it as…” facets, Assist family
model, user-owned-data and scoped-authority principle, user authority,
cross-product boundary, or trust/non-goal boundaries require explicit
product-owner approval.
Evidence-led capability updates may change without redefining the philosophy.

## Document changelog

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

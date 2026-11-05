# Page inventory ? Assist With Moving

Run: `2026-11-05-playbook`. Baseline: `964eec223b8fb1ec3a3c8ff8926dd4c5806b2076`. All 50 baseline page files are accounted for. This maps the existing product; it does not claim implementation or runtime acceptance.

| Route | Playbook family | Preserve / implementation direction | Source |
| --- | --- | --- | --- |
| `/sign-in/[[...sign-in]]` | Focused session | Clerk authentication; preserve redirects and account actions | `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` |
| `/sign-up/[[...sign-up]]` | Focused session | Clerk authentication; preserve redirects and account actions | `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` |
| `/about` | Learning-reader ?3.10 | Preserve all current content, sources, code samples, copy actions and truthful links | `src/app/(marketing)/about/page.tsx` |
| `/ai` | Learning-reader ?3.10 | Preserve all current content, sources, code samples, copy actions and truthful links | `src/app/(marketing)/ai/page.tsx` |
| `/ai/start` | Learning-reader ?3.10 | Preserve all current content, sources, code samples, copy actions and truthful links | `src/app/(marketing)/ai/start/page.tsx` |
| `/claims-inventory` | Learning-reader ?3.10 | Preserve all current content, sources, code samples, copy actions and truthful links | `src/app/(marketing)/claims-inventory/page.tsx` |
| `/faq` | Learning-reader ?3.10 | Preserve all current content, sources, code samples, copy actions and truthful links | `src/app/(marketing)/faq/page.tsx` |
| `/features` | Learning-reader ?3.10 | Preserve all current content, sources, code samples, copy actions and truthful links | `src/app/(marketing)/features/page.tsx` |
| `/mcp/guide` | Learning-reader ?3.10 | Preserve all current content, sources, code samples, copy actions and truthful links | `src/app/(marketing)/mcp/guide/page.tsx` |
| `/` | Home + learning-reader | Public domain promise, setup prompt, truthful overview | `src/app/(marketing)/page.tsx` |
| `/pcs-moving` | Learning-reader ?3.10 | Preserve all current content, sources, code samples, copy actions and truthful links | `src/app/(marketing)/pcs-moving/page.tsx` |
| `/privacy` | Learning-reader ?3.10 | Preserve all current content, sources, code samples, copy actions and truthful links | `src/app/(marketing)/privacy/page.tsx` |
| `/terms` | Learning-reader ?3.10 | Preserve all current content, sources, code samples, copy actions and truthful links | `src/app/(marketing)/terms/page.tsx` |
| `/updates` | Learning-reader ?3.10 | Preserve all current content, sources, code samples, copy actions and truthful links | `src/app/(marketing)/updates/page.tsx` |
| `/admin` | Admin ?3.7 + stats ?3.6 | Owner-only ledger and instrument panels; existing access boundary | `src/app/(product)/admin/page.tsx` |
| `/app/box-labels` | Learning-reader ?3.10 / print document | Retain every print/export field, QR and recipient safety rule | `src/app/(product)/app/box-labels/page.tsx` |
| `/app/boxes/[boxId]` | Record ?3.1 | Box image/identity, contents, evidence, activity, labels and load actions | `src/app/(product)/app/boxes/[boxId]/page.tsx` |
| `/app/claim-packet` | Learning-reader ?3.10 / print document | Retain every print/export field, QR and recipient safety rule | `src/app/(product)/app/claim-packet/page.tsx` |
| `/app/dashboard` | Compatibility route | Preserve exact redirect; upgrade destination | `src/app/(product)/app/dashboard/page.tsx` |
| `/app/employer-packet` | Learning-reader ?3.10 / print document | Retain every print/export field, QR and recipient safety rule | `src/app/(product)/app/employer-packet/page.tsx` |
| `/app/items` | Collection ?3.3 | Search/filter/sort, all existing views, columns, bulk actions and editing | `src/app/(product)/app/items/page.tsx` |
| `/app/load-plan-packet` | Learning-reader ?3.10 / print document | Retain every print/export field, QR and recipient safety rule | `src/app/(product)/app/load-plan-packet/page.tsx` |
| `/app/movable-units` | Collection ?3.3 | Search/filter/sort, all existing views, columns, bulk actions and editing | `src/app/(product)/app/movable-units/page.tsx` |
| `/app/mover-packet` | Learning-reader ?3.10 / print document | Retain every print/export field, QR and recipient safety rule | `src/app/(product)/app/mover-packet/page.tsx` |
| `/app/moves/[moveId]/ai-review` | Collection ?3.3 + activity ?3.4 | AI work attribution, suggestions, review, source and capture paths | `src/app/(product)/app/moves/[moveId]/ai-review/page.tsx` |
| `/app/moves/[moveId]/boxes` | Compatibility route | Preserve exact redirect; upgrade destination | `src/app/(product)/app/moves/[moveId]/boxes/page.tsx` |
| `/app/moves/[moveId]/capture` | Focused session + collection ?3.3 | Manual and AI capture, files, progress and intake queue | `src/app/(product)/app/moves/[moveId]/capture/page.tsx` |
| `/app/moves/[moveId]/configure` | Sections ?3.2 + record ?3.1 | Move details, origin/destination areas, transport and household forms | `src/app/(product)/app/moves/[moveId]/configure/page.tsx` |
| `/app/moves/[moveId]/inventory` | Compatibility route | Preserve exact redirect; upgrade destination | `src/app/(product)/app/moves/[moveId]/inventory/page.tsx` |
| `/app/moves/[moveId]/load-plan` | Site-specific: load planning | Uncovered packing/capacity workflow: now + three blind takes; preserve tools | `src/app/(product)/app/moves/[moveId]/load-plan/page.tsx` |
| `/app/moves/[moveId]/move-day` | Site-specific: move-day checklist | Uncovered field workflow: now + three blind takes; preserve offline, exceptions and checks | `src/app/(product)/app/moves/[moveId]/move-day/page.tsx` |
| `/app/moves/[moveId]/overview` | Record ?3.1 + home ?3.5 | Move dossier, one activity/results stream, context, readiness and real section links | `src/app/(product)/app/moves/[moveId]/overview/page.tsx` |
| `/app/moves/[moveId]/packets` | Sections ?3.2 + collection ?3.3 | Packet configuration, exports, evidence, claims and share links | `src/app/(product)/app/moves/[moveId]/packets/page.tsx` |
| `/app/moves/[moveId]` | Record ?3.1 + home ?3.5 | Move dossier, one activity/results stream, context, readiness and real section links | `src/app/(product)/app/moves/[moveId]/page.tsx` |
| `/app/moves/[moveId]/photos` | Compatibility route | Preserve exact redirect; upgrade destination | `src/app/(product)/app/moves/[moveId]/photos/page.tsx` |
| `/app/moves/[moveId]/plan` | Site-specific: spatial planning | Uncovered canvas workflow: now + three blind takes; preserve geometry, undo, assignments | `src/app/(product)/app/moves/[moveId]/plan/page.tsx` |
| `/app/moves/[moveId]/queue` | Queue list ?3.11 + Queue item ?3.11 | Existing four-state contract, row answers, attributed item thread; no backend migration | `src/app/(product)/app/moves/[moveId]/queue/page.tsx` |
| `/app/moves/[moveId]/sell` | Compatibility route | Preserve exact redirect; upgrade destination | `src/app/(product)/app/moves/[moveId]/sell/page.tsx` |
| `/app/moves/[moveId]/spaces` | Compatibility route | Preserve exact redirect; upgrade destination | `src/app/(product)/app/moves/[moveId]/spaces/page.tsx` |
| `/app/moves` | Collection ?3.3 | Search/filter/sort, all existing views, columns, bulk actions and editing | `src/app/(product)/app/moves/page.tsx` |
| `/app` | Home ?3.5 | Desk trays; real move context, existing destinations and AI setup | `src/app/(product)/app/page.tsx` |
| `/app/pcs-packet` | Learning-reader ?3.10 / print document | Retain every print/export field, QR and recipient safety rule | `src/app/(product)/app/pcs-packet/page.tsx` |
| `/app/queue` | Queue list ?3.11 + Queue item ?3.11 | Existing four-state contract, row answers, attributed item thread; no backend migration | `src/app/(product)/app/queue/page.tsx` |
| `/app/spaces-transport` | Collection ?3.3 + record ?3.1 | Space and transport relationships, all current types and controls | `src/app/(product)/app/spaces-transport/page.tsx` |
| `/app/sub-manifest` | Learning-reader ?3.10 / print document | Retain every print/export field, QR and recipient safety rule | `src/app/(product)/app/sub-manifest/page.tsx` |
| `/settings/ai-connections` | Compatibility route | Preserve exact redirect; upgrade destination | `src/app/(product)/settings/ai-connections/page.tsx` |
| `/settings/ai` | Settings-AI ?3.8 | Real grant abilities matrix; revoke confirmation; current scopes | `src/app/(product)/settings/ai/page.tsx` |
| `/settings` | Settings-data ?3.9 + sections ?3.2 | All existing household, privacy, feature, API-key and planning controls | `src/app/(product)/settings/page.tsx` |
| `/api` | Learning-reader ?3.10 | Preserve all current content, sources, code samples, copy actions and truthful links | `src/app/api/page.tsx` |
| `/share/[token]` | Record ?3.1 + collection ?3.3 | Recipient-safe fields, permitted actions, comments, expiry and revocation | `src/app/share/[token]/page.tsx` |

## Site-specific exploration only

Spatial plan, load planning, and move-day checklist are the three uncovered interaction families. Each receives the unchanged baseline (?now?) plus three different compositions, blind labels and both judges. Inventory, boxes, rooms, packets, and ordinary record pages extend decided patterns; they do not get redundant A/B/C rounds.

## Shared states

- `src/app/(marketing)/error.tsx` ? preserve loading, recovery, not-found, provider lifetime, and existing route scope while adopting shared tokens.
- `src/app/(product)/app/moves/[moveId]/layout.tsx` ? preserve loading, recovery, not-found, provider lifetime, and existing route scope while adopting shared tokens.
- `src/app/(product)/app/moves/[moveId]/queue/error.tsx` ? preserve loading, recovery, not-found, provider lifetime, and existing route scope while adopting shared tokens.
- `src/app/(product)/app/queue/error.tsx` ? preserve loading, recovery, not-found, provider lifetime, and existing route scope while adopting shared tokens.
- `src/app/(product)/error.tsx` ? preserve loading, recovery, not-found, provider lifetime, and existing route scope while adopting shared tokens.
- `src/app/(product)/layout.tsx` ? preserve loading, recovery, not-found, provider lifetime, and existing route scope while adopting shared tokens.
- `src/app/error.tsx` ? preserve loading, recovery, not-found, provider lifetime, and existing route scope while adopting shared tokens.
- `src/app/layout.tsx` ? preserve loading, recovery, not-found, provider lifetime, and existing route scope while adopting shared tokens.
- `src/app/loading.tsx` ? preserve loading, recovery, not-found, provider lifetime, and existing route scope while adopting shared tokens.
- `src/app/not-found.tsx` ? preserve loading, recovery, not-found, provider lifetime, and existing route scope while adopting shared tokens.

## Capabilities crossing pages

- Keep MoveWorkspaceProvider and MediaUploadProvider above navigation; unfinished drafts, selections and uploads must survive appearance/navigation changes.
- Preserve real columns, filters, sort, search, bulk actions, capture/import, evidence, labels, QR, print/export, sharing controls, revocation and manual workflows. No invented saved views, counts, trends or permissions.
- Record/photo slots stay present; a Codex-written domain SVG fills an empty slot without implying a real photo.
- Existing feature flags and authorization remain authoritative; a design pattern never enables a capability.
- Activity is a record region and Queue items are detail sheets today, not new invented standalone routes.
- Learning-study is absent; auth and capture are focused sessions. Do not invent a learning feature to fill a family.

# MovingManifest - AI-Agent-Ready Product Blueprint and Build Spec

Prepared: June 8, 2026
Status: Draft 2 - full product build plan and technical spec
Target builder: an autonomous AI coding agent working in a fresh repository

## Build Directive for the AI Agent

Build the complete application described in this document, not a thin demo and not a minimal MVP. The product owner wants the full product vision implemented in sequenced milestones. Implement the product workflows, database schema, image pipeline, API, agent integration, documentation packet system, admin screens, tests, seed data, and deployment documentation. If current official documentation conflicts with anything here, follow the official documentation and leave a short note explaining the change.

Default stack: Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Convex, Clerk, Vercel, Backblaze B2, Cloudflare image delivery/transformations, and a small Node-based MCP server plus REST API for agent integrations.

Important domain note: MovingManifest is the product brand, and `movingmanifest.com` has been purchased and connected through Vercel. Use it as the production domain once the app is ready, but do not hardcode any production domain; the app name, marketing domain, and email-from domain must remain configurable.

---

# 1. Executive Summary

The product is an AI-assisted household inventory, move planning, loading, and claims documentation system.

The first motivating scenario is a PCS military move with multiple transport channels: two trucks, a 7x16 trailer, and a military/professional mover for the rest. The product must also support any normal household move where people need to decide what is going in each vehicle, what is being sold, what is being donated, what is going to the dump, what is going into storage, and what is too valuable or sensitive to let movers handle.

The app's job is to turn moving chaos into a searchable source of truth:

- What do we own?
- What room is it in?
- What box is it in?
- What photo evidence do we have?
- Is it being kept, sold, donated, dumped, stored, or moved by someone else?
- Which truck, trailer, vehicle, mover, or section is responsible for it?
- What is the approximate weight and volume?
- What is already packed, loaded, delivered, damaged, or missing?

The AI's job is not to silently make irreversible decisions. The AI acts like a calm logistics clerk: it classifies, estimates, suggests, flags uncertainty, and prepares plans that humans can accept or revise.

## 1.1 Full Product Mandate

MovingManifest should be planned as a full product, not as a throwaway MVP. Sequencing still matters: foundation, permissions, inventory, photos, load planning, AI, exports, API, and admin must land in dependency order. However, the intended destination includes the full documentation, AI, claims, helper access, API/MCP, and operational/admin surfaces.

The first useful workflows should become usable early, but they should be implemented on the same architecture that supports the full product. Avoid temporary shortcuts that would make later privacy, exports, AI review, or collaboration difficult.

## 1.2 Product Outcome

MovingManifest should become the trusted record of a move:

- a household inventory,
- a packing and box manifest,
- a load plan,
- a photo evidence vault,
- a claim-ready documentation center,
- a helper/mover-friendly task surface,
- and an AI-assisted planning partner that keeps uncertainty visible.

# 2. Product Mental Model

The simplest model is this:

Move -> Transport Resources -> Zones -> Boxes/Containers -> Items -> Photos/Evidence -> Assignments

A user creates a Move. Inside that move, they create Transport Resources such as Truck 1, Truck 2, Trailer, Military Movers, Dump, Donate, Sell, Free Giveaway, or Storage. Each transport resource can have one or more Zones. For example, a truck can have Cab, Bed Front, Bed Middle, Bed Rear, Roof Rack, or Back Seat. A trailer can have Front Left, Front Right, Center, Rear, or Fragile Shelf.

Items can exist independently or inside boxes. Boxes are first-class objects with a short code such as B-001, B-002, K-014, or GAR-003. A person can write that code on the box, scan a QR label, or type the code into the app to see everything inside.

Photos can attach to items, boxes, rooms, or claims. A photo might show the item, the serial number, the item's pre-move condition, the box label, the box contents before sealing, or the damaged condition after delivery.

Assignments connect items or boxes to a transport resource and optional zone. This is what powers drag-and-drop planning, capacity totals, printable load sheets, and AI reassignment suggestions.

# 3. Guiding Product Principles

1. Moving is a decision factory. The app should reduce repeated decisions, not create more forms.
2. Mobile matters more than desktop during intake. Desktop matters more during planning.
3. AI suggestions must be editable, explainable, and confidence-scored.
4. Photos are evidence, not decoration. Originals should be preserved privately.
5. The database is the source of truth. The UI, API, and AI tools must all use the same permission model.
6. Every list should be filterable by room, owner, disposition, transport, box, status, confidence, photo presence, value, and claim relevance.
7. The user should always know what still needs a human decision.
8. Claims documentation should be built automatically as a byproduct of normal packing.

# 4. Primary User Scenarios

## 4.1 PCS Mixed Move

A family has PCS orders. They have two trucks, one 7x16 trailer, and military movers. Some items are personally transported, some go with movers, some are donated, some are sold, and some are dumped.

The app should allow them to:

- Create a PCS move.
- Add their moving resources and capacity assumptions.
- Add items room by room using text, photos, and quick entry.
- Let AI estimate item weights and cubic volume.
- Mark high-value items, fragile items, documents, medication, keepsakes, electronics, and irreplaceable items.
- Generate a suggested load plan.
- Manually drag things between resources and zones.
- Track totals by vehicle, trailer, mover, and disposition.
- Print or export the loading plan.
- Keep claim-ready photo evidence.

## 4.2 Normal Household Move

A household moves across town or across the country. The app helps them create an inventory, organize boxes, know where everything is, and make move-day loading less awful.

## 4.3 Decluttering Move

A household wants to avoid moving junk. The app creates pipelines for Sell, Donate, Free, Dump, and Keep. Items can be filtered into action lists.

## 4.4 Claims and Insurance Support

A user wants pre-move and post-move evidence. The app keeps photos, condition notes, values, serial numbers, and box contents in a claims center. It should produce a claims packet export, but it should not pretend to be legal, insurance, or military claims advice.

## 4.5 Documentation Packet Support

Many moves require documentation for a third party. MovingManifest should support documentation profiles and export packets for common recipients:

- Military PCS / HHG / PPM / partial PPM documentation
- Moving company inventory and high-value item lists
- Employer relocation reimbursement support
- Insurance or claims evidence packets
- Self-move planning and load sheets
- Donation, sell, free pickup, dump run, and storage manifests

Each documentation profile should define which fields matter, which sensitive fields are hidden by default, and which disclaimers should be shown. The app should organize evidence and records, not claim to replace official forms, transportation office guidance, legal advice, or insurer/mover requirements.

# 5. Personas and Permissions

## 5.1 Owner / Move Planner

The person who creates the move. They can manage everything: transport resources, inventory, photos, collaborators, API keys, exports, and billing if SaaS plans are added later.

## 5.2 Household Collaborator

A spouse, family member, roommate, or trusted helper. They can add items, edit items, upload photos, create boxes, and change assignments depending on role.

## 5.3 Packer / Helper

A limited-access person who can scan boxes, mark items packed or loaded, and maybe add notes. They should not automatically see item values, API keys, admin settings, or hidden valuables.

## 5.4 Mover / Guest View

Optional limited role. Can see only the relevant load list or box count. Should not see values, private notes, serial numbers, photos of valuables, or personal documents unless explicitly shared.

## 5.5 AI Agent

A machine actor authorized through an API key or OAuth/MCP flow. The AI can read inventory, add items, attach photos, generate suggestions, and apply changes only within allowed scopes.

## 5.6 Platform Admin

An internal admin. Can view system health, user counts, storage usage, AI job status, API usage, and abuse signals. Any support-level access to user content must be role-limited and audited.

# 6. Core Product Workflows

## 6.1 Create a Move

The user creates a move with title, origin, destination, target move dates, move type, and optional PCS fields.

Suggested fields:

- Move title
- Origin city/state or freeform address
- Destination city/state or freeform address
- Move date range
- Move type: PCS, local, long-distance, storage, estate cleanout, other
- Household members or item owners
- Unit system: imperial default, metric optional
- Notes

PCS-specific settings should be configurable and must tell the user to verify official allowances with their transportation office or current official guidance. The app can track these fields, but it should not assume that any PCS rule is static forever.

## 6.2 Add Transport Resources

The user can add resources such as:

- Truck 1
- Truck 2
- 7x16 Trailer
- Personal vehicle
- Military/professional movers
- Storage unit
- Dump
- Sell
- Donate
- Free giveaway
- Unknown/Unassigned

Each resource can include:

- Type
- Name
- Description
- Capacity weight in pounds
- Usable volume in cubic feet
- Dimensions if relevant
- Soft capacity and hard capacity
- Whether weight or volume is considered unlimited for app planning purposes
- Rules, such as no liquids, no valuables, no fragile items, no hazardous items, no things needed first night, no paperwork

A resource like Military Movers may be unlimited by app space, but the move itself may still have an official household goods weight allowance. Therefore, the app should support both resource-level caps and move-level caps.

## 6.3 Add Zones Inside Resources

Zones create more granular planning.

Examples:

- Truck 1: Cab, Back Seat, Bed Front, Bed Middle, Bed Rear
- Truck 2: Cab, Back Seat, Bed
- Trailer: Front Left, Front Right, Center, Rear, Fragile Top Area
- Storage: Unit A, Unit B, Back Wall, Door Area
- Movers: High-value crate, Fragile, Garage, Furniture, General boxes

Each zone should have optional dimensions, max weight, sort order, notes, and preferred item tags.

## 6.4 Inventory Intake

The app must support multiple intake methods:

- Quick add item
- Spreadsheet-like table entry
- Bulk paste from notes
- Photo upload and AI extraction
- Room-by-room walk mode
- Voice note transcription as optional later feature
- API import
- Agent/MCP import

Every AI-created item must be marked as AI-created or AI-assisted until reviewed. The user should be able to approve, edit, merge duplicates, or delete suggestions.

## 6.5 Box and Container Tracking

A box is not just a label. It is a container with its own status, photos, dimensions, estimated weight, actual weight, destination room, and contents.

Box workflow:

1. Create or scan a box code.
2. Add photos of the empty box, open box, packed contents, and sealed label if desired.
3. Add items into the box.
4. Let AI infer possible contents from an open-box photo, if enabled.
5. Mark the box as open, packed, sealed, loaded, delivered, missing, or damaged.
6. Assign the box to a transport resource and zone.
7. Generate a printable label or QR code.

Box codes should be short and human-writable. Example patterns:

- B-001, B-002, B-003 for generic boxes
- K-001 for kitchen
- GAR-001 for garage
- BED1-001 for Bedroom 1

The QR code should resolve to a secure app route, but the plain text code should be enough to search manually.

## 6.6 AI Planning

The AI can suggest:

- Item categories
- Fragility
- High-value flags
- Weight estimates
- Volume estimates
- Disposition candidates, such as sell, donate, dump, or keep
- Best transport resource
- Best zone
- Box grouping suggestions
- Missing details that should be filled in
- Items that should not go with movers
- Items that may require special handling

AI suggestions must include confidence and reasoning. If confidence is low, the item should appear in a review queue.

## 6.7 Manual Planning and Drag-and-Drop

The user should be able to drag items or boxes between resources and zones.

When something is moved:

- The assignment updates immediately.
- Resource totals recalculate.
- Zone totals recalculate.
- Warnings appear if capacity is exceeded.
- The action is audited.
- Locked items remain locked unless intentionally unlocked.

The load planner should make tradeoffs visible, not mysterious. It should show weight, volume, count, fragile count, high-value count, and unreviewed AI estimates.

## 6.8 Move Day Mode

Move Day Mode should be optimized for phones and tired people.

Features:

- Big buttons
- Scan or type box code
- Mark packed, loaded, delivered, missing, or damaged
- Show only today's task list
- Show resource-specific load order
- Keep a quick damage photo capture flow
- Work acceptably on spotty connections where feasible

# 7. Core Screens and UI Architecture

## 7.1 Marketing Site

Routes:

- `/` landing page
- `/features`
- `/pcs-moving`
- `/claims-inventory`
- `/pricing` if SaaS plans are enabled
- `/privacy`
- `/terms`

Marketing angle:

- Inventory your home faster.
- Plan what goes in each truck, trailer, box, or mover shipment.
- Keep proof for claims.
- Let AI help without surrendering control.

## 7.2 Auth and Onboarding

Use Clerk for sign-up, sign-in, profile, organization support if enabled, and user management.

Onboarding should ask:

- Are you planning a move, inventorying storage, or creating a claim-ready household inventory?
- Are you moving with professional/military movers?
- Do you want to create transport resources now?
- Do you want to import from photos, start with a table, or create boxes first?

## 7.3 Dashboard

The dashboard shows active moves, recent moves, totals, incomplete work, and quick actions.

Cards:

- Active moves
- Items added
- Boxes created
- Items needing review
- Unassigned weight/volume
- Upcoming move date
- Recent AI jobs

## 7.4 Move Workspace

Main route example: `/app/moves/[moveId]`

Tabs:

- Overview
- Inventory
- Boxes
- Load Planner
- Photos
- Claims
- Reports
- Settings

The move workspace should have persistent summary metrics:

- Total items
- Total boxes
- Estimated total weight
- Estimated total volume
- Percent assigned
- Percent packed
- Percent loaded
- Items needing review

## 7.5 Inventory Table

The inventory table is the power-user center of the app.

Recommended features:

- TanStack Table or equivalent
- Column visibility controls
- Inline editing for common fields
- Bulk actions
- Saved filters
- Search
- Pagination or virtualization for large inventories
- Filter chips
- Import/export CSV
- Multi-select
- Confidence badges
- Photo indicator
- Box indicator
- Transport assignment indicator

Important columns:

- Item name
- Room
- Category
- Disposition
- Status
- Box
- Assigned resource
- Zone
- Estimated weight
- Estimated volume
- Value
- Fragility
- High value
- Photos
- AI confidence
- Last updated

## 7.6 Item Detail Panel

The item detail should open as a sheet or side panel.

Sections:

- Summary
- Photos
- Description
- Room/category
- Dimensions and weight
- Value and serial number
- Box membership
- Transport assignment
- Condition notes
- AI estimates and reasoning
- Activity log

## 7.7 Box Manager

The Box Manager should show boxes as cards and as a table.

Each box card should show:

- Box code
- Room
- Destination room
- Item count
- Estimated weight
- Actual weight if available
- Assigned resource/zone
- Status
- Photo thumbnail
- QR label action

## 7.8 Load Planner

The Load Planner should have a board-style UI.

Columns or groups:

- Unassigned
- Truck 1
- Truck 2
- Trailer
- Military/Professional Movers
- Storage
- Sell
- Donate
- Dump
- Free Giveaway

Inside each resource, show zones if configured. Dragging a box or item into a zone assigns it.

Each resource should show capacity meters:

- Weight used vs max
- Volume used vs max
- Item/box count
- Warning count
- Locked assignment count

## 7.9 Photo Intake and Review Queue

Photos are central. The app should have a photo page that can filter by:

- Unattached photos
- Attached to item
- Attached to box
- Claim photos
- Serial number photos
- Condition photos
- Low-quality photos
- AI not processed

An AI photo-processing queue should let the user approve extracted items.

## 7.10 Claims Center

The Claims Center should be designed around evidence completeness.

Features:

- High-value item list
- Items with value but no photo
- Items with photo but no value
- Items with serial number
- Items marked damaged or missing
- Before/after photo pairing
- Claims packet export
- Timeline of item status changes

## 7.11 Profile Menu

Profile menu items:

- Account settings
- Organization/household settings if enabled
- API keys
- Connected AI agents / MCP setup
- Storage usage
- Export my data
- Delete account request

## 7.12 Admin Menu

Admin menu items:

- Users
- Organizations
- Moves
- Storage usage
- AI job logs
- API key usage
- Rate limit events
- Error logs
- Feature flags
- Abuse review

# 8. Technical Architecture

## 8.1 Recommended Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Convex for database, server functions, real-time sync, and backend logic
- Clerk for authentication and user/profile/organization management
- Vercel for app hosting
- Backblaze B2 for private original image storage
- Cloudflare for image delivery, transformation, and CDN edge caching
- Zod for validation
- dnd-kit for drag and drop
- TanStack Table for inventory grids
- Playwright for end-to-end tests
- Vitest for unit tests

## 8.2 Suggested Repository Structure

```text
app/
  (marketing)/
  (auth)/
  app/
    dashboard/
    moves/[moveId]/
    settings/
    admin/
  api/v1/
components/
  ui/
  inventory/
  boxes/
  load-planner/
  photos/
  claims/
convex/
  schema.ts
  auth.ts
  users.ts
  moves.ts
  items.ts
  boxes.ts
  photos.ts
  assignments.ts
  estimates.ts
  documentationProfiles.ts
  shareLinks.ts
  apiKeys.ts
  aiJobs.ts
  http.ts
lib/
  validators/
  images/
  ai/
  api/
  permissions/
  estimation/
  capacity/
  documentation/
packages/
  mcp-server/
tests/
  unit/
  e2e/
scripts/
  seed.ts
```

## 8.3 Authentication Model

Use Clerk for user authentication. Convex functions must not trust client-provided user IDs. Every sensitive Convex query, mutation, and action should call a shared `requireUser(ctx)` helper that reads identity from Convex auth and resolves the local user record.

Recommended pattern:

- Clerk handles sign-in, sign-up, sessions, profile, and optional organizations.
- Clerk webhooks sync user and organization metadata into Convex.
- Convex stores app-specific user data and move-specific roles.
- Convex enforces object-level authorization on every function.
- API keys are for external clients and agents, not replacements for human user sessions.

## 8.4 Tenant Model

Support either personal accounts or organizations/households. Even if the first launch is personal, design the schema so moves belong to an `orgId` or `householdId`, not only to a single user.

Recommended roles:

- owner
- admin
- editor
- packer
- viewer
- guest

Every move-level object should have `moveId`, and every move should have `orgId` or owner scope. Never fetch an item only by item ID without verifying move access.

# 9. Convex Data Model

This is the recommended schema. The AI coding agent should translate this into `convex/schema.ts` using Convex validators and indexes.

## 9.1 users

Purpose: local snapshot of Clerk users and app-specific preferences.

Fields:

- clerkUserId
- email
- name
- imageUrl
- defaultOrgId
- role: user or platformAdmin
- unitPreference: imperial or metric
- createdAt
- updatedAt

Indexes:

- by_clerkUserId
- by_email

## 9.2 organizations or households

Purpose: collaboration boundary.

Fields:

- clerkOrgId optional
- name
- plan
- ownerUserId
- createdAt
- updatedAt

Indexes:

- by_clerkOrgId
- by_ownerUserId

## 9.3 memberships

Purpose: app-specific role mapping if not fully delegated to Clerk organizations.

Fields:

- orgId
- userId
- role
- status
- createdAt

Indexes:

- by_orgId
- by_userId
- by_org_user

## 9.4 moves

Purpose: top-level project.

Fields:

- orgId
- ownerUserId
- title
- status: planning, packing, moving, delivered, archived
- moveType: pcs, local, longDistance, storage, estate, other
- origin
- destination
- startDate
- targetMoveDate
- deliveryDate
- unitPreference
- officialWeightAllowanceLb optional
- pcsBranch optional
- pcsNotes optional
- aiEnabled boolean
- createdAt
- updatedAt

Indexes:

- by_orgId
- by_ownerUserId
- by_status
- by_org_status

## 9.5 people

Purpose: item ownership and task assignment.

Fields:

- moveId
- name
- roleLabel
- color
- notes
- createdAt

Indexes:

- by_moveId

## 9.6 transportResources

Purpose: trucks, trailers, movers, disposal paths, storage, etc.

Fields:

- moveId
- name
- type: truck, trailer, car, professionalMover, militaryMover, storage, sell, donate, dump, freeGiveaway, unknown
- description
- maxWeightLb optional
- softMaxWeightLb optional
- usableVolumeCuFt optional
- softUsableVolumeCuFt optional
- dimensionsIn optional object: length, width, height
- unlimitedWeight boolean
- unlimitedVolume boolean
- rules text
- sortOrder
- createdAt
- updatedAt

Indexes:

- by_moveId
- by_move_sortOrder

## 9.7 transportZones

Purpose: sections within a vehicle, trailer, mover shipment, or storage location.

Fields:

- moveId
- resourceId
- name
- description
- maxWeightLb optional
- usableVolumeCuFt optional
- dimensionsIn optional
- balanceHint: front, middle, rear, left, right, top, bottom, none
- preferredTags array
- sortOrder
- createdAt
- updatedAt

Indexes:

- by_moveId
- by_resourceId
- by_resource_sortOrder

## 9.8 items

Purpose: inventory item.

Fields:

- moveId
- name
- normalizedName
- description
- room
- destinationRoom
- category
- subcategory
- ownerPersonId optional
- disposition: undecided, take, sell, donate, dump, free, storage, mover, personalTransport
- status: draft, active, packed, loaded, delivered, missing, damaged, archived
- quantity
- condition
- valueCents optional
- replacementValueCents optional
- serialNumber optional
- modelNumber optional
- dimensionsIn optional: length, width, height
- estimatedWeightLb optional
- estimatedWeightLowLb optional
- estimatedWeightHighLb optional
- actualWeightLb optional
- estimatedVolumeCuFt optional
- estimatedPackedVolumeCuFt optional
- weightConfidence: none, low, medium, high, manual, actual
- volumeConfidence: none, low, medium, high, manual, actual
- fragility: low, medium, high
- stackable boolean
- hazardousFlag boolean
- highValue boolean
- requiresPersonalTransport boolean
- needsReview boolean
- aiSummary
- aiTags array
- createdVia: manual, bulkImport, photoAI, api, mcp
- reviewedAt optional
- createdByUserId
- updatedByUserId
- createdAt
- updatedAt
- deletedAt optional

Indexes:

- by_moveId
- by_move_status
- by_move_disposition
- by_move_room
- by_move_category
- by_move_needsReview
- by_move_highValue
- by_move_updatedAt

## 9.9 boxes

Purpose: physical boxes or containers.

Fields:

- moveId
- code
- label
- room
- destinationRoom
- description
- status: open, packing, sealed, loaded, delivered, missing, damaged, archived
- dimensionsIn optional
- estimatedWeightLb optional
- actualWeightLb optional
- estimatedVolumeCuFt optional
- assignedResourceId optional
- assignedZoneId optional
- sealedAt optional
- createdByUserId
- createdAt
- updatedAt

Indexes:

- by_moveId
- by_move_code
- by_move_status
- by_assignedResourceId

## 9.10 boxItems

Purpose: join table for item contents inside boxes.

Fields:

- moveId
- boxId
- itemId
- quantity
- notes
- createdAt

Indexes:

- by_boxId
- by_itemId
- by_moveId

## 9.11 itemPhotos

Purpose: images attached to items, boxes, rooms, and claims.

Fields:

- moveId
- itemId optional
- boxId optional
- room optional
- originalStorageKey
- originalBucket
- originalHash
- width
- height
- mimeType
- sizeBytes
- caption
- photoType: item, serialNumber, condition, damage, boxContents, boxLabel, receipt, room, other
- derivativeBasePath or cloudflareImageId
- privacyLevel: normal, sensitive, hiddenFromGuests
- aiProcessed boolean
- capturedAt optional
- uploadedByUserId
- createdAt

Indexes:

- by_moveId
- by_itemId
- by_boxId
- by_move_aiProcessed

## 9.12 assignments

Purpose: planned or actual placement of items and boxes.

Fields:

- moveId
- itemId optional
- boxId optional
- resourceId
- zoneId optional
- status: suggested, planned, packed, loaded, delivered
- locked boolean
- assignedBy: user, ai, api, mcp
- confidence optional
- reason optional
- sortOrder
- createdAt
- updatedAt

Indexes:

- by_moveId
- by_itemId
- by_boxId
- by_resourceId
- by_zoneId
- by_resource_sortOrder

## 9.13 estimates

Purpose: preserve AI/manual estimate history and assumptions.

Fields:

- moveId
- itemId optional
- boxId optional
- estimateType: weight, volume, value, category, assignment
- source: ai, manual, actual, catalog, formula
- pointValue
- lowValue optional
- highValue optional
- unit
- confidence
- assumptions
- model optional
- promptVersion optional
- createdByUserId optional
- createdAt

Indexes:

- by_itemId
- by_boxId
- by_moveId

## 9.14 aiJobs

Purpose: queue and audit AI processing.

Fields:

- moveId
- type: photoIntake, textIntake, estimateItems, suggestAssignments, detectDuplicates, generateReport
- status: queued, running, succeeded, failed, canceled
- inputSummary
- resultSummary
- errorMessage optional
- provider optional
- model optional
- tokenUsage optional
- estimatedCostCents optional
- createdByUserId
- createdAt
- updatedAt

Indexes:

- by_moveId
- by_status
- by_move_status

## 9.15 apiKeys

Purpose: secure external agent access.

Fields:

- orgId
- userId
- name
- keyPrefix
- secretHash
- scopes array
- allowedMoveIds array optional
- expiresAt optional
- revokedAt optional
- lastUsedAt optional
- createdAt

Indexes:

- by_orgId
- by_userId
- by_keyPrefix

## 9.16 auditLogs

Purpose: security and change history.

Fields:

- orgId
- moveId optional
- actorType: user, apiKey, mcp, system, admin
- actorId
- action
- targetType
- targetId optional
- summary
- before optional redacted object
- after optional redacted object
- ipHash optional
- userAgent optional
- createdAt

Indexes:

- by_orgId
- by_moveId
- by_actorId
- by_createdAt

## 9.17 exports

Purpose: generated files and reports.

Fields:

- moveId
- type: inventoryCsv, packingPdf, boxLabelsPdf, claimsPacket, loadPlan
- status: queued, running, ready, failed
- fileStorageKey optional
- createdByUserId
- createdAt
- updatedAt

Indexes:

- by_moveId
- by_status

## 9.18 documentationProfiles

Purpose: reusable export/share configurations for third-party documentation needs.

Fields:

- moveId
- type: personalFullRecord, pcsMove, movingCompany, employerRelocation, insuranceClaim, donationPickup, sellOrGiveaway, storageInventory, loadCrew
- name
- description
- includedFields array
- includedPhotoTypes array
- includeValues boolean
- includeSerialNumbers boolean
- includePrivateNotes boolean
- includeSensitivePhotos boolean
- allowedFormats array: csv, pdf, printableHtml, shareLink
- disclaimerText
- createdByUserId
- createdAt
- updatedAt

Indexes:

- by_moveId
- by_move_type

## 9.19 shareLinks

Purpose: scoped, revocable access for helpers, movers, pickup recipients, or documentation packets.

Fields:

- orgId
- moveId
- documentationProfileId optional
- tokenHash
- tokenPrefix
- linkType: boxLookup, loadCrew, moverList, donationPickup, sellOrGiveaway, claimsPacket, storageInventory
- allowedBoxIds optional array
- allowedResourceIds optional array
- expiresAt optional
- revokedAt optional
- lastAccessedAt optional
- createdByUserId
- createdAt

Indexes:

- by_orgId
- by_moveId
- by_tokenPrefix
- by_move_linkType

# 10. Estimation and Load Planning

## 10.1 Weight Estimates

Store weight as a range, not only a single number.

Fields:

- estimatedWeightLowLb
- estimatedWeightLb
- estimatedWeightHighLb
- actualWeightLb
- weightConfidence

Why: an AI estimate for a couch, dresser, or tool box can be directionally useful but not exact. The user should know whether the estimate is a guess, a known value, or measured.

## 10.2 Volume Estimates

If dimensions are known:

```text
rawVolumeCuFt = lengthIn * widthIn * heightIn / 1728
packedVolumeCuFt = rawVolumeCuFt * packingFactor
```

Packing factor examples:

- Solid furniture: 1.05 to 1.25
- Stackable boxes: 1.0 to 1.1
- Awkward fragile items: 1.25 to 1.75
- Loose garage items: 1.5 to 2.5

These are planning heuristics, not certified measurements.

## 10.3 Box Aggregation

A box's estimated weight can be:

- Manually entered actual weight
- Sum of contents plus box tare weight
- AI-estimated based on contents
- User override

The UI should always show whether a box weight is actual, manual estimate, AI estimate, or contents-derived.

## 10.4 Capacity Planning

Every resource should show:

- Weight used
- Weight remaining
- Volume used
- Volume remaining
- Percent full by weight
- Percent full by volume
- Warning count

Use soft warnings before hard failures. A user may intentionally overload a soft estimate but should not accidentally exceed a known hard cap.

## 10.5 Assignment Algorithm

The AI suggestion engine should follow this order:

1. Honor locked assignments.
2. Exclude items marked sell, donate, dump, free, or not taking.
3. Treat sealed boxes as single loadable units.
4. Put high-value, irreplaceable, legal documents, medications, and sensitive items into personal transport unless the user overrides.
5. Keep hazardous or mover-restricted items out of professional/military mover resources unless marked verified.
6. Put heavy items low and closer to load-bearing zones.
7. Put fragile items in protected zones and avoid stacking heavy items above them.
8. Balance weight between trucks/trailer where possible.
9. Keep first-night items accessible.
10. Output a plan with reasons and confidence.

The AI should first create suggestions. The user then accepts all, accepts selected changes, or edits manually.

# 11. AI Features

## 11.1 AI Intake from Text

The user can paste notes like:

```text
Garage: two bikes, red toolbox, camping tent, 4 bins of Christmas decor, shop vac, air compressor.
Kitchen: mixer, plates, pots and pans, toaster, coffee machine.
```

The AI should convert this into draft items with categories, rooms, likely weights, volume estimates, and review flags.

## 11.2 AI Intake from Photos

The user can upload one or more room/item/box photos. AI can propose items found in the images.

Rules:

- Keep the original photo.
- Create draft items, not final items, unless user has enabled auto-create.
- Attach the photo to all proposed items or to the room intake batch.
- Ask for review when confidence is low.
- Never invent serial numbers, exact values, or official weights.

## 11.3 AI Box Contents Detection

When the user photographs an open box, the AI can propose contents.

Output should include:

- Box code
- Suggested item list
- Confidence per item
- Photo association
- Missing details

The user can accept, reject, merge, or edit proposed contents.

## 11.4 AI Duplicate Detection

The app should flag likely duplicates. Example: "red toolbox", "tool box", and "garage toolbox" may refer to the same item.

The duplicate review UI should allow:

- Merge
- Keep separate
- Mark as quantity
- Ignore suggestion

## 11.5 AI Questions to Ask the User

The AI should proactively identify missing information:

- Which items are first-night essentials?
- Which valuables should not go with movers?
- Do any boxes contain liquids, batteries, ammunition, fuel, paint, chemicals, food, or perishable items?
- Which items need serial number photos?
- Which high-value items need condition photos?
- Are truck/trailer capacities actual or guesses?

## 11.6 AI Safety and Product Rules

AI must not:

- Delete user data without explicit user action.
- Mark a claim as officially valid.
- Guarantee weight accuracy.
- Hide low-confidence assumptions.
- Override locked assignments.
- Expose private inventory through guest/API access.
- Fetch arbitrary remote image URLs without SSRF protections.

AI should:

- Store assumptions.
- Store confidence.
- Produce reversible suggestions.
- Keep audit logs.
- Prefer asking for review over pretending to be certain.

# 12. Image Storage and Delivery Architecture

## 12.1 Goals

- Preserve original images privately for claims and evidence.
- Serve optimized derivatives quickly in the web app.
- Avoid overusing Vercel image optimization if Cloudflare is already handling image delivery.
- Keep sensitive household photos private.
- Avoid exposing Backblaze credentials or raw bucket paths to the client.

## 12.2 Recommended Pipeline

1. Client requests an upload session from the app.
2. Server validates move access.
3. Server creates a B2/S3-compatible presigned upload URL or upload authorization.
4. Client uploads the original directly to Backblaze B2.
5. Client calls a finalize endpoint or Convex mutation with file metadata.
6. Server records photo metadata in Convex.
7. Cloudflare Worker or Cloudflare Images serves transformed variants.
8. The app loads thumbnails/cards/detail images from Cloudflare, not Vercel optimization.
9. Original downloads require owner/admin permission and signed access.

## 12.3 Variants

Recommended variants:

- thumb: 200 px wide, list/table thumbnails
- card: 480 px wide, cards and grids
- detail: 1200 px wide, item detail view
- full: original or near-original, signed only

The app should keep originals but strip or avoid exposing EXIF metadata in public derivatives when possible.

## 12.4 Security Rules for Images

- Backblaze bucket should be private unless a deliberate public architecture is chosen.
- Never put B2 application keys in client code.
- Do not allow arbitrary user-supplied remote URLs to be fetched server-side unless SSRF protection is implemented.
- Use object keys that do not reveal names, addresses, or item contents.
- Use signed URLs or signed Cloudflare routes for sensitive photos.
- Track photo privacy level.
- Hide sensitive photos from packer, mover, or guest views by default.

# 13. API and Agent Integration

## 13.1 Why the API Matters

The product should work well with external AI agents such as code assistants, automation agents, personal assistants, or future household inventory agents. The API allows an agent to add items, attach photos, ask for summaries, suggest assignments, and update statuses without pretending to be the browser UI.

## 13.2 API Key UX

In the profile menu, the user can create an API key.

API key creation flow:

1. User opens Settings -> API Keys.
2. User clicks Create API Key.
3. User chooses name, expiration, scopes, and allowed move(s).
4. App shows the raw key exactly once.
5. App stores only a hash plus prefix/last characters.
6. User can revoke the key at any time.
7. API usage appears in an audit log.

Recommended key format:

```text
tmp_live_<publicPrefix>_<secret>
tmp_test_<publicPrefix>_<secret>
```

The prefix helps lookup. The secret is hashed. The raw secret is never stored.

## 13.3 API Scopes

Suggested scopes:

- moves:read
- moves:write
- items:read
- items:write
- boxes:read
- boxes:write
- photos:write
- assignments:read
- assignments:write
- estimates:write
- exports:read
- admin:read

Most user-created keys should default to one move and limited scopes.

## 13.4 REST API Endpoints

Suggested v1 endpoints:

```text
GET    /api/v1/me
GET    /api/v1/moves
POST   /api/v1/moves
GET    /api/v1/moves/:moveId
PATCH  /api/v1/moves/:moveId
GET    /api/v1/moves/:moveId/summary
GET    /api/v1/moves/:moveId/items
POST   /api/v1/moves/:moveId/items
POST   /api/v1/moves/:moveId/items/batch-upsert
PATCH  /api/v1/items/:itemId
DELETE /api/v1/items/:itemId
GET    /api/v1/moves/:moveId/boxes
POST   /api/v1/moves/:moveId/boxes
PATCH  /api/v1/boxes/:boxId
POST   /api/v1/boxes/:boxId/items
DELETE /api/v1/boxes/:boxId/items/:itemId
POST   /api/v1/uploads/init
POST   /api/v1/photos/finalize
POST   /api/v1/photos/:photoId/attach
GET    /api/v1/moves/:moveId/resources
POST   /api/v1/moves/:moveId/resources
POST   /api/v1/moves/:moveId/assignments/suggest
POST   /api/v1/moves/:moveId/assignments/apply
GET    /api/v1/moves/:moveId/capacity-report
POST   /api/v1/moves/:moveId/exports
GET    /api/v1/exports/:exportId
```

## 13.5 API Design Requirements

- JSON only for v1 except file upload handoff.
- Cursor pagination for list endpoints.
- Server-side validation with Zod.
- Idempotency keys for write-heavy and batch endpoints.
- Rate limits by API key and organization.
- Request size limits.
- Audit all writes.
- Object-level authorization for every object.
- Never accept `userId` or `orgId` as authority from client payloads.
- Return stable error codes.
- Include `requestId` in responses for debugging.

## 13.6 MCP Server

Build a small MCP server package that wraps the REST API. This is especially useful for agent tools that can call structured functions.

Recommended tools:

- `list_moves`
- `get_move_summary`
- `search_inventory`
- `create_item`
- `batch_upsert_items`
- `update_item`
- `create_box`
- `add_items_to_box`
- `attach_photo_to_item`
- `list_transport_resources`
- `suggest_assignments`
- `apply_assignment_plan`
- `mark_item_disposition`
- `get_capacity_report`
- `create_export`

The MCP server can run locally with an API key in the user's environment. A remote MCP option can be added later if OAuth/consent flow is implemented securely.

## 13.7 Agent Guardrails

The API and MCP server should expose coarse, useful actions rather than hundreds of tiny tools. Too many chatty tools increase token use, confusion, and cost. Batch operations are important.

Agent writes should support dry-run mode:

```text
POST /api/v1/moves/:moveId/assignments/suggest
```

Then apply mode:

```text
POST /api/v1/moves/:moveId/assignments/apply
```

The apply endpoint should accept only reviewed/specific changes, not arbitrary broad instructions.

# 14. Security Requirements

## 14.1 Core Risks

The product stores household inventory, photos, valuables, addresses, move dates, serial numbers, and potentially documents. This makes privacy and object-level authorization critical.

API security risks to explicitly defend against:

- Broken object-level authorization
- Broken authentication
- Broken object property-level authorization
- Unrestricted resource consumption
- Broken function-level authorization
- Server-side request forgery if remote image ingestion is added
- Excessive data exposure through exports, guest links, or API keys

## 14.2 Authorization Rules

Every query/mutation/route handler must verify:

1. Who is the actor?
2. Which organization/household do they belong to?
3. Do they have access to this move?
4. Do they have permission for this action?
5. Are they allowed to see sensitive fields such as item values, serial numbers, private notes, and sensitive photos?

Never rely on client-side hiding as security.

## 14.3 API Key Security

- Show the raw key only once.
- Store only a strong hash.
- Use key prefix for lookup.
- Require scopes.
- Allow move-level restriction.
- Support expiration.
- Support revocation.
- Track last used time.
- Rate limit usage.
- Audit writes.
- Do not use API keys as human session tokens.

## 14.4 Guest Links

Guest links should be optional and scoped.

Possible guest link types:

- View only one box
- View only a load list
- View only donation pickup list
- View only free giveaway list
- View only a claims packet shared export

Guest links should support expiration and revocation.

## 14.5 Photo Privacy

Photos may reveal addresses, family members, valuables, documents, medicines, firearms, serial numbers, or room layouts.

Therefore:

- Hide sensitive photos from guests.
- Avoid public bucket URLs for originals.
- Strip EXIF from derivatives where possible.
- Store originals privately.
- Use signed delivery for sensitive originals.
- Consider a "private item" flag for valuables and documents.

# 15. Efficiency and Cost Control

## 15.1 Convex Efficiency

Do:

- Use indexes for all common filters.
- Use paginated queries for inventory and photo lists.
- Subscribe only to data needed for the current screen.
- Store resource/zone aggregate totals so the UI does not recalculate the entire move repeatedly.
- Use batch mutations for bulk import and AI suggestions.
- Store AI job results once and reuse them.
- Debounce inline editing.
- Avoid making one network write per keystroke.
- Avoid real-time subscriptions to every photo metadata record when a user is only viewing a summary.

Do not:

- Load every item, every photo, and every assignment into every page.
- Re-run AI estimation every time a row renders.
- Use unindexed scans for common filters.
- Store large image blobs in Convex.

## 15.2 Vercel Efficiency

Do:

- Keep Vercel functions thin.
- Let Convex handle app data and mutations.
- Let Backblaze and Cloudflare handle image storage and delivery.
- Avoid using Vercel Image Optimization for images already transformed by Cloudflare unless there is a clear reason.
- Cache static marketing pages.
- Use server route handlers mostly for API key auth, upload init/finalize, exports, and MCP/REST boundary.

Do not:

- Proxy every image through Vercel.
- Run heavy image processing in Vercel functions.
- Use many tiny API calls where a batch endpoint would work.

## 15.3 AI Cost Control

Do:

- Batch process item estimates.
- Use small image variants for AI review where full originals are not needed.
- Cache model outputs by item/photo hash and prompt version.
- Store confidence and assumptions.
- Use coarse MCP tools and batch endpoints.
- Require human review for expensive operations.

# 16. Reports and Exports

## 16.1 Inventory CSV

Columns:

- Item ID
- Name
- Room
- Destination room
- Category
- Description
- Disposition
- Status
- Box code
- Transport resource
- Zone
- Estimated weight
- Estimated volume
- Actual weight
- Value
- Serial number
- Condition
- Photo count
- High value
- Fragile
- Needs review

## 16.2 Load Plan Export

The load plan should group by resource and zone.

For each resource:

- Total estimated weight
- Total estimated volume
- Capacity warnings
- Boxes
- Loose items
- First-night items
- High-value items
- Fragile items
- Loading order

## 16.3 Box Labels PDF

Labels should include:

- Box code
- QR code
- Room
- Destination room
- Fragile indicator
- Heavy indicator
- Assigned resource/zone

## 16.4 Claims Packet

Claims export should include:

- Item name
- Description
- Room
- Box code if any
- Value
- Serial/model number
- Condition before move
- Photos
- Damage/missing status
- Timeline of relevant status changes
- Notes

The app should state that exports are evidence organization tools and not official claims approval.

# 17. Documentation Modes and PCS-Specific Considerations

MovingManifest should include a documentation packet system. A documentation packet is a filtered/exportable view of a move for a specific purpose. It can produce CSV, printable HTML/PDF, and shareable scoped views depending on sensitivity and recipient.

## 17.1 Documentation Profile Types

Recommended profile types:

- personalFullRecord: complete owner archive
- pcsMove: military PCS / HHG / PPM / partial PPM support
- movingCompany: mover-facing inventory and load details
- employerRelocation: employer reimbursement and relocation support
- insuranceClaim: general insurance or damage/missing claim support
- donationPickup: donation manifest and pickup list
- sellOrGiveaway: sale/free item list with private fields hidden
- storageInventory: storage unit manifest
- loadCrew: helper/mover load task sheet

Each profile should control:

- included item fields
- included photos
- value/serial visibility
- private notes visibility
- recipient-facing disclaimers
- export format options
- whether a share link is allowed
- expiration/revocation defaults for share links

## 17.2 Common Documentation Packets

PCS support packet:

- Move summary
- PCS-specific fields and user-entered allowance notes
- Resource/load plan summary
- Personal transport / do-not-let-movers-touch list
- High-value item list
- Photos/evidence checklist
- Boxes and contents
- Damage/missing timeline if applicable
- Clear reminder to verify current official guidance with the transportation office

Moving company packet:

- Mover-visible load list
- Box counts by room
- Fragile/heavy labels
- High-value flag summary without exposing values unless explicitly included
- Restricted/hazardous item warnings
- Destination room labels

Employer relocation packet:

- Move summary
- Inventory summary
- Receipts/expense attachment metadata if added later
- Storage/shipping summaries
- CSV/PDF export suitable for reimbursement support

Insurance/claims packet:

- Item values and replacement values where entered
- Serial/model numbers
- Before/after condition notes
- Photos and evidence density
- Damage/missing status history
- Export disclaimer that the packet is evidence organization, not claim approval

Self-move/load crew packet:

- Resource and zone load sheets
- Loading order
- Heavy/fragile/first-night indicators
- Box code lookup
- Mobile-friendly helper view

## 17.3 PCS-Specific Considerations

The app should support PCS mode, but rules and allowances must remain configurable and verified by the user.

PCS fields:

- Branch
- Rank/pay grade optional
- Dependent status optional
- Move type: HHG, PPM, partial PPM, storage, mixed
- Official weight allowance optional
- Pro gear/PBP&E category fields optional
- Transportation office notes
- Restricted items notes

Potential PCS warnings:

- Some items may be prohibited or restricted for movers.
- Hazardous materials, fuel, paints, chemicals, perishables, and similar categories need verification.
- High-value items should have photos, serial numbers, values, and condition notes.
- User should confirm official entitlements and mover restrictions with current official sources.

The product should have a PCS mode with structured fields, documentation packet exports, and strong verification language. It should not hardcode permanent legal assumptions or present itself as official military claims, HHG, PPM, or entitlement guidance.

# 18. Advanced Product Capabilities

These are not throwaway backlog ideas. They are part of the full product vision, sequenced after the foundation and core workflows.

## 18.1 Photo Walk Mode

The user chooses a room and walks around taking photos. The AI creates a review queue of proposed items. This is the fastest path for messy rooms.

## 18.2 First-Night Box

A special category for everything needed immediately after arrival: toiletries, bedding, chargers, medications, clothes, snacks, pet supplies, documents, and basic tools.

## 18.3 Do Not Let Movers Touch List

A dedicated list for passports, birth certificates, legal papers, laptops, drives, irreplaceable photos, jewelry, medications, firearms if applicable, and other sensitive items.

## 18.4 Packing Debt Dashboard

A dashboard that shows unfinished decision debt:

- Unreviewed AI items
- Items with no disposition
- Items with no transport assignment
- High-value items without photos
- Boxes without destination room
- Boxes not loaded
- Over-capacity resources

## 18.5 Evidence Density Score

A claims-focused score per item:

- Has item photo
- Has serial photo
- Has condition note
- Has value
- Has receipt photo
- Has box association

This gently nudges the user toward better documentation.

## 18.6 Sell/Donate/Free Pipelines

The app can generate action lists for decluttering:

- To photograph for sale
- Ready to list
- Listed
- Sold
- Donation packed
- Donation delivered
- Free pickup link
- Dump run

## 18.7 Private Giveaway Link

For free or giveaway items, the app can create a limited share page that hides the rest of the inventory.

## 18.8 Label Printer Mode

Support standard printable label sheets first. Later, add direct support for common thermal label printers.

## 18.9 Low-Confidence Review Queue

The app should not make the user hunt for AI uncertainty. Low-confidence items should naturally flow into a review queue.

## 18.10 Load Lock

The user can lock assignments they know are correct. The AI can rebalance everything else without moving locked items.

# 19. Full Build Program

These phases are dependency order. The plan is to build the complete product, with quality gates between phases so each later layer rests on real permissions, data contracts, tests, and working UI.

## Phase 0 - Project Foundation

- Create Next.js App Router TypeScript project.
- Configure Tailwind and shadcn/ui.
- Configure Clerk.
- Configure Convex.
- Set up linting, formatting, test framework, and environment examples.
- Add seed data scripts.
- Create base marketing, auth, dashboard, app layout, and admin layout.
- Connect `movingmanifest.com` to the Vercel project when production app routes exist.
- Configure project metadata, Open Graph defaults, and environment examples.

## Phase 1 - Auth, Tenancy, and Core Data

- Implement Clerk/Convex auth integration.
- Implement user sync via Clerk webhooks.
- Implement organizations/households or owner-scoped moves.
- Implement permission helpers.
- Implement moves, people, transport resources, and zones.
- Add tests for object-level authorization.
- Implement audit log primitives before broad write flows.

## Phase 2 - Move Setup, Resources, and Planning Presets

- Implement move creation and onboarding.
- Implement PCS, local, long-distance, storage, estate, and decluttering presets.
- Implement transport resource presets for trucks, trailers, movers, storage, sell, donate, dump, free, and unknown.
- Implement zones, capacities, rules, soft/hard warnings, and first-night/personal transport defaults.
- Implement documentation profile selection during move setup.

## Phase 3 - Inventory and Boxes

- Implement items, boxes, box contents, photos, and status flows.
- Implement inventory table.
- Implement item detail panel.
- Implement box manager.
- Implement bulk paste/text import without AI dependency.
- Implement QR/short-code lookup.
- Implement box labels PDF.

## Phase 4 - Photos and Evidence

- Implement photo metadata, privacy levels, evidence density, and photo review.
- Implement Backblaze upload session and photo finalize flow.
- Implement Cloudflare image delivery route/loader.
- Implement original download with owner/admin permission only.
- Implement EXIF handling for derivatives.

## Phase 5 - Estimation and Load Planner

- Implement weight and volume fields.
- Implement aggregate capacity calculations.
- Implement transport resource capacity meters.
- Implement drag-and-drop assignments.
- Implement warnings.
- Implement locked assignments.
- Implement first-night, do-not-let-movers-touch, and load crew views.

## Phase 6 - AI Assistance

- Implement AI provider abstraction.
- Implement text intake.
- Implement photo intake review queue if model credentials are present; provide mocked local mode if not.
- Implement estimate jobs.
- Implement assignment suggestion jobs.
- Store confidence, reasoning, and assumptions.
- Implement duplicate detection and low-confidence review queues.
- Implement AI cost controls and prompt/model version tracking.

## Phase 7 - Documentation Packets, Reports, and Exports

- Implement CSV export.
- Implement load plan export.
- Implement box labels PDF if not already complete.
- Implement claims packet export.
- Implement PCS support packet.
- Implement moving company packet.
- Implement employer relocation packet.
- Implement donation/sell/free/storage manifests.
- Implement scoped share links with expiration/revocation.

## Phase 8 - API and MCP

- Implement API key management UI.
- Implement REST API v1.
- Implement scopes, move restrictions, rate limiting, idempotency, and audit logs.
- Implement Node MCP server package wrapping the API.
- Add API docs and examples.

## Phase 9 - Admin, Billing Readiness, and Operations

- Implement admin dashboard.
- Implement storage/AI/API usage views.
- Implement abuse signals and audit review.
- Implement feature flags.
- Implement account export/delete flows.
- Add billing/pricing scaffolding only when product direction requires paid plans.

## Phase 10 - Mobile, Accessibility, and Launch Hardening

- Add mobile Move Day Mode.
- Add accessibility review.
- Add empty states, loading states, optimistic updates, and error states.
- Run type checks.
- Run lint.
- Run unit tests.
- Run end-to-end tests for core flows.
- Verify mobile layout.
- Verify unauthorized access attempts fail.
- Verify API key scope restrictions.
- Verify image originals are private.
- Verify exports work.
- Document deployment steps.
- Verify `movingmanifest.com` production routes, SSL, and redirect behavior.

# 20. Acceptance Criteria

The build is complete when all of these are true:

- A new user can sign up and create a move.
- The user can add two trucks, a 7x16 trailer, military/professional movers, dump, sell, donate, free, and storage resources.
- The user can create zones inside vehicles/trailers.
- The user can add at least 200 items without the UI becoming painful.
- The user can bulk import text and receive AI-created draft items.
- The user can upload photos and attach them to items or boxes.
- The app stores originals privately and serves optimized derivatives.
- The user can create boxes with short codes.
- The user can add items to boxes and look up box contents by code.
- The user can print or export box labels with QR codes.
- The user can drag items/boxes between resources and zones.
- Weight and volume totals update after assignments.
- The app shows capacity warnings.
- The AI can suggest assignments and explain them.
- The user can accept or reject AI suggestions.
- API keys can be created, scoped, revoked, and audited.
- REST API can list moves, add items, update items, create boxes, and suggest/apply assignments.
- MCP server can connect an external agent to the REST API.
- A guest/helper role can be limited and cannot see private values/photos.
- Admin can see usage and job status.
- Claims export includes item details, photos, values, condition notes, and status history.
- PCS documentation packet can be generated with appropriate disclaimers and configurable official fields.
- Moving company, employer relocation, insurance, self-move/load crew, donation/sell/free, and storage packets can be generated or shared with scoped privacy.
- `movingmanifest.com` serves the production application.
- Tests cover permissions, estimate calculations, API scopes, and core UI flows.

# 21. Product Owner Decisions

The product owner has decided to build the full product rather than a narrow MVP. The following defaults are technical/product decisions Codex should use unless Scott explicitly overrides them.

1. Build the complete product vision in phases rather than stopping at a minimal MVP.
2. Use `movingmanifest.com` as the production domain when the production app is ready.
3. Make PCS a first-class documentation mode, with configurable official fields and careful disclaimers.
4. Support common third-party documentation needs: moving company, employer relocation, insurance/claims, self-move/load crew, donation/sell/free, and storage.
5. Build as SaaS-capable from day one, while still making the product useful for a single household.
6. Use households/organizations as the collaboration boundary.
7. Hide values, serial numbers, sensitive photos, and private notes from helper/mover views by default.
8. Build QR labels, printable exports, and documentation packets as part of the full product.
9. Make load planning practical and capacity-based first; do not attempt precise 3D packing optimization unless a later dedicated feature requires it.
10. Make mobile capture and Move Day Mode robust, then consider full offline sync only after the data model and conflict rules are stable.

# 22. Technical Defaults

To reduce ambiguity for the coding agent, use these defaults:

- Build as SaaS-capable from day one, but allow single-user usage.
- Use households/organizations as the collaboration boundary.
- Use Clerk for auth and optional organizations.
- Build with built-in AI provider abstraction and external API/MCP access.
- Make load planning ballpark and capacity-based, not full 3D packing optimization.
- Add printable QR labels in the first build.
- Hide item values, serial numbers, and sensitive photos from helper/mover roles by default.
- Use Backblaze B2 for originals and Cloudflare for derivatives.
- Use private originals and signed access for originals.
- Use Cloudflare-transformed images in the web UI rather than Vercel image optimization.
- Implement REST API and local MCP server in the first full build.
- Make PCS a first-class documentation mode with configurable official allowance fields and clear verification language.
- Include moving company, employer relocation, insurance, self-move/load crew, donation/sell/free, and storage documentation profiles.
- Treat domain/app name as configurable.

# 23. Environment Variables

Suggested `.env.example`:

```text
NEXT_PUBLIC_APP_NAME="MovingManifest"
NEXT_PUBLIC_APP_URL="http://localhost:3827"

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""
CLERK_WEBHOOK_SECRET=""

NEXT_PUBLIC_CONVEX_URL=""
CONVEX_DEPLOYMENT=""

B2_APPLICATION_KEY_ID=""
B2_APPLICATION_KEY=""
B2_BUCKET_NAME=""
B2_ENDPOINT=""
B2_REGION=""

CLOUDFLARE_ACCOUNT_ID=""
CLOUDFLARE_IMAGES_TOKEN=""
CLOUDFLARE_IMAGE_DELIVERY_DOMAIN=""
IMAGE_SIGNING_SECRET=""

AI_PROVIDER="mock"
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""

API_KEY_PEPPER=""
ADMIN_EMAILS=""
```

Never expose non-public variables to the browser. Only variables prefixed with `NEXT_PUBLIC_` should be assumed client-visible.

# 24. Suggested Seed Data

Create seed data for:

- A PCS move from Utah to another state.
- Truck 1 with cab and bed zones.
- Truck 2 with cab and bed zones.
- 7x16 trailer with front/middle/rear zones.
- Military movers resource.
- Sell, donate, dump, free giveaway, and storage resources.
- At least 75 sample items across kitchen, garage, bedroom, office, living room, and storage.
- 10 boxes with contents.
- Several high-value items.
- Several fragile items.
- Several low-confidence AI estimates.
- Several photos represented by placeholder metadata.

# 25. Testing Requirements

## 25.1 Unit Tests

Test:

- Weight aggregation
- Volume aggregation
- Capacity warnings
- Box content aggregation
- API key hashing and scope checks
- Permission helpers
- Assignment suggestion constraints
- Export field mapping

## 25.2 Integration Tests

Test:

- Clerk webhook user sync into Convex
- Move creation
- Item creation
- Box creation
- Adding item to box
- Assignment apply endpoint
- Upload init/finalize flow with mocked B2
- API key auth and failure cases

## 25.3 End-to-End Tests

Test:

- Sign in
- Create move
- Add resources
- Add item
- Create box
- Assign item to box
- Assign box to trailer
- View capacity warning
- Create API key
- Use API key to add item
- Generate export

# 26. Source Notes Reviewed for This Spec

These are not implementation docs embedded forever. The coding agent should check current official docs before final implementation.

- Convex + Clerk integration documentation
- Convex Next.js App Router documentation
- Convex auth in functions documentation
- Clerk Server Actions/auth documentation
- Clerk API keys and MCP-related product documentation
- Backblaze B2 and Cloudflare integration documentation
- Backblaze B2 S3-compatible API and presigned URL documentation
- Cloudflare Images and image transformations documentation
- Vercel Image Optimization usage/pricing documentation
- Vercel Functions and Cron documentation
- OWASP API Security Top 10
- Model Context Protocol official introduction
- Military OneSource PCS FAQ and entitlements pages
- Live check that the original pre-rename domain direction was unavailable because the domain resolved to an existing site

# 27. One-Sentence Product North Star

MovingManifest should make it possible to walk through a house with a phone, capture what exists, let AI organize the mess, decide what goes where, and arrive with a searchable, claim-ready record instead of a foggy memory and a pile of mystery boxes.

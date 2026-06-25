export const MOVINGMANIFEST_CAPABILITY_VERSION = "2026-06-12";

export const MOVINGMANIFEST_KNOWN_LAUNCH_BLOCKERS = [
  {
    issue: "MOVE-63",
    title: "Switch Clerk to a production instance before public launch",
    area: "auth",
    impact:
      "Production auth must use Clerk production keys and origins before public users are invited.",
    owner: "external-account",
  },
  {
    issue: "MOVE-62",
    title: "Configure production admin access",
    area: "operations",
    impact:
      "The shipped admin dashboard cannot be used until an intended admin is granted access.",
    owner: "external-account",
  },
  {
    issue: "MOVE-68",
    title: "Configure Clerk production webhook endpoint and Convex signing secret",
    area: "auth-sync",
    impact:
      "Production Clerk user/org changes will not sync into Convex until the webhook secret is configured.",
    owner: "external-account",
  },
  {
    issue: "MOVE-64",
    title: "Evaluate and enforce a Content Security Policy after production origins settle",
    area: "security",
    impact:
      "CSP should be enforced after production auth, storage, analytics, and media origins are final.",
    owner: "security-default",
  },
  {
    issue: "MOVE-67",
    title: "Remove stale legacy Vercel alias after brand rename",
    area: "routing",
    impact:
      "Old pre-rename aliases can confuse QA and support notes after the MovingManifest rename.",
    owner: "external-account",
  },
];

export const MOVINGMANIFEST_API_CAPABILITIES = [
  {
    id: "apiContext",
    title: "API key context",
    status: "available",
    purpose:
      "Confirm the current API key's household, scopes, move restriction, and safe account context.",
    requiredScopes: ["valid API key"],
    restEndpoints: ["GET /api/v1/me"],
    mcpTools: ["get_api_context"],
    agentWorkflows: [
      "Check what a local agent is allowed to read or write before making changes.",
      "Detect whether a key is restricted to one move.",
    ],
  },
  {
    id: "moveSetup",
    title: "Move setup and summaries",
    status: "available",
    purpose:
      "Create PCS, local, long-distance, storage, estate, and decluttering moves, including one-call agent setup with room lists, transport resources/zones, and starter inventory.",
    requiredScopes: ["moves/read", "moves/write", "inventory/write"],
    restEndpoints: [
      "GET /api/v1/moves",
      "POST /api/v1/moves",
      "POST /api/v1/moves/setup",
      "GET /api/v1/moves/:moveId/summary",
      "GET /api/v1/moves/:moveId/agent-context",
    ],
    mcpTools: [
      "list_moves",
      "create_move",
      "setup_move",
      "get_move_summary",
      "get_agent_context",
    ],
    agentWorkflows: [
      "Create a PCS mixed move with official fields and default documentation profiles.",
      "Set up a new move from a user conversation in one write call, then use detailed endpoints for follow-up edits.",
      "Fetch one compact move summary before planning, exporting, or bulk updates.",
      "Fetch one compact agent context before making multi-step AI edits so the agent sees spaces, transport, inventory, photos, sales state, and write guidance in one call.",
    ],
  },
  {
    id: "householdMembers",
    title: "Household member access",
    status: "available",
    purpose:
      "List real household login access and add or invite a user to the household by email. Use this for spouses or family members who should sign in to the same move.",
    requiredScopes: ["members/manage"],
    restEndpoints: [
      "GET /api/v1/households/:householdId/members",
      "POST /api/v1/households/:householdId/members",
    ],
    mcpTools: ["list_household_members", "add_household_member"],
    agentWorkflows: [
      "Add a spouse or family member by email as editor, packer, viewer, guest, or admin; if they do not have an account yet, the invite activates when they sign in with that email.",
      "Explain the difference between household members who can log in and move people/contact records used for movers, helpers, offices, and adjusters.",
      "Use a key with explicit members/manage scope because granting household access is more sensitive than inventory intake.",
    ],
  },
  {
    id: "moveSpaces",
    title: "First-class move spaces",
    status: "available",
    purpose:
      "Create and read durable origin rooms, destination rooms, yards, storage areas, and transport-related spaces for inventory, photos, Layout Studio, and sale context.",
    requiredScopes: ["moves/read", "moves/write"],
    restEndpoints: [
      "GET /api/v1/moves/:moveId/spaces",
      "POST /api/v1/moves/:moveId/spaces",
      "PATCH /api/v1/moves/:moveId/spaces/:spaceId",
    ],
    mcpTools: ["list_move_spaces", "create_move_space"],
    agentWorkflows: [
      "Turn a user-provided room list into durable space targets instead of appending free-text notes.",
      "Attach future room, destination, storage, and transport photos to stable IDs.",
      "Use currentSpaceId/destinationSpaceId on inventory while preserving readable room names.",
    ],
  },
  {
    id: "salePipeline",
    title: "Sell item marketplace pipeline",
    status: "available",
    purpose:
      "Track sell-marked inventory items through listing prep, marketplace draft, pricing, research trail, buyer interest, listing status, and sold details.",
    requiredScopes: ["inventory/read", "inventory/write"],
    restEndpoints: [
      "GET /api/v1/moves/:moveId/sale-listings",
      "POST /api/v1/moves/:moveId/sale-listings",
      "PATCH /api/v1/moves/:moveId/sale-listings/:listingId",
    ],
    mcpTools: ["upsert_sale_listing"],
    agentWorkflows: [
      "Create a Facebook Marketplace-style draft from inventory title, photos, dimensions, room/context, and user notes.",
      "Save pricing research with source count, comparable prices, source links/summaries, confidence, and where the AI left off.",
      "Update listing status, official decided price, buyer interest, offers, sold price, and pickup status.",
    ],
  },
  {
    id: "moveQuestions",
    title: "Move question readiness",
    status: "available",
    purpose:
      "Fetch structured unanswered-question prompts that tell agents what setup, PCS, resource, inventory, evidence, load, and packet details still need human attention.",
    requiredScopes: ["moves/read", "inventory/read"],
    restEndpoints: ["GET /api/v1/moves/:moveId/questions"],
    mcpTools: ["get_move_questions"],
    agentWorkflows: [
      "Ask what is still missing before producing a PCS, moving-company, employer, storage, donation, or claims packet.",
      "Guide a user through the highest-severity missing move details without scraping the browser UI.",
    ],
  },
  {
    id: "moveDayChecklist",
    title: "Move Day checklist",
    status: "available",
    purpose:
      "Fetch a crew-safe Move Day box checklist with progress counts, load assignment names, warnings, hard blocks, and exception notes.",
    requiredScopes: ["moves/read", "inventory/read"],
    restEndpoints: ["GET /api/v1/moves/:moveId/move-day"],
    mcpTools: ["get_move_day_checklist"],
    agentWorkflows: [
      "Give helpers, movers, or local assistants a filtered status checklist without exposing values, serials, private notes, or photo details.",
      "Search a scanned box code and see where it should be staged, loaded, or marked as an exception.",
    ],
  },
  {
    id: "floorPlans",
    title: "Layout Studio floor plans",
    status: "available",
    purpose:
      "Read, summarize, snapshot, directly apply, or propose Layout Studio plan operations through the same op language used by the app.",
    requiredScopes: ["plans/read", "plans/write"],
    restEndpoints: [
      "GET /api/v1/plans?moveId=",
      "GET /api/v1/plans/:planId",
      "GET /api/v1/plans/:planId/summary",
      "POST /api/v1/plans/:planId/ops",
      "GET /api/v1/plans/:planId/proposals",
      "POST /api/v1/plans/:planId/proposals",
      "GET /api/v1/plans/:planId/snapshot.svg",
    ],
    mcpTools: [
      "plans_list",
      "plan_get",
      "plan_summary",
      "plan_apply_ops",
      "plan_propose_ops",
      "plan_snapshot",
    ],
    agentWorkflows: [
      "Read the current plan document before writing any plan ops.",
      "Propose op batches with human-readable reasoning so the user can review before applying.",
      "Render the SVG snapshot after substantial edits so a vision-capable agent can inspect its own geometry.",
    ],
  },
  {
    id: "inventory",
    title: "Inventory intake, planned items, and item updates",
    status: "available",
    purpose:
      "Search, create, update, soft-delete, batch upsert owned inventory records, and manage desired future items before they become owned inventory.",
    requiredScopes: ["inventory/read", "inventory/write"],
    restEndpoints: [
      "GET /api/v1/moves/:moveId/items",
      "POST /api/v1/moves/:moveId/items",
      "POST /api/v1/moves/:moveId/items/batch-upsert",
      "PATCH /api/v1/moves/:moveId/items/:itemId",
      "DELETE /api/v1/items/:itemId",
      "GET /api/v1/moves/:moveId/planned-items",
      "POST /api/v1/moves/:moveId/planned-items",
      "PATCH /api/v1/moves/:moveId/planned-items/:plannedItemId",
      "POST /api/v1/moves/:moveId/planned-items/:plannedItemId/convert",
      "DELETE /api/v1/moves/:moveId/planned-items/:plannedItemId",
    ],
    mcpTools: [
      "search_inventory",
      "create_item",
      "batch_upsert_items",
      "update_item",
      "delete_item",
      "list_planned_items",
      "create_planned_item",
      "update_planned_item",
      "convert_planned_item",
      "archive_planned_item",
    ],
    agentWorkflows: [
      "Import inventory from spreadsheets, walkthrough notes, or agent-created item lists.",
      "Track future furniture, appliances, or purchases inside Layout Studio before they should count as owned load.",
      "Convert a planned item into owned inventory when it has been purchased, preserving any existing floor-plan placements.",
      "Use dry runs before bulk inventory writes.",
    ],
  },
  {
    id: "boxes",
    title: "Boxes and contents",
    status: "available",
    purpose:
      "Capture box packing sessions as one workflow or use lower-level box/item assignment tools when a client needs detailed control.",
    requiredScopes: ["inventory/read", "inventory/write", "photos/write"],
    restEndpoints: [
      "POST /api/v1/moves/:moveId/boxes",
      "PATCH /api/v1/moves/:moveId/boxes/:boxId",
      "POST /api/v1/moves/:moveId/items/batch-upsert",
      "POST /api/v1/boxes/:boxId/items",
      "POST /api/v1/photos/upload",
      "DELETE /api/v1/boxes/:boxId/items/:itemId",
    ],
    mcpTools: [
      "save_box_intake",
      "create_box",
      "add_items_to_box",
      "remove_item_from_box",
    ],
    agentWorkflows: [
      "Use save_box_intake when a user wants to add or update a box with dimensions, weight, description, photos, newly described contents, or existing itemIds in one agent call.",
      "Run save_box_intake with dryRun first for confirmation and pass a stable idempotencyKey when creating a new box so retries do not create duplicate boxes.",
      "Build box manifests from packing sessions.",
      "Move items between boxes while preserving inventory history.",
    ],
  },
  {
    id: "transportPlanning",
    title: "Transport resources, zones, and capacity planning",
    status: "available",
    purpose:
      "Model trucks, trailers, military/professional movers, storage, donation, sale, dump, and internal zones.",
    requiredScopes: ["moves/read", "moves/write"],
    restEndpoints: [
      "GET /api/v1/moves/:moveId/resources",
      "POST /api/v1/moves/:moveId/resources",
      "PATCH /api/v1/moves/:moveId/resources/:resourceId",
      "GET /api/v1/moves/:moveId/zones",
      "POST /api/v1/moves/:moveId/zones",
      "PATCH /api/v1/moves/:moveId/zones/:zoneId",
      "GET /api/v1/moves/:moveId/capacity-report",
    ],
    mcpTools: [
      "list_transport_resources",
      "create_transport_resource",
      "update_transport_resource",
      "create_transport_zone",
      "update_transport_zone",
      "get_capacity_report",
    ],
    agentWorkflows: [
      "Set up a PCS move with two trucks, a trailer, and an HHG mover channel.",
      "Compare estimated load against capacity before move day.",
    ],
  },
  {
    id: "assignmentSuggestions",
    title: "Load assignment suggestions and review",
    status: "available",
    purpose:
      "Generate deterministic box-to-resource suggestions and route AI planning suggestions through explicit review.",
    requiredScopes: ["moves/read", "moves/write", "inventory/read", "inventory/write"],
    restEndpoints: [
      "POST /api/v1/moves/:moveId/assignments/suggest",
      "POST /api/v1/moves/:moveId/assignments/apply",
      "GET /api/v1/moves/:moveId/planning-suggestions",
      "POST /api/v1/moves/:moveId/planning-suggestions/generate",
      "POST /api/v1/moves/:moveId/planning-suggestions/approve",
      "POST /api/v1/moves/:moveId/planning-suggestions/reject",
    ],
    mcpTools: [
      "suggest_assignments",
      "apply_assignments",
      "list_planning_suggestions",
      "generate_planning_suggestions",
      "approve_planning_suggestions",
      "reject_planning_suggestions",
    ],
    agentWorkflows: [
      "Suggest load assignments without writing.",
      "Approve or reject specific planning suggestions instead of silently mutating user data.",
    ],
  },
  {
    id: "aiReviewVisibility",
    title: "AI job and intake review queues",
    status: "available",
    purpose:
      "Inspect AI job status and route text/photo intake suggestions through explicit dry-run, approval, or rejection review.",
    requiredScopes: ["inventory/read", "inventory/write"],
    restEndpoints: [
      "GET /api/v1/moves/:moveId/ai-jobs/provider-status",
      "GET /api/v1/moves/:moveId/ai-jobs",
      "GET /api/v1/moves/:moveId/ai-jobs/:aiJobId",
      "GET /api/v1/moves/:moveId/ai-text-suggestions",
      "GET /api/v1/moves/:moveId/ai-text-suggestions/:suggestionId",
      "POST /api/v1/moves/:moveId/ai-text-suggestions/generate",
      "POST /api/v1/moves/:moveId/ai-text-suggestions/approve",
      "POST /api/v1/moves/:moveId/ai-text-suggestions/reject",
      "GET /api/v1/moves/:moveId/ai-photo-suggestions",
      "GET /api/v1/moves/:moveId/ai-photo-suggestions/:suggestionId",
      "POST /api/v1/moves/:moveId/ai-photo-suggestions/generate",
      "POST /api/v1/moves/:moveId/ai-photo-suggestions/approve",
      "POST /api/v1/moves/:moveId/ai-photo-suggestions/reject",
    ],
    mcpTools: [
      "get_ai_provider_status",
      "list_ai_jobs",
      "list_ai_text_suggestions",
      "list_ai_photo_suggestions",
      "generate_ai_text_suggestions",
      "generate_ai_photo_suggestions",
      "approve_ai_text_suggestions",
      "reject_ai_text_suggestions",
      "approve_ai_photo_suggestions",
      "reject_ai_photo_suggestions",
    ],
    agentWorkflows: [
      "Check whether model-backed review is configured before recommending OpenAI-backed work.",
      "Summarize pending AI text/photo suggestions for a human reviewer.",
      "Inspect AI job success, failure, cost, and token summaries without exposing raw provider refs.",
      "Generate pending review suggestions from source text or already-uploaded photo evidence.",
      "Dry-run exact suggestion approvals before creating trusted inventory, boxes, assignments, or photo links.",
      "Approve or reject explicit pending suggestion IDs with API-key audit events.",
    ],
  },
  {
    id: "photoEvidence",
    title: "Evidence media intake",
    status: "available",
    purpose:
      "View existing photos as inline images, upload image evidence through a one-call agent path, or use lower-level upload sessions for audio, video, progress bars, and custom clients.",
    requiredScopes: ["moves/read", "inventory/read", "inventory/write", "photos/write"],
    restEndpoints: [
      "GET /api/v1/moves/:moveId/photos",
      "GET /api/v1/moves/:moveId/photos/:photoId/display-url",
      "POST /api/v1/photos/upload",
      "POST /api/v1/images/upload",
      "POST /api/v1/uploads/init",
      "POST /api/v1/photos/finalize",
      "POST /api/v1/photos/:photoId/attach",
    ],
    mcpTools: [
      "get_images",
      "add_item_from_photo",
      "create_item_with_images",
      "upload_evidence_image",
      "upload_evidence_images",
      "upload_photo",
      "upload_photos",
      "upload_image",
      "upload_images",
      "upload_evidence_file",
      "start_photo_upload",
      "finalize_photo_upload",
      "attach_photo",
    ],
    agentWorkflows: [
      "To LOOK AT existing photos (read a model/serial number, write a description, judge condition), call get_images with a filter (itemId/boxId/spaceId/room or photoIds) — it returns the pictures as inline viewable images, not just links, and the server fetches the bytes so it works even when your own sandbox cannot reach the image host. Use variant 'detail' for fine print; keep limit small.",
      "When the user provides one picture plus a few short words for one household item, use add_item_from_photo. Set quantity only when the user says it or the photo clearly shows a count; otherwise omit quantity so it defaults to 1. Unknown weight/size/disposition/condition can stay blank. The tool uploads the original image, creates web-ready derivatives, attaches the photo, and returns item/photo IDs plus agentReview.",
      "Use create_item_with_images when the same new item has several photos or when the agent already has an images array.",
      "For ordinary images, use upload_image, upload_photo, or upload_evidence_image first: pass exactly one local file path, public image URL, data URL, or base64 image; MovingManifest stores the original, reads dimensions, finalizes the evidence record, and creates web-ready derivatives.",
      "Use derivativeVariants in upload responses to confirm the storage-prepped 200x200 thumb, 600x600 card, 1200x1200 detail, and 2400x2400 full WebP display variants without exposing private storage keys.",
      "When a user gives several ordinary images from the same room/context or for an existing item, use upload_images, upload_photos, or upload_evidence_images with shared defaults and one image entry per user image. For existing items, resolve itemId first with get_agent_context or get_move_summary and pass itemId at the top level.",
      "Set generateAiSuggestions true when the uploaded image should also enter AI photo review; upload still succeeds if review queueing fails or the key only has photos/write.",
      "Do not ask the user for dimensions, thumbnail sizes, or derivative files during normal AI-assisted photo capture.",
      "Use upload_evidence_file for non-image media or when the agent needs to keep the storage PUT in the local process.",
      "Use lower-level start/finalize tools only when the client needs presigned-upload control, audio/video upload, progress bars, or client-created image derivatives.",
      "Attach reviewed evidence media to items, boxes, rooms, and documentation profiles.",
      "Keep original file delivery separate from recipient-safe packet thumbnails.",
    ],
  },
  {
    id: "peopleAndContacts",
    title: "People and move contacts",
    status: "available",
    purpose:
      "Track household members, helpers, movers, PCS offices, employer relocation contacts, storage contacts, and adjusters.",
    requiredScopes: ["moves/read", "moves/write"],
    restEndpoints: [
      "GET /api/v1/moves/:moveId/people",
      "POST /api/v1/moves/:moveId/people",
      "PATCH /api/v1/moves/:moveId/people/:personId",
      "DELETE /api/v1/moves/:moveId/people/:personId",
    ],
    mcpTools: [
      "list_move_people",
      "create_move_person",
      "update_move_person",
      "archive_move_person",
    ],
    agentWorkflows: [
      "Create PCS transportation office or employer relocation contacts for documentation packets.",
      "Archive contacts without losing move history.",
    ],
  },
  {
    id: "documentationProfiles",
    title: "Documentation profiles and packets",
    status: "available",
    purpose:
      "Create and manage scoped packet profiles for PCS, movers, employers, claims, donations, giveaways, storage, load crews, and owner records.",
    requiredScopes: ["exports/read", "exports/create", "inventory/read"],
    restEndpoints: [
      "GET /api/v1/moves/:moveId/documentation-profiles",
      "POST /api/v1/moves/:moveId/documentation-profiles",
      "PATCH /api/v1/moves/:moveId/documentation-profiles/:documentationProfileId",
      "DELETE /api/v1/moves/:moveId/documentation-profiles/:documentationProfileId",
      "POST /api/v1/moves/:moveId/exports",
      "GET /api/v1/moves/:moveId/exports",
      "GET /api/v1/moves/:moveId/exports/:exportJobId/download",
    ],
    mcpTools: [
      "list_documentation_profiles",
      "create_documentation_profile",
      "update_documentation_profile",
      "archive_documentation_profile",
      "create_export",
      "list_exports",
      "download_export",
    ],
    agentWorkflows: [
      "Generate PCS, moving-company, employer-relocation, storage, donation, and claims-ready packets.",
      "Export CSV artifacts without granting broad browser session access.",
    ],
  },
  {
    id: "publicSharing",
    title: "Scoped public sharing",
    status: "available",
    purpose:
      "Create and revoke scoped share links that expose only recipient-safe packet fields and actions.",
    requiredScopes: ["exports/read", "exports/create"],
    restEndpoints: [
      "GET /api/v1/moves/:moveId/share-links",
      "GET /api/v1/moves/:moveId/share-links/comments",
      "GET /api/v1/moves/:moveId/share-links/:shareLinkId/comments",
      "POST /api/v1/moves/:moveId/share-links",
      "DELETE /api/v1/moves/:moveId/share-links/:shareLinkId",
    ],
    mcpTools: [
      "list_share_links",
      "list_share_link_comments",
      "create_share_link",
      "revoke_share_link",
    ],
    agentWorkflows: [
      "Create profile-scoped links for movers, employers, PCS offices, donation pickup, storage, or helpers.",
      "Review recipient comments without exposing raw share tokens or browser sessions.",
      "Allow public status updates and comments through token links without exposing raw API keys.",
    ],
  },
];

export function getCapabilityToolNames() {
  return [
    "get_api_capabilities",
    ...new Set(MOVINGMANIFEST_API_CAPABILITIES.flatMap((entry) => entry.mcpTools)),
  ];
}

export function getApiCapabilities() {
  const statuses = MOVINGMANIFEST_API_CAPABILITIES.reduce((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    product: "MovingManifest",
    apiVersion: "v1",
    capabilityVersion: MOVINGMANIFEST_CAPABILITY_VERSION,
    defaultBaseUrl: "https://movingmanifest.com/api/v1",
    summary: {
      capabilityCount: MOVINGMANIFEST_API_CAPABILITIES.length,
      toolCount: getCapabilityToolNames().length,
      statuses,
    },
    capabilities: MOVINGMANIFEST_API_CAPABILITIES,
    knownLaunchBlockers: MOVINGMANIFEST_KNOWN_LAUNCH_BLOCKERS,
    guidance: [
      "Call get_api_context first to inspect scopes and move restrictions.",
      "Prefer dryRun on write tools before bulk imports, load assignment changes, and scoped sharing.",
      "Use move-restricted API keys for local agents whenever possible.",
      "Do not put API keys or raw share tokens in prompts, screenshots, logs, issues, or exported docs.",
    ],
  };
}

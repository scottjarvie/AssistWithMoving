export const MOVINGMANIFEST_CAPABILITY_VERSION = "2026-06-09";

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
    issue: "MOVE-66",
    title: "Fix Backblaze B2 credentials and CORS for photo-upload e2e",
    area: "storage",
    impact:
      "Photo evidence code is implemented, but live upload verification is blocked by invalid B2 auth/CORS.",
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
    title: "Remove stale TheMovePlanner Vercel alias after brand rename",
    area: "routing",
    impact:
      "Old generated aliases can confuse QA and support notes after the MovingManifest rename.",
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
      "Create PCS, local, long-distance, storage, estate, and decluttering moves and fetch compact move state.",
    requiredScopes: ["moves/read", "moves/write"],
    restEndpoints: [
      "GET /api/v1/moves",
      "POST /api/v1/moves",
      "GET /api/v1/moves/:moveId/summary",
    ],
    mcpTools: ["list_moves", "create_move", "get_move_summary"],
    agentWorkflows: [
      "Create a PCS mixed move with official fields and default documentation profiles.",
      "Fetch one compact move summary before planning, exporting, or bulk updates.",
    ],
  },
  {
    id: "inventory",
    title: "Inventory intake and item updates",
    status: "available",
    purpose:
      "Search, create, update, soft-delete, and batch upsert household inventory records.",
    requiredScopes: ["inventory/read", "inventory/write"],
    restEndpoints: [
      "GET /api/v1/moves/:moveId/items",
      "POST /api/v1/moves/:moveId/items",
      "POST /api/v1/moves/:moveId/items/batch-upsert",
      "PATCH /api/v1/moves/:moveId/items/:itemId",
      "DELETE /api/v1/items/:itemId",
    ],
    mcpTools: [
      "search_inventory",
      "create_item",
      "batch_upsert_items",
      "update_item",
      "delete_item",
    ],
    agentWorkflows: [
      "Import inventory from spreadsheets, walkthrough notes, or agent-created item lists.",
      "Use dry runs before bulk inventory writes.",
    ],
  },
  {
    id: "boxes",
    title: "Boxes and contents",
    status: "available",
    purpose:
      "Create boxes and maintain item-to-box assignments without exposing deleted item data.",
    requiredScopes: ["inventory/read", "inventory/write"],
    restEndpoints: [
      "POST /api/v1/moves/:moveId/boxes",
      "POST /api/v1/boxes/:boxId/items",
      "DELETE /api/v1/boxes/:boxId/items/:itemId",
    ],
    mcpTools: ["create_box", "add_items_to_box", "remove_item_from_box"],
    agentWorkflows: [
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
      "Summarize pending AI text/photo suggestions for a human reviewer.",
      "Inspect AI job success, failure, cost, and token summaries without exposing raw provider refs.",
      "Generate pending review suggestions from source text or already-uploaded photo evidence.",
      "Dry-run exact suggestion approvals before creating trusted inventory, boxes, assignments, or photo links.",
      "Approve or reject explicit pending suggestion IDs with API-key audit events.",
    ],
  },
  {
    id: "photoEvidence",
    title: "Photo evidence intake",
    status: "availableWithOperationalBlocker",
    purpose:
      "Start upload sessions and attach photo metadata for condition, serial, receipt, mover, PCS, and claims evidence.",
    requiredScopes: ["moves/read", "inventory/read", "photos/write"],
    restEndpoints: [
      "POST /api/v1/uploads/init",
      "POST /api/v1/photos/:photoId/attach",
    ],
    mcpTools: ["start_photo_upload", "attach_photo"],
    agentWorkflows: [
      "Attach reviewed evidence photos to items, boxes, rooms, and documentation profiles.",
      "Keep original file delivery separate from recipient-safe packet thumbnails.",
    ],
    operationalBlockers: ["MOVE-66"],
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

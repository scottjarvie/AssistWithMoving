#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  addItemFromPhoto,
  addItemsToBox,
  applyAssignments,
  batchUpsertItems,
  attachPhoto,
  archiveMovePerson,
  archiveDocumentationProfile,
  addHouseholdMember,
  approveAiPhotoSuggestions,
  approveAiTextSuggestions,
  createApiConfig,
  createBox,
  createDocumentationProfile,
  createExport,
  createItem,
  createItemWithImages,
  createMove,
  createMovePerson,
  createTransportResource,
  createTransportZone,
  deleteItem,
  finalizePhotoUpload,
  downloadExport,
  approvePlanningSuggestions,
  generatePlanningSuggestions,
  generateAiPhotoSuggestions,
  generateAiTextSuggestions,
  createMoveSpace,
  archivePlannedItem,
  getAiProviderStatus,
  getApiCapabilities,
  getApiContext,
  getAgentContext,
  getCapacityReport,
  getInlineImages,
  getMoveDayChecklist,
  getMoveQuestions,
  getMoveSummary,
  listHouseholdMembers,
  listAiJobs,
  listAiPhotoSuggestions,
  listAiTextSuggestions,
  listDocumentationProfiles,
  listExports,
  listMoves,
  listMovePeople,
  listMoveSpaces,
  listPlannedItems,
  listPlanningSuggestions,
  listShareLinkComments,
  listShareLinks,
  listTransportResources,
  planApplyOps,
  planGet,
  planProposeOps,
  planSnapshot,
  planSummary,
  plansList,
  convertPlannedItem,
  removeItemFromBox,
  rejectAiPhotoSuggestions,
  rejectAiTextSuggestions,
  rejectPlanningSuggestions,
  revokeShareLink,
  saveBoxIntake,
  searchInventory,
  setupMove,
  updateMove,
  startPhotoUpload,
  suggestAssignments,
  textResult,
  toolErrorResult,
  createPlannedItem,
  uploadEvidenceImage,
  uploadEvidenceImages,
  uploadEvidenceFile,
  updateDocumentationProfile,
  updateMovePerson,
  updateTransportResource,
  updateTransportZone,
  upsertSaleListing,
  updateItem,
  updatePlannedItem,
  createShareLink,
} from "./movingmanifest-api.mjs";

const allowedOriginalMediaMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

const allowedOriginalImageMimeTypes = ["image/jpeg", "image/png", "image/webp"];

const allowedDerivativeImageMimeTypes = ["image/jpeg", "image/png", "image/webp"];

const capacityInputSchema = z.object({
  maxWeightLb: z.number().nonnegative().optional(),
  maxVolumeCuFt: z.number().nonnegative().optional(),
  maxItemCount: z.number().int().nonnegative().optional(),
  dimensions: z
    .object({
      lengthIn: z.number().nonnegative().optional(),
      widthIn: z.number().nonnegative().optional(),
      heightIn: z.number().nonnegative().optional(),
    })
    .optional(),
  weightIsUnlimited: z.boolean().optional(),
  volumeIsUnlimited: z.boolean().optional(),
});

const documentationProfileTypeSchema = z.enum([
  "personalFullRecord",
  "pcsMove",
  "movingCompany",
  "employerRelocation",
  "insuranceClaim",
  "donationPickup",
  "sellOrGiveaway",
  "storageInventory",
  "loadCrew",
]);

const documentationFieldSchema = z.enum([
  "moveSummary",
  "pcsFields",
  "rooms",
  "items",
  "boxes",
  "loadAssignments",
  "photos",
  "estimatedValues",
  "purchaseValues",
  "serialNumbers",
  "privateNotes",
  "conditionAndDamage",
  "auditSummary",
]);

const documentationImageRuleSchema = z.enum([
  "none",
  "thumbsOnly",
  "reviewedEvidence",
  "allAllowed",
]);

const documentationStatusSchema = z.enum(["draft", "active", "archived"]);

const planningSuggestionStatusSchema = z.enum([
  "pending",
  "approved",
  "edited",
  "rejected",
]);

const aiJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
]);

const aiSuggestionStatusSchema = z.enum([
  "pending",
  "approved",
  "edited",
  "rejected",
]);

const itemDispositionSchema = z.enum([
  "undecided",
  "take",
  "sell",
  "donate",
  "dump",
  "free",
  "storage",
  "mover",
  "personalTransport",
]);

const itemFragilitySchema = z.enum(["low", "medium", "high"]);

const planningDefaultKeySchema = z.enum([
  "firstNight",
  "doNotLetMoversTouch",
  "highValue",
  "documents",
  "medication",
  "electronics",
  "sensitive",
  "fragile",
  "irreplaceable",
  "restrictedReview",
]);

const estimateConfidenceSchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "manual",
  "actual",
  "estimated",
]);

const measurementProvenanceSourceSchema = z.enum([
  "unknown",
  "photoEstimate",
  "conversationEstimate",
  "aiEstimate",
  "manualEstimate",
  "manualMeasurement",
  "productResearch",
  "manufacturerSpec",
  "moverEstimate",
  "moverConfirmed",
  "import",
  "api",
]);

const plannedItemStatusSchema = z.enum([
  "idea",
  "decided",
  "purchased",
  "dropped",
]);

const dimensionsInSchema = z.object({
  lengthIn: z.number().nonnegative().optional(),
  widthIn: z.number().nonnegative().optional(),
  heightIn: z.number().nonnegative().optional(),
});

const measurementProvenanceEntrySchema = z.object({
  sourceType: measurementProvenanceSourceSchema,
  confidence: estimateConfidenceSchema.optional(),
  label: z.string().optional(),
  notes: z.string().optional(),
  recordedAt: z.number().optional(),
  recordedByLabel: z.string().optional(),
  needsVerification: z.boolean().optional(),
});

const itemMeasurementProvenanceSchema = z.object({
  dimensions: measurementProvenanceEntrySchema.optional(),
  weight: measurementProvenanceEntrySchema.optional(),
  volume: measurementProvenanceEntrySchema.optional(),
});

const moveSpaceKindSchema = z.enum([
  "originRoom",
  "destinationRoom",
  "yardOutdoor",
  "storage",
  "transportResource",
  "transportZone",
  "custom",
]);

const saleListingStatusSchema = z.enum([
  "needsPrep",
  "researchingPrice",
  "draftReady",
  "listed",
  "interestReceived",
  "offerPending",
  "sold",
  "removed",
  "kept",
  "donated",
]);

const saleListingPlatformSchema = z.enum([
  "facebookMarketplace",
  "craigslist",
  "offerUp",
  "nextdoor",
  "ebay",
  "other",
]);

const saleResearchDepthSchema = z.enum(["none", "quick", "standard", "deep"]);

const saleResearchSourceSchema = z.object({
  title: z.string().optional(),
  url: z.string().url().optional(),
  summary: z.string().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  checkedAt: z.number().optional(),
});

const capacityReviewStatusSchema = z.enum([
  "unreviewed",
  "estimated",
  "confirmed",
]);

const inventoryItemWriteSchema = z.object({
  itemId: z.string().optional(),
  externalSource: z.string().optional(),
  externalId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  room: z.string().optional(),
  destinationRoom: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  disposition: itemDispositionSchema.optional(),
  status: z.string().optional(),
  quantity: z.number().positive().optional(),
  condition: z.string().optional(),
  valueCents: z.number().int().nonnegative().optional(),
  replacementValueCents: z.number().int().nonnegative().optional(),
  serialNumber: z.string().optional(),
  modelNumber: z.string().optional(),
  dimensionsIn: dimensionsInSchema.optional(),
  measurementProvenance: itemMeasurementProvenanceSchema.optional(),
  dimensionsConfidence: estimateConfidenceSchema.optional(),
  estimatedWeightLb: z.number().nonnegative().optional(),
  estimatedWeightLowLb: z.number().nonnegative().optional(),
  estimatedWeightHighLb: z.number().nonnegative().optional(),
  actualWeightLb: z.number().nonnegative().optional(),
  weightConfidence: estimateConfidenceSchema.optional(),
  estimatedVolumeCuFt: z.number().nonnegative().optional(),
  estimatedPackedVolumeCuFt: z.number().nonnegative().optional(),
  volumeConfidence: estimateConfidenceSchema.optional(),
  fragility: itemFragilitySchema.optional(),
  stackable: z.boolean().optional(),
  hazardousFlag: z.boolean().optional(),
  highValue: z.boolean().optional(),
  requiresPersonalTransport: z.boolean().optional(),
  planningDefaultKeys: z.array(planningDefaultKeySchema).optional(),
  needsReview: z.boolean().optional(),
  reviewFlags: z.array(z.string()).optional(),
  privateNotes: z.string().optional(),
  aiSummary: z.string().optional(),
  aiTags: z.array(z.string()).optional(),
});

const evidenceImageInputSchema = z.object({
  filePath: z
    .string()
    .optional()
    .describe("Absolute or working-directory-relative local JPEG, PNG, or WebP file path."),
  sourceUrl: z
    .string()
    .url()
    .optional()
    .describe("Public HTTP(S) image URL. Do not use for private localhost or credentialed URLs."),
  dataUrl: z
    .string()
    .optional()
    .describe("Base64 image data URL such as data:image/jpeg;base64,..."),
  fileBase64: z
    .string()
    .optional()
    .describe("Raw base64 JPEG, PNG, or WebP bytes when a data URL is not convenient."),
  fileName: z.string().optional(),
  itemId: z.string().optional(),
  boxId: z.string().optional(),
  spaceId: z.string().optional(),
  transportResourceId: z.string().optional(),
  transportZoneId: z.string().optional(),
  room: z.string().optional(),
  mimeType: z.enum(allowedOriginalImageMimeTypes).optional(),
  originalHash: z.string().optional(),
  caption: z.string().optional(),
  photoType: z.string().optional(),
  privacyLevel: z.string().optional(),
  visibilityScope: z.string().optional(),
  source: z.string().optional(),
  exifHandlingStatus: z.string().optional(),
  confidence: z.string().optional(),
  notes: z.string().optional(),
  verificationStatus: z.string().optional(),
  capturedAt: z.number().optional(),
  generateAiSuggestions: z
    .boolean()
    .optional()
    .describe("When true, ask MovingManifest to queue AI photo-intake suggestions after upload. Requires inventory/write in addition to photos/write."),
  idempotencyKey: z.string().optional(),
});

const createdItemImageInputSchema = evidenceImageInputSchema.omit({
  itemId: true,
});

const boxIntakeImageInputSchema = evidenceImageInputSchema.omit({
  itemId: true,
  boxId: true,
});

const evidenceImageBatchDefaultsSchema = evidenceImageInputSchema.omit({
  filePath: true,
  sourceUrl: true,
  dataUrl: true,
  fileBase64: true,
  fileName: true,
  originalHash: true,
  idempotencyKey: true,
});

const evidencePhotoDefaultsSchema = z.object({
  boxId: z.string().optional(),
  spaceId: z.string().optional(),
  transportResourceId: z.string().optional(),
  transportZoneId: z.string().optional(),
  room: z.string().optional(),
  mimeType: z.enum(allowedOriginalImageMimeTypes).optional(),
  caption: z.string().optional(),
  photoType: z.string().optional(),
  privacyLevel: z.string().optional(),
  visibilityScope: z.string().optional(),
  source: z.string().optional(),
  exifHandlingStatus: z.string().optional(),
  confidence: z.string().optional(),
  notes: z.string().optional(),
  verificationStatus: z.string().optional(),
  capturedAt: z.number().optional(),
  generateAiSuggestions: z
    .boolean()
    .optional()
    .describe("When true, queue AI photo-intake suggestions for uploaded item photos when the key also has inventory/write."),
});

const setupTransportZoneSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  capacity: capacityInputSchema.optional(),
  preferredTags: z.array(z.string()).optional(),
  sortOrder: z.number().optional(),
});

const setupTransportResourceSchema = z.object({
  presetKey: z.string().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  capacity: capacityInputSchema.optional(),
  capacityReviewStatus: capacityReviewStatusSchema.optional(),
  capacityNotes: z.string().optional(),
  rules: z.array(z.string()).optional(),
  sortOrder: z.number().optional(),
  zones: z.array(setupTransportZoneSchema).optional(),
});

const moveDayFilterSchema = z.enum([
  "all",
  "ready",
  "staged",
  "loaded",
  "exceptions",
]);

const planningEstimateDraftSchema = z.object({
  category: z.string().optional(),
  estimatedWeightLb: z.number().positive().optional(),
  estimatedWeightLowLb: z.number().positive().optional(),
  estimatedWeightHighLb: z.number().positive().optional(),
  estimatedVolumeCuFt: z.number().positive().optional(),
  estimatedPackedVolumeCuFt: z.number().positive().optional(),
  weightConfidence: estimateConfidenceSchema.optional(),
  volumeConfidence: estimateConfidenceSchema.optional(),
});

const planningAssignmentDraftSchema = z.object({
  overrideReason: z.string().optional(),
});

const planningApprovalSchema = z.object({
  suggestionId: z.string(),
  estimateDraft: planningEstimateDraftSchema.optional(),
  assignmentDraft: planningAssignmentDraftSchema.optional(),
  assignmentOverrideReason: z.string().optional(),
});

const aiItemDraftBaseSchema = z.object({
  name: z.string().min(1),
  room: z.string().optional(),
  category: z.string().optional(),
  disposition: itemDispositionSchema.optional(),
  quantity: z.number().positive().optional(),
  description: z.string().optional(),
  suggestedBoxLabel: z.string().optional(),
  fragility: itemFragilitySchema.optional(),
  highValue: z.boolean().optional(),
  planningDefaultKeys: z.array(planningDefaultKeySchema).optional(),
});

const aiTextItemDraftSchema = aiItemDraftBaseSchema.extend({
  destinationRoom: z.string().optional(),
});

const aiPhotoItemDraftSchema = aiItemDraftBaseSchema;

const aiTextBoxDraftSchema = z.object({
  code: z.string().optional(),
  label: z.string().min(1),
  room: z.string().optional(),
  destinationRoom: z.string().optional(),
  description: z.string().optional(),
});

const aiPhotoBoxDraftSchema = z.object({
  code: z.string().optional(),
  label: z.string().min(1),
  room: z.string().optional(),
  description: z.string().optional(),
});

const aiTextApprovalSchema = z.object({
  suggestionId: z.string(),
  itemDraft: aiTextItemDraftSchema.optional(),
  boxDraft: aiTextBoxDraftSchema.optional(),
});

const aiPhotoApprovalSchema = z.object({
  suggestionId: z.string(),
  itemDraft: aiPhotoItemDraftSchema.optional(),
  boxDraft: aiPhotoBoxDraftSchema.optional(),
});

const movePersonRoleSchema = z.enum([
  "owner",
  "householdMember",
  "helper",
  "mover",
  "contact",
]);

const householdMemberRoleSchema = z.enum([
  "admin",
  "editor",
  "packer",
  "viewer",
  "guest",
]);

const shareLinkActionSchema = z.enum([
  "view",
  "viewPlan",
  "download",
  "statusUpdate",
  "comment",
  "uploadEvidence",
]);

const planPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const planUnderlaySchema = z.object({
  photoId: z.string(),
  opacity: z.number(),
  originX: z.number(),
  originY: z.number(),
  scaleInPerPx: z.number().positive(),
  rotationDeg: z.number(),
});

const planWallSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  thicknessIn: z.number().positive(),
  heightIn: z.number().positive(),
});

const planRoomSchema = z.object({
  points: z.array(planPointSchema).min(3),
  fillColor: z.string().optional(),
});

const planOpeningSchema = z.object({
  wallShortId: z.string().min(1),
  offsetAlongWallIn: z.number(),
  widthIn: z.number().positive(),
  kind: z.enum(["door", "window", "passage"]),
  swing: z.enum(["left", "right", "none"]),
  sillHeightIn: z.number().optional(),
  headHeightIn: z.number().optional(),
});

const planFeatureSchema = z.object({
  x: z.number(),
  y: z.number(),
  rotationDeg: z.number(),
  featureKind: z.enum([
    "stairs",
    "sink",
    "toilet",
    "tub",
    "shower",
    "waterHeater",
    "fireplace",
    "counter",
    "custom",
  ]),
  widthIn: z.number().positive(),
  depthIn: z.number().positive(),
  label: z.string().optional(),
});

const planZoneSchema = z.object({
  points: z.array(planPointSchema).min(3),
  zoneKind: z.enum(["driveway", "shed", "garden", "fence", "patio", "custom"]),
});

const planAnnotationSchema = z.object({
  x: z.number(),
  y: z.number(),
  text: z.string().min(1),
  fontSizeIn: z.number().positive().optional(),
});

const planLevelInputSchema = z.object({
  name: z.string().min(1),
  levelType: z.enum(["indoor", "outdoor"]),
  sortOrder: z.number(),
  ceilingHeightIn: z.number().positive().optional(),
  underlay: planUnderlaySchema.optional(),
});

const planEntityInputSchema = z.object({
  levelId: z.string().min(1),
  entityType: z.enum(["wall", "room", "opening", "feature", "zone", "annotation"]),
  name: z.string().optional(),
  color: z.string().optional(),
  locked: z.boolean().optional(),
  wall: planWallSchema.optional(),
  room: planRoomSchema.optional(),
  opening: planOpeningSchema.optional(),
  feature: planFeatureSchema.optional(),
  zone: planZoneSchema.optional(),
  annotation: planAnnotationSchema.optional(),
});

const planPlacementSourceSchema = z.union([
  z.object({ itemId: z.string().min(1) }),
  z.object({ boxId: z.string().min(1) }),
  z.object({ plannedItemId: z.string().min(1) }),
  z.object({ templateKey: z.string().min(1) }),
]);

const planPlacementInputSchema = planPlacementSourceSchema.and(
  z.object({
    levelId: z.string().min(1),
    x: z.number(),
    y: z.number(),
    rotationDeg: z.number(),
    footprintOverrideIn: z
      .object({
        lengthIn: z.number().positive(),
        widthIn: z.number().positive(),
      })
      .optional(),
    parentPlacementId: z.string().optional(),
    containmentMode: z.enum(["inside", "onTop"]).optional(),
    zOrder: z.number().optional(),
    color: z.string().optional(),
    locked: z.boolean().optional(),
  })
);

const planEntityPatchSchema = z.object({
  name: z.string().optional(),
  color: z.string().optional(),
  locked: z.boolean().optional(),
  wall: planWallSchema.optional(),
  room: planRoomSchema.optional(),
  opening: planOpeningSchema.optional(),
  feature: planFeatureSchema.optional(),
  zone: planZoneSchema.optional(),
  annotation: planAnnotationSchema.optional(),
});

const planPlacementPatchSchema = z.object({
  itemId: z.string().min(1).optional(),
  boxId: z.string().min(1).optional(),
  plannedItemId: z.string().min(1).optional(),
  templateKey: z.string().min(1).optional(),
  footprintOverrideIn: z
    .object({
      lengthIn: z.number().positive(),
      widthIn: z.number().positive(),
    })
    .optional(),
  color: z.string().optional(),
  locked: z.boolean().optional(),
  zOrder: z.number().optional(),
});

export const planOpSchema = z.union([
  z.object({ type: z.literal("createLevel"), level: planLevelInputSchema }),
  z.object({
    type: z.literal("updateLevel"),
    levelId: z.string().min(1),
    patch: planLevelInputSchema.partial(),
  }),
  z.object({ type: z.literal("deleteLevel"), levelId: z.string().min(1) }),
  z.object({
    type: z.literal("restoreLevel"),
    level: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("setLevelUnderlay"),
    levelId: z.string().min(1),
    underlay: planUnderlaySchema.optional(),
  }),
  z.object({ type: z.literal("createEntity"), entity: planEntityInputSchema }),
  z.object({
    type: z.literal("updateEntity"),
    entityId: z.string().min(1),
    patch: planEntityPatchSchema,
  }),
  z.object({
    type: z.literal("renameEntity"),
    entityId: z.string().min(1),
    name: z.string().optional(),
  }),
  z.object({ type: z.literal("deleteEntity"), entityId: z.string().min(1) }),
  z.object({
    type: z.literal("restoreEntity"),
    entity: z.record(z.string(), z.unknown()),
  }),
  z.object({ type: z.literal("createPlacement"), placement: planPlacementInputSchema }),
  z.object({
    type: z.literal("movePlacement"),
    placementId: z.string().min(1),
    x: z.number(),
    y: z.number(),
    rotationDeg: z.number(),
  }),
  z.object({
    type: z.literal("updatePlacement"),
    placementId: z.string().min(1),
    patch: planPlacementPatchSchema,
  }),
  z.object({
    type: z.literal("setContainment"),
    placementId: z.string().min(1),
    parentPlacementId: z.string().optional(),
    containmentMode: z.enum(["inside", "onTop"]).optional(),
  }),
  z.object({ type: z.literal("deletePlacement"), placementId: z.string().min(1) }),
  z.object({
    type: z.literal("restorePlacement"),
    placement: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("updatePlanSettings"),
    patch: z.object({
      name: z.string().optional(),
      northAngleDeg: z.number().optional(),
      defaultWallThicknessIn: z.number().positive().optional(),
      defaultCeilingHeightIn: z.number().positive().optional(),
      gridSnapIn: z.number().positive().optional(),
    }),
  }),
]);

const documentationFiltersSchema = z.object({
  dispositions: z
    .array(
      z.enum([
        "undecided",
        "take",
        "sell",
        "donate",
        "dump",
        "free",
        "storage",
        "mover",
        "personalTransport",
      ])
    )
    .optional(),
  statuses: z
    .array(
      z.enum([
        "draft",
        "active",
        "packed",
        "staged",
        "loaded",
        "delivered",
        "missing",
        "damaged",
        "archived",
      ])
    )
    .optional(),
  planningDefaultKeys: z
    .array(
      z.enum([
        "firstNight",
        "doNotLetMoversTouch",
        "highValue",
        "documents",
        "medication",
        "electronics",
        "sensitive",
        "fragile",
        "irreplaceable",
        "restrictedReview",
      ])
    )
    .optional(),
  room: z.string().optional(),
  destinationRoom: z.string().optional(),
});

const boxIntakeBoxSchema = z.object({
  boxId: z
    .string()
    .optional()
    .describe("Existing box id to update. Omit to create a new box."),
  code: z.string().optional(),
  label: z.string().optional(),
  room: z.string().optional(),
  destinationRoom: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  dimensionsIn: dimensionsInSchema.optional(),
  estimatedWeightLb: z.number().nonnegative().optional(),
  actualWeightLb: z.number().nonnegative().optional(),
  estimatedVolumeCuFt: z.number().nonnegative().optional(),
  assignedResourceId: z.string().optional(),
  assignedZoneId: z.string().optional(),
  assignmentLocked: z.boolean().optional(),
  assignmentOverrideReason: z.string().optional(),
});

const boxIntakeContentSchema = inventoryItemWriteSchema.extend({
  name: z.string().optional(),
  images: z.array(boxIntakeImageInputSchema).max(20).optional(),
});

const boxIntakeLinkedItemSchema = z.object({
  itemId: z.string(),
  quantity: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS = [
  "get_api_capabilities",
  "get_api_context",
  "list_moves",
  "setup_move",
  "update_move",
  "get_move_summary",
  "get_agent_context",
  "get_move_questions",
  "get_move_day_checklist",
  "search_inventory",
  "save_box_intake",
  "add_item_from_photo",
  "batch_upsert_items",
  "update_item",
  "list_move_spaces",
  "create_move_space",
  "list_transport_resources",
  "suggest_assignments",
  "apply_assignments",
  "upload_evidence_image",
  "upload_evidence_images",
  "upload_photo",
  "upload_photos",
  "list_planned_items",
  "create_planned_item",
  "update_planned_item",
];

const allowedToolNamesByTarget = new WeakMap();

export function createAllowedToolFilter(allowedToolNames) {
  if (!allowedToolNames) return () => true;
  const allowed = new Set(allowedToolNames);
  return (toolName) => allowed.has(toolName);
}

export function createMovingManifestMcpServer(apiConfig, options = {}) {
  const target = new McpServer({
    name: "movingmanifest",
    version: "0.2.0",
    websiteUrl: "https://movingmanifest.com",
  });
  registerTools(target, apiConfig, options);
  return target;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const config = createApiConfig();
  const server = createMovingManifestMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function registerTools(target, apiConfig, options = {}) {
  if (options.allowedToolNames) {
    allowedToolNamesByTarget.set(target, new Set(options.allowedToolNames));
  } else {
    allowedToolNamesByTarget.delete(target);
  }

  registerTool(target, "get_api_capabilities", {
    title: "Get API capabilities",
    description:
      "Inspect MovingManifest REST/MCP capabilities, required scopes, core workflows, and known launch blockers. This is local metadata and does not call the API.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: () => getApiCapabilities(),
  });

  registerTool(target, "get_api_context", {
    title: "Get API context",
    description:
      "Inspect the current MovingManifest API key context, including scopes and any move restriction.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: () => getApiContext(apiConfig),
  });

  registerTool(target, "list_household_members", {
    title: "List household members",
    description:
      "List real household login access for the current API key household. This is different from move people/contact records. Requires members/manage.",
    inputSchema: {
      householdId: z.string().describe("MovingManifest household id from get_api_context."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listHouseholdMembers(apiConfig, input),
  });

  registerTool(target, "add_household_member", {
    title: "Add household member",
    description:
      "Grant real household login access by email, or create a pending invitation if the email has not signed in yet. Requires members/manage.",
    inputSchema: {
      householdId: z.string().describe("MovingManifest household id from get_api_context."),
      email: z.string().email(),
      role: householdMemberRoleSchema.default("editor"),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => addHouseholdMember(apiConfig, input),
  });

  registerTool(target, "list_moves", {
    title: "List moves",
    description:
      "List accessible MovingManifest moves. Requires an API key with moves/read scope.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listMoves(apiConfig, input),
  });

  registerTool(target, "create_move", {
    title: "Create move",
    description:
      "Create a move using a household-scoped API key with moves/write. Set dryRun true to preview the request without writing.",
    inputSchema: {
      title: z.string().min(1),
      type: z.string().optional(),
      origin: z.string().optional(),
      destination: z.string().optional(),
      dateStart: z.string().optional(),
      dateEnd: z.string().optional(),
      unitSystem: z.enum(["imperial", "metric"]).optional(),
      documentationProfileTypes: z.array(z.string()).optional(),
      moveLevelWeightAllowanceLb: z.number().positive().optional(),
      pcsBranch: z.string().optional(),
      pcsRankPayGrade: z.string().optional(),
      pcsDependentStatus: z.string().optional(),
      pcsShipmentType: z.string().optional(),
      pcsOrdersNumber: z.string().optional(),
      pcsAllowanceNotes: z.string().optional(),
      pcsTransportationOfficeNotes: z.string().optional(),
      pcsRestrictedItemsNotes: z.string().optional(),
      proGearNotes: z.string().optional(),
      notes: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createMove(apiConfig, input),
  });

  registerTool(target, "setup_move", {
    title: "Set up move",
    description:
      "Create or update a move, room lists, transport resources/zones, and starter inventory in one idempotent setup call. Requires a household-scoped key with moves/read, moves/write, and inventory/write.",
    inputSchema: {
      moveId: z.string().optional(),
      title: z.string().optional(),
      updateExisting: z.boolean().optional(),
      type: z.string().optional(),
      status: z.string().optional(),
      origin: z.string().optional(),
      destination: z.string().optional(),
      dateStart: z.string().optional(),
      dateEnd: z.string().optional(),
      unitSystem: z.enum(["imperial", "metric"]).optional(),
      documentationProfileTypes: z.array(z.string()).optional(),
      moveLevelWeightAllowanceLb: z.number().positive().optional(),
      notes: z.string().optional(),
      originRooms: z.array(z.string()).optional(),
      destinationRooms: z.array(z.string()).optional(),
      spaces: z
        .array(
          z.object({
            kind: moveSpaceKindSchema,
            name: z.string().min(1),
            aliases: z.array(z.string()).optional(),
            notes: z.string().optional(),
            floorLevel: z.string().optional(),
            sortOrder: z.number().optional(),
            capacity: capacityInputSchema.optional(),
          })
        )
        .max(100)
        .optional(),
      transportResources: z.array(setupTransportResourceSchema).max(25).optional(),
      items: z.array(inventoryItemWriteSchema).max(100).optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => setupMove(apiConfig, input),
  });

  registerTool(target, "update_move", {
    title: "Update move",
    description:
      "Update an existing move's basics — name, status, origin/destination, dates, driving distance (miles), and travel time (minutes). Distance + travel time are user- or agent-entered (no maps integration). Pass null to clear distance/travel. Requires a household-scoped key with moves/write.",
    inputSchema: {
      moveId: z.string().describe("MovingManifest move id to update."),
      title: z.string().optional(),
      status: z.string().optional(),
      origin: z.string().optional(),
      destination: z.string().optional(),
      dateStart: z.string().optional(),
      dateEnd: z.string().optional(),
      distanceMiles: z
        .number()
        .min(0)
        .nullable()
        .optional()
        .describe("Driving distance in miles. null clears it."),
      travelMinutes: z
        .number()
        .min(0)
        .nullable()
        .optional()
        .describe("Driving time in minutes. null clears it."),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => updateMove(apiConfig, input),
  });

  registerTool(target, "get_move_summary", {
    title: "Get move summary",
    description:
      "Fetch a compact move summary with resources, zones, inventory, boxes, assignments, and photo metadata.",
    inputSchema: {
      moveId: z.string().describe("MovingManifest move id."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => getMoveSummary(apiConfig, input),
  });

  registerTool(target, "get_agent_context", {
    title: "Get agent context",
    description:
      "Fetch one compact structured context payload for AI agents: move, spaces, transport resources/zones, items, photos, sale pipeline, counts, and write-contract guidance.",
    inputSchema: {
      moveId: z.string().describe("MovingManifest move id."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => getAgentContext(apiConfig, input),
  });

  registerTool(target, "get_move_questions", {
    title: "Get move questions",
    description:
      "Fetch structured unanswered-question prompts for setup, PCS, resources, inventory, evidence, load planning, and documentation packets.",
    inputSchema: {
      moveId: z.string().describe("MovingManifest move id."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => getMoveQuestions(apiConfig, input),
  });

  registerTool(target, "get_move_day_checklist", {
    title: "Get Move Day checklist",
    description:
      "Fetch a crew-safe Move Day checklist with box status, item counts, load assignment names, warnings, exception notes, and progress counts.",
    inputSchema: {
      moveId: z.string().describe("MovingManifest move id."),
      filter: moveDayFilterSchema.optional(),
      query: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => getMoveDayChecklist(apiConfig, input),
  });

  registerTool(target, "plans_list", {
    title: "List floor plans",
    description:
      "List Layout Studio floor plans for a move, including level summaries. Requires plans/read. Move-restricted keys may omit moveId.",
    inputSchema: {
      moveId: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => plansList(apiConfig, input),
  });

  registerTool(target, "plan_get", {
    title: "Get floor plan document",
    description:
      "Fetch the full Layout Studio plan document: settings, levels, entities, placements, source metadata, and pending proposal count. Always read this before writing plan ops.",
    inputSchema: {
      planId: z.string(),
      moveId: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => planGet(apiConfig, input),
  });

  registerTool(target, "plan_summary", {
    title: "Summarize floor plan",
    description:
      "Fetch a plain-text Layout Studio plan summary for text-only agents and sanity checks before editing.",
    inputSchema: {
      planId: z.string(),
      moveId: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => planSummary(apiConfig, input),
  });

  registerTool(target, "plan_apply_ops", {
    title: "Apply floor plan ops",
    description:
      "Apply a batch of Layout Studio ops directly. Prefer plan_propose_ops unless the user explicitly wants immediate writes. Set dryRun true to preview the HTTP request.",
    inputSchema: {
      planId: z.string(),
      moveId: z.string().optional(),
      batchId: z.string().min(1),
      ops: z.array(planOpSchema).min(1).max(250),
      agentLabel: z.string().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => planApplyOps(apiConfig, input),
  });

  registerTool(target, "plan_propose_ops", {
    title: "Propose floor plan ops",
    description:
      "Create a pending Layout Studio proposal instead of mutating the plan. This is the recommended default for agents. Include human-readable reasoning.",
    inputSchema: {
      planId: z.string(),
      moveId: z.string().optional(),
      batchId: z.string().min(1),
      ops: z.array(planOpSchema).min(1).max(250),
      reasoning: z.string().min(1),
      agentLabel: z.string().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => planProposeOps(apiConfig, input),
  });

  registerTool(target, "plan_snapshot", {
    title: "Get floor plan SVG snapshot",
    description:
      "Fetch a no-underlay SVG snapshot of a plan level. Vision-capable agents should render and inspect this after large edits to self-check geometry mistakes.",
    inputSchema: {
      planId: z.string(),
      moveId: z.string().optional(),
      levelId: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => planSnapshot(apiConfig, input),
  });

  registerTool(target, "search_inventory", {
    title: "Search inventory",
    description:
      "Search inventory by text after applying optional API-side status/disposition filters.",
    inputSchema: {
      moveId: z.string(),
      query: z.string().optional(),
      status: z.string().optional(),
      disposition: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => searchInventory(apiConfig, input),
  });

  registerTool(target, "create_item", {
    title: "Create item",
    description:
      "Create one inventory item. Set dryRun true to preview the API request without writing.",
    inputSchema: {
      moveId: z.string(),
      name: z.string().min(1),
      dryRun: z.boolean().optional(),
      ...inventoryItemWriteSchema.omit({ name: true }).shape,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createItem(apiConfig, input),
  });

  registerTool(target, "create_item_with_images", {
    title: "Create item with images",
    description:
      "Fast household-item intake for agents: create one inventory item, set quantity only when the user says it or the photo clearly shows a count, default omitted quantity to 1, upload one or more original images attached to that item, and let MovingManifest create web-ready derivatives server-side. Use this when the user provides a picture plus a few short words.",
    inputSchema: {
      moveId: z.string(),
      name: z.string().min(1),
      images: z
        .array(createdItemImageInputSchema)
        .min(1)
        .max(50)
        .describe("One entry per user-provided image. Each entry must provide exactly one filePath, sourceUrl, dataUrl, or fileBase64."),
      photoDefaults: evidencePhotoDefaultsSchema
        .optional()
        .describe("Shared photo metadata. Item room is reused for photos when this does not provide room."),
      continueOnImageError: z
        .boolean()
        .optional()
        .describe("Defaults true so the created item is returned with per-image failures instead of losing the useful partial result."),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
      ...inventoryItemWriteSchema.omit({ itemId: true, name: true }).shape,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    handler: (input) => createItemWithImages(apiConfig, input),
  });

  registerTool(target, "add_item_from_photo", {
    title: "Add item from photo",
    description:
      "Plain-language fastest path for one household item from one user photo plus a few words. Provide one local filePath, public sourceUrl, dataUrl, or fileBase64 with the item name and any obvious fields. Set quantity only when the user says it or the photo clearly shows a count; omitted quantity defaults to 1. Missing weight, dimensions, disposition, and condition do not block creation; MovingManifest stores the original image, creates web-ready derivatives server-side, attaches the photo to the created item, and returns agentReview for a lightweight user correction summary.",
    inputSchema: {
      moveId: z.string(),
      name: z.string().min(1),
      ...inventoryItemWriteSchema.omit({ itemId: true, name: true }).shape,
      ...createdItemImageInputSchema.shape,
      continueOnImageError: z
        .boolean()
        .optional()
        .describe("Defaults true so the item can still be created if the single image upload fails."),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    handler: (input) => addItemFromPhoto(apiConfig, input),
  });

  registerTool(target, "batch_upsert_items", {
    title: "Batch upsert items",
    description:
      "Create or update up to 100 inventory items. Rows with itemId update existing items; rows without itemId create new items. Set dryRun true to validate without writing.",
    inputSchema: {
      moveId: z.string(),
      items: z
        .array(inventoryItemWriteSchema)
        .min(1)
        .max(100),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => batchUpsertItems(apiConfig, input),
  });

  registerTool(target, "update_item", {
    title: "Update item",
    description:
      "Update selected item fields. Set dryRun true to preview the API request without writing.",
    inputSchema: {
      moveId: z.string(),
      itemId: z.string(),
      dryRun: z.boolean().optional(),
      ...inventoryItemWriteSchema.omit({ itemId: true }).shape,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => updateItem(apiConfig, input),
  });

  registerTool(target, "delete_item", {
    title: "Delete item",
    description:
      "Soft-delete one inventory item. Set dryRun true to preview the request without writing.",
    inputSchema: {
      moveId: z.string(),
      itemId: z.string(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (input) => deleteItem(apiConfig, input),
  });

  registerTool(target, "list_move_spaces", {
    title: "List move spaces",
    description:
      "List first-class rooms/spaces for a move, including origin rooms, destination rooms, storage, outdoor areas, and transport-related spaces.",
    inputSchema: {
      moveId: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listMoveSpaces(apiConfig, input),
  });

  registerTool(target, "create_move_space", {
    title: "Create move space",
    description:
      "Create a first-class room/space target for inventory, photos, transport planning, selling context, and Layout Studio. (OAuth gateway equivalent: upsert_spaces, which is rooms-only.) To add TRANSPORTATION that appears in transport lists and can be assigned to boxes/items, use create_transport_resource instead — a 'transportResource'/'transportZone' kind here is a Layout Studio placement and should reference an existing transportResourceId/transportZoneId, not a way to create the transport itself.",
    inputSchema: {
      moveId: z.string(),
      kind: moveSpaceKindSchema,
      name: z.string().min(1),
      aliases: z.array(z.string()).optional(),
      notes: z.string().optional(),
      floorLevel: z.string().optional(),
      sortOrder: z.number().optional(),
      transportResourceId: z.string().optional(),
      transportZoneId: z.string().optional(),
      linkedPlanEntityId: z.string().optional(),
      capacity: capacityInputSchema.optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createMoveSpace(apiConfig, input),
  });

  registerTool(target, "upsert_sale_listing", {
    title: "Upsert sale listing",
    description:
      "Create or update the sale workflow record for a sell-marked item: marketplace draft, price range, official price, research trail, status, interest, and sold details.",
    inputSchema: {
      moveId: z.string(),
      listingId: z.string().optional(),
      itemId: z.string().optional(),
      status: saleListingStatusSchema.optional(),
      platform: saleListingPlatformSchema.optional(),
      platformLabel: z.string().optional(),
      listingTitle: z.string().optional(),
      listingDescription: z.string().optional(),
      category: z.string().optional(),
      condition: z.string().optional(),
      locationLabel: z.string().optional(),
      selectedPhotoIds: z.array(z.string()).max(20).optional(),
      listingUrl: z.string().url().optional(),
      listedAt: z.number().optional(),
      lastRefreshedAt: z.number().optional(),
      suggestedPriceLowCents: z.number().int().nonnegative().optional(),
      suggestedPriceHighCents: z.number().int().nonnegative().optional(),
      officialPriceCents: z.number().int().nonnegative().optional(),
      currency: z.string().optional(),
      pricingConfidence: estimateConfidenceSchema.optional(),
      priceDecisionSource: z.string().optional(),
      userOverrodePrice: z.boolean().optional(),
      researchDepth: saleResearchDepthSchema.optional(),
      researchSourceCount: z.number().int().nonnegative().optional(),
      researchSources: z.array(saleResearchSourceSchema).max(25).optional(),
      researchNotes: z.string().optional(),
      interestedCount: z.number().int().nonnegative().optional(),
      inquiryNotes: z.string().optional(),
      offerNotes: z.string().optional(),
      buyerNotes: z.string().optional(),
      pickupStatus: z.string().optional(),
      soldPriceCents: z.number().int().nonnegative().optional(),
      soldAt: z.number().optional(),
      needsMorePhotos: z.boolean().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => upsertSaleListing(apiConfig, input),
  });

  registerTool(target, "list_planned_items", {
    title: "List planned items",
    description:
      "List desired or future-purchase items for a move. These are excluded from owned inventory totals until converted.",
    inputSchema: {
      moveId: z.string(),
      query: z.string().optional(),
      includeArchived: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listPlannedItems(apiConfig, input),
  });

  registerTool(target, "create_planned_item", {
    title: "Create planned item",
    description:
      "Create one desired future item for Layout Studio planning. Set dryRun true to preview without writing.",
    inputSchema: {
      moveId: z.string(),
      name: z.string().min(1),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      description: z.string().optional(),
      dimensionsIn: dimensionsInSchema.optional(),
      dimensionsConfidence: estimateConfidenceSchema.optional(),
      estimatedPriceCents: z.number().int().nonnegative().optional(),
      url: z.string().optional(),
      priority: z.number().int().min(1).max(4).optional(),
      notes: z.string().optional(),
      status: plannedItemStatusSchema.optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createPlannedItem(apiConfig, input),
  });

  registerTool(target, "update_planned_item", {
    title: "Update planned item",
    description:
      "Update selected fields on a desired future item. Set dryRun true to preview without writing.",
    inputSchema: {
      moveId: z.string(),
      plannedItemId: z.string(),
      name: z.string().min(1).optional(),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      description: z.string().optional(),
      dimensionsIn: dimensionsInSchema.optional(),
      dimensionsConfidence: estimateConfidenceSchema.optional(),
      estimatedPriceCents: z.number().int().nonnegative().optional(),
      url: z.string().optional(),
      priority: z.number().int().min(1).max(4).optional(),
      notes: z.string().optional(),
      status: plannedItemStatusSchema.optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => updatePlannedItem(apiConfig, input),
  });

  registerTool(target, "convert_planned_item", {
    title: "Convert planned item",
    description:
      "Convert one planned item into owned inventory and re-point any Layout Studio placements that referenced it.",
    inputSchema: {
      moveId: z.string(),
      plannedItemId: z.string(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => convertPlannedItem(apiConfig, input),
  });

  registerTool(target, "archive_planned_item", {
    title: "Archive planned item",
    description:
      "Archive one planned future item. Set dryRun true to preview the request without writing.",
    inputSchema: {
      moveId: z.string(),
      plannedItemId: z.string(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (input) => archivePlannedItem(apiConfig, input),
  });

  registerTool(target, "create_box", {
    title: "Create box",
    description:
      "Create one box/container record. Set dryRun true to preview the API request without writing.",
    inputSchema: {
      moveId: z.string(),
      code: z.string().optional(),
      label: z.string().optional(),
      room: z.string().optional(),
      destinationRoom: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      estimatedWeightLb: z.number().nonnegative().optional(),
      actualWeightLb: z.number().nonnegative().optional(),
      estimatedVolumeCuFt: z.number().nonnegative().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createBox(apiConfig, input),
  });

  registerTool(target, "save_box_intake", {
    title: "Save box intake",
    description:
      "One-call workflow for a packing session: create or update one box, record dimensions/weight/description, attach box photos, create described contents, link existing itemIds into the box, and attach content photos. This is the preferred hosted-agent path when a user says they packed or photographed a box. Use dryRun first for confirmation, and pass a stable idempotencyKey when creating a new box.",
    inputSchema: {
      moveId: z.string(),
      box: boxIntakeBoxSchema
        .optional()
        .describe("Existing boxId updates that box; otherwise this creates a new box."),
      photos: z
        .array(boxIntakeImageInputSchema)
        .max(50)
        .optional()
        .describe("Photos of the outside label, open box, or overall contents."),
      contents: z
        .array(boxIntakeContentSchema)
        .max(100)
        .optional()
        .describe("New or existing item rows described as being inside this box."),
      linkedItems: z
        .array(boxIntakeLinkedItemSchema)
        .max(100)
        .optional()
        .describe("Existing itemIds to connect to this box without editing item details."),
      photoDefaults: evidencePhotoDefaultsSchema.optional(),
      continueOnImageError: z
        .boolean()
        .optional()
        .describe("Defaults true so useful box and item writes can still return with per-image failures."),
      idempotencyKey: z
        .string()
        .optional()
        .describe("Required for a live new box without boxId so retries do not create duplicates."),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    handler: (input) => saveBoxIntake(apiConfig, input),
  });

  registerTool(target, "add_items_to_box", {
    title: "Add items to box",
    description:
      "Assign multiple items to a box. Set dryRun true to preview the assignments without writing.",
    inputSchema: {
      moveId: z.string(),
      boxId: z.string(),
      items: z.array(
        z.object({
          itemId: z.string(),
          quantity: z.number().positive().optional(),
          notes: z.string().optional(),
        })
      ),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => addItemsToBox(apiConfig, input),
  });

  registerTool(target, "remove_item_from_box", {
    title: "Remove item from box",
    description:
      "Remove one item-to-box assignment without deleting the inventory item. Set dryRun true to preview the request without writing.",
    inputSchema: {
      moveId: z.string(),
      boxId: z.string(),
      itemId: z.string(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (input) => removeItemFromBox(apiConfig, input),
  });

  registerTool(target, "suggest_assignments", {
    title: "Suggest assignments",
    description:
      "Generate deterministic box-to-resource/zone assignment suggestions using MovingManifest load planner validation. This does not write changes.",
    inputSchema: {
      moveId: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => suggestAssignments(apiConfig, input),
  });

  registerTool(target, "apply_assignments", {
    title: "Apply assignments",
    description:
      "Apply explicit box-to-resource/zone assignments. Use dryRun true first to validate warnings, hard blocks, and locked boxes without writing.",
    inputSchema: {
      moveId: z.string(),
      assignments: z
        .array(
          z.object({
            boxId: z.string(),
            assignedResourceId: z.string(),
            assignedZoneId: z.string().optional(),
            overrideReason: z.string().optional(),
          })
        )
        .min(1)
        .max(100),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => applyAssignments(apiConfig, input),
  });

  registerTool(target, "list_planning_suggestions", {
    title: "List planning suggestions",
    description:
      "List AI planning review suggestions for a move, optionally filtered by pending, approved, edited, or rejected status.",
    inputSchema: {
      moveId: z.string(),
      status: planningSuggestionStatusSchema.optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listPlanningSuggestions(apiConfig, input),
  });

  registerTool(target, "list_ai_jobs", {
    title: "List AI jobs",
    description:
      "List AI job status summaries for a move without returning raw provider input/output references.",
    inputSchema: {
      moveId: z.string(),
      status: aiJobStatusSchema.optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listAiJobs(apiConfig, input),
  });

  registerTool(target, "get_ai_provider_status", {
    title: "Get AI provider status",
    description:
      "Fetch safe AI provider readiness for a move, including default provider/model and whether OpenAI is configured, without exposing secrets.",
    inputSchema: {
      moveId: z.string(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => getAiProviderStatus(apiConfig, input),
  });

  registerTool(target, "list_ai_text_suggestions", {
    title: "List AI text suggestions",
    description:
      "List text-intake AI review suggestions for a move before exact-ID approval or rejection.",
    inputSchema: {
      moveId: z.string(),
      status: aiSuggestionStatusSchema.optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listAiTextSuggestions(apiConfig, input),
  });

  registerTool(target, "list_ai_photo_suggestions", {
    title: "List AI photo suggestions",
    description:
      "List photo-intake AI review suggestions for a move before exact-ID approval or rejection.",
    inputSchema: {
      moveId: z.string(),
      status: aiSuggestionStatusSchema.optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listAiPhotoSuggestions(apiConfig, input),
  });

  registerTool(target, "generate_ai_text_suggestions", {
    title: "Generate AI text suggestions",
    description:
      "Parse supplied source text into pending text-intake suggestions for explicit review. This creates an AI job and review queue rows, but does not create trusted inventory.",
    inputSchema: {
      moveId: z.string(),
      sourceText: z.string().min(1).max(12000),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => generateAiTextSuggestions(apiConfig, input),
  });

  registerTool(target, "generate_ai_photo_suggestions", {
    title: "Generate AI photo suggestions",
    description:
      "Create pending photo-intake suggestions for explicit photo IDs. Existing pending suggestions are reused instead of duplicated.",
    inputSchema: {
      moveId: z.string(),
      photoId: z.string().optional(),
      photoIds: z.array(z.string()).min(1).max(50).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => generateAiPhotoSuggestions(apiConfig, input),
  });

  registerTool(target, "approve_ai_text_suggestions", {
    title: "Approve AI text suggestions",
    description:
      "Approve exact pending text-intake suggestion IDs. Use dryRun true first to validate and preview created items, boxes, and assignments without writing.",
    inputSchema: {
      moveId: z.string(),
      approvals: z.array(aiTextApprovalSchema).min(1).max(100),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => approveAiTextSuggestions(apiConfig, input),
  });

  registerTool(target, "reject_ai_text_suggestions", {
    title: "Reject AI text suggestions",
    description:
      "Reject exact pending text-intake suggestion IDs without creating inventory.",
    inputSchema: {
      moveId: z.string(),
      suggestionIds: z.array(z.string()).min(1).max(100),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => rejectAiTextSuggestions(apiConfig, input),
  });

  registerTool(target, "approve_ai_photo_suggestions", {
    title: "Approve AI photo suggestions",
    description:
      "Approve exact pending photo-intake suggestion IDs. Use dryRun true first to validate and preview created items or boxes without writing.",
    inputSchema: {
      moveId: z.string(),
      approvals: z.array(aiPhotoApprovalSchema).min(1).max(100),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => approveAiPhotoSuggestions(apiConfig, input),
  });

  registerTool(target, "reject_ai_photo_suggestions", {
    title: "Reject AI photo suggestions",
    description:
      "Reject exact pending photo-intake suggestion IDs without creating inventory or changing photo evidence links.",
    inputSchema: {
      moveId: z.string(),
      suggestionIds: z.array(z.string()).min(1).max(100),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => rejectAiPhotoSuggestions(apiConfig, input),
  });

  registerTool(target, "generate_planning_suggestions", {
    title: "Generate planning suggestions",
    description:
      "Create deterministic estimate and load-assignment suggestions in the review queue. This writes suggestions, but does not apply them to inventory or boxes.",
    inputSchema: {
      moveId: z.string(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => generatePlanningSuggestions(apiConfig, input),
  });

  registerTool(target, "approve_planning_suggestions", {
    title: "Approve planning suggestions",
    description:
      "Approve specific pending planning suggestions, optionally with edited estimate drafts or assignment override reasons.",
    inputSchema: {
      moveId: z.string(),
      approvals: z.array(planningApprovalSchema).min(1).max(100),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => approvePlanningSuggestions(apiConfig, input),
  });

  registerTool(target, "reject_planning_suggestions", {
    title: "Reject planning suggestions",
    description:
      "Reject specific pending planning suggestions without applying their estimate or assignment draft.",
    inputSchema: {
      moveId: z.string(),
      suggestionIds: z.array(z.string()).min(1).max(100),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => rejectPlanningSuggestions(apiConfig, input),
  });

  registerTool(target, "get_images", {
    title: "View household photos inline",
    description:
      "Fetch household photos and return them as INLINE viewable images (not just links) so you can read labels, model/serial numbers, and condition directly from the picture. Filter by exactly one of itemId | boxId | spaceId | transportResourceId | transportZoneId | room | all:true, or pass photoIds:[...] to fetch specific photos. variant thumb|card|detail|full (default detail — best for reading fine print). limit default 4, max 8; image payloads are large, so narrow the filter when you want specific photos. The MCP server fetches the bytes itself, so this works even when your own sandbox cannot reach the image host. (OAuth gateway equivalent get_images returns short-lived URLs instead of inline images.)",
    inputSchema: {
      moveId: z.string(),
      itemId: z.string().optional(),
      boxId: z.string().optional(),
      spaceId: z.string().optional(),
      transportResourceId: z.string().optional(),
      transportZoneId: z.string().optional(),
      room: z.string().optional(),
      photoIds: z.array(z.string()).max(8).optional(),
      all: z.boolean().optional(),
      variant: z.enum(["thumb", "card", "detail", "full"]).optional(),
      limit: z.number().int().positive().max(8).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    rawResult: true,
    handler: async (input) => {
      const result = await getInlineImages(apiConfig, input);
      const summary = {
        moveId: result.moveId,
        variant: result.variant,
        requested: result.requested,
        returned: result.images.filter((img) => img.base64).length,
        images: result.images.map((img) => ({
          photoId: img.photoId,
          caption: img.caption ?? null,
          attachedTo: img.attachedTo ?? null,
          servedVariant: img.servedVariant ?? null,
          width: img.width ?? null,
          height: img.height ?? null,
          bytes: img.bytes ?? null,
          error: img.error ?? null,
        })),
      };
      const content = [{ type: "text", text: JSON.stringify(summary, null, 2) }];
      for (const img of result.images) {
        if (img.base64) {
          content.push({ type: "image", data: img.base64, mimeType: img.mimeType });
        }
      }
      if (content.length === 1) {
        content.push({
          type: "text",
          text: "No viewable images were returned for this filter.",
        });
      }
      return { content };
    },
  });

  registerTool(target, "start_photo_upload", {
    title: "Start media evidence upload",
    description:
      "Create a presigned evidence upload session for an image, audio file, or video. The client must PUT the file to the returned URL and then call finalize_photo_upload. Image derivatives are optional; MovingManifest creates them server-side when API/MCP clients upload only the original.",
    inputSchema: {
      moveId: z.string(),
      itemId: z.string().optional(),
      boxId: z.string().optional(),
      spaceId: z.string().optional(),
      transportResourceId: z.string().optional(),
      transportZoneId: z.string().optional(),
      room: z.string().optional(),
      mimeType: z.enum(allowedOriginalMediaMimeTypes),
      sizeBytes: z.number().int().positive().max(500 * 1024 * 1024),
      derivatives: z
        .array(
          z.object({
            variant: z.enum(["thumb", "card", "detail", "full"]),
            mimeType: z.enum(allowedDerivativeImageMimeTypes),
            sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          })
        )
        .max(4)
        .optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    handler: (input) => startPhotoUpload(apiConfig, input),
  });

  registerTool(target, "upload_evidence_file", {
    title: "Upload evidence file",
    description:
      "Easy MCP upload path: provide a local file path or source URL and this tool starts the upload session, PUTs the original file, finalizes the evidence record, and returns the photoId. For images, MovingManifest creates web-ready derivatives server-side so agents do not need to resize or re-encode files.",
    inputSchema: {
      moveId: z.string(),
      filePath: z.string().optional(),
      sourceUrl: z.string().url().optional(),
      fileName: z.string().optional(),
      itemId: z.string().optional(),
      boxId: z.string().optional(),
      spaceId: z.string().optional(),
      transportResourceId: z.string().optional(),
      transportZoneId: z.string().optional(),
      room: z.string().optional(),
      mimeType: z.enum(allowedOriginalMediaMimeTypes).optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      originalHash: z.string().optional(),
      caption: z.string().optional(),
      photoType: z.string().optional(),
      privacyLevel: z.string().optional(),
      visibilityScope: z.string().optional(),
      source: z.string().optional(),
      exifHandlingStatus: z.string().optional(),
      confidence: z.string().optional(),
      notes: z.string().optional(),
      verificationStatus: z.string().optional(),
      capturedAt: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    handler: (input) => uploadEvidenceFile(apiConfig, input),
  });

  registerTool(target, "upload_evidence_image", {
    title: "Upload evidence image in one call",
    description:
      "Default image upload path for agents: provide exactly one local file path, public source URL, data URL, or base64 image. The tool sends the original image to MovingManifest, finalizes evidence metadata, creates web-ready display/AI derivatives server-side, and returns the photoId plus agentReview so the assistant can tell the user what caption, target, privacy/type, and assumptions were used. Agents do not need to resize, re-encode, calculate dimensions, or create derivative files.",
    inputSchema: {
      moveId: z.string(),
      filePath: z
        .string()
        .optional()
        .describe("Absolute or working-directory-relative local JPEG, PNG, or WebP file path. The MCP helper reads and sends the original bytes directly; do not base64-wrap local files."),
      sourceUrl: z
        .string()
        .url()
        .optional()
        .describe("Public HTTP(S) image URL. Do not use for private localhost or credentialed URLs."),
      dataUrl: z
        .string()
        .optional()
        .describe("Base64 image data URL such as data:image/jpeg;base64,..."),
      fileBase64: z
        .string()
        .optional()
        .describe("Raw base64 JPEG, PNG, or WebP bytes when a data URL is not convenient."),
      fileName: z.string().optional().describe("Optional display/source filename."),
      itemId: z.string().optional().describe("Attach the uploaded image to an inventory item."),
      boxId: z.string().optional().describe("Attach the uploaded image to a box."),
      spaceId: z.string().optional().describe("Attach the uploaded image to a room or move space."),
      transportResourceId: z.string().optional(),
      transportZoneId: z.string().optional(),
      room: z.string().optional().describe("Readable room label when a spaceId is not known yet."),
      mimeType: z
        .enum(allowedOriginalImageMimeTypes)
        .optional()
        .describe("Optional override when the image type cannot be inferred."),
      originalHash: z.string().optional(),
      caption: z.string().optional().describe("Short human-readable description to show users."),
      photoType: z.string().optional().describe("Use item, room, condition, damage, receipt, boxContents, boxLabel, serialNumber, blueprint, or other when known."),
      privacyLevel: z.string().optional().describe("Leave blank for normal evidence unless the user says it is private, sensitive, mover-visible, claim-only, or report-visible."),
      visibilityScope: z.string().optional().describe("Leave blank for the app default, or pass moveCollaborators, household, documentationScoped, or private."),
      source: z.string().optional(),
      exifHandlingStatus: z.string().optional(),
      confidence: z.string().optional().describe("Optional agent confidence about the caption/context, not a required photo-quality score."),
      notes: z.string().optional().describe("Optional reviewer notes or assumptions to show the user."),
      verificationStatus: z.string().optional(),
      capturedAt: z.number().optional(),
      generateAiSuggestions: z
        .boolean()
        .optional()
        .describe("When true, queue AI photo-intake suggestions after upload. Requires inventory/write in addition to photos/write; upload still returns the photo result if review queueing fails."),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    handler: (input) => uploadEvidenceImage(apiConfig, input),
  });

  registerTool(target, "upload_evidence_images", {
    title: "Upload multiple evidence images",
    description:
      "Batch convenience path for agents when the user provides several household photos. Each image entry supplies exactly one local file path, public source URL, data URL, or base64 image. Shared metadata at the top level applies to every image unless an image entry overrides it. MovingManifest stores originals and creates web-ready derivatives server-side, then returns per-image status plus agentReview summaries; agents do not need to resize, re-encode, calculate dimensions, or create derivative files.",
    inputSchema: {
      moveId: z.string(),
      images: z
        .array(
          z.object({
            filePath: z
              .string()
              .optional()
              .describe("Absolute or working-directory-relative local JPEG, PNG, or WebP file path."),
            sourceUrl: z
              .string()
              .url()
              .optional()
              .describe("Public HTTP(S) image URL. Do not use for private localhost or credentialed URLs."),
            dataUrl: z
              .string()
              .optional()
              .describe("Base64 image data URL such as data:image/jpeg;base64,..."),
            fileBase64: z
              .string()
              .optional()
              .describe("Raw base64 JPEG, PNG, or WebP bytes when a data URL is not convenient."),
            fileName: z.string().optional(),
            itemId: z.string().optional(),
            boxId: z.string().optional(),
            spaceId: z.string().optional(),
            transportResourceId: z.string().optional(),
            transportZoneId: z.string().optional(),
            room: z.string().optional(),
            mimeType: z.enum(allowedOriginalImageMimeTypes).optional(),
            originalHash: z.string().optional(),
            caption: z.string().optional(),
            photoType: z.string().optional(),
            privacyLevel: z.string().optional(),
            visibilityScope: z.string().optional(),
            source: z.string().optional(),
            exifHandlingStatus: z.string().optional(),
            confidence: z.string().optional(),
            notes: z.string().optional(),
            verificationStatus: z.string().optional(),
            capturedAt: z.number().optional(),
            generateAiSuggestions: z
              .boolean()
              .optional()
              .describe("Per-image override to queue AI photo-intake suggestions after this upload."),
            idempotencyKey: z.string().optional(),
          })
        )
        .min(1)
        .max(50)
        .describe("Images to upload. Use one entry per user photo."),
      itemId: z.string().optional().describe("Default item attachment for all images."),
      boxId: z.string().optional().describe("Default box attachment for all images."),
      spaceId: z.string().optional().describe("Default room/space attachment for all images."),
      transportResourceId: z.string().optional(),
      transportZoneId: z.string().optional(),
      room: z.string().optional().describe("Default readable room label when a spaceId is not known yet."),
      mimeType: z.enum(allowedOriginalImageMimeTypes).optional(),
      caption: z.string().optional().describe("Default caption for all images; prefer per-image captions when the photos differ."),
      photoType: z.string().optional(),
      privacyLevel: z.string().optional(),
      visibilityScope: z.string().optional(),
      source: z.string().optional(),
      exifHandlingStatus: z.string().optional(),
      confidence: z.string().optional(),
      notes: z.string().optional().describe("Default reviewer notes or assumptions to show the user."),
      verificationStatus: z.string().optional(),
      capturedAt: z.number().optional(),
      generateAiSuggestions: z
        .boolean()
        .optional()
        .describe("Default for all images: queue AI photo-intake suggestions after upload when the key also has inventory/write."),
      idempotencyKey: z.string().optional().describe("Optional batch prefix; each image gets a stable numbered key."),
      dryRun: z.boolean().optional(),
      continueOnError: z
        .boolean()
        .optional()
        .describe("When true, keep uploading later images after a failed entry and return per-image errors."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    handler: (input) => uploadEvidenceImages(apiConfig, input),
  });

  registerTool(target, "upload_photo", {
    title: "Upload photo",
    description:
      "Plain-language alias for upload_evidence_image. Use this for a normal single household photo: pass a local filePath, public sourceUrl, dataUrl, or fileBase64, and MovingManifest stores the original, creates web-ready derivatives server-side, and returns photoId plus agentReview.",
    inputSchema: {
      moveId: z.string(),
      ...evidenceImageInputSchema.shape,
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    handler: (input) => uploadEvidenceImage(apiConfig, input),
  });

  registerTool(target, "upload_image", {
    title: "Upload image",
    description:
      "Plain-language alias for upload_evidence_image using image terminology. Use this when the user or agent says image instead of photo: pass a local filePath, public sourceUrl, dataUrl, or fileBase64, and MovingManifest stores the original, creates web-ready derivatives server-side, and returns photoId plus agentReview.",
    inputSchema: {
      moveId: z.string(),
      ...evidenceImageInputSchema.shape,
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    handler: (input) => uploadEvidenceImage(apiConfig, input),
  });

  registerTool(target, "upload_photos", {
    title: "Upload photos",
    description:
      "Plain-language alias for upload_evidence_images. Use this when the user provides several ordinary photos from the same room/context or wants new photos attached to an existing itemId. One image entry equals one user photo; shared itemId, room, privacy/type, and review defaults can live at the top level; MovingManifest stores originals, creates web-ready derivatives server-side, and returns per-image status plus agentReview.",
    inputSchema: {
      moveId: z.string(),
      images: z
        .array(evidenceImageInputSchema)
        .min(1)
        .max(50)
        .describe("Images to upload. Use one entry per user photo."),
      ...evidenceImageBatchDefaultsSchema.shape,
      idempotencyKey: z.string().optional().describe("Optional batch prefix; each image gets a stable numbered key."),
      dryRun: z.boolean().optional(),
      continueOnError: z
        .boolean()
        .optional()
        .describe("When true, keep uploading later images after a failed entry and return per-image errors."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    handler: (input) => uploadEvidenceImages(apiConfig, input),
  });

  registerTool(target, "upload_images", {
    title: "Upload images",
    description:
      "Plain-language alias for upload_evidence_images using image terminology. Use this when the user provides several ordinary images from the same room/context or wants new images attached to an existing itemId. One image entry equals one user image; shared itemId, room, privacy/type, and review defaults can live at the top level; MovingManifest stores originals, creates web-ready derivatives server-side, and returns per-image status plus agentReview.",
    inputSchema: {
      moveId: z.string(),
      images: z
        .array(evidenceImageInputSchema)
        .min(1)
        .max(50)
        .describe("Images to upload. Use one entry per user image."),
      ...evidenceImageBatchDefaultsSchema.shape,
      idempotencyKey: z.string().optional().describe("Optional batch prefix; each image gets a stable numbered key."),
      dryRun: z.boolean().optional(),
      continueOnError: z
        .boolean()
        .optional()
        .describe("When true, keep uploading later images after a failed entry and return per-image errors."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    handler: (input) => uploadEvidenceImages(apiConfig, input),
  });

  registerTool(target, "finalize_photo_upload", {
    title: "Finalize photo upload",
    description:
      "Finalize a completed presigned evidence upload after the file PUT succeeds. The server verifies size and MIME type before creating the evidence record. Width and height are required for images.",
    inputSchema: {
      moveId: z.string(),
      uploadSessionId: z.string(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      originalHash: z.string().optional(),
      caption: z.string().optional(),
      photoType: z.string().optional(),
      privacyLevel: z.string().optional(),
      visibilityScope: z.string().optional(),
      source: z.string().optional(),
      exifHandlingStatus: z.string().optional(),
      confidence: z.string().optional(),
      notes: z.string().optional(),
      verificationStatus: z.string().optional(),
      capturedAt: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => finalizePhotoUpload(apiConfig, input),
  });

  registerTool(target, "attach_photo", {
    title: "Attach photo",
    description:
      "Attach or update photo evidence metadata after upload finalization. Supports item, box, room, caption, privacy, documentation profile, and review fields.",
    inputSchema: {
      moveId: z.string(),
      photoId: z.string(),
      itemId: z.string().optional(),
      boxId: z.string().optional(),
      spaceId: z.string().optional(),
      transportResourceId: z.string().optional(),
      transportZoneId: z.string().optional(),
      room: z.string().optional(),
      claimId: z.string().optional(),
      documentationProfileTypes: z.array(z.string()).optional(),
      caption: z.string().optional(),
      photoType: z.string().optional(),
      privacyLevel: z.string().optional(),
      visibilityScope: z.string().optional(),
      source: z.string().optional(),
      exifHandlingStatus: z.string().optional(),
      confidence: z.string().optional(),
      notes: z.string().optional(),
      verificationStatus: z.string().optional(),
      aiProcessed: z.boolean().optional(),
      capturedAt: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => attachPhoto(apiConfig, input),
  });

  registerTool(target, "list_transport_resources", {
    title: "List transport resources",
    description: "List transport resources and zones for load planning.",
    inputSchema: {
      moveId: z.string(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listTransportResources(apiConfig, input),
  });

  registerTool(target, "list_move_people", {
    title: "List move people",
    description:
      "List move people and contact records such as household members, helpers, movers, transportation offices, employer contacts, and adjusters.",
    inputSchema: {
      moveId: z.string(),
      includeArchived: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listMovePeople(apiConfig, input),
  });

  registerTool(target, "create_move_person", {
    title: "Create move person",
    description:
      "Create a person/contact record for a move. Use this for household members, helpers, movers, PCS offices, employer relocation contacts, insurance adjusters, storage contacts, and pickup contacts.",
    inputSchema: {
      moveId: z.string(),
      name: z.string(),
      role: movePersonRoleSchema.optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      notes: z.string().optional(),
      sortOrder: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createMovePerson(apiConfig, input),
  });

  registerTool(target, "update_move_person", {
    title: "Update move person",
    description:
      "Update a move person/contact record's name, role, email, phone, notes, sort order, or archivedAt state.",
    inputSchema: {
      moveId: z.string(),
      personId: z.string(),
      name: z.string().optional(),
      role: movePersonRoleSchema.optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      notes: z.string().optional(),
      sortOrder: z.number().optional(),
      archivedAt: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => updateMovePerson(apiConfig, input),
  });

  registerTool(target, "archive_move_person", {
    title: "Archive move person",
    description:
      "Archive a move person/contact record without deleting history. Set dryRun true to preview.",
    inputSchema: {
      moveId: z.string(),
      personId: z.string(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (input) => archiveMovePerson(apiConfig, input),
  });

  registerTool(target, "create_transport_resource", {
    title: "Create transport resource",
    description:
      "Create a truck, trailer, personal vehicle, professional or military movers (type 'militaryMovers'), POD/storage unit, disposal, sale, donation, or custom transport resource. Use presetKey for built-in resource templates. This is the ONLY way to create transportation that shows up in transport lists and can be assigned to boxes/items. (OAuth gateway equivalent: upsert_transport.)",
    inputSchema: {
      moveId: z.string(),
      presetKey: z.string().optional(),
      type: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      capacity: capacityInputSchema.optional(),
      capacityReviewStatus: capacityReviewStatusSchema.optional(),
      capacityNotes: z.string().optional(),
      rules: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createTransportResource(apiConfig, input),
  });

  registerTool(target, "update_transport_resource", {
    title: "Update transport resource",
    description:
      "Update a transport resource's name, description, type, capacity, capacity review state, rules, or sort order.",
    inputSchema: {
      moveId: z.string(),
      resourceId: z.string(),
      type: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      capacity: capacityInputSchema.optional(),
      capacityReviewStatus: capacityReviewStatusSchema.optional(),
      capacityNotes: z.string().optional(),
      rules: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => updateTransportResource(apiConfig, input),
  });

  registerTool(target, "create_transport_zone", {
    title: "Create transport zone",
    description:
      "Create a zone inside a transport resource, such as cab, trailer front, storage doorway, donation pickup, or claimed giveaway.",
    inputSchema: {
      moveId: z.string(),
      resourceId: z.string(),
      name: z.string(),
      description: z.string().optional(),
      capacity: capacityInputSchema.optional(),
      preferredTags: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createTransportZone(apiConfig, input),
  });

  registerTool(target, "update_transport_zone", {
    title: "Update transport zone",
    description:
      "Update a transport zone's resource, name, description, capacity, preferred tags, or sort order.",
    inputSchema: {
      moveId: z.string(),
      zoneId: z.string(),
      resourceId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      capacity: capacityInputSchema.optional(),
      preferredTags: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => updateTransportZone(apiConfig, input),
  });

  registerTool(target, "get_capacity_report", {
    title: "Get capacity report",
    description:
      "Fetch move-level weight/volume estimates, box reports, resource capacity usage, zone usage, and missing-estimate counts.",
    inputSchema: {
      moveId: z.string(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => getCapacityReport(apiConfig, input),
  });

  registerTool(target, "list_documentation_profiles", {
    title: "List documentation profiles",
    description: "List scoped documentation profiles for a move.",
    inputSchema: {
      moveId: z.string(),
      status: documentationStatusSchema.optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listDocumentationProfiles(apiConfig, input),
  });

  registerTool(target, "create_documentation_profile", {
    title: "Create documentation profile",
    description:
      "Create a scoped packet profile for PCS, movers, employers, claims, donation, sell/free, storage, or load crew workflows.",
    inputSchema: {
      moveId: z.string(),
      type: documentationProfileTypeSchema,
      status: z.enum(["draft", "active"]).optional(),
      name: z.string().optional(),
      includedFields: z.array(documentationFieldSchema).optional(),
      imageRule: documentationImageRuleSchema.optional(),
      filters: documentationFiltersSchema.optional(),
      allowedActions: z.array(shareLinkActionSchema).optional(),
      disclaimer: z.string().optional(),
      ownerNotes: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createDocumentationProfile(apiConfig, input),
  });

  registerTool(target, "update_documentation_profile", {
    title: "Update documentation profile",
    description:
      "Update selected documentation profile settings such as fields, filters, image rules, status, or allowed share-link actions.",
    inputSchema: {
      moveId: z.string(),
      documentationProfileId: z.string(),
      type: documentationProfileTypeSchema.optional(),
      status: documentationStatusSchema.optional(),
      name: z.string().optional(),
      includedFields: z.array(documentationFieldSchema).optional(),
      imageRule: documentationImageRuleSchema.optional(),
      filters: documentationFiltersSchema.optional(),
      allowedActions: z.array(shareLinkActionSchema).optional(),
      disclaimer: z.string().optional(),
      ownerNotes: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => updateDocumentationProfile(apiConfig, input),
  });

  registerTool(target, "archive_documentation_profile", {
    title: "Archive documentation profile",
    description: "Archive a documentation profile so it is hidden from default lists.",
    inputSchema: {
      moveId: z.string(),
      documentationProfileId: z.string(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (input) => archiveDocumentationProfile(apiConfig, input),
  });

  registerTool(target, "create_export", {
    title: "Create export",
    description:
      "Create a CSV export for inventory, boxes, assignments, or a documentation profile.",
    inputSchema: {
      moveId: z.string(),
      type: z.enum(["inventory", "boxes", "assignments", "documentationProfile"]),
      documentationProfileId: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createExport(apiConfig, input),
  });

  registerTool(target, "list_exports", {
    title: "List exports",
    description: "List server-generated exports for a move.",
    inputSchema: {
      moveId: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listExports(apiConfig, input),
  });

  registerTool(target, "download_export", {
    title: "Download export",
    description: "Return an unexpired export artifact as text.",
    inputSchema: {
      moveId: z.string(),
      exportJobId: z.string(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => downloadExport(apiConfig, input),
  });

  registerTool(target, "list_share_links", {
    title: "List share links",
    description:
      "List safe metadata for documentation share links. Raw tokens are never returned from this list.",
    inputSchema: {
      moveId: z.string(),
      status: z.enum(["active", "revoked"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listShareLinks(apiConfig, input),
  });

  registerTool(target, "list_share_link_comments", {
    title: "List share link comments",
    description:
      "List recent public-recipient comments for a move or one share link. Returns safe share/profile metadata and never raw share tokens.",
    inputSchema: {
      moveId: z.string(),
      shareLinkId: z.string().optional(),
      documentationProfileId: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listShareLinkComments(apiConfig, input),
  });

  registerTool(target, "create_share_link", {
    title: "Create share link",
    description:
      "Create a scoped documentation share link. The raw token is returned only once in the create response; store it carefully.",
    inputSchema: {
      moveId: z.string(),
      documentationProfileId: z.string().optional(),
      scope: z.enum(["move", "profile"]).optional(),
      label: z.string().optional(),
      role: z
        .enum(["owner", "admin", "editor", "packer", "viewer", "guest"])
        .optional(),
      allowedActions: z
        .array(
          z.enum([
            "view",
            "viewPlan",
            "download",
            "statusUpdate",
            "comment",
            "uploadEvidence",
          ])
        )
        .optional(),
      expiresAt: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createShareLink(apiConfig, input),
  });

  registerTool(target, "revoke_share_link", {
    title: "Revoke share link",
    description:
      "Revoke a documentation share link so the public token can no longer be used.",
    inputSchema: {
      moveId: z.string(),
      shareLinkId: z.string(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (input) => revokeShareLink(apiConfig, input),
  });
}

function registerTool(target, name, config) {
  const allowedToolNames = allowedToolNamesByTarget.get(target);
  if (allowedToolNames && !allowedToolNames.has(name)) {
    return;
  }

  target.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: config.annotations,
    },
    async (input) => {
      try {
        const result = await config.handler(input);
        // Most tools return plain data we wrap as a text block. Tools that need
        // to emit native content blocks (e.g. inline images) set rawResult and
        // return a ready { content: [...] } result we pass through untouched.
        return config.rawResult ? result : textResult(result);
      } catch (error) {
        return toolErrorResult(error);
      }
    }
  );
}

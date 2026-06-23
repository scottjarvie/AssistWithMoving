#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  addBoxItemFromPhoto,
  addItemFromPhoto,
  addItemsToBox,
  appendItemNote,
  applyAssignments,
  batchAddBoxContents,
  batchUpsertMovableUnits,
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
  getPhotoDisplayUrl,
  approvePlanningSuggestions,
  generatePlanningSuggestions,
  generateAiPhotoSuggestions,
  generateAiTextSuggestions,
  createMoveSpace,
  archivePlannedItem,
  getAiProviderStatus,
  getApiCapabilities,
  getApiContext,
  getAgentWorkbenchGuide,
  getAgentContext,
  getCapacityReport,
  getIngestionQueueEvidenceMedia,
  getIngestionQueueEvidenceUrl,
  getMoveDayChecklist,
  getMoveQuestions,
  getMoveSummary,
  claimIngestionQueue,
  createFloorPlanIntake,
  createIngestionQueueEntry,
  listHouseholdMembers,
  listAiJobs,
  listAiPhotoSuggestions,
  listAiTextSuggestions,
  listIngestionQueue,
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
  floorPlanCalculate,
  floorPlanEvidence,
  floorPlanContext,
  floorPlanObservations,
  floorPlanQuestions,
  floorPlanRelationships,
  floorPlanResetDraft,
  floorPlanSolve,
  planApplyOps,
  planCreate,
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
  setIngestionQueueStatus,
  setupMove,
  startPhotoUpload,
  submitIngestionQueueResults,
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

const allowedDerivativeImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

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

const ingestionQueueStatusSchema = z.enum([
  "queued",
  "claimed",
  "processed",
  "needsInput",
  "resolved",
  "discarded",
]);

const ingestionScopeHintSchema = z.enum([
  "inventory",
  "packing",
  "condition",
  "measurements",
  "floorPlan",
]);

const ingestionQueueIntentSchema = z.enum([
  "general",
  "newMovableUnit",
  "newItem",
  "existingBox",
  "existingItem",
  "boxContents",
  "condition",
  "measurements",
  "floorPlan",
]);

const aiSuggestionStatusSchema = z.enum([
  "pending",
  "approved",
  "edited",
  "rejected",
]);

const agentWorkbenchModeSchema = z.enum([
  "overview",
  "intakeQueue",
  "photoInventory",
  "reviewFirst",
  "trustedHelper",
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

const itemResearchSourceStatusSchema = z.enum([
  "used",
  "checked",
  "blocked",
  "gated",
  "failed",
  "notRelevant",
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

const itemResearchSourceSchema = z.object({
  title: z.string().optional(),
  url: z.string().url().optional(),
  summary: z.string().optional(),
  status: itemResearchSourceStatusSchema.optional(),
  checkedAt: z.number().optional(),
});

const ingestionProposedItemSchema = z.object({
  name: z.string().min(1),
  room: z.string().optional(),
  spaceId: z.string().optional(),
  spaceName: z.string().optional(),
  currentSpaceId: z.string().optional(),
  destinationRoom: z.string().optional(),
  destinationSpaceId: z.string().optional(),
  destinationSpaceName: z.string().optional(),
  category: z.string().optional(),
  disposition: itemDispositionSchema.optional(),
  quantity: z.number().positive().optional(),
  description: z.string().optional(),
  dimensionsIn: dimensionsInSchema.optional(),
  dimensionsConfidence: estimateConfidenceSchema.optional(),
  estimatedWeightLb: z.number().nonnegative().optional(),
  estimatedWeightLowLb: z.number().nonnegative().optional(),
  estimatedWeightHighLb: z.number().nonnegative().optional(),
  weightConfidence: estimateConfidenceSchema.optional(),
  estimatedVolumeCuFt: z.number().nonnegative().optional(),
  volumeConfidence: estimateConfidenceSchema.optional(),
  suggestedBoxLabel: z.string().optional(),
  fragility: itemFragilitySchema.optional(),
  highValue: z.boolean().optional(),
  planningDefaultKeys: z.array(planningDefaultKeySchema).optional(),
  researchSummary: z.string().optional(),
  researchSources: z.array(itemResearchSourceSchema).max(25).optional(),
  researchNotes: z.string().optional(),
  researchConfidence: estimateConfidenceSchema.optional(),
  attachMediaPhotoIds: z
    .array(z.string())
    .optional()
    .describe(
      "Queue media photo IDs from this entry to attach when the proposed item is approved.",
    ),
});

const ingestionResultRefSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  label: z.string().optional(),
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
  spaceId: z.string().optional(),
  spaceName: z.string().optional(),
  currentSpaceId: z.string().optional(),
  destinationRoom: z.string().optional(),
  destinationSpaceId: z.string().optional(),
  destinationSpaceName: z.string().optional(),
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
  assignedResourceId: z
    .string()
    .optional()
    .describe(
      "Optional transport resource ID for rough load planning. Use IDs from get_agent_context/list transport resources, not guessed names.",
    ),
  assignedZoneId: z
    .string()
    .optional()
    .describe(
      "Optional transport zone ID within assignedResourceId for rough load planning.",
    ),
  assignmentOverrideReason: z
    .string()
    .optional()
    .describe(
      "Short user-reviewed reason when assigning despite known warnings or when explaining a rough load hint.",
    ),
  planningDefaultKeys: z.array(planningDefaultKeySchema).optional(),
  needsReview: z.boolean().optional(),
  reviewFlags: z.array(z.string()).optional(),
  privateNotes: z.string().optional(),
  aiSummary: z.string().optional(),
  aiTags: z.array(z.string()).optional(),
  agentLabel: z.string().max(64).optional(),
  aiConfidenceScore: z.number().min(0).max(1).optional(),
  researchSummary: z.string().optional(),
  researchSources: z.array(itemResearchSourceSchema).max(25).optional(),
  researchNotes: z.string().optional(),
  researchConfidence: estimateConfidenceSchema.optional(),
  researchedAt: z.number().optional(),
  researchedByLabel: z.string().max(128).optional(),
});

const ingestionCommittedItemSchema = inventoryItemWriteSchema.extend({
  attachMediaPhotoIds: z
    .array(z.string())
    .optional()
    .describe(
      "Queue media photo IDs from this entry to attach to the created or updated item.",
    ),
  appendNote: z
    .string()
    .max(4000)
    .optional()
    .describe(
      "Optional append-only item note to save with this committed queue result, preserving the user's capture note or agent decision rationale in the same approval.",
    ),
  appendNoteLabel: z
    .string()
    .max(64)
    .optional()
    .describe(
      "Optional label for appendNote. Defaults to the API key or agent label.",
    ),
  researchSourceMode: z
    .enum(["append", "replace"])
    .optional()
    .describe(
      "Defaults to append for existing item queue commits so prior research sources are preserved; use replace only for intentional cleanup.",
    ),
});

const batchInventoryItemWriteSchema = inventoryItemWriteSchema.extend({
  researchSourceMode: z
    .enum(["append", "replace"])
    .optional()
    .describe(
      "Defaults to append for existing item batch updates so prior research sources are preserved; use replace only for intentional cleanup.",
    ),
});

const batchBoxContentItemWriteSchema = batchInventoryItemWriteSchema.extend({
  boxQuantity: z
    .number()
    .positive()
    .optional()
    .describe(
      "Quantity to pack into the target box. Defaults to the item quantity or 1.",
    ),
  boxItemNotes: z
    .string()
    .optional()
    .describe("Optional note for this item-to-box assignment."),
});

const boxContainerTypeSchema = z
  .enum([
    "carton",
    "plasticTote",
    "bin",
    "wardrobe",
    "dishPack",
    "crate",
    "other",
  ])
  .describe(
    "Reusable container/material type. Use plasticTote for reusable totes, carton for ordinary cardboard boxes, wardrobe for hanging-clothes boxes, dishPack for dish/glassware boxes, bin/crate for rigid reusable containers, and other when none fit.",
  );

const ingestionCommittedBoxSchema = z.object({
  code: z.string().optional(),
  label: z.string().optional(),
  containerType: boxContainerTypeSchema.optional(),
  room: z.string().optional(),
  destinationRoom: z.string().optional(),
  destinationSpaceId: z.string().optional(),
  destinationSpaceName: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  agentLabel: z.string().max(64).optional(),
  aiConfidenceScore: z.number().min(0).max(1).optional(),
  dimensionsIn: dimensionsInSchema.optional(),
  estimatedWeightLb: z.number().nonnegative().optional(),
  actualWeightLb: z.number().nonnegative().optional(),
  estimatedVolumeCuFt: z.number().nonnegative().optional(),
  assignedResourceId: z
    .string()
    .optional()
    .describe(
      "Optional transport resource ID for the box load assignment. Use explicit IDs, not resource names.",
    ),
  assignedZoneId: z
    .string()
    .optional()
    .describe("Optional transport zone ID within assignedResourceId."),
  assignmentOverrideReason: z
    .string()
    .optional()
    .describe("Short reason for a rough assignment or warning override."),
});

const movableUnitBoxSchema = ingestionCommittedBoxSchema.extend({
  kind: z.literal("box"),
  boxId: z.string().optional(),
  photoIds: z
    .array(z.string())
    .min(1)
    .max(20)
    .optional()
    .describe(
      "Existing MovingManifest photo IDs to attach to this box after the box row is created or updated. Use after upload_photo/upload_photos or ingestion_queue media so many photographed boxes/totes can be linked in the same batch approval.",
    ),
  count: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(
      "Optional count for new auto-coded rough boxes, such as 12 medium boxes. Only use without boxId/code; coded ranges should be expanded into explicit code rows.",
    ),
});

const movableUnitLooseItemSchema = inventoryItemWriteSchema.extend({
  kind: z.literal("looseItem"),
  name: z.string().min(1),
});

const movableUnitWriteSchema = z.discriminatedUnion("kind", [
  movableUnitBoxSchema,
  movableUnitLooseItemSchema,
]);

const ingestionBoxAssignmentSchema = z.object({
  boxId: z.string().optional(),
  boxCode: z.string().optional(),
  itemId: z.string().optional(),
  externalSource: z.string().optional(),
  externalId: z.string().optional(),
  quantity: z.number().positive().optional(),
  notes: z.string().optional(),
});

const ingestionLoadAssignmentSchema = z.object({
  boxId: z.string().optional(),
  boxCode: z.string().optional(),
  itemId: z.string().optional(),
  externalSource: z.string().optional(),
  externalId: z.string().optional(),
  assignedResourceId: z.string().min(1),
  assignedZoneId: z.string().optional(),
  overrideReason: z.string().optional(),
});

const evidenceImageInputSchema = z.object({
  filePath: z
    .string()
    .optional()
    .describe(
      "Absolute or working-directory-relative local JPEG, PNG, or WebP file path.",
    ),
  sourceUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "Public HTTP(S) image URL. Do not use for private localhost or credentialed URLs.",
    ),
  dataUrl: z
    .string()
    .optional()
    .describe("Base64 image data URL such as data:image/jpeg;base64,..."),
  fileBase64: z
    .string()
    .optional()
    .describe(
      "Raw base64 JPEG, PNG, or WebP bytes when a data URL is not convenient.",
    ),
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
  agentLabel: z.string().max(64).optional(),
  aiConfidenceScore: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
  verificationStatus: z.string().optional(),
  capturedAt: z.number().optional(),
  generateAiSuggestions: z
    .boolean()
    .optional()
    .describe(
      "When true, ask MovingManifest to queue AI photo-intake suggestions after upload. Requires inventory/write in addition to photos/write.",
    ),
  idempotencyKey: z.string().optional(),
});

const createdItemImageInputSchema = evidenceImageInputSchema.omit({
  itemId: true,
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
  agentLabel: z.string().max(64).optional(),
  aiConfidenceScore: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
  verificationStatus: z.string().optional(),
  capturedAt: z.number().optional(),
  generateAiSuggestions: z
    .boolean()
    .optional()
    .describe(
      "When true, queue AI photo-intake suggestions for uploaded item photos when the key also has inventory/write.",
    ),
});

const boxIntakeBoxSchema = ingestionCommittedBoxSchema.extend({
  boxId: z
    .string()
    .optional()
    .describe("Existing box ID. Omit when creating a new box."),
  boxCode: z
    .string()
    .optional()
    .describe("Visible existing box code such as B-012. Used as code when creating."),
});

const boxIntakeContentSchema = batchBoxContentItemWriteSchema.extend({
  photos: z
    .array(createdItemImageInputSchema)
    .max(20)
    .optional()
    .describe(
      "Optional photos for this specific content item. Use box-level photos for images that show the whole box.",
    ),
});

const boxIntakeLinkedItemSchema = z.object({
  itemId: z.string().optional(),
  externalSource: z.string().optional(),
  externalId: z.string().optional(),
  quantity: z.number().positive().optional(),
  notes: z.string().optional(),
});

const floorPlanIntakeImageSchema = z.object({
  filePath: z
    .string()
    .optional()
    .describe(
      "Absolute or working-directory-relative local blueprint/floor-plan image path.",
    ),
  sourceUrl: z
    .string()
    .url()
    .optional()
    .describe("Public HTTP(S) blueprint/floor-plan image URL."),
  fileName: z.string().optional(),
  mimeType: z.enum(allowedOriginalImageMimeTypes).optional(),
  caption: z.string().optional(),
  privacyLevel: z.string().optional(),
  visibilityScope: z.string().optional(),
  source: z.string().optional(),
  exifHandlingStatus: z.string().optional(),
  agentLabel: z.string().max(64).optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

const floorPlanSourceRegionSchema = z.object({
  xPct: z.number().min(0).max(100),
  yPct: z.number().min(0).max(100),
  widthPct: z.number().min(0).max(100),
  heightPct: z.number().min(0).max(100),
});

const floorPlanMeasurementSchema = z.object({
  subjectType: z.enum([
    "plan",
    "level",
    "room",
    "structure",
    "areaGroup",
    "lot",
    "zone",
    "shell",
    "opening",
    "fixture",
    "path",
  ]),
  subjectKey: z.string().min(1),
  subjectLabel: z.string().min(1),
  measurementType: z.enum([
    "width",
    "depth",
    "clearWidth",
    "clearDepth",
    "height",
    "area",
    "grossArea",
    "conditionedArea",
    "excludedArea",
    "lotArea",
    "footprintArea",
    "perimeter",
    "exteriorWidth",
    "exteriorDepth",
    "areaVariance",
    "span",
    "wallThickness",
    "openingWidth",
    "fixtureOffset",
    "clearance",
    "unknown",
  ]),
  kind: z.enum(["known", "assumption", "derived", "range"]).optional(),
  valueIn: z.number().positive().optional(),
  minIn: z.number().positive().optional(),
  maxIn: z.number().positive().optional(),
  unit: z.enum(["in", "ft", "sqft", "acre", "percent", "count"]).optional(),
  value: z.number().positive().optional(),
  minValue: z.number().positive().optional(),
  maxValue: z.number().positive().optional(),
  displayValue: z.string().optional(),
  confidence: estimateConfidenceSchema.optional(),
  areaRole: z
    .enum(["conditioned", "unconditioned", "excluded", "outdoor", "unknown"])
    .optional(),
  constraintStrength: z
    .enum(["hard", "strong", "soft", "displayOnly"])
    .optional(),
  sourceObservationIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const floorPlanObservationSchema = z.object({
  evidenceId: z.string().optional(),
  sourceType: z
    .enum(["image", "textNote", "userEdit", "agentExtraction", "calculation"])
    .optional(),
  sourcePhotoId: z.string().optional(),
  sourceLabel: z.string().optional(),
  sourceRegion: floorPlanSourceRegionSchema.optional(),
  imageNumber: z.number().int().positive().optional(),
  observationType: z.enum([
    "label",
    "ocrText",
    "measurementText",
    "roomName",
    "wallSegment",
    "opening",
    "door",
    "doorway",
    "doorlessPassage",
    "window",
    "fixture",
    "closet",
    "hall",
    "exteriorStructure",
    "patio",
    "carport",
    "shed",
    "lotFeature",
    "orientationClue",
    "areaTarget",
    "unknownMark",
    "sourceNote",
  ]),
  status: z
    .enum(["active", "needsReview", "superseded", "rejected"])
    .optional(),
  title: z.string().min(1),
  subjectKey: z.string().optional(),
  subjectLabel: z.string().optional(),
  subjectKind: z
    .enum([
      "room",
      "hall",
      "closet",
      "bathroom",
      "kitchen",
      "fixture",
      "opening",
      "wall",
      "structure",
      "zone",
      "lot",
      "unknown",
    ])
    .optional(),
  rawText: z.string().optional(),
  normalized: z.record(z.string(), z.unknown()).optional(),
  confidence: estimateConfidenceSchema.optional(),
  relatedMeasurementIds: z.array(z.string()).optional(),
  relatedObservationIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
  agentLabel: z.string().optional(),
});

const floorPlanRelationshipSchema = z.object({
  evidenceId: z.string().optional(),
  sourceType: z
    .enum(["image", "textNote", "userEdit", "agentExtraction", "calculation"])
    .optional(),
  sourceLabel: z.string().optional(),
  relationshipType: z.enum([
    "adjacentTo",
    "connectedTo",
    "contains",
    "partOf",
    "leftOf",
    "rightOf",
    "above",
    "below",
    "sameAs",
    "conflictsWith",
    "openingIn",
    "countsTowardArea",
    "excludedFromArea",
    "accessesThrough",
    "doorlessPassageBetween",
    "wallSharedWith",
  ]),
  status: z
    .enum(["active", "needsReview", "superseded", "rejected"])
    .optional(),
  fromSubjectKey: z.string().min(1),
  fromSubjectLabel: z.string().optional(),
  toSubjectKey: z.string().min(1),
  toSubjectLabel: z.string().optional(),
  confidence: estimateConfidenceSchema.optional(),
  sourceObservationIds: z.array(z.string()).optional(),
  sourceMeasurementIds: z.array(z.string()).optional(),
  evidenceIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
  agentLabel: z.string().optional(),
});

const floorPlanRelativeRoomSchema = z.object({
  roomId: z.string().min(1),
  relation: z.enum(["rightOf", "leftOf", "above", "below"]),
  align: z.enum(["start", "center", "end"]).optional(),
  gapIn: z.number().optional(),
});

const floorPlanConnectionSchema = z.object({
  targetRoomId: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum([
    "door",
    "doorway",
    "doorlessPassage",
    "opening",
    "hall",
    "throughRoom",
    "window",
    "unknown",
  ]),
  confidence: z.enum(["high", "medium", "low", "conflict"]).optional(),
  note: z.string().optional(),
});

const floorPlanRoomConstraintSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  kind: z
    .enum([
      "room",
      "hall",
      "closet",
      "bath",
      "utility",
      "kitchen",
      "circulation",
      "garage",
      "carport",
      "patio",
      "deck",
      "porch",
      "shed",
      "yard",
      "outdoor",
    ])
    .optional(),
  areaRole: z
    .enum(["conditioned", "unconditioned", "excluded", "outdoor", "unknown"])
    .optional(),
  confidence: z.enum(["high", "medium", "low", "conflict"]).optional(),
  xIn: z.number().optional(),
  yIn: z.number().optional(),
  widthIn: z.number().positive().optional(),
  depthIn: z.number().positive().optional(),
  clearWidthIn: z.number().positive().optional(),
  clearDepthIn: z.number().positive().optional(),
  wallThicknessIn: z.number().positive().optional(),
  widthRangeIn: z
    .tuple([z.number().positive(), z.number().positive()])
    .optional(),
  depthRangeIn: z
    .tuple([z.number().positive(), z.number().positive()])
    .optional(),
  accessNote: z.string().optional(),
  unresolvedSubspaces: z.array(z.string()).optional(),
  connectsTo: z.array(floorPlanConnectionSchema).optional(),
  containedIn: z.string().optional(),
  partialOutside: z.boolean().optional(),
  sourceMeasurementIds: z.array(z.string()).optional(),
  relativeTo: floorPlanRelativeRoomSchema.optional(),
});

const floorPlanPropertyZoneSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  kind: z.enum([
    "houseShell",
    "garage",
    "carport",
    "patio",
    "deck",
    "porch",
    "shed",
    "yard",
    "driveway",
    "garden",
    "fence",
    "lot",
    "custom",
  ]),
  areaRole: z
    .enum(["conditioned", "unconditioned", "excluded", "outdoor", "unknown"])
    .optional(),
  confidence: z.enum(["high", "medium", "low", "conflict"]).optional(),
  xIn: z.number().optional(),
  yIn: z.number().optional(),
  widthIn: z.number().positive().optional(),
  depthIn: z.number().positive().optional(),
  widthRangeIn: z
    .tuple([z.number().positive(), z.number().positive()])
    .optional(),
  depthRangeIn: z
    .tuple([z.number().positive(), z.number().positive()])
    .optional(),
  sourceMeasurementIds: z.array(z.string()).optional(),
  partialOutside: z.boolean().optional(),
  note: z.string().optional(),
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
  entityType: z.enum([
    "wall",
    "room",
    "opening",
    "feature",
    "zone",
    "annotation",
  ]),
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
  }),
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
  z.object({
    type: z.literal("createPlacement"),
    placement: planPlacementInputSchema,
  }),
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
  z.object({
    type: z.literal("deletePlacement"),
    placementId: z.string().min(1),
  }),
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
      ]),
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
      ]),
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
      ]),
    )
    .optional(),
  room: z.string().optional(),
  destinationRoom: z.string().optional(),
});

export const MOVINGMANIFEST_MCP_INSTRUCTIONS =
  "Canonical MovingManifest workflow: hosted connectors should use https://movingmanifest.com/api/mcp as the connector URL; https://movingmanifest.com/mcp is the human setup page, so if tools never appear, OAuth never starts, or HTML/docs appear, ask the user to switch to /api/mcp; call agent_workbench first to choose the correct workflow lane, then call get_api_context to verify the current OAuth/API-key connection, scopes, and move restriction; if expected tools are missing or private calls fail with Invalid API key format, invalid_token, or missing scopes right after a deploy/OAuth/toolset change, refresh the MCP tool list or restart the session, then ask the user to disconnect and reconnect the hosted connector if the same failure persists; Claude may require the user to approve each tool separately, or the user can choose Allow all in connector permissions only if they trust the MovingManifest connector and signed-in account; for bulk phone photos, tell the user to use the MovingManifest Capture page so originals upload directly to site storage, then process them with ingestion_queue instead of asking for base64 in chat; use list_moves or setup_move before write tools; use get_agent_context/get_move_summary with bounded sections before multi-step edits; prefer save_box_intake when the user wants to create/update one box with dimensions, weight, description, containerType, box photos, newly described contents, or linked existing items in the same approval; prefer batch_upsert_movable_units when the user gives a rough list of boxes plus large loose items, expand numbered coded box ranges like boxes 1-25 or B-001-B-025 into one row per physical code, set containerType on box rows when the user says carton, plastic tote, bin, wardrobe box, dish pack, crate, or similar, use count only for new auto-coded box rows such as 12 medium boxes, pass a stable idempotencyKey for live auto-coded box rows without code/boxId, include assignedResourceId and optional assignedZoneId when rough load hints are already resolved to explicit MovingManifest IDs, include photoIds on photographed box rows after upload_photo/upload_photos and do not combine photoIds with count, read movableUnitSummary.measurementRoute before asking what to measure next, and use batch_upsert_movable_units again with existing boxId/code or itemId rows to patch missing movable-unit weights, dimensions, volume, or assignment without duplicating records; include photoIds on existing boxId/code rows when photos need to be attached later; prefer batch_upsert_items for detailed inventory batches not tied to one box; prefer add_item_from_photo for one photo becoming one standalone item; prefer upload_photo/upload_photos for one-off evidence photos; use ingestion_queue list/claim/media for captured app queue work, then use ingestion_queue submitResults to finalize, honoring intent plus targetBoxId/targetBoxCode/targetItemId before creating records; use apply_assignments for later or review-driven box/loose-item load assignment changes; call get_move_summary after substantial writes to verify results and tell the user any physical follow-up, such as the box code label to write on the box.";

export const MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS = Object.freeze([
  "get_api_capabilities",
  "agent_workbench",
  "get_api_context",
  "list_moves",
  "setup_move",
  "get_move_summary",
  "get_agent_context",
  "get_move_questions",
  "get_move_day_checklist",
  "search_inventory",
  "list_move_spaces",
  "create_move_space",
  "create_item_with_images",
  "add_item_from_photo",
  "save_box_intake",
  "batch_upsert_movable_units",
  "batch_upsert_items",
  "append_item_note",
  "suggest_assignments",
  "apply_assignments",
  "ingestion_queue",
  "upload_photo",
  "upload_photos",
  "get_photo_display_url",
  "get_capacity_report",
]);

export function createMovingManifestMcpServer(apiConfig) {
  const target = new McpServer(
    {
      name: "movingmanifest",
      version: "0.2.0",
      websiteUrl: "https://movingmanifest.com",
    },
    {
      instructions: MOVINGMANIFEST_MCP_INSTRUCTIONS,
    },
  );
  registerTools(target, apiConfig);
  return target;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const config = createApiConfig();
  const server = createMovingManifestMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function registerTools(target, apiConfig, options = {}) {
  target = filteredToolTarget(target, options.allowedToolNames);

  registerTool(target, "get_api_capabilities", {
    title: "Get API capabilities",
    description:
      "Inspect MovingManifest REST/MCP capabilities, required scopes, core workflows, and known launch blockers. This is local metadata and does not call the API.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: () => getApiCapabilities(),
  });

  registerTool(target, "agent_workbench", {
    title: "Agent workbench",
    description:
      "Read-first workflow guide for MovingManifest agents. Use this before choosing from the broader tool surface, especially for capture queue, photo inventory, review-first, or trusted-helper work.",
    inputSchema: {
      mode: agentWorkbenchModeSchema.optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => getAgentWorkbenchGuide(input.mode),
  });

  registerTool(target, "get_api_context", {
    title: "Get API context",
    description:
      "Inspect the current MovingManifest OAuth/API-key connection context, including household, scopes, and any move restriction.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: () => getApiContext(apiConfig),
  });

  registerTool(target, "list_household_members", {
    title: "List household members",
    description:
      "List real household login access for the current connection's household, including each member's API access status and active key count. This is different from move people/contact records. Requires members/manage.",
    inputSchema: {
      householdId: z
        .string()
        .describe("MovingManifest household id from get_api_context."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listHouseholdMembers(apiConfig, input),
  });

  registerTool(target, "add_household_member", {
    title: "Add household member",
    description:
      "Grant real household login access by email, or create a pending invitation if the email has not signed in yet. Requires members/manage.",
    inputSchema: {
      householdId: z
        .string()
        .describe("MovingManifest household id from get_api_context."),
      email: z.string().email(),
      role: householdMemberRoleSchema.default("editor"),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
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
          }),
        )
        .max(100)
        .optional(),
      transportResources: z
        .array(setupTransportResourceSchema)
        .max(25)
        .optional(),
      items: z.array(inventoryItemWriteSchema).max(100).optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => setupMove(apiConfig, input),
  });

  registerTool(target, "get_move_summary", {
    title: "Get move summary",
    description:
      "Fetch a bounded move summary with resources, zones, inventory, boxes, assignments, photo metadata, and movableUnitSummary. Use movableUnitSummary.measurementRoute before asking what rough boxes or loose items to measure next.",
    inputSchema: {
      moveId: z.string().describe("MovingManifest move id."),
      sections: z
        .array(
          z.enum([
            "resources",
            "zones",
            "people",
            "items",
            "boxes",
            "assignments",
            "photos",
            "planningSuggestions",
            "documentationProfiles",
            "exports",
            "shareLinks",
          ]),
        )
        .optional(),
      maxPerSection: z.number().int().min(1).max(500).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => getMoveSummary(apiConfig, input),
  });

  registerTool(target, "get_agent_context", {
    title: "Get agent context",
    description:
      "Fetch one bounded structured context payload for AI agents: move, spaces, transport resources/zones, items, photos, sale pipeline, counts, movableUnitSummary, and write-contract guidance. Use movableUnitSummary.measurementRoute before rough-load follow-up questions.",
    inputSchema: {
      moveId: z.string().describe("MovingManifest move id."),
      sections: z
        .array(
          z.enum([
            "spaces",
            "transportResources",
            "transportZones",
            "items",
            "photos",
            "salePipeline",
            "layoutPlans",
          ]),
        )
        .optional(),
      maxPerSection: z.number().int().min(1).max(500).optional(),
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

  registerTool(target, "plan_create", {
    title: "Create floor plan",
    description:
      "Create a destination or origin Layout Studio plan for a move. Use this when a user shares blueprint/floor-plan evidence before opening Layout Studio. Requires plans/write.",
    inputSchema: {
      moveId: z.string(),
      name: z.string().min(1).optional(),
      kind: z.enum(["destination", "origin"]).optional(),
      defaultWallThicknessIn: z.number().positive().optional(),
      defaultCeilingHeightIn: z.number().positive().optional(),
      gridSnapIn: z.number().positive().optional(),
      northAngleDeg: z.number().optional(),
      mainLevelName: z.string().min(1).optional(),
      yardLevelName: z.string().min(1).optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => planCreate(apiConfig, input),
  });

  registerTool(target, "create_floor_plan_intake", {
    title: "Create floor-plan intake",
    description:
      "Upload blueprint/floor-plan images when needed, create or select a Layout Studio plan, and create a floorPlan-scoped ingestion queue entry for an external AI agent to interpret. This stores evidence and work state; it does not run site-hosted AI.",
    inputSchema: {
      moveId: z.string(),
      planId: z.string().optional(),
      planName: z.string().optional(),
      photoIds: z.array(z.string()).optional(),
      filePaths: z
        .array(z.string())
        .optional()
        .describe(
          "Convenience list of local blueprint/floor-plan image paths.",
        ),
      sourceUrls: z
        .array(z.string().url())
        .optional()
        .describe(
          "Convenience list of public blueprint/floor-plan image URLs.",
        ),
      images: z.array(floorPlanIntakeImageSchema).max(50).optional(),
      instructions: z.string().optional(),
      roomHint: z.string().optional(),
      dispositionHint: z.string().optional(),
      caption: z.string().optional(),
      privacyLevel: z.string().optional(),
      visibilityScope: z.string().optional(),
      source: z.string().optional(),
      exifHandlingStatus: z.string().optional(),
      agentLabel: z.string().max(64).optional(),
      notes: z.string().optional(),
      continueOnImageError: z.boolean().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    handler: (input) => createFloorPlanIntake(apiConfig, input),
  });

  registerTool(target, "floor_plan_context", {
    title: "Get floor-plan agent context",
    description:
      "Fetch the active plan, source images, measurement/evidence ledger, solve diagnostics, destination spaces, floorPlan queue items, unresolved agent questions, and unplaced counts for a Layout Studio agent.",
    inputSchema: {
      moveId: z.string(),
      planId: z.string().optional(),
      includeMedia: z.boolean().optional(),
      queueLimit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => floorPlanContext(apiConfig, input),
  });

  registerTool(target, "floor_plan_evidence", {
    title: "Manage floor-plan evidence",
    description:
      "Create, list, update, or supersede durable floor-plan evidence and measurements with provenance. Use this before proposing geometry so the user's AI agent records what each image, text note, user edit, or calculation supports.",
    inputSchema: {
      action: z.enum(["list", "create", "update", "supersede"]),
      planId: z.string(),
      moveId: z.string().optional(),
      evidenceId: z.string().optional(),
      evidenceType: z
        .enum(["measurement", "knownFact", "assumption", "conflict", "note"])
        .optional(),
      title: z.string().min(1).optional(),
      summary: z.string().optional(),
      confidence: estimateConfidenceSchema.optional(),
      sourceType: z
        .enum([
          "image",
          "textNote",
          "userEdit",
          "agentExtraction",
          "calculation",
        ])
        .optional(),
      areaRole: z
        .enum([
          "conditioned",
          "unconditioned",
          "excluded",
          "outdoor",
          "unknown",
        ])
        .optional(),
      constraintStrength: z
        .enum(["hard", "strong", "soft", "displayOnly"])
        .optional(),
      sourcePhotoId: z.string().optional(),
      sourceLabel: z.string().optional(),
      sourceRegion: floorPlanSourceRegionSchema.optional(),
      imageNumber: z.number().int().positive().optional(),
      facts: z.array(z.string()).optional(),
      measurements: z.array(floorPlanMeasurementSchema).optional(),
      reason: z.string().optional(),
      agentLabel: z.string().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => floorPlanEvidence(apiConfig, input),
  });

  registerTool(target, "floor_plan_observations", {
    title: "Manage floor-plan observations",
    description:
      "Bulk create, list, update, or supersede atomic floor-plan observations extracted from images, notes, photos, and satellite views. Use this for labels, handwritten/OCR text, measurements, rooms, walls, openings, doorways, doorless passages, windows, fixtures, exterior structures, lot clues, and unknown marks.",
    inputSchema: {
      action: z.enum(["list", "create", "update", "supersede"]),
      planId: z.string(),
      moveId: z.string().optional(),
      observationId: z.string().optional(),
      observations: z.array(floorPlanObservationSchema).max(250).optional(),
      title: z.string().optional(),
      status: z
        .enum(["active", "needsReview", "superseded", "rejected"])
        .optional(),
      subjectKey: z.string().optional(),
      subjectLabel: z.string().optional(),
      rawText: z.string().optional(),
      normalized: z.record(z.string(), z.unknown()).optional(),
      confidence: estimateConfidenceSchema.optional(),
      reason: z.string().optional(),
      agentLabel: z.string().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => floorPlanObservations(apiConfig, input),
  });

  registerTool(target, "floor_plan_relationships", {
    title: "Manage floor-plan relationships",
    description:
      "Bulk create, list, update, or supersede topology relationships such as adjacentTo, connectedTo, partOf, openingIn, doorlessPassageBetween, countsTowardArea, and excludedFromArea. This lets agents make the puzzle solvable without hand-supplied rectangles.",
    inputSchema: {
      action: z.enum(["list", "create", "update", "supersede"]),
      planId: z.string(),
      moveId: z.string().optional(),
      relationshipId: z.string().optional(),
      relationships: z.array(floorPlanRelationshipSchema).max(250).optional(),
      status: z
        .enum(["active", "needsReview", "superseded", "rejected"])
        .optional(),
      fromSubjectLabel: z.string().optional(),
      toSubjectLabel: z.string().optional(),
      confidence: estimateConfidenceSchema.optional(),
      notes: z.string().optional(),
      reason: z.string().optional(),
      agentLabel: z.string().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => floorPlanRelationships(apiConfig, input),
  });

  registerTool(target, "floor_plan_solve", {
    title: "Solve floor-plan puzzle",
    description:
      "Validate stored observations, relationships, measurements, and optional topology hints. Generate draft geometry only when the evidence graph is sufficient; otherwise return conflicts and gap questions instead of hiding geometry mistakes.",
    inputSchema: {
      planId: z.string(),
      moveId: z.string().optional(),
      rooms: z.array(floorPlanRoomConstraintSchema).max(120).optional(),
      zones: z.array(floorPlanPropertyZoneSchema).max(80).optional(),
      levelId: z.string().optional(),
      includeProposedOps: z.boolean().optional(),
      createProposal: z.boolean().optional(),
      batchId: z.string().optional(),
      reasoning: z.string().optional(),
      agentLabel: z.string().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => floorPlanSolve(apiConfig, input),
  });

  registerTool(target, "floor_plan_reset_draft", {
    title: "Trash floor-plan draft output",
    description:
      "Archive stale floor-plan solve runs and reject pending floorplan-generated proposals while preserving source photos, observations, relationships, evidence, and measurements.",
    inputSchema: {
      planId: z.string(),
      moveId: z.string().optional(),
      reason: z.string().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
    handler: (input) => floorPlanResetDraft(apiConfig, input),
  });

  registerTool(target, "floor_plan_calculate", {
    title: "Calculate floor-plan derived facts",
    description:
      "Recompute derived area totals, official square-foot variance, excluded-area totals, lot coverage, and calculation diagnostics from stored floor-plan evidence without creating proposal ops.",
    inputSchema: {
      planId: z.string(),
      moveId: z.string().optional(),
      rooms: z.array(floorPlanRoomConstraintSchema).max(120).optional(),
      zones: z.array(floorPlanPropertyZoneSchema).max(80).optional(),
      reasoning: z.string().optional(),
      agentLabel: z.string().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => floorPlanCalculate(apiConfig, input),
  });

  registerTool(target, "floor_plan_questions", {
    title: "Get floor-plan gap questions",
    description:
      "Generate highest-impact missing measurement questions from the stored evidence, area reconciliation, property zones, and latest solver diagnostics.",
    inputSchema: {
      planId: z.string(),
      moveId: z.string().optional(),
      rooms: z.array(floorPlanRoomConstraintSchema).max(120).optional(),
      zones: z.array(floorPlanPropertyZoneSchema).max(80).optional(),
      reasoning: z.string().optional(),
      agentLabel: z.string().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => floorPlanQuestions(apiConfig, input),
  });

  registerTool(target, "plan_get", {
    title: "Get floor plan document",
    description:
      "Fetch the full Layout Studio plan document: settings, levels, entities, placements, source metadata, and pending proposal count. Always read this before writing plan ops. Plans can be large; text-only agents should prefer plan_summary, and use plan_snapshot for visual inspection.",
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
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
      "Search inventory by server-side text query after applying optional status, disposition, destination, or attribution filters.",
    inputSchema: {
      moveId: z.string(),
      query: z.string().optional(),
      status: z.string().optional(),
      disposition: z.string().optional(),
      destinationRoom: z.string().optional(),
      destinationSpaceId: z.string().optional(),
      agentLabel: z.string().optional(),
      maxConfidence: z.number().min(0).max(1).optional(),
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
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
        .describe(
          "One entry per user-provided image. Each entry must provide exactly one filePath, sourceUrl, dataUrl, or fileBase64.",
        ),
      photoDefaults: evidencePhotoDefaultsSchema
        .optional()
        .describe(
          "Shared photo metadata. Item room is reused for photos when this does not provide room.",
        ),
      continueOnImageError: z
        .boolean()
        .optional()
        .describe(
          "Defaults true so the created item is returned with per-image failures instead of losing the useful partial result.",
        ),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
      ...inventoryItemWriteSchema.omit({ itemId: true, name: true }).shape,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
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
        .describe(
          "Defaults true so the item can still be created if the single image upload fails.",
        ),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    handler: (input) => addItemFromPhoto(apiConfig, input),
  });

  registerTool(target, "add_box_item_from_photo", {
    title: "Add boxed item from photo",
    description:
      "One-call path for opening a rough box on mobile: provide the existing boxId or boxCode plus one original photo and the item name. MovingManifest creates a review-ready item, uploads and attaches the photo, packs the item into that existing box, and keeps the box record instead of creating a replacement box.",
    inputSchema: {
      moveId: z.string(),
      boxId: z.string().optional(),
      boxCode: z.string().optional(),
      boxQuantity: z
        .number()
        .positive()
        .optional()
        .describe(
          "Quantity to pack into the box. Defaults to the item quantity or 1.",
        ),
      boxItemNotes: z.string().optional(),
      name: z.string().min(1),
      ...inventoryItemWriteSchema.omit({ itemId: true, name: true }).shape,
      ...createdItemImageInputSchema.shape,
      continueOnImageError: z
        .boolean()
        .optional()
        .describe(
          "Defaults true so the item can still be created if the single image upload fails.",
        ),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    handler: (input) => addBoxItemFromPhoto(apiConfig, input),
  });

  registerTool(target, "batch_upsert_items", {
    title: "Batch upsert items",
    description:
      "Create or update up to 100 inventory items. Rows with itemId or matching externalSource/externalId update existing items; rows without a match create new items. Existing item rows append/merge researchSources by default; use row researchSourceMode=replace only for intentional cleanup. Set dryRun true to validate without writing.",
    inputSchema: {
      moveId: z.string(),
      items: z.array(batchInventoryItemWriteSchema).min(1).max(100),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => batchUpsertItems(apiConfig, input),
  });

  registerTool(target, "batch_add_box_contents", {
    title: "Batch add box contents",
    description:
      "One-call path for opening an existing rough box and saving several discovered contents: create or update item records, mark them packed/reviewable by default, and pack them into the same existing box by boxId or boxCode. Use this instead of separate batch_upsert_items plus add_items_to_box when all rows belong to one open box.",
    inputSchema: {
      moveId: z.string(),
      boxId: z.string().optional(),
      boxCode: z.string().optional(),
      items: z.array(batchBoxContentItemWriteSchema).min(1).max(100),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => batchAddBoxContents(apiConfig, input),
  });

  registerTool(target, "batch_upsert_movable_units", {
    title: "Batch upsert movable units",
    description:
      "Create or update a rough load-planning list where each row is either a visible box/carton or a large loose item that moves as-is. Use this before detailed itemization when the user says things like 'I have 25 boxes, a treadmill, a planer, and a saw.' Include assignedResourceId and optional assignedZoneId on rows when the user already gave a load hint and you have resolved it to explicit MovingManifest resource/zone IDs; use apply_assignments later for stricter warning/block validation or reassignment. Expand numbered coded box ranges like 'boxes 1-25' or 'B-001-B-025' into one box row per explicit code before calling this tool. Set containerType on box rows when the user says carton, plastic tote, bin, wardrobe box, dish pack, crate, or similar. For new auto-coded boxes such as '12 medium boxes', you may send one code-less box row with count: 12; MovingManifest expands it into physical box rows and returns unitCountIndex/unitCount. When photos are already uploaded, include photoIds on each box row so photographed boxes/totes are attached after upsert in the same batch approval; do not combine photoIds with count. Use it again to fill missing weight, dimensions, volume, or assignment by passing existing boxId/code or loose itemId rows; include photoIds on box rows when photos need to be attached later. Omitted fields are left alone on existing itemId patches. Box rows upsert by boxId or normalized code, so 'b 012' and 'B-012' target the same box. Live rows without boxId or code receive server-generated box codes and require a stable idempotencyKey so retries do not create duplicate auto-coded boxes. New looseItem rows require externalSource plus externalId, become active, reviewable movable-unit inventory records, and use movable-unit/loose-item tags. Dry-run and live responses preserve original rough-list positions with unitIndex/unitIndexes so you can map created ids or errors back to the user's pasted list. Set dryRun true first for validation.",
    inputSchema: {
      moveId: z.string(),
      units: z.array(movableUnitWriteSchema).min(1).max(100),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => batchUpsertMovableUnits(apiConfig, input),
  });

  registerTool(target, "update_item", {
    title: "Update item",
    description:
      "Update selected item fields. When sending researchSources, MCP defaults to appending/merging them with existing item sources; pass researchSourceMode=replace only when the user explicitly wants the research source list overwritten. Set dryRun true to preview the API request without writing.",
    inputSchema: {
      moveId: z.string(),
      itemId: z.string(),
      dryRun: z.boolean().optional(),
      idempotencyKey: z.string().optional(),
      researchSourceMode: z
        .enum(["append", "replace"])
        .optional()
        .describe(
          "Defaults to append for MCP updates so item research history is preserved; use replace only for intentional cleanup.",
        ),
      ...inventoryItemWriteSchema.omit({ itemId: true }).shape,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => updateItem(apiConfig, input),
  });

  registerTool(target, "append_item_note", {
    title: "Append item note",
    description:
      "Append a private note to one inventory item without reading or replacing existing private notes. Use this for additive observations, caveats, handling notes, and agent follow-up notes.",
    inputSchema: {
      moveId: z.string(),
      itemId: z.string(),
      note: z.string().min(1).max(4000),
      label: z.string().max(64).optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => appendItemNote(apiConfig, input),
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
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
      "Create a first-class room/space target for inventory, photos, transport planning, selling context, and Layout Studio.",
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
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

  registerTool(target, "manage_planned_item", {
    title: "Manage planned item",
    description:
      "Create, update, convert, or archive a desired future item. Requires an existing move; call setup_move or list_moves first. Use list_planned_items before updating, converting, or archiving when the plannedItemId is unknown.",
    inputSchema: {
      action: z.enum(["create", "update", "convert", "archive"]),
      moveId: z.string(),
      plannedItemId: z.string().optional(),
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => {
      switch (input.action) {
        case "create":
          return createPlannedItem(apiConfig, input);
        case "update":
          return updatePlannedItem(apiConfig, input);
        case "convert":
          return convertPlannedItem(apiConfig, input);
        case "archive":
          return archivePlannedItem(apiConfig, input);
        default:
          return { error: `Unsupported planned item action: ${input.action}` };
      }
    },
  });

  registerTool(target, "save_box_intake", {
    title: "Save box intake",
    description:
      "Workflow tool for one box-focused capture session. Use this when the user wants to create or update a box with dimensions, weight, description, destination, box-level photos, newly described contents, or existing items to pack into that box. This replaces separate create_box, upload_photos, batch_add_box_contents, and add_items_to_box calls for the normal Claude/OAuth box workflow.",
    inputSchema: {
      moveId: z.string(),
      box: boxIntakeBoxSchema.describe(
        "Box to create or update. Use boxId or boxCode for an existing box; omit both to create a new box. Include dimensionsIn and weight fields when the user gives measurements.",
      ),
      photos: z
        .array(createdItemImageInputSchema)
        .max(50)
        .optional()
        .describe(
          "Photos of the box or its general contents. Each entry must provide exactly one filePath, sourceUrl, dataUrl, or fileBase64.",
        ),
      contents: z
        .array(boxIntakeContentSchema)
        .max(100)
        .optional()
        .describe(
          "New or updated item records that should be packed into this box. Use linkedItems for records that already exist and only need packing.",
        ),
      linkedItems: z
        .array(boxIntakeLinkedItemSchema)
        .max(100)
        .optional()
        .describe(
          "Existing items to pack into this box by itemId or externalSource/externalId.",
        ),
      photoDefaults: evidencePhotoDefaultsSchema
        .optional()
        .describe("Shared metadata for box-level and content-item photos."),
      continueOnImageError: z
        .boolean()
        .optional()
        .describe(
          "Defaults true so box and contents can still save if one image upload fails.",
        ),
      idempotencyKey: z
        .string()
        .optional()
        .describe(
          "Required for live new-box creates when no boxId/boxCode/code is supplied. Use a stable key for retries.",
        ),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    handler: (input) => saveBoxIntake(apiConfig, input),
  });

  registerTool(target, "create_box", {
    title: "Create box",
    description:
      "Create one box/carton/container record for packing and optional current box-based load assignment. Set containerType when the user identifies a carton, plastic tote, bin, wardrobe box, dish pack, crate, or similar. For a rough list containing cartons plus large loose items, prefer batch_upsert_movable_units first so loose pieces remain loose inventory records. Set dryRun true to preview the API request without writing.",
    inputSchema: {
      moveId: z.string(),
      code: z.string().optional(),
      label: z.string().optional(),
      containerType: boxContainerTypeSchema.optional(),
      room: z.string().optional(),
      destinationRoom: z.string().optional(),
      destinationSpaceId: z.string().optional(),
      destinationSpaceName: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      agentLabel: z.string().max(64).optional(),
      aiConfidenceScore: z.number().min(0).max(1).optional(),
      dimensionsIn: dimensionsInSchema.optional(),
      estimatedWeightLb: z.number().nonnegative().optional(),
      actualWeightLb: z.number().nonnegative().optional(),
      estimatedVolumeCuFt: z.number().nonnegative().optional(),
      assignedResourceId: z.string().optional(),
      assignedZoneId: z.string().optional(),
      assignmentOverrideReason: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => createBox(apiConfig, input),
  });

  registerTool(target, "add_items_to_box", {
    title: "Add items to box",
    description:
      "Assign multiple items to a box. You may pass boxCode (for example B-012) instead of boxId, and item externalSource/externalId instead of itemId. Set dryRun true to preview the assignments without writing; pass idempotencyKey for stable retries.",
    inputSchema: {
      moveId: z.string(),
      boxId: z.string().optional(),
      boxCode: z.string().optional(),
      items: z.array(
        z.object({
          itemId: z.string().optional(),
          externalSource: z.string().optional(),
          externalId: z.string().optional(),
          quantity: z.number().positive().optional(),
          notes: z.string().optional(),
        }),
      ),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => addItemsToBox(apiConfig, input),
  });

  registerTool(target, "remove_item_from_box", {
    title: "Remove item from box",
    description:
      "Remove one item-to-box assignment without deleting the inventory item. You may pass boxCode instead of boxId and item externalSource/externalId instead of itemId. Set dryRun true to preview the request without writing; pass idempotencyKey for stable retries.",
    inputSchema: {
      moveId: z.string(),
      boxId: z.string().optional(),
      boxCode: z.string().optional(),
      itemId: z.string().optional(),
      externalSource: z.string().optional(),
      externalId: z.string().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
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
      "Apply explicit movable-unit-to-resource/zone assignments. Pass boxId for a box or itemId for a large loose item created by batch_upsert_movable_units. Use dryRun true first to validate warnings, hard blocks, and locked units without writing; pass idempotencyKey for stable retries.",
    inputSchema: {
      moveId: z.string(),
      assignments: z
        .array(
          z.object({
            boxId: z.string().optional(),
            itemId: z.string().optional(),
            assignedResourceId: z.string(),
            assignedZoneId: z.string().optional(),
            overrideReason: z.string().optional(),
          }),
        )
        .min(1)
        .max(100),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => applyAssignments(apiConfig, input),
  });

  registerTool(target, "ingestion_queue", {
    title: "Ingestion queue",
    description:
      "Create, list, claim, fetch image evidence as MCP media blocks, resolve, or request signed evidence URLs for capture-now/process-later queue entries. For bulk phone photos, tell the user to upload through the MovingManifest Capture page so originals go straight to storage; then process the queued media here instead of asking for base64 in chat. Use intent plus targetBoxId/targetBoxCode/targetItemId when a capture is about an existing box or item. Use committedItems plus optional committedBoxes, boxAssignments, and loadAssignments for trusted one-call inventory/packing/load writes, and use proposedItems for review suggestions. If queue media already has a boxId or targetBoxId from an opened rough box, create items with attachMediaPhotoIds and pack them back into that existing box with boxAssignments instead of creating a replacement box.",
    inputSchema: {
      action: z.enum([
        "create",
        "list",
        "claim",
        "submitResults",
        "setStatus",
        "evidenceUrl",
        "media",
      ]),
      moveId: z.string(),
      entryId: z.string().optional(),
      photoId: z.string().optional(),
      photoIds: z.array(z.string()).min(1).max(10).optional(),
      status: ingestionQueueStatusSchema.optional(),
      instructions: z.string().optional(),
      room: z.string().optional(),
      roomHint: z.string().optional(),
      dispositionHint: z.string().optional(),
      scopeHint: ingestionScopeHintSchema.optional(),
      intent: ingestionQueueIntentSchema
        .describe(
          "What the user believes this capture is for: a new movable unit/box, new inventory item, existing box/item follow-up, box contents, condition, measurements, floorPlan, or general."
        )
        .optional(),
      targetBoxId: z
        .string()
        .describe(
          "Existing box ID this queue entry is about. Prefer this when queue media was captured from a known box page."
        )
        .optional(),
      targetBoxCode: z
        .string()
        .describe(
          "Visible existing box code, such as B-001. MovingManifest resolves and normalizes it inside the current move."
        )
        .optional(),
      targetItemId: z
        .string()
        .describe("Existing inventory item ID this queue entry is about.")
        .optional(),
      targetLabel: z
        .string()
        .describe(
          "Human-readable target label when the user names an existing thing but the assistant has not resolved an ID yet."
        )
        .optional(),
      targetPlanId: z.string().optional(),
      mediaPhotoIds: z.array(z.string()).optional(),
      hasAudio: z.boolean().optional(),
      hasVideo: z.boolean().optional(),
      hasImage: z.boolean().optional(),
      includeMedia: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      batchSize: z.number().int().min(1).max(10).optional(),
      agentLabel: z.string().optional(),
      agentSummary: z.string().optional(),
      committedItems: z
        .array(ingestionCommittedItemSchema)
        .min(1)
        .max(100)
        .optional(),
      committedBoxes: z
        .array(ingestionCommittedBoxSchema)
        .min(1)
        .max(100)
        .optional(),
      boxAssignments: z
        .array(ingestionBoxAssignmentSchema)
        .min(1)
        .max(100)
        .optional(),
      loadAssignments: z
        .array(ingestionLoadAssignmentSchema)
        .min(1)
        .max(100)
        .optional(),
      proposedItems: z
        .array(ingestionProposedItemSchema)
        .min(1)
        .max(100)
        .optional(),
      resultItemIds: z.array(z.string()).optional(),
      resultRefs: z.array(ingestionResultRefSchema).optional(),
      needsInputQuestion: z.string().optional(),
      question: z.string().optional(),
      variant: z
        .enum(["original", "thumb", "card", "detail", "full"])
        .optional(),
      maxBytes: z.number().int().min(1).max(16_000_000).optional(),
      fallbackToOriginal: z.boolean().optional(),
      continueOnError: z.boolean().optional(),
      idempotencyKey: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => {
      if (input.action === "create")
        return createIngestionQueueEntry(apiConfig, input);
      if (input.action === "list") return listIngestionQueue(apiConfig, input);
      if (input.action === "claim")
        return claimIngestionQueue(apiConfig, input);
      if (input.action === "submitResults") {
        return submitIngestionQueueResults(apiConfig, input);
      }
      if (input.action === "setStatus") {
        return setIngestionQueueStatus(apiConfig, input);
      }
      if (input.action === "media") {
        return getIngestionQueueEvidenceMedia(apiConfig, input);
      }
      return getIngestionQueueEvidenceUrl(apiConfig, input);
    },
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

  registerTool(target, "list_ai_suggestions", {
    title: "List AI suggestions",
    description:
      "List AI suggestions by kind: text, photo, or planning. Use this before exact-ID approval or rejection.",
    inputSchema: {
      moveId: z.string(),
      kind: z.enum(["text", "photo", "planning"]),
      status: z
        .union([aiSuggestionStatusSchema, planningSuggestionStatusSchema])
        .optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => {
      if (input.kind === "text") return listAiTextSuggestions(apiConfig, input);
      if (input.kind === "photo")
        return listAiPhotoSuggestions(apiConfig, input);
      return listPlanningSuggestions(apiConfig, input);
    },
  });

  registerTool(target, "generate_ai_suggestions", {
    title: "Generate AI suggestions",
    description:
      "Generate review-queue suggestions by kind. For text, pass sourceText. For photo, pass photoId or photoIds. For planning, pass kind=planning.",
    inputSchema: {
      moveId: z.string(),
      kind: z.enum(["text", "photo", "planning"]),
      sourceText: z.string().min(1).max(12000).optional(),
      photoId: z.string().optional(),
      photoIds: z.array(z.string()).min(1).max(50).optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => {
      if (input.kind === "text")
        return generateAiTextSuggestions(apiConfig, input);
      if (input.kind === "photo")
        return generateAiPhotoSuggestions(apiConfig, input);
      return generatePlanningSuggestions(apiConfig, input);
    },
  });

  registerTool(target, "approve_ai_suggestions", {
    title: "Approve AI suggestions",
    description:
      "Approve exact pending suggestion IDs by kind. Use dryRun true first to validate and preview writes.",
    inputSchema: {
      moveId: z.string(),
      kind: z.enum(["text", "photo", "planning"]),
      textApprovals: z.array(aiTextApprovalSchema).min(1).max(100).optional(),
      photoApprovals: z.array(aiPhotoApprovalSchema).min(1).max(100).optional(),
      planningApprovals: z
        .array(planningApprovalSchema)
        .min(1)
        .max(100)
        .optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => {
      if (input.kind === "text") {
        return approveAiTextSuggestions(apiConfig, {
          ...input,
          approvals: input.textApprovals,
        });
      }
      if (input.kind === "photo") {
        return approveAiPhotoSuggestions(apiConfig, {
          ...input,
          approvals: input.photoApprovals,
        });
      }
      return approvePlanningSuggestions(apiConfig, {
        ...input,
        approvals: input.planningApprovals,
      });
    },
  });

  registerTool(target, "reject_ai_suggestions", {
    title: "Reject AI suggestions",
    description:
      "Reject exact pending suggestion IDs by kind without applying their drafts.",
    inputSchema: {
      moveId: z.string(),
      kind: z.enum(["text", "photo", "planning"]),
      suggestionIds: z.array(z.string()).min(1).max(100),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => {
      if (input.kind === "text")
        return rejectAiTextSuggestions(apiConfig, input);
      if (input.kind === "photo")
        return rejectAiPhotoSuggestions(apiConfig, input);
      return rejectPlanningSuggestions(apiConfig, input);
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
      sizeBytes: z
        .number()
        .int()
        .positive()
        .max(500 * 1024 * 1024),
      agentLabel: z.string().max(64).optional(),
      aiConfidenceScore: z.number().min(0).max(1).optional(),
      derivatives: z
        .array(
          z.object({
            variant: z.enum(["thumb", "card", "detail", "full"]),
            mimeType: z.enum(allowedDerivativeImageMimeTypes),
            sizeBytes: z
              .number()
              .int()
              .positive()
              .max(25 * 1024 * 1024),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          }),
        )
        .max(4)
        .optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
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
      agentLabel: z.string().max(64).optional(),
      aiConfidenceScore: z.number().min(0).max(1).optional(),
      notes: z.string().optional(),
      verificationStatus: z.string().optional(),
      capturedAt: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    handler: (input) => uploadEvidenceFile(apiConfig, input),
  });

  registerTool(target, "upload_photo", {
    title: "Upload photo",
    description:
      "Canonical MCP image upload path for a normal single household photo: pass a local filePath, public sourceUrl, dataUrl, or fileBase64, and MovingManifest stores the original, creates web-ready derivatives server-side, and returns photoId plus agentReview.",
    inputSchema: {
      moveId: z.string(),
      ...evidenceImageInputSchema.shape,
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    handler: (input) => uploadEvidenceImage(apiConfig, input),
  });

  registerTool(target, "upload_photos", {
    title: "Upload photos",
    description:
      "Canonical MCP batch image upload path. Use this when the user provides several ordinary photos from the same room/context or wants new photos attached to an existing itemId. One image entry equals one user photo; shared itemId, room, privacy/type, and review defaults can live at the top level; MovingManifest stores originals, creates web-ready derivatives server-side, and returns per-image status plus agentReview.",
    inputSchema: {
      moveId: z.string(),
      images: z
        .array(evidenceImageInputSchema)
        .min(1)
        .max(50)
        .describe("Images to upload. Use one entry per user photo."),
      ...evidenceImageBatchDefaultsSchema.shape,
      idempotencyKey: z
        .string()
        .optional()
        .describe(
          "Optional batch prefix; each image gets a stable numbered key.",
        ),
      dryRun: z.boolean().optional(),
      continueOnError: z
        .boolean()
        .optional()
        .describe(
          "When true, keep uploading later images after a failed entry and return per-image errors.",
        ),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
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
      agentLabel: z.string().max(64).optional(),
      aiConfidenceScore: z.number().min(0).max(1).optional(),
      notes: z.string().optional(),
      verificationStatus: z.string().optional(),
      capturedAt: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
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
      boxCode: z.string().optional(),
      spaceId: z.string().optional(),
      spaceName: z.string().optional(),
      transportResourceId: z.string().optional(),
      transportZoneId: z.string().optional(),
      externalSource: z.string().optional(),
      externalId: z.string().optional(),
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
      agentLabel: z.string().max(64).optional(),
      aiConfidenceScore: z.number().min(0).max(1).optional(),
      notes: z.string().optional(),
      verificationStatus: z.string().optional(),
      aiProcessed: z.boolean().optional(),
      capturedAt: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => attachPhoto(apiConfig, input),
  });

  registerTool(target, "get_photo_display_url", {
    title: "Get photo display URL",
    description:
      "Return a short-lived URL for a web-ready image derivative after evidence upload. This is for normal display/AI-safe derivatives only; it does not expose original private storage files.",
    inputSchema: {
      moveId: z.string(),
      photoId: z.string(),
      variant: z.enum(["thumb", "card", "detail", "full"]).optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => getPhotoDisplayUrl(apiConfig, input),
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

  registerTool(target, "manage_move_person", {
    title: "Manage move person",
    description:
      "Create, update, or archive a person/contact record for a move. Requires an existing move; call setup_move or list_moves first. Use list_move_people before updating or archiving when the personId is unknown.",
    inputSchema: {
      action: z.enum(["create", "update", "archive"]),
      moveId: z.string(),
      personId: z.string().optional(),
      name: z.string().optional(),
      role: movePersonRoleSchema.optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      notes: z.string().optional(),
      sortOrder: z.number().optional(),
      archivedAt: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => {
      switch (input.action) {
        case "create":
          return createMovePerson(apiConfig, input);
        case "update":
          return updateMovePerson(apiConfig, input);
        case "archive":
          return archiveMovePerson(apiConfig, input);
        default:
          return { error: `Unsupported move person action: ${input.action}` };
      }
    },
  });

  registerTool(target, "manage_transport_resource", {
    title: "Manage transport resource",
    description:
      "Create or update a truck, trailer, mover channel, storage unit, disposal, sale, donation, or custom transport resource. Requires an existing move; call setup_move or list_moves first. Use list_transport_resources before updating when the resourceId is unknown.",
    inputSchema: {
      action: z.enum(["create", "update"]),
      moveId: z.string(),
      resourceId: z.string().optional(),
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => {
      switch (input.action) {
        case "create":
          return createTransportResource(apiConfig, input);
        case "update":
          return updateTransportResource(apiConfig, input);
        default:
          return {
            error: `Unsupported transport resource action: ${input.action}`,
          };
      }
    },
  });

  registerTool(target, "manage_transport_zone", {
    title: "Manage transport zone",
    description:
      "Create or update a zone inside a transport resource, such as cab, trailer front, storage doorway, donation pickup, or claimed giveaway. Requires an existing resource; call list_transport_resources first when the resourceId or zoneId is unknown.",
    inputSchema: {
      action: z.enum(["create", "update"]),
      moveId: z.string(),
      zoneId: z.string().optional(),
      resourceId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      capacity: capacityInputSchema.optional(),
      preferredTags: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => {
      switch (input.action) {
        case "create":
          return createTransportZone(apiConfig, input);
        case "update":
          return updateTransportZone(apiConfig, input);
        default:
          return {
            error: `Unsupported transport zone action: ${input.action}`,
          };
      }
    },
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

  registerTool(target, "manage_documentation_profile", {
    title: "Manage documentation profile",
    description:
      "Create, update, or archive a scoped packet profile for PCS, movers, employers, claims, donation, sell/free, storage, or load crew workflows. Use list_documentation_profiles before updating or archiving when the documentationProfileId is unknown.",
    inputSchema: {
      action: z.enum(["create", "update", "archive"]),
      moveId: z.string(),
      documentationProfileId: z.string().optional(),
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => {
      switch (input.action) {
        case "create":
          return createDocumentationProfile(apiConfig, input);
        case "update":
          return updateDocumentationProfile(apiConfig, input);
        case "archive":
          return archiveDocumentationProfile(apiConfig, input);
        default:
          return {
            error: `Unsupported documentation profile action: ${input.action}`,
          };
      }
    },
  });

  registerTool(target, "manage_exports", {
    title: "Manage exports",
    description:
      "Create, list, or download server-generated exports. Prefer list before download when the exportJobId is unknown.",
    inputSchema: {
      action: z.enum(["create", "list", "download"]),
      moveId: z.string(),
      type: z
        .enum(["inventory", "boxes", "assignments", "documentationProfile"])
        .optional(),
      documentationProfileId: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      exportJobId: z.string().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => {
      switch (input.action) {
        case "create":
          return createExport(apiConfig, input);
        case "list":
          return listExports(apiConfig, input);
        case "download":
          return downloadExport(apiConfig, input);
        default:
          return { error: `Unsupported export action: ${input.action}` };
      }
    },
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

  registerTool(target, "manage_share_link", {
    title: "Manage share link",
    description:
      "Create or revoke a scoped documentation share link. Use list_share_links before revoking when the shareLinkId is unknown. The raw token is returned only once from create; store it carefully.",
    inputSchema: {
      action: z.enum(["create", "revoke"]),
      moveId: z.string(),
      shareLinkId: z.string().optional(),
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
          ]),
        )
        .optional(),
      expiresAt: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: (input) => {
      switch (input.action) {
        case "create":
          return createShareLink(apiConfig, input);
        case "revoke":
          return revokeShareLink(apiConfig, input);
        default:
          return { error: `Unsupported share link action: ${input.action}` };
      }
    },
  });
}

function filteredToolTarget(target, allowedToolNames) {
  if (!allowedToolNames) return target;
  const allowed = new Set(allowedToolNames);
  return {
    registerTool(name, ...args) {
      if (!allowed.has(name)) return undefined;
      return target.registerTool(name, ...args);
    },
  };
}

function registerTool(target, name, config) {
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
        return isToolResult(result) ? result : textResult(result);
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );
}

function isToolResult(result) {
  return (
    result &&
    typeof result === "object" &&
    Array.isArray(result.content) &&
    result.content.every((block) => block && typeof block.type === "string")
  );
}

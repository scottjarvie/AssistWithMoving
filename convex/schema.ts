import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const appRole = v.union(v.literal("member"), v.literal("admin"));

export const householdRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("editor"),
  v.literal("packer"),
  v.literal("viewer"),
  v.literal("guest")
);

export const membershipStatus = v.union(
  v.literal("active"),
  v.literal("invited"),
  v.literal("disabled")
);

export const moveRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("editor"),
  v.literal("packer"),
  v.literal("viewer"),
  v.literal("guest")
);

export const auditActorType = v.union(
  v.literal("user"),
  v.literal("apiKey"),
  v.literal("system"),
  v.literal("webhook")
);

export const auditCategory = v.union(
  v.literal("auth"),
  v.literal("household"),
  v.literal("inventory"),
  v.literal("assignment"),
  v.literal("photo"),
  v.literal("documentation"),
  v.literal("shareLink"),
  v.literal("apiKey"),
  v.literal("export"),
  v.literal("ai"),
  v.literal("admin"),
  v.literal("system")
);

export const moveType = v.union(
  v.literal("pcs"),
  v.literal("local"),
  v.literal("longDistance"),
  v.literal("storage"),
  v.literal("estate"),
  v.literal("decluttering"),
  v.literal("claimsInventory"),
  v.literal("other")
);

export const moveStatus = v.union(
  v.literal("planning"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("archived")
);

export const unitSystem = v.union(v.literal("imperial"), v.literal("metric"));

export const documentationProfileType = v.union(
  v.literal("personalFullRecord"),
  v.literal("pcsMove"),
  v.literal("movingCompany"),
  v.literal("employerRelocation"),
  v.literal("insuranceClaim"),
  v.literal("donationPickup"),
  v.literal("sellOrGiveaway"),
  v.literal("storageInventory"),
  v.literal("loadCrew")
);

export const documentationFieldKey = v.union(
  v.literal("moveSummary"),
  v.literal("pcsFields"),
  v.literal("rooms"),
  v.literal("items"),
  v.literal("boxes"),
  v.literal("loadAssignments"),
  v.literal("photos"),
  v.literal("estimatedValues"),
  v.literal("purchaseValues"),
  v.literal("serialNumbers"),
  v.literal("privateNotes"),
  v.literal("conditionAndDamage"),
  v.literal("auditSummary")
);

export const documentationImageRule = v.union(
  v.literal("none"),
  v.literal("thumbsOnly"),
  v.literal("reviewedEvidence"),
  v.literal("allAllowed")
);

export const documentationProfileStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived")
);

export const shareLinkScope = v.union(v.literal("move"), v.literal("profile"));

export const shareLinkStatus = v.union(
  v.literal("active"),
  v.literal("revoked")
);

export const shareLinkAction = v.union(
  v.literal("view"),
  v.literal("download"),
  v.literal("statusUpdate"),
  v.literal("comment"),
  v.literal("uploadEvidence")
);

export const apiKeyStatus = v.union(
  v.literal("active"),
  v.literal("revoked")
);

export const apiKeyScope = v.union(
  v.literal("moves/read"),
  v.literal("moves/write"),
  v.literal("inventory/read"),
  v.literal("inventory/write"),
  v.literal("photos/write"),
  v.literal("exports/read"),
  v.literal("exports/create")
);

export const pcsBranch = v.union(
  v.literal("army"),
  v.literal("navy"),
  v.literal("airForce"),
  v.literal("marineCorps"),
  v.literal("coastGuard"),
  v.literal("spaceForce"),
  v.literal("noaa"),
  v.literal("publicHealthService"),
  v.literal("other")
);

export const pcsShipmentType = v.union(
  v.literal("hhg"),
  v.literal("ppm"),
  v.literal("partialPpm"),
  v.literal("storage"),
  v.literal("mixed"),
  v.literal("other")
);

export const pcsDependentStatus = v.union(
  v.literal("withDependents"),
  v.literal("withoutDependents"),
  v.literal("unknown")
);

export const transportResourceType = v.union(
  v.literal("truck"),
  v.literal("trailer"),
  v.literal("personalVehicle"),
  v.literal("professionalMovers"),
  v.literal("militaryMovers"),
  v.literal("storage"),
  v.literal("dump"),
  v.literal("sell"),
  v.literal("donate"),
  v.literal("free"),
  v.literal("freeGiveaway"),
  v.literal("unknown"),
  v.literal("custom")
);

export const planningDefaultKey = v.union(
  v.literal("firstNight"),
  v.literal("doNotLetMoversTouch"),
  v.literal("highValue"),
  v.literal("documents"),
  v.literal("medication"),
  v.literal("electronics"),
  v.literal("sensitive"),
  v.literal("fragile"),
  v.literal("irreplaceable"),
  v.literal("restrictedReview")
);

export const planningDefaultHandling = v.union(
  v.literal("personalTransport"),
  v.literal("keepAccessible"),
  v.literal("evidenceRequired"),
  v.literal("restrictedReview"),
  v.literal("moverAllowedWithReview")
);

export const itemDisposition = v.union(
  v.literal("undecided"),
  v.literal("take"),
  v.literal("sell"),
  v.literal("donate"),
  v.literal("dump"),
  v.literal("free"),
  v.literal("storage"),
  v.literal("mover"),
  v.literal("personalTransport")
);

export const itemStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("packed"),
  v.literal("staged"),
  v.literal("loaded"),
  v.literal("delivered"),
  v.literal("missing"),
  v.literal("damaged"),
  v.literal("archived")
);

export const itemCondition = v.union(
  v.literal("unknown"),
  v.literal("new"),
  v.literal("excellent"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("poor"),
  v.literal("damaged")
);

export const estimateConfidence = v.union(
  v.literal("none"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("manual"),
  v.literal("actual")
);

export const itemFragility = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high")
);

export const itemCreatedVia = v.union(
  v.literal("manual"),
  v.literal("bulkImport"),
  v.literal("textAI"),
  v.literal("photoAI"),
  v.literal("api"),
  v.literal("mcp")
);

export const boxStatus = v.union(
  v.literal("open"),
  v.literal("packing"),
  v.literal("sealed"),
  v.literal("staged"),
  v.literal("loaded"),
  v.literal("delivered"),
  v.literal("missing"),
  v.literal("damaged"),
  v.literal("archived")
);

export const photoType = v.union(
  v.literal("item"),
  v.literal("serialNumber"),
  v.literal("condition"),
  v.literal("damage"),
  v.literal("boxContents"),
  v.literal("boxLabel"),
  v.literal("receipt"),
  v.literal("room"),
  v.literal("other")
);

export const photoPrivacyLevel = v.union(
  v.literal("normal"),
  v.literal("moverVisible"),
  v.literal("reportVisible"),
  v.literal("claimOnly"),
  v.literal("sensitive"),
  v.literal("hiddenFromGuests"),
  v.literal("private")
);

export const photoVisibilityScope = v.union(
  v.literal("household"),
  v.literal("moveCollaborators"),
  v.literal("documentationScoped"),
  v.literal("private")
);

export const photoSource = v.union(
  v.literal("manualUpload"),
  v.literal("photoAI"),
  v.literal("api"),
  v.literal("mcp"),
  v.literal("import")
);

export const exifHandlingStatus = v.union(
  v.literal("pending"),
  v.literal("stripped"),
  v.literal("retained"),
  v.literal("failed"),
  v.literal("notApplicable")
);

export const photoVerificationStatus = v.union(
  v.literal("unreviewed"),
  v.literal("verified"),
  v.literal("needsReview"),
  v.literal("rejected")
);

export const aiJobType = v.union(
  v.literal("photoIntake"),
  v.literal("inventoryExtraction"),
  v.literal("itemCategorization"),
  v.literal("loadPlanSuggestions"),
  v.literal("documentationDraft"),
  v.literal("claimsReview"),
  v.literal("generalReview")
);

export const aiJobStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("canceled")
);

export const aiJobModality = v.union(
  v.literal("text"),
  v.literal("vision"),
  v.literal("structured")
);

export const aiJobReviewStatus = v.union(
  v.literal("unreviewed"),
  v.literal("accepted"),
  v.literal("edited"),
  v.literal("rejected")
);

export const aiTextSuggestionType = v.union(
  v.literal("item"),
  v.literal("box")
);

export const aiTextSuggestionStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("edited"),
  v.literal("rejected")
);

export const aiPhotoSuggestionType = v.union(
  v.literal("item"),
  v.literal("box"),
  v.literal("boxContents"),
  v.literal("duplicateCandidate"),
  v.literal("evidenceGap")
);

export const aiPhotoSuggestionStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("edited"),
  v.literal("rejected")
);

export const aiPlanningSuggestionType = v.union(
  v.literal("estimate"),
  v.literal("assignment")
);

export const aiPlanningSuggestionStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("edited"),
  v.literal("rejected")
);

export const movePersonRole = v.union(
  v.literal("owner"),
  v.literal("householdMember"),
  v.literal("helper"),
  v.literal("mover"),
  v.literal("contact")
);

const dimensionsIn = v.object({
  lengthIn: v.optional(v.number()),
  widthIn: v.optional(v.number()),
  heightIn: v.optional(v.number()),
});

const capacity = v.object({
  maxWeightLb: v.optional(v.number()),
  maxVolumeCuFt: v.optional(v.number()),
  maxItemCount: v.optional(v.number()),
  dimensions: v.optional(dimensionsIn),
  weightIsUnlimited: v.optional(v.boolean()),
  volumeIsUnlimited: v.optional(v.boolean()),
});

const photoDerivativeRefs = v.object({
  thumb: v.optional(v.string()),
  card: v.optional(v.string()),
  detail: v.optional(v.string()),
  full: v.optional(v.string()),
});

const photoDerivativeVariant = v.union(
  v.literal("thumb"),
  v.literal("card"),
  v.literal("detail"),
  v.literal("full")
);

const photoDerivativeStatus = v.union(
  v.literal("pending"),
  v.literal("ready"),
  v.literal("failed")
);

const documentationFilters = v.object({
  dispositions: v.optional(v.array(itemDisposition)),
  statuses: v.optional(v.array(itemStatus)),
  planningDefaultKeys: v.optional(v.array(planningDefaultKey)),
  room: v.optional(v.string()),
  destinationRoom: v.optional(v.string()),
});

const exportHistoryEntry = v.object({
  exportJobId: v.optional(v.string()),
  format: v.union(v.literal("pdf"), v.literal("csv"), v.literal("print")),
  createdByUserId: v.optional(v.id("users")),
  createdAt: v.number(),
});

const exportJobFormat = v.union(
  v.literal("pdf"),
  v.literal("csv"),
  v.literal("print")
);

const exportJobStatus = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("expired")
);

const exportJobType = v.union(
  v.literal("inventory"),
  v.literal("boxes"),
  v.literal("assignments"),
  v.literal("documentationProfile")
);

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    appRole,
    status: v.union(v.literal("active"), v.literal("disabled")),
    defaultHouseholdId: v.optional(v.id("households")),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  households: defineTable({
    name: v.string(),
    slug: v.optional(v.string()),
    createdByUserId: v.id("users"),
    ownerUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_slug", ["slug"])
    .index("by_archived", ["archivedAt"]),

  householdMemberships: defineTable({
    householdId: v.id("households"),
    userId: v.id("users"),
    role: householdRole,
    status: membershipStatus,
    invitedEmail: v.optional(v.string()),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household_user", ["householdId", "userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_household_status_role", ["householdId", "status", "role"])
    .index("by_invited_email", ["invitedEmail"]),

  moveRoleGrants: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    userId: v.id("users"),
    role: moveRole,
    status: membershipStatus,
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_user", ["moveId", "userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_household_move", ["householdId", "moveId"]),

  documentationProfiles: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    type: documentationProfileType,
    name: v.string(),
    status: documentationProfileStatus,
    includedFields: v.array(documentationFieldKey),
    imageRule: documentationImageRule,
    filters: documentationFilters,
    allowedActions: v.array(shareLinkAction),
    disclaimer: v.optional(v.string()),
    ownerNotes: v.optional(v.string()),
    exportHistory: v.array(exportHistoryEntry),
    createdByUserId: v.id("users"),
    updatedByUserId: v.optional(v.id("users")),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_status", ["moveId", "status"])
    .index("by_move_type", ["moveId", "type"])
    .index("by_household_status", ["householdId", "status"]),

  exportJobs: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    documentationProfileId: v.optional(v.id("documentationProfiles")),
    type: exportJobType,
    format: exportJobFormat,
    status: exportJobStatus,
    version: v.number(),
    filename: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    artifactText: v.optional(v.string()),
    rowCount: v.optional(v.number()),
    sizeBytes: v.optional(v.number()),
    filters: v.optional(v.any()),
    error: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  })
    .index("by_move_created", ["moveId", "createdAt"])
    .index("by_profile_created", ["documentationProfileId", "createdAt"])
    .index("by_household_created", ["householdId", "createdAt"])
    .index("by_status", ["status"])
    .index("by_expires", ["expiresAt"]),

  apiKeys: defineTable({
    householdId: v.id("households"),
    moveId: v.optional(v.id("moves")),
    name: v.string(),
    prefix: v.string(),
    tokenPreview: v.string(),
    secretHash: v.string(),
    scopes: v.array(apiKeyScope),
    status: apiKeyStatus,
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedByUserId: v.optional(v.id("users")),
    rotatedFromApiKeyId: v.optional(v.id("apiKeys")),
    lastUsedAt: v.optional(v.number()),
    lastUsedAction: v.optional(v.string()),
    lastUsedIpHash: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_prefix", ["prefix"])
    .index("by_household_status", ["householdId", "status"])
    .index("by_move_status", ["moveId", "status"])
    .index("by_created_by", ["createdByUserId"])
    .index("by_expires", ["expiresAt"]),

  apiIdempotencyKeys: defineTable({
    householdId: v.id("households"),
    moveId: v.optional(v.id("moves")),
    apiKeyId: v.id("apiKeys"),
    idempotencyKey: v.string(),
    requestHash: v.string(),
    response: v.any(),
    status: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_api_key_key", ["apiKeyId", "idempotencyKey"])
    .index("by_expires", ["expiresAt"])
    .index("by_household", ["householdId"]),

  shareLinks: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    documentationProfileId: v.optional(v.id("documentationProfiles")),
    scope: shareLinkScope,
    tokenHash: v.string(),
    tokenPreview: v.string(),
    label: v.optional(v.string()),
    role: householdRole,
    status: shareLinkStatus,
    allowedActions: v.array(shareLinkAction),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    revokedByUserId: v.optional(v.id("users")),
    accessCount: v.number(),
    lastAccessedAt: v.optional(v.number()),
    lastAccessMetadata: v.optional(v.any()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_move_status", ["moveId", "status"])
    .index("by_profile_status", ["documentationProfileId", "status"])
    .index("by_household_status", ["householdId", "status"])
    .index("by_expires", ["expiresAt"]),

  auditLogs: defineTable({
    householdId: v.optional(v.id("households")),
    moveId: v.optional(v.id("moves")),
    actorType: auditActorType,
    actorUserId: v.optional(v.id("users")),
    actorApiKeyId: v.optional(v.string()),
    category: auditCategory,
    action: v.string(),
    objectTable: v.optional(v.string()),
    objectId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_household_time", ["householdId", "createdAt"])
    .index("by_move_time", ["moveId", "createdAt"])
    .index("by_object_time", ["objectTable", "objectId", "createdAt"])
    .index("by_actor_user_time", ["actorUserId", "createdAt"])
    .index("by_category_time", ["category", "createdAt"]),

  moves: defineTable({
    householdId: v.id("households"),
    title: v.string(),
    type: moveType,
    status: moveStatus,
    origin: v.optional(v.string()),
    destination: v.optional(v.string()),
    dateStart: v.optional(v.string()),
    dateEnd: v.optional(v.string()),
    unitSystem,
    documentationProfileTypes: v.optional(v.array(documentationProfileType)),
    moveLevelWeightAllowanceLb: v.optional(v.number()),
    pcsBranch: v.optional(pcsBranch),
    pcsRankPayGrade: v.optional(v.string()),
    pcsDependentStatus: v.optional(pcsDependentStatus),
    pcsShipmentType: v.optional(pcsShipmentType),
    pcsOrdersNumber: v.optional(v.string()),
    pcsAllowanceNotes: v.optional(v.string()),
    pcsTransportationOfficeNotes: v.optional(v.string()),
    pcsRestrictedItemsNotes: v.optional(v.string()),
    proGearNotes: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_household_status", ["householdId", "status"])
    .index("by_household_type", ["householdId", "type"])
    .index("by_created_by", ["createdByUserId"]),

  movePeople: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    name: v.string(),
    role: movePersonRole,
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    sortOrder: v.number(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_move_sort", ["moveId", "sortOrder"])
    .index("by_household", ["householdId"]),

  transportResources: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    type: transportResourceType,
    name: v.string(),
    description: v.optional(v.string()),
    capacity,
    rules: v.array(v.string()),
    sortOrder: v.number(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_move_sort", ["moveId", "sortOrder"])
    .index("by_move_type", ["moveId", "type"])
    .index("by_household", ["householdId"]),

  transportZones: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    resourceId: v.id("transportResources"),
    name: v.string(),
    description: v.optional(v.string()),
    capacity,
    preferredTags: v.array(v.string()),
    sortOrder: v.number(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_resource_sort", ["resourceId", "sortOrder"])
    .index("by_move_sort", ["moveId", "sortOrder"])
    .index("by_household", ["householdId"]),

  movePlanningDefaults: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    key: planningDefaultKey,
    label: v.string(),
    description: v.string(),
    handling: planningDefaultHandling,
    sensitiveByDefault: v.boolean(),
    recommendedResourceTypes: v.array(transportResourceType),
    documentationProfileTypes: v.array(documentationProfileType),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_sort", ["moveId", "sortOrder"])
    .index("by_move_key", ["moveId", "key"])
    .index("by_household", ["householdId"]),

  boxes: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    code: v.string(),
    label: v.optional(v.string()),
    room: v.optional(v.string()),
    destinationRoom: v.optional(v.string()),
    description: v.optional(v.string()),
    status: boxStatus,
    dimensionsIn: v.optional(dimensionsIn),
    estimatedWeightLb: v.optional(v.number()),
    actualWeightLb: v.optional(v.number()),
    estimatedVolumeCuFt: v.optional(v.number()),
    assignedResourceId: v.optional(v.id("transportResources")),
    assignedZoneId: v.optional(v.id("transportZones")),
    assignmentLocked: v.optional(v.boolean()),
    assignmentOverrideReason: v.optional(v.string()),
    assignmentWarnings: v.optional(v.array(v.string())),
    assignmentHardBlocks: v.optional(v.array(v.string())),
    assignmentValidatedAt: v.optional(v.number()),
    sealedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_move_code", ["moveId", "code"])
    .index("by_move_status", ["moveId", "status"])
    .index("by_move_updated", ["moveId", "updatedAt"])
    .index("by_assigned_resource", ["assignedResourceId"])
    .index("by_household", ["householdId"]),

  boxItems: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    boxId: v.id("boxes"),
    itemId: v.id("items"),
    quantity: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_box", ["boxId"])
    .index("by_item", ["itemId"])
    .index("by_move", ["moveId"])
    .index("by_household", ["householdId"]),

  itemPhotos: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.optional(v.id("items")),
    boxId: v.optional(v.id("boxes")),
    room: v.optional(v.string()),
    claimId: v.optional(v.string()),
    documentationProfileTypes: v.array(documentationProfileType),
    originalStorageKey: v.string(),
    originalBucket: v.string(),
    originalHash: v.optional(v.string()),
    derivativeRefs: photoDerivativeRefs,
    derivativeStatus: v.optional(photoDerivativeStatus),
    derivativeError: v.optional(v.string()),
    derivativesUpdatedAt: v.optional(v.number()),
    cloudflareImageId: v.optional(v.string()),
    width: v.number(),
    height: v.number(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    caption: v.optional(v.string()),
    photoType,
    privacyLevel: photoPrivacyLevel,
    visibilityScope: photoVisibilityScope,
    source: photoSource,
    exifHandlingStatus,
    confidence: estimateConfidence,
    notes: v.optional(v.string()),
    verificationStatus: photoVerificationStatus,
    aiProcessed: v.boolean(),
    capturedAt: v.optional(v.number()),
    uploadedByUserId: v.id("users"),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_move_created", ["moveId", "createdAt"])
    .index("by_item_created", ["itemId", "createdAt"])
    .index("by_box_created", ["boxId", "createdAt"])
    .index("by_move_ai_processed", ["moveId", "aiProcessed"])
    .index("by_move_verification", ["moveId", "verificationStatus"])
    .index("by_move_privacy", ["moveId", "privacyLevel"])
    .index("by_household", ["householdId"]),

  photoUploadSessions: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.optional(v.id("items")),
    boxId: v.optional(v.id("boxes")),
    room: v.optional(v.string()),
    originalStorageKey: v.string(),
    originalBucket: v.string(),
    expectedMimeType: v.string(),
    expectedSizeBytes: v.number(),
    derivativeUploads: v.optional(
      v.array(
        v.object({
          variant: photoDerivativeVariant,
          storageKey: v.string(),
          bucket: v.string(),
          expectedMimeType: v.string(),
          expectedSizeBytes: v.number(),
          width: v.number(),
          height: v.number(),
        })
      )
    ),
    status: v.union(
      v.literal("authorized"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("failed")
    ),
    expiresAt: v.number(),
    createdByUserId: v.id("users"),
    completedPhotoId: v.optional(v.id("itemPhotos")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_status", ["moveId", "status"])
    .index("by_expires", ["expiresAt"])
    .index("by_household", ["householdId"]),

  aiJobs: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    type: aiJobType,
    status: aiJobStatus,
    modality: aiJobModality,
    provider: v.string(),
    model: v.string(),
    inputRef: v.optional(v.any()),
    inputSummary: v.optional(v.string()),
    outputRef: v.optional(v.any()),
    outputSummary: v.optional(v.string()),
    confidence: v.optional(estimateConfidence),
    reviewStatus: aiJobReviewStatus,
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    tokenUsage: v.optional(
      v.object({
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        totalTokens: v.optional(v.number()),
      })
    ),
    cost: v.optional(
      v.object({
        estimatedCents: v.optional(v.number()),
        actualCents: v.optional(v.number()),
        currency: v.string(),
      })
    ),
    maxCostCents: v.optional(v.number()),
    retryCount: v.number(),
    maxRetries: v.number(),
    error: v.optional(v.string()),
    providerMetadata: v.optional(v.any()),
    createdByUserId: v.id("users"),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_created", ["moveId", "createdAt"])
    .index("by_move_status", ["moveId", "status"])
    .index("by_household_status", ["householdId", "status"])
    .index("by_household_created", ["householdId", "createdAt"])
    .index("by_created_by", ["createdByUserId"])
    .index("by_created_by_created", ["createdByUserId", "createdAt"])
    .index("by_status_updated", ["status", "updatedAt"]),

  aiTextSuggestions: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    aiJobId: v.id("aiJobs"),
    type: aiTextSuggestionType,
    status: aiTextSuggestionStatus,
    sourceText: v.string(),
    sourceLine: v.string(),
    sourceIndex: v.number(),
    confidence: estimateConfidence,
    reasoning: v.string(),
    itemDraft: v.optional(
      v.object({
        name: v.string(),
        room: v.optional(v.string()),
        destinationRoom: v.optional(v.string()),
        category: v.optional(v.string()),
        disposition: itemDisposition,
        quantity: v.number(),
        description: v.optional(v.string()),
        suggestedBoxLabel: v.optional(v.string()),
        fragility: v.optional(itemFragility),
        highValue: v.optional(v.boolean()),
        planningDefaultKeys: v.optional(v.array(planningDefaultKey)),
      })
    ),
    boxDraft: v.optional(
      v.object({
        code: v.optional(v.string()),
        label: v.string(),
        room: v.optional(v.string()),
        destinationRoom: v.optional(v.string()),
        description: v.optional(v.string()),
      })
    ),
    approvedItemId: v.optional(v.id("items")),
    approvedBoxId: v.optional(v.id("boxes")),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_status", ["moveId", "status"])
    .index("by_move_created", ["moveId", "createdAt"])
    .index("by_job", ["aiJobId"])
    .index("by_household_status", ["householdId", "status"]),

  aiPhotoSuggestions: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
    aiJobId: v.id("aiJobs"),
    type: aiPhotoSuggestionType,
    status: aiPhotoSuggestionStatus,
    sourceDerivativeVariant: photoDerivativeVariant,
    sourceSummary: v.string(),
    confidence: estimateConfidence,
    reasoning: v.string(),
    itemDraft: v.optional(
      v.object({
        name: v.string(),
        room: v.optional(v.string()),
        category: v.optional(v.string()),
        disposition: itemDisposition,
        quantity: v.number(),
        description: v.optional(v.string()),
        suggestedBoxLabel: v.optional(v.string()),
        fragility: v.optional(itemFragility),
        highValue: v.optional(v.boolean()),
        planningDefaultKeys: v.optional(v.array(planningDefaultKey)),
      })
    ),
    boxDraft: v.optional(
      v.object({
        code: v.optional(v.string()),
        label: v.string(),
        room: v.optional(v.string()),
        description: v.optional(v.string()),
      })
    ),
    duplicatePhotoIds: v.optional(v.array(v.id("itemPhotos"))),
    approvedItemId: v.optional(v.id("items")),
    approvedBoxId: v.optional(v.id("boxes")),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_status", ["moveId", "status"])
    .index("by_move_created", ["moveId", "createdAt"])
    .index("by_photo_status", ["photoId", "status"])
    .index("by_job", ["aiJobId"])
    .index("by_household_status", ["householdId", "status"]),

  aiPlanningSuggestions: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    aiJobId: v.id("aiJobs"),
    type: aiPlanningSuggestionType,
    status: aiPlanningSuggestionStatus,
    itemId: v.optional(v.id("items")),
    boxId: v.optional(v.id("boxes")),
    confidence: estimateConfidence,
    reasoning: v.string(),
    assumptions: v.array(v.string()),
    estimateDraft: v.optional(
      v.object({
        category: v.optional(v.string()),
        estimatedWeightLb: v.optional(v.number()),
        estimatedWeightLowLb: v.optional(v.number()),
        estimatedWeightHighLb: v.optional(v.number()),
        estimatedVolumeCuFt: v.optional(v.number()),
        estimatedPackedVolumeCuFt: v.optional(v.number()),
        weightConfidence: estimateConfidence,
        volumeConfidence: estimateConfidence,
      })
    ),
    assignmentDraft: v.optional(
      v.object({
        assignedResourceId: v.id("transportResources"),
        assignedZoneId: v.optional(v.id("transportZones")),
        assignmentWarnings: v.array(v.string()),
        assignmentHardBlocks: v.array(v.string()),
        weightPercent: v.optional(v.number()),
        volumePercent: v.optional(v.number()),
        overrideReason: v.optional(v.string()),
      })
    ),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_status", ["moveId", "status"])
    .index("by_move_created", ["moveId", "createdAt"])
    .index("by_item_status", ["itemId", "status"])
    .index("by_box_status", ["boxId", "status"])
    .index("by_job", ["aiJobId"])
    .index("by_household_status", ["householdId", "status"]),

  items: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    name: v.string(),
    normalizedName: v.string(),
    description: v.optional(v.string()),
    room: v.optional(v.string()),
    destinationRoom: v.optional(v.string()),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    ownerPersonId: v.optional(v.id("movePeople")),
    disposition: itemDisposition,
    status: itemStatus,
    quantity: v.number(),
    condition: itemCondition,
    valueCents: v.optional(v.number()),
    replacementValueCents: v.optional(v.number()),
    serialNumber: v.optional(v.string()),
    modelNumber: v.optional(v.string()),
    dimensionsIn: v.optional(dimensionsIn),
    estimatedWeightLb: v.optional(v.number()),
    estimatedWeightLowLb: v.optional(v.number()),
    estimatedWeightHighLb: v.optional(v.number()),
    actualWeightLb: v.optional(v.number()),
    estimatedVolumeCuFt: v.optional(v.number()),
    estimatedPackedVolumeCuFt: v.optional(v.number()),
    weightConfidence: estimateConfidence,
    volumeConfidence: estimateConfidence,
    fragility: itemFragility,
    stackable: v.boolean(),
    hazardousFlag: v.boolean(),
    highValue: v.boolean(),
    requiresPersonalTransport: v.boolean(),
    planningDefaultKeys: v.array(planningDefaultKey),
    needsReview: v.boolean(),
    reviewFlags: v.array(v.string()),
    privateNotes: v.optional(v.string()),
    aiSummary: v.optional(v.string()),
    aiTags: v.array(v.string()),
    createdVia: itemCreatedVia,
    reviewedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_move_status", ["moveId", "status"])
    .index("by_move_disposition", ["moveId", "disposition"])
    .index("by_move_room", ["moveId", "room"])
    .index("by_move_category", ["moveId", "category"])
    .index("by_move_needs_review", ["moveId", "needsReview"])
    .index("by_move_high_value", ["moveId", "highValue"])
    .index("by_move_updated", ["moveId", "updatedAt"])
    .index("by_household", ["householdId"]),
});

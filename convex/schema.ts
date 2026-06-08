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
  v.literal("photoAI"),
  v.literal("api"),
  v.literal("mcp")
);

export const boxStatus = v.union(
  v.literal("open"),
  v.literal("packing"),
  v.literal("sealed"),
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
  v.literal("sensitive"),
  v.literal("hiddenFromGuests")
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

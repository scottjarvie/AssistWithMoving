import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  ingestionQueueStatusValidator,
  ingestionScopeHintValidator,
} from "./lib/ingestionQueue";
import {
  floorPlanKindValidator,
  floorPlanStatusValidator,
  planAnnotationValidator,
  planContainmentModeValidator,
  planEntityTypeValidator,
  planFeatureValidator,
  planFootprintOverrideValidator,
  planLevelTypeValidator,
  planOpActorTypeValidator,
  planOpValidator,
  planOpeningValidator,
  planRoomValidator,
  planShortIdCountersValidator,
  planUnderlayValidator,
  planWallValidator,
  planZoneValidator,
} from "./lib/planValidators";
import {
  structuredLocationValidator,
  transportTripStatusValidator,
} from "./lib/moveFields";

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

export const memberApiAccessStatus = v.union(
  v.literal("enabled"),
  v.literal("disabled")
);

export const householdInvitationStatus = v.union(
  v.literal("invited"),
  v.literal("accepted"),
  v.literal("revoked")
);

export const clerkOrganizationStatus = v.union(
  v.literal("active"),
  v.literal("deleted")
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
  v.literal("plan"),
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
  v.literal("viewPlan"),
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
  v.literal("plans/read"),
  v.literal("plans/write"),
  v.literal("photos/write"),
  v.literal("exports/read"),
  v.literal("exports/create"),
  v.literal("members/manage")
);

export const planProposalStatus = v.union(
  v.literal("pending"),
  v.literal("applied"),
  v.literal("partiallyApplied"),
  v.literal("rejected")
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

export const measurementProvenanceSource = v.union(
  v.literal("unknown"),
  v.literal("photoEstimate"),
  v.literal("conversationEstimate"),
  v.literal("aiEstimate"),
  v.literal("manualEstimate"),
  v.literal("manualMeasurement"),
  v.literal("productResearch"),
  v.literal("manufacturerSpec"),
  v.literal("moverEstimate"),
  v.literal("moverConfirmed"),
  v.literal("import"),
  v.literal("api")
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

export const plannedItemStatus = v.union(
  v.literal("idea"),
  v.literal("decided"),
  v.literal("purchased"),
  v.literal("dropped")
);

export const plannedItemCreatedVia = v.union(
  v.literal("manual"),
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
  v.literal("blueprint"),
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

export const mediaKind = v.union(
  v.literal("image"),
  v.literal("audio"),
  v.literal("video")
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

export const inventoryDuplicateDecisionStatus = v.union(v.literal("ignored"));

export const capacityReviewStatus = v.union(
  v.literal("unreviewed"),
  v.literal("estimated"),
  v.literal("confirmed")
);

export const moveSpaceKind = v.union(
  v.literal("originRoom"),
  v.literal("destinationRoom"),
  v.literal("yardOutdoor"),
  v.literal("storage"),
  v.literal("transportResource"),
  v.literal("transportZone"),
  v.literal("custom")
);

export const moveSpaceStatus = v.union(
  v.literal("active"),
  v.literal("archived")
);

export const saleListingStatus = v.union(
  v.literal("needsPrep"),
  v.literal("researchingPrice"),
  v.literal("draftReady"),
  v.literal("listed"),
  v.literal("interestReceived"),
  v.literal("offerPending"),
  v.literal("sold"),
  v.literal("removed"),
  v.literal("kept"),
  v.literal("donated")
);

export const saleListingPlatform = v.union(
  v.literal("facebookMarketplace"),
  v.literal("craigslist"),
  v.literal("offerUp"),
  v.literal("nextdoor"),
  v.literal("ebay"),
  v.literal("other")
);

export const saleResearchDepth = v.union(
  v.literal("none"),
  v.literal("quick"),
  v.literal("standard"),
  v.literal("deep")
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

export const measurementProvenanceEntry = v.object({
  sourceType: measurementProvenanceSource,
  confidence: estimateConfidence,
  label: v.optional(v.string()),
  notes: v.optional(v.string()),
  recordedAt: v.number(),
  recordedByUserId: v.optional(v.id("users")),
  recordedByApiKeyId: v.optional(v.id("apiKeys")),
  recordedByLabel: v.optional(v.string()),
  needsVerification: v.boolean(),
});

export const itemMeasurementProvenance = v.object({
  dimensions: v.optional(measurementProvenanceEntry),
  weight: v.optional(measurementProvenanceEntry),
  volume: v.optional(measurementProvenanceEntry),
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

const accountExportJobStatus = v.union(
  v.literal("completed"),
  v.literal("expired")
);

const accountDeletionRequestStatus = v.union(
  v.literal("pending"),
  v.literal("cancelled"),
  v.literal("completed")
);

const billingTier = v.union(
  v.literal("free"),
  v.literal("launch"),
  v.literal("plus"),
  v.literal("pro"),
  v.literal("unlimited")
);

const billingProvider = v.union(
  v.literal("none"),
  v.literal("stripe"),
  v.literal("vercelMarketplace")
);

const exportJobType = v.union(
  v.literal("inventory"),
  v.literal("boxes"),
  v.literal("assignments"),
  v.literal("documentationProfile"),
  v.literal("floorPlan")
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

  clerkOrganizations: defineTable({
    clerkOrganizationId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    status: clerkOrganizationStatus,
    linkedHouseholdId: v.optional(v.id("households")),
    createdAt: v.number(),
    updatedAt: v.number(),
    sourceUpdatedAt: v.optional(v.number()),
  })
    .index("by_clerk_organization_id", ["clerkOrganizationId"])
    .index("by_status", ["status"])
    .index("by_linked_household", ["linkedHouseholdId"]),

  clerkOrganizationMemberships: defineTable({
    clerkOrganizationMembershipId: v.string(),
    clerkOrganizationId: v.string(),
    clerkUserId: v.string(),
    userId: v.optional(v.id("users")),
    rawRole: v.string(),
    status: membershipStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
    sourceUpdatedAt: v.optional(v.number()),
  })
    .index("by_clerk_membership_id", ["clerkOrganizationMembershipId"])
    .index("by_clerk_org_user", ["clerkOrganizationId", "clerkUserId"])
    .index("by_org_status", ["clerkOrganizationId", "status"])
    .index("by_user_status", ["userId", "status"]),

  accountExportJobs: defineTable({
    userId: v.id("users"),
    status: accountExportJobStatus,
    format: v.literal("json"),
    filename: v.string(),
    artifactText: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    summary: v.any(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    expiresAt: v.number(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_status", ["status"])
    .index("by_expires", ["expiresAt"]),

  accountDeletionRequests: defineTable({
    userId: v.id("users"),
    status: accountDeletionRequestStatus,
    requestedAt: v.number(),
    scheduledDeletionAt: v.number(),
    cancelledAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    revokedApiKeyCount: v.optional(v.number()),
    revokedShareLinkCount: v.optional(v.number()),
    disabledMembershipCount: v.optional(v.number()),
    disabledMoveGrantCount: v.optional(v.number()),
    completedSummary: v.optional(v.any()),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_status", ["status"])
    .index("by_scheduled", ["scheduledDeletionAt"]),

  featureFlags: defineTable({
    key: v.string(),
    environment: v.string(),
    enabled: v.boolean(),
    note: v.optional(v.string()),
    updatedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key_environment", ["key", "environment"])
    .index("by_environment", ["environment"]),

  householdBillingProfiles: defineTable({
    householdId: v.id("households"),
    tier: billingTier,
    provider: billingProvider,
    providerCustomerId: v.optional(v.string()),
    providerSubscriptionId: v.optional(v.string()),
    status: v.union(
      v.literal("none"),
      v.literal("trialing"),
      v.literal("active"),
      v.literal("pastDue"),
      v.literal("cancelled")
    ),
    note: v.optional(v.string()),
    updatedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_tier", ["tier"])
    .index("by_provider", ["provider"]),

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
    apiAccessStatus: v.optional(memberApiAccessStatus),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_household_user", ["householdId", "userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_household_status_role", ["householdId", "status", "role"])
    .index("by_invited_email", ["invitedEmail"]),

  householdInvitations: defineTable({
    householdId: v.id("households"),
    invitedEmail: v.string(),
    role: householdRole,
    status: householdInvitationStatus,
    createdByUserId: v.optional(v.id("users")),
    createdByApiKeyId: v.optional(v.id("apiKeys")),
    acceptedByUserId: v.optional(v.id("users")),
    acceptedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household_status", ["householdId", "status"])
    .index("by_email_status", ["invitedEmail", "status"])
    .index("by_household_email_status", [
      "householdId",
      "invitedEmail",
      "status",
    ]),

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
    createdByApiKeyId: v.optional(v.id("apiKeys")),
    updatedByUserId: v.optional(v.id("users")),
    updatedByApiKeyId: v.optional(v.id("apiKeys")),
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

  apiRateLimitWindows: defineTable({
    householdId: v.id("households"),
    moveId: v.optional(v.id("moves")),
    apiKeyId: v.id("apiKeys"),
    windowStart: v.number(),
    windowEnd: v.number(),
    count: v.number(),
    limit: v.number(),
    lastAction: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_api_key_window", ["apiKeyId", "windowStart"])
    .index("by_expires", ["windowEnd"])
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
    revokedByApiKeyId: v.optional(v.id("apiKeys")),
    accessCount: v.number(),
    lastAccessedAt: v.optional(v.number()),
    lastAccessMetadata: v.optional(v.any()),
    createdByUserId: v.id("users"),
    createdByApiKeyId: v.optional(v.id("apiKeys")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_move_status", ["moveId", "status"])
    .index("by_profile_status", ["documentationProfileId", "status"])
    .index("by_household_status", ["householdId", "status"])
    .index("by_expires", ["expiresAt"]),

  shareLinkComments: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    shareLinkId: v.id("shareLinks"),
    documentationProfileId: v.id("documentationProfiles"),
    tokenPreview: v.string(),
    role: householdRole,
    authorLabel: v.optional(v.string()),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_move_created", ["moveId", "createdAt"])
    .index("by_share_link_created", ["shareLinkId", "createdAt"])
    .index("by_profile_created", ["documentationProfileId", "createdAt"])
    .index("by_household_created", ["householdId", "createdAt"]),

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
    // Structured locations are an additive superset of origin/destination strings,
    // which remain the canonical values for the public MCP/REST contract.
    startLocation: v.optional(structuredLocationValidator),
    endLocation: v.optional(structuredLocationValidator),
    distanceMiles: v.optional(v.number()),
    travelMinutes: v.optional(v.number()),
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
    createdByApiKeyId: v.optional(v.id("apiKeys")),
    updatedByUserId: v.optional(v.id("users")),
    updatedByApiKeyId: v.optional(v.id("apiKeys")),
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
    capacityReviewStatus: v.optional(capacityReviewStatus),
    capacityNotes: v.optional(v.string()),
    capacityReviewedAt: v.optional(v.number()),
    capacityReviewedByUserId: v.optional(v.id("users")),
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

  // A trip (run/load) of a transportation method. A method (transportResource)
  // can have N trips; each trip can hold loadable tripSpaces.
  transportTrips: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    resourceId: v.id("transportResources"),
    name: v.string(),
    description: v.optional(v.string()),
    scheduledDate: v.optional(v.string()),
    status: transportTripStatusValidator,
    sortOrder: v.number(),
    createdByUserId: v.id("users"),
    createdByApiKeyId: v.optional(v.id("apiKeys")),
    updatedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_resource_sort", ["resourceId", "sortOrder"])
    .index("by_move_sort", ["moveId", "sortOrder"])
    .index("by_household", ["householdId"]),

  // A loadable space within a trip, with an area and/or weight restriction.
  tripSpaces: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    resourceId: v.id("transportResources"),
    tripId: v.id("transportTrips"),
    name: v.string(),
    description: v.optional(v.string()),
    maxAreaSqFt: v.optional(v.number()),
    maxWeightLb: v.optional(v.number()),
    sortOrder: v.number(),
    createdByUserId: v.id("users"),
    createdByApiKeyId: v.optional(v.id("apiKeys")),
    updatedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_trip_sort", ["tripId", "sortOrder"])
    .index("by_resource_sort", ["resourceId", "sortOrder"])
    .index("by_move_sort", ["moveId", "sortOrder"])
    .index("by_household", ["householdId"]),

  moveSpaces: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    kind: moveSpaceKind,
    name: v.string(),
    aliases: v.array(v.string()),
    notes: v.optional(v.string()),
    floorLevel: v.optional(v.string()),
    sortOrder: v.number(),
    status: moveSpaceStatus,
    transportResourceId: v.optional(v.id("transportResources")),
    transportZoneId: v.optional(v.id("transportZones")),
    linkedPlanEntityId: v.optional(v.id("planEntities")),
    capacity,
    createdByUserId: v.id("users"),
    createdByApiKeyId: v.optional(v.id("apiKeys")),
    updatedByUserId: v.optional(v.id("users")),
    updatedByApiKeyId: v.optional(v.id("apiKeys")),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_move_sort", ["moveId", "sortOrder"])
    .index("by_move_kind", ["moveId", "kind"])
    .index("by_move_status", ["moveId", "status"])
    .index("by_move_name", ["moveId", "name"])
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

  floorPlans: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    name: v.string(),
    kind: floorPlanKindValidator,
    northAngleDeg: v.number(),
    defaultWallThicknessIn: v.number(),
    defaultCeilingHeightIn: v.number(),
    gridSnapIn: v.number(),
    shortIdCounters: planShortIdCountersValidator,
    nextSeq: v.number(),
    status: floorPlanStatusValidator,
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_move_status", ["moveId", "status"])
    .index("by_household", ["householdId"]),

  planLevels: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
    name: v.string(),
    levelType: planLevelTypeValidator,
    sortOrder: v.number(),
    ceilingHeightIn: v.optional(v.number()),
    underlay: v.optional(planUnderlayValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_plan_sort", ["planId", "sortOrder"])
    .index("by_move", ["moveId"])
    .index("by_household", ["householdId"]),

  planEntities: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
    levelId: v.id("planLevels"),
    shortId: v.string(),
    entityType: planEntityTypeValidator,
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    locked: v.boolean(),
    wall: v.optional(planWallValidator),
    room: v.optional(planRoomValidator),
    opening: v.optional(planOpeningValidator),
    feature: v.optional(planFeatureValidator),
    zone: v.optional(planZoneValidator),
    annotation: v.optional(planAnnotationValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_level", ["levelId"])
    .index("by_plan_type", ["planId", "entityType"])
    .index("by_plan_shortId", ["planId", "shortId"])
    .index("by_household", ["householdId"]),

  planPlacements: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
    levelId: v.id("planLevels"),
    shortId: v.string(),
    itemId: v.optional(v.id("items")),
    boxId: v.optional(v.id("boxes")),
    plannedItemId: v.optional(v.id("plannedItems")),
    templateKey: v.optional(v.string()),
    x: v.number(),
    y: v.number(),
    rotationDeg: v.number(),
    footprintOverrideIn: v.optional(planFootprintOverrideValidator),
    parentPlacementId: v.optional(v.id("planPlacements")),
    containmentMode: v.optional(planContainmentModeValidator),
    zOrder: v.number(),
    color: v.optional(v.string()),
    locked: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_level", ["levelId"])
    .index("by_plan", ["planId"])
    .index("by_item", ["itemId"])
    .index("by_planned_item", ["plannedItemId"])
    .index("by_parent", ["parentPlacementId"])
    .index("by_household", ["householdId"]),

  planOps: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
    seq: v.number(),
    batchId: v.string(),
    actorType: planOpActorTypeValidator,
    actorUserId: v.optional(v.id("users")),
    actorApiKeyId: v.optional(v.id("apiKeys")),
    agentLabel: v.optional(v.string()),
    op: planOpValidator,
    inverse: planOpValidator,
    createdAt: v.number(),
  })
    .index("by_plan_seq", ["planId", "seq"])
    .index("by_batch", ["batchId"])
    .index("by_household", ["householdId"]),

  planProposals: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
    batchId: v.string(),
    ops: v.array(planOpValidator),
    agentLabel: v.optional(v.string()),
    reasoning: v.string(),
    status: planProposalStatus,
    appliedOpIndexes: v.array(v.number()),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdByApiKeyId: v.id("apiKeys"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_plan_status", ["planId", "status"])
    .index("by_move_status", ["moveId", "status"])
    .index("by_household_status", ["householdId", "status"]),

  boxes: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    code: v.string(),
    label: v.optional(v.string()),
    room: v.optional(v.string()),
    destinationRoom: v.optional(v.string()),
    description: v.optional(v.string()),
    moveDayNote: v.optional(v.string()),
    status: boxStatus,
    dimensionsIn: v.optional(dimensionsIn),
    estimatedWeightLb: v.optional(v.number()),
    actualWeightLb: v.optional(v.number()),
    estimatedVolumeCuFt: v.optional(v.number()),
    assignedResourceId: v.optional(v.id("transportResources")),
    assignedZoneId: v.optional(v.id("transportZones")),
    assignedTripId: v.optional(v.id("transportTrips")),
    assignedTripSpaceId: v.optional(v.id("tripSpaces")),
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
    .index("by_assigned_trip", ["assignedTripId"])
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
    spaceId: v.optional(v.id("moveSpaces")),
    transportResourceId: v.optional(v.id("transportResources")),
    transportZoneId: v.optional(v.id("transportZones")),
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
    mediaKind: v.optional(mediaKind),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
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
    .index("by_space_created", ["spaceId", "createdAt"])
    .index("by_transport_resource_created", [
      "transportResourceId",
      "createdAt",
    ])
    .index("by_transport_zone_created", ["transportZoneId", "createdAt"])
    .index("by_move_ai_processed", ["moveId", "aiProcessed"])
    .index("by_move_verification", ["moveId", "verificationStatus"])
    .index("by_move_privacy", ["moveId", "privacyLevel"])
    .index("by_household", ["householdId"]),

  photoUploadSessions: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.optional(v.id("items")),
    boxId: v.optional(v.id("boxes")),
    spaceId: v.optional(v.id("moveSpaces")),
    transportResourceId: v.optional(v.id("transportResources")),
    transportZoneId: v.optional(v.id("transportZones")),
    room: v.optional(v.string()),
    originalStorageKey: v.string(),
    originalBucket: v.string(),
    mediaKind: v.optional(mediaKind),
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
    cleanupAttemptedAt: v.optional(v.number()),
    cleanupCompletedAt: v.optional(v.number()),
    cleanupError: v.optional(v.string()),
    abandonedObjectCount: v.optional(v.number()),
    deletedAbandonedObjectCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_status", ["moveId", "status"])
    .index("by_status_expires", ["status", "expiresAt"])
    .index("by_expires", ["expiresAt"])
    .index("by_household", ["householdId"]),

  // Capture-now, process-later work orders for the user's own AI agent.
  // Evidence lives in itemPhotos (image/audio/video); entries reference it.
  ingestionQueueEntries: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    status: ingestionQueueStatusValidator,
    instructions: v.optional(v.string()),
    roomHint: v.optional(v.string()),
    // Free string so user-defined dispositions keep working later.
    dispositionHint: v.optional(v.string()),
    scopeHint: v.optional(ingestionScopeHintValidator),
    mediaPhotoIds: v.array(v.id("itemPhotos")),
    sortOrder: v.number(),
    claimedByUserId: v.optional(v.id("users")),
    claimedByApiKeyId: v.optional(v.id("apiKeys")),
    claimedByAgentLabel: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    claimExpiresAt: v.optional(v.number()),
    agentSummary: v.optional(v.string()),
    agentQuestion: v.optional(v.string()),
    resultItemIds: v.optional(v.array(v.id("items"))),
    processedAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_status_order", ["moveId", "status", "sortOrder"])
    .index("by_move_created", ["moveId", "createdAt"])
    .index("by_household_status", ["householdId", "status"]),

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
    createdByApiKeyId: v.optional(v.id("apiKeys")),
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
    reviewedByApiKeyId: v.optional(v.id("apiKeys")),
    reviewedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdByApiKeyId: v.optional(v.id("apiKeys")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_status", ["moveId", "status"])
    .index("by_move_created", ["moveId", "createdAt"])
    .index("by_item_status", ["itemId", "status"])
    .index("by_box_status", ["boxId", "status"])
    .index("by_job", ["aiJobId"])
    .index("by_household_status", ["householdId", "status"]),

  inventoryDuplicateDecisions: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    groupKey: v.string(),
    itemIdsKey: v.string(),
    itemIds: v.array(v.id("items")),
    status: inventoryDuplicateDecisionStatus,
    reviewedByUserId: v.id("users"),
    reviewedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_status", ["moveId", "status"])
    .index("by_move_group", ["moveId", "groupKey", "itemIdsKey"]),

  items: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    name: v.string(),
    normalizedName: v.string(),
    externalSource: v.optional(v.string()),
    externalId: v.optional(v.string()),
    description: v.optional(v.string()),
    room: v.optional(v.string()),
    destinationRoom: v.optional(v.string()),
    currentSpaceId: v.optional(v.id("moveSpaces")),
    destinationSpaceId: v.optional(v.id("moveSpaces")),
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
    measurementProvenance: v.optional(itemMeasurementProvenance),
    dimensionsConfidence: v.optional(estimateConfidence),
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
    assignedResourceId: v.optional(v.id("transportResources")),
    assignedZoneId: v.optional(v.id("transportZones")),
    assignedTripId: v.optional(v.id("transportTrips")),
    assignedTripSpaceId: v.optional(v.id("tripSpaces")),
    assignmentLocked: v.optional(v.boolean()),
    assignmentOverrideReason: v.optional(v.string()),
    assignmentWarnings: v.optional(v.array(v.string())),
    assignmentHardBlocks: v.optional(v.array(v.string())),
    assignmentValidatedAt: v.optional(v.number()),
    planningDefaultKeys: v.array(planningDefaultKey),
    needsReview: v.boolean(),
    reviewFlags: v.array(v.string()),
    privateNotes: v.optional(v.string()),
    aiSummary: v.optional(v.string()),
    aiTags: v.array(v.string()),
    agentLabel: v.optional(v.string()),
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
    .index("by_current_space", ["currentSpaceId"])
    .index("by_destination_space", ["destinationSpaceId"])
    .index("by_move_category", ["moveId", "category"])
    .index("by_move_needs_review", ["moveId", "needsReview"])
    .index("by_move_high_value", ["moveId", "highValue"])
    .index("by_assigned_resource", ["assignedResourceId"])
    .index("by_assigned_trip", ["assignedTripId"])
    .index("by_move_updated", ["moveId", "updatedAt"])
    .index("by_move_external_key", ["moveId", "externalSource", "externalId"])
    .index("by_household", ["householdId"]),

  saleListings: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.id("items"),
    status: saleListingStatus,
    platform: saleListingPlatform,
    platformLabel: v.optional(v.string()),
    listingTitle: v.optional(v.string()),
    listingDescription: v.optional(v.string()),
    category: v.optional(v.string()),
    condition: v.optional(v.string()),
    locationLabel: v.optional(v.string()),
    selectedPhotoIds: v.array(v.id("itemPhotos")),
    listingUrl: v.optional(v.string()),
    listedAt: v.optional(v.number()),
    lastRefreshedAt: v.optional(v.number()),
    suggestedPriceLowCents: v.optional(v.number()),
    suggestedPriceHighCents: v.optional(v.number()),
    officialPriceCents: v.optional(v.number()),
    currency: v.string(),
    pricingConfidence: estimateConfidence,
    priceDecisionSource: v.optional(v.string()),
    userOverrodePrice: v.boolean(),
    researchDepth: saleResearchDepth,
    researchSourceCount: v.number(),
    researchSources: v.array(
      v.object({
        title: v.optional(v.string()),
        url: v.optional(v.string()),
        summary: v.optional(v.string()),
        priceCents: v.optional(v.number()),
        checkedAt: v.optional(v.number()),
      })
    ),
    researchedAt: v.optional(v.number()),
    researchedByUserId: v.optional(v.id("users")),
    researchedByApiKeyId: v.optional(v.id("apiKeys")),
    researchedByLabel: v.optional(v.string()),
    researchNotes: v.optional(v.string()),
    interestedCount: v.number(),
    inquiryNotes: v.optional(v.string()),
    offerNotes: v.optional(v.string()),
    buyerNotes: v.optional(v.string()),
    pickupStatus: v.optional(v.string()),
    soldPriceCents: v.optional(v.number()),
    soldAt: v.optional(v.number()),
    needsMorePhotos: v.boolean(),
    createdByUserId: v.optional(v.id("users")),
    createdByApiKeyId: v.optional(v.id("apiKeys")),
    updatedByUserId: v.optional(v.id("users")),
    updatedByApiKeyId: v.optional(v.id("apiKeys")),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_move_status", ["moveId", "status"])
    .index("by_move_updated", ["moveId", "updatedAt"])
    .index("by_item", ["itemId"])
    .index("by_platform_status", ["platform", "status"])
    .index("by_household", ["householdId"]),

  plannedItems: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    name: v.string(),
    normalizedName: v.string(),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    description: v.optional(v.string()),
    dimensionsIn: v.optional(dimensionsIn),
    dimensionsConfidence: v.optional(estimateConfidence),
    estimatedPriceCents: v.optional(v.number()),
    url: v.optional(v.string()),
    priority: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: plannedItemStatus,
    convertedItemId: v.optional(v.id("items")),
    createdVia: plannedItemCreatedVia,
    createdByUserId: v.id("users"),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_move_status", ["moveId", "status"])
    .index("by_move_updated", ["moveId", "updatedAt"])
    .index("by_household", ["householdId"]),
});

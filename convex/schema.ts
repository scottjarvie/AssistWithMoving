import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  ingestionItemKindValidator,
  ingestionQueueIntentValidator,
  ingestionQueueStatusValidator,
  ingestionScopeHintValidator,
  mediaUploadStateValidator,
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
  dimensionsValidator,
  itemDispositionValidator,
  structuredLocationValidator,
  transportTripStatusValidator,
} from "./lib/moveFields";
import {
  queueActivityTypeValidator,
  queueActorTypeValidator,
  queueContextKindValidator,
  queueDomainKindValidator,
  queuePriorityValidator,
  queueResultRefValidator,
  queueStateValidator,
  queueTerminalReasonValidator,
  queueWaitingReasonValidator,
} from "./lib/queue";

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
  // "agent" = a write made by a connected AI/automation acting on behalf of a
  // real human. The event still carries actorUserId (the human) so provenance
  // can answer both "who" and "whose agent". Kept in lockstep with the same
  // union in convex/lib/audit.ts and the convex/audit.ts record validator.
  v.literal("agent"),
  v.literal("system"),
  v.literal("webhook")
);

// A move participant's "type" — a label that drives a preset authority bundle
// in the UI. "contact" = address-book only (no access); the rest can carry real
// move access. Mirrors the long-standing movePersonRole vocabulary but is the
// access-granting surface, not the cosmetic contact list.
export const moveParticipantType = v.union(
  v.literal("householdMember"),
  v.literal("helper"),
  v.literal("mover"),
  v.literal("company"),
  v.literal("contact")
);

// How far a participant's access reaches. "householdBacked" = also a household
// member (sees every move in the household at their role) — for family.
// "moveOnly" = walled to exactly this one move, no household visibility, sensitive
// fields hidden by role — for outsiders (movers, helpers, companies).
export const moveParticipantAccessKind = v.union(
  v.literal("householdBacked"),
  v.literal("moveOnly")
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
  v.literal("queue"),
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
  v.literal("queue/read"),
  v.literal("queue/write"),
  v.literal("plans/read"),
  v.literal("plans/write"),
  v.literal("photos/write"),
  v.literal("exports/read"),
  v.literal("exports/create"),
  v.literal("members/manage")
);

/**
 * Product scopes for a chosen AI connected over OAuth.
 *
 * Deliberately separate from `apiKeyScope`: an `mmk_` key is a headless
 * automation credential the person mints, and an OAuth grant is authority a
 * person approves for someone else's AI. Sharing one vocabulary would make the
 * two look interchangeable on screen, and they are not.
 *
 * The meanings, and each scope's does-not-imply boundary, live in
 * `convex/lib/aiGrants.ts` so the product UI, the consent snapshot, and the
 * agent-facing guides all render from one source.
 */
export const movingGrantScope = v.union(
  v.literal("moving.context.read"),
  v.literal("moving.evidence.read"),
  v.literal("moving.work.write"),
  v.literal("moving.queue.work"),
  v.literal("moving.archive")
);

export const mcpClientRegistrationMethod = v.union(
  v.literal("clientIdMetadataDocument"),
  v.literal("dynamicClientRegistration")
);

export const aiGrantActivityType = v.union(
  v.literal("approved"),
  v.literal("scopeUsed"),
  v.literal("refused"),
  v.literal("clientBound"),
  v.literal("revoked"),
  v.literal("expired")
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
  maxAreaSqFt: v.optional(v.number()),
  maxItemCount: v.optional(v.number()),
  dimensions: v.optional(dimensionsIn),
  weightIsUnlimited: v.optional(v.boolean()),
  volumeIsUnlimited: v.optional(v.boolean()),
});

// Container type for a box (carried from agent/movable-unit work; optional so
// existing rows that already carry it validate).
export const boxContainerType = v.union(
  v.literal("carton"),
  v.literal("plasticTote"),
  v.literal("bin"),
  v.literal("wardrobe"),
  v.literal("dishPack"),
  v.literal("crate"),
  v.literal("other")
);

// Agent research provenance on items (carried from agent research work).
export const itemResearchSourceStatus = v.union(
  v.literal("used"),
  v.literal("checked"),
  v.literal("blocked"),
  v.literal("gated"),
  v.literal("failed"),
  v.literal("notRelevant")
);

export const itemResearchSource = v.object({
  title: v.optional(v.string()),
  url: v.optional(v.string()),
  summary: v.optional(v.string()),
  status: v.optional(itemResearchSourceStatus),
  checkedAt: v.optional(v.number()),
});

// Durable move-planning records written by a person's connected AI. These are
// intentionally product records rather than raw tool transcripts: decisions,
// estimates, readable planning results, and honest source checks all keep
// stable identity, links back to the move, and human-visible provenance.
export const movePlanningRecordKind = v.union(
  v.literal("decision"),
  v.literal("estimate"),
  v.literal("planResult"),
  v.literal("sourceCheck"),
);

export const movePlanningRecordStatus = v.union(
  v.literal("draft"),
  v.literal("current"),
  v.literal("needsReview"),
  v.literal("confirmed"),
  v.literal("superseded"),
  v.literal("blocked"),
  v.literal("failed"),
  v.literal("notRelevant"),
);

export const moveSourceCheckStatus = v.union(
  v.literal("checked"),
  v.literal("blocked"),
  v.literal("gated"),
  v.literal("failed"),
  v.literal("notRelevant"),
);

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
    apiAccessUpdatedAt: v.optional(v.number()),
    apiAccessUpdatedByUserId: v.optional(v.id("users")),
    acceptedInvitationId: v.optional(v.id("householdInvitations")),
    acceptedInvitationAt: v.optional(v.number()),
    onboardingDismissedAt: v.optional(v.number()),
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
    // So the owner remembers whose email this is before they have an account.
    invitedName: v.optional(v.string()),
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

  // The unified per-move participant + access record. This is the front door for
  // "add a person to my move and choose their access". A row can be:
  //  - pending (userId undefined, keyed by invitedEmail) until a VERIFIED email
  //    claims it on sign-up;
  //  - householdBacked (the claim also makes them a household member) for family;
  //  - moveOnly (no household membership ever) for walled-off outsiders.
  // resolveMoveAccess (convex/lib/moveAccess.ts) reads this alongside
  // householdMemberships to compute a user's effective role for a move.
  moveParticipants: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    // Undefined until a verified-email sign-up claims the invite.
    userId: v.optional(v.id("users")),
    // Normalized lowercase email — the pending-invite key + claim-on-signup key.
    invitedEmail: v.optional(v.string()),
    // So the owner remembers whose email this is before they have an account.
    invitedName: v.optional(v.string()),
    role: householdRole,
    accessKind: moveParticipantAccessKind,
    participantType: moveParticipantType,
    status: membershipStatus, // active | invited | disabled
    // Owner kill-switch for THIS participant's connected agents (moveOnly guests
    // have no householdMemberships row, so the kill-switch lives here).
    agentAccessStatus: v.optional(memberApiAccessStatus),
    // Queue-run delegation: the userIds whose per-user queue THIS participant may
    // run (share an AI subscription). Empty/undefined = may only run their own.
    canRunQueueForUserIds: v.optional(v.array(v.id("users"))),
    invitedByUserId: v.optional(v.id("users")),
    createdByUserId: v.optional(v.id("users")),
    createdByApiKeyId: v.optional(v.id("apiKeys")),
    updatedByUserId: v.optional(v.id("users")),
    updatedByApiKeyId: v.optional(v.id("apiKeys")),
    claimedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Gate resolution: concrete userId only (pending rows have undefined userId
    // and must NOT be looked up here — use by_move_email for those).
    .index("by_move_user", ["moveId", "userId"])
    .index("by_move_email", ["moveId", "invitedEmail"])
    .index("by_email_status", ["invitedEmail", "status"])
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
    // Snapshot of the creating participant's effective move role at mint time, so
    // a move-only guest's key can be clamped to <= their role on the REST path
    // (which otherwise authorizes by scope alone). Re-checked live per request
    // against the participant row; this is only the fast-path/default.
    participantMoveRole: v.optional(householdRole),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_prefix", ["prefix"])
    .index("by_household_status", ["householdId", "status"])
    .index("by_move_status", ["moveId", "status"])
    .index("by_created_by", ["createdByUserId"])
    .index("by_household_creator", ["householdId", "createdByUserId", "status"])
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
    // Answer "what did THIS agent (api key) do" efficiently — previously a scan.
    .index("by_actor_apikey_time", ["actorApiKeyId", "createdAt"])
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
    // Legacy code-reservation counters. An abandoned performance branch
    // (8ebdc13, never merged to main) deployed a schema carrying these and
    // wrote them onto rows in the shared development deployment. No current
    // code reads or writes them, but Convex validates the whole table on every
    // push, so leaving them out makes any push fail on those pre-existing rows.
    // They are retained for backward compatibility with rows written before the
    // branch was dropped. Removing them requires deleting or patching those rows
    // first — see docs/operations/convex-legacy-code-seq-cleanup.md.
    nextItemCodeSeq: v.optional(v.number()),
    nextBoxCodeSeq: v.optional(v.number()),
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

  movePlanningRecords: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    kind: movePlanningRecordKind,
    // A caller-stable semantic key, namespaced to the verified OAuth client on
    // write. It makes a retried complete-result save update instead of clone.
    stableKey: v.string(),
    title: v.string(),
    summary: v.string(),
    details: v.optional(v.string()),
    status: movePlanningRecordStatus,
    confidence: v.optional(estimateConfidence),
    decision: v.optional(v.string()),
    alternatives: v.optional(v.array(v.string())),
    rationale: v.optional(v.string()),
    estimateMetric: v.optional(v.string()),
    estimateLow: v.optional(v.number()),
    estimateValue: v.optional(v.number()),
    estimateHigh: v.optional(v.number()),
    estimateUnit: v.optional(v.string()),
    estimateCurrency: v.optional(v.string()),
    assumptions: v.optional(v.array(v.string())),
    sectionKey: v.optional(v.string()),
    body: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourcePublisher: v.optional(v.string()),
    sourceStatus: v.optional(moveSourceCheckStatus),
    checkedAt: v.optional(v.number()),
    relatedItemIds: v.array(v.id("items")),
    relatedBoxIds: v.array(v.id("boxes")),
    relatedSpaceIds: v.array(v.id("moveSpaces")),
    relatedQueueItemId: v.optional(v.id("queueItems")),
    searchText: v.string(),
    createdByUserId: v.id("users"),
    createdByMcpClientId: v.string(),
    updatedByUserId: v.id("users"),
    updatedByMcpClientId: v.string(),
    operationId: v.string(),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_move_updated", ["moveId", "updatedAt"])
    .index("by_move_kind_updated", ["moveId", "kind", "updatedAt"])
    .index("by_move_stable_key", ["moveId", "stableKey"])
    .index("by_household_updated", ["householdId", "updatedAt"])
    .searchIndex("search_move_records", {
      searchField: "searchText",
      filterFields: ["moveId", "kind", "status"],
    }),

  // Bounded replay receipts for stateless OAuth MCP writes. This is protocol
  // reliability state, not a second product record or a conversational session.
  mcpOperations: defineTable({
    actorUserId: v.id("users"),
    moveId: v.id("moves"),
    clientId: v.string(),
    tool: v.string(),
    operationId: v.string(),
    requestHash: v.string(),
    result: v.any(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_actor_client_tool_operation", [
      "actorUserId",
      "clientId",
      "tool",
      "operationId",
    ])
    .index("by_move", ["moveId"])
    .index("by_expires", ["expiresAt"]),

  /**
   * What one person has approved one chosen AI to do inside Moving.
   *
   * This is the authority record, and it is read fresh on every discovery and
   * every tool call. An OAuth token proves who signed in; this row decides what
   * they may reach. That is what makes revocation immediate: the token is still
   * cryptographically valid, and the very next call is still refused.
   *
   * A grant is per OAuth client, so revoking one connected AI does not disturb
   * another. It is never a credential — there is nothing here to connect with.
   */
  aiGrants: defineTable({
    ownerUserId: v.id("users"),
    householdId: v.id("households"),
    // What the person called this connection, for their own screen.
    label: v.string(),
    // The OAuth client this grant is bound to. Absent means the person approved
    // the grant before any client connected; the first matching client claims it.
    clientId: v.optional(v.string()),
    registrationMethod: v.optional(mcpClientRegistrationMethod),
    // SHA-256 of the Client ID Metadata Document, so a swapped document shows up.
    clientMetadataDigest: v.optional(v.string()),
    // What the client called itself. A label for the person, never authority.
    observedClientName: v.optional(v.string()),
    scopes: v.array(movingGrantScope),
    moveScope: v.union(v.literal("allMoves"), v.literal("selectedMoves")),
    moveIds: v.optional(v.array(v.id("moves"))),
    status: v.union(v.literal("active"), v.literal("revoked")),
    // The text the person actually approved, frozen at approval time. Rendering
    // today's wording for an old grant would quietly rewrite what they agreed to.
    consentBoundaryVersion: v.string(),
    consentSnapshot: v.array(
      v.object({
        scope: v.string(),
        label: v.string(),
        grants: v.string(),
        doesNotImply: v.string(),
      }),
    ),
    // A grant that never ends is one nobody remembers agreeing to.
    expiresAt: v.optional(v.number()),
    approvedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    lastToolName: v.optional(v.string()),
    useCount: v.number(),
    revokedAt: v.optional(v.number()),
    revokedByUserId: v.optional(v.id("users")),
    revokedReason: v.optional(v.string()),
    note: v.optional(v.string()),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_status_updated", ["ownerUserId", "status", "updatedAt"])
    .index("by_owner_updated", ["ownerUserId", "updatedAt"])
    .index("by_owner_client_status", ["ownerUserId", "clientId", "status"])
    .index("by_household_updated", ["householdId", "updatedAt"]),

  // Append-only, owner-readable history for one grant: approvals, uses,
  // refusals, and revocation. Revoking future access must never erase the
  // attribution of work already done, so nothing here is deleted on revoke.
  aiGrantActivities: defineTable({
    grantId: v.id("aiGrants"),
    ownerUserId: v.id("users"),
    householdId: v.id("households"),
    moveId: v.optional(v.id("moves")),
    type: aiGrantActivityType,
    scope: v.optional(movingGrantScope),
    toolName: v.optional(v.string()),
    clientId: v.optional(v.string()),
    clientLabel: v.optional(v.string()),
    // Plain language, written for the person rather than for an operator.
    message: v.string(),
    outcome: v.union(v.literal("allowed"), v.literal("refused"), v.literal("recorded")),
    refusalCode: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_grant_created", ["grantId", "createdAt"])
    .index("by_owner_created", ["ownerUserId", "createdAt"])
    .index("by_move_created", ["moveId", "createdAt"])
    .index("by_expires", ["expiresAt"]),

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
    .index("by_box", ["boxId"])
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
    nickname: v.optional(v.string()),
    room: v.optional(v.string()),
    destinationRoom: v.optional(v.string()),
    description: v.optional(v.string()),
    moveDayNote: v.optional(v.string()),
    containerType: v.optional(boxContainerType),
    destinationSpaceId: v.optional(v.id("moveSpaces")),
    currentSpaceId: v.optional(v.id("moveSpaces")),
    agentLabel: v.optional(v.string()),
    aiConfidenceScore: v.optional(v.number()),
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
    .index("by_current_space", ["currentSpaceId"])
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
    fileName: v.optional(v.string()),
    agentLabel: v.optional(v.string()),
    aiConfidenceScore: v.optional(v.number()),
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
    agentLabel: v.optional(v.string()),
    aiConfidenceScore: v.optional(v.number()),
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
    intent: v.optional(ingestionQueueIntentValidator),
    targetBoxId: v.optional(v.id("boxes")),
    targetItemId: v.optional(v.id("items")),
    targetBoxCode: v.optional(v.string()),
    targetLabel: v.optional(v.string()),
    targetPlanId: v.optional(v.id("floorPlans")),
    // A capture can also be aimed at a room (space) or a transport resource so
    // the agent knows to attach its photos / work there (MCP capture_to_queue).
    targetSpaceId: v.optional(v.id("moveSpaces")),
    targetTransportId: v.optional(v.id("transportResources")),
    resultSuggestionIds: v.optional(v.array(v.id("aiTextSuggestions"))),
    resultRefs: v.optional(
      v.array(
        v.object({
          type: v.string(),
          id: v.string(),
          label: v.optional(v.string()),
        })
      )
    ),
    roomHint: v.optional(v.string()),
    // Free string so user-defined dispositions keep working later.
    dispositionHint: v.optional(v.string()),
    scopeHint: v.optional(ingestionScopeHintValidator),
    // Structured capture hints (agent gap #4): the user or agent can pre-set
    // these so the processing agent applies them directly instead of re-parsing
    // the free-text instructions. DESTINATION room/transport reuse the
    // targetSpaceId / targetTransportId fields above; these add the rest.
    itemKind: v.optional(ingestionItemKindValidator),
    estimatedWeightLb: v.optional(v.number()),
    dimensionsIn: v.optional(dimensionsValidator),
    disposition: v.optional(itemDispositionValidator),
    startingSpaceId: v.optional(v.id("moveSpaces")),
    presentSpaceId: v.optional(v.id("moveSpaces")),
    presentTransportId: v.optional(v.id("transportResources")),
    mediaPhotoIds: v.array(v.id("itemPhotos")),
    // Background-upload bookkeeping. Both optional → old rows (undefined) read as
    // "media is fully attached / complete". expectedMediaCount is how many photos
    // the client promised to upload after the entry was saved; mediaUploadState is
    // the coarse entry-level rollup (per-file progress/retry lives client-side).
    expectedMediaCount: v.optional(v.number()),
    mediaUploadState: v.optional(mediaUploadStateValidator),
    sortOrder: v.number(),
    claimedByUserId: v.optional(v.id("users")),
    claimedByApiKeyId: v.optional(v.id("apiKeys")),
    claimedByAgentLabel: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    claimExpiresAt: v.optional(v.number()),
    agentSummary: v.optional(v.string()),
    agentQuestion: v.optional(v.string()),
    resultItemIds: v.optional(v.array(v.id("items"))),
    // Boxes/totes the capture produced (a capture can become a box, not just
    // items) — lets submit_queue_result link the produced unit (MOVE agent gap).
    resultBoxIds: v.optional(v.array(v.id("boxes"))),
    processedAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    // The user whose PERSONAL queue this entry belongs to. Authoritative for
    // per-user queue isolation + run-delegation. Optional for back-compat;
    // readers coalesce undefined -> createdByUserId (backfilled to match).
    // (Executor identity at claim time reuses the existing claimedByApiKeyId /
    // claimedByUserId / claimedByAgentLabel fields above.)
    ownerUserId: v.optional(v.id("users")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_status_order", ["moveId", "status", "sortOrder"])
    .index("by_move_owner_status", ["moveId", "ownerUserId", "status", "sortOrder"])
    .index("by_move_owner_created", ["moveId", "ownerUserId", "createdAt"])
    .index("by_move_creator_owner_created", [
      "moveId",
      "createdByUserId",
      "ownerUserId",
      "createdAt",
    ])
    .index("by_move_created", ["moveId", "createdAt"])
    .index("by_household_status", ["householdId", "status"])
    // Global sweep for captures stuck mid-upload (cron ages them out to "failed"
    // so a lost/reloaded upload doesn't strand the capture un-claimable forever).
    .index("by_media_state_created", ["mediaUploadState", "createdAt"]),

  // Canonical person <-> chosen-AI handoffs. Specialized domain workflows keep
  // their own statuses and may be projected through adapters; they are not
  // silently relabeled or migrated into this table.
  queueItems: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    ownerUserId: v.id("users"),
    createdByUserId: v.id("users"),
    directive: v.string(),
    summary: v.optional(v.string()),
    state: queueStateValidator,
    priority: queuePriorityValidator,
    contextKind: queueContextKindValidator,
    contextRefId: v.optional(v.string()),
    contextLabel: v.optional(v.string()),
    domainKind: queueDomainKindValidator,
    domainRefType: v.optional(v.string()),
    domainRefId: v.optional(v.string()),
    requiredAction: v.optional(v.string()),
    nextStep: v.optional(v.string()),
    waitingReason: v.optional(queueWaitingReasonValidator),
    nextAttemptAt: v.optional(v.number()),
    latestHumanResponse: v.optional(v.string()),
    resultSummary: v.optional(v.string()),
    resultRefs: v.optional(v.array(queueResultRefValidator)),
    terminalReason: v.optional(queueTerminalReasonValidator),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    failureRetryable: v.optional(v.boolean()),
    attemptCount: v.number(),
    maxAttempts: v.number(),
    claimedByUserId: v.optional(v.id("users")),
    claimedByApiKeyId: v.optional(v.id("apiKeys")),
    claimedByLabel: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    claimExpiresAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_move_state_updated", ["moveId", "state", "updatedAt"])
    .index("by_move_owner_state_updated", [
      "moveId",
      "ownerUserId",
      "state",
      "updatedAt",
    ])
    .index("by_move_owner_updated", ["moveId", "ownerUserId", "updatedAt"])
    .index("by_move_updated", ["moveId", "updatedAt"])
    .index("by_owner_updated", ["ownerUserId", "updatedAt"])
    .index("by_household_updated", ["householdId", "updatedAt"])
    .index("by_move_domain_ref", ["moveId", "domainRefType", "domainRefId"])
    .index("by_move_owner_idempotency", [
      "moveId",
      "ownerUserId",
      "idempotencyKey",
    ])
    .index("by_state_claim_expiry", ["state", "claimExpiresAt"])
    .index("by_expiry", ["expiresAt"])
    .searchIndex("search_directive", {
      searchField: "directive",
      filterFields: ["moveId", "state", "ownerUserId"],
    }),

  // Append-only, item-scoped history. This is user-inspectable Queue provenance;
  // auditLogs remains the broader security/operations trail.
  queueActivities: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    queueItemId: v.id("queueItems"),
    ownerUserId: v.id("users"),
    type: queueActivityTypeValidator,
    actorType: queueActorTypeValidator,
    actorUserId: v.optional(v.id("users")),
    actorApiKeyId: v.optional(v.id("apiKeys")),
    actorLabel: v.optional(v.string()),
    fromState: v.optional(queueStateValidator),
    toState: queueStateValidator,
    message: v.string(),
    failureCode: v.optional(v.string()),
    resultRefCount: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_item_created", ["queueItemId", "createdAt"])
    .index("by_move_created", ["moveId", "createdAt"])
    .index("by_household_created", ["householdId", "createdAt"])
    .index("by_owner_created", ["ownerUserId", "createdAt"])
    .index("by_actor_user_created", ["actorUserId", "createdAt"])
    .index("by_actor_apikey_created", ["actorApiKeyId", "createdAt"])
    .index("by_item_idempotency", ["queueItemId", "idempotencyKey"]),

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
    code: v.optional(v.string()),
    nickname: v.optional(v.string()),
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
    aiConfidenceScore: v.optional(v.number()),
    researchSummary: v.optional(v.string()),
    researchSources: v.optional(v.array(itemResearchSource)),
    researchNotes: v.optional(v.string()),
    researchConfidence: v.optional(estimateConfidence),
    researchedAt: v.optional(v.number()),
    researchedByUserId: v.optional(v.id("users")),
    researchedByApiKeyId: v.optional(v.id("apiKeys")),
    researchedByLabel: v.optional(v.string()),
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
    .index("by_move_code", ["moveId", "code"])
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

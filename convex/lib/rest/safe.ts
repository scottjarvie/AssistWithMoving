import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { authenticateApiKey } from "../apiKeyAuth";
import { itemDimensionsConfidenceForRead } from "../../../src/lib/inventory-measurements";
import { safeShareLinkMetadata } from "../shareLinks";

export function safeMove(move: Doc<"moves">) {
  return {
    moveId: move._id,
    title: move.title,
    type: move.type,
    status: move.status,
    origin: move.origin,
    destination: move.destination,
    dateStart: move.dateStart,
    dateEnd: move.dateEnd,
    unitSystem: move.unitSystem,
    documentationProfileTypes: move.documentationProfileTypes,
    createdAt: move.createdAt,
    updatedAt: move.updatedAt,
  };
}

type ApiVisibility = Awaited<ReturnType<typeof authenticateApiKey>>["visibility"];

export function safeItem(item: Doc<"items">, visibility: ApiVisibility) {
  return {
    itemId: item._id,
    name: item.name,
    externalSource: item.externalSource,
    externalId: item.externalId,
    description: item.description,
    room: item.room,
    destinationRoom: item.destinationRoom,
    currentSpaceId: item.currentSpaceId,
    destinationSpaceId: item.destinationSpaceId,
    category: item.category,
    disposition: item.disposition,
    status: item.status,
    quantity: item.quantity,
    condition: item.condition,
    // Gate value/serial behind the key creator's role (same as the web/gateway).
    valueCents: visibility.estimatedValue ? item.valueCents : undefined,
    replacementValueCents: visibility.estimatedValue
      ? item.replacementValueCents
      : undefined,
    serialNumber: visibility.serialNumber ? item.serialNumber : undefined,
    modelNumber: visibility.serialNumber ? item.modelNumber : undefined,
    dimensionsIn: item.dimensionsIn,
    measurementProvenance: item.measurementProvenance,
    dimensionsConfidence: itemDimensionsConfidenceForRead({
      dimensionsIn: item.dimensionsIn,
      dimensionsConfidence: item.dimensionsConfidence,
    }),
    estimatedWeightLb: item.estimatedWeightLb,
    estimatedWeightLowLb: item.estimatedWeightLowLb,
    estimatedWeightHighLb: item.estimatedWeightHighLb,
    actualWeightLb: item.actualWeightLb,
    estimatedVolumeCuFt: item.estimatedVolumeCuFt,
    estimatedPackedVolumeCuFt: item.estimatedPackedVolumeCuFt,
    weightConfidence: item.weightConfidence,
    volumeConfidence: item.volumeConfidence,
    highValue: item.highValue,
    needsReview: item.needsReview,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function safePlannedItem(plannedItem: Doc<"plannedItems">) {
  return {
    plannedItemId: plannedItem._id,
    moveId: plannedItem.moveId,
    name: plannedItem.name,
    category: plannedItem.category,
    subcategory: plannedItem.subcategory,
    description: plannedItem.description,
    dimensionsIn: plannedItem.dimensionsIn,
    dimensionsConfidence: plannedItem.dimensionsConfidence,
    estimatedPriceCents: plannedItem.estimatedPriceCents,
    url: plannedItem.url,
    priority: plannedItem.priority,
    notes: plannedItem.notes,
    status: plannedItem.status,
    convertedItemId: plannedItem.convertedItemId,
    createdVia: plannedItem.createdVia,
    createdAt: plannedItem.createdAt,
    updatedAt: plannedItem.updatedAt,
    archivedAt: plannedItem.archivedAt,
  };
}

export function safeBox(box: Doc<"boxes">) {
  return {
    boxId: box._id,
    code: box.code,
    label: box.label,
    room: box.room,
    destinationRoom: box.destinationRoom,
    status: box.status,
    estimatedWeightLb: box.estimatedWeightLb,
    actualWeightLb: box.actualWeightLb,
    estimatedVolumeCuFt: box.estimatedVolumeCuFt,
    assignedResourceId: box.assignedResourceId,
    assignedZoneId: box.assignedZoneId,
    assignmentLocked: box.assignmentLocked,
    assignmentWarnings: box.assignmentWarnings,
    assignmentHardBlocks: box.assignmentHardBlocks,
    createdAt: box.createdAt,
    updatedAt: box.updatedAt,
  };
}

export function safeMovePerson(person: Doc<"movePeople">) {
  return {
    personId: person._id,
    name: person.name,
    role: person.role,
    email: person.email,
    phone: person.phone,
    notes: person.notes,
    sortOrder: person.sortOrder,
    archivedAt: person.archivedAt,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
  };
}

export function safeTransportResource(resource: Doc<"transportResources">) {
  return {
    resourceId: resource._id,
    type: resource.type,
    name: resource.name,
    description: resource.description,
    capacity: resource.capacity,
    capacityReviewStatus: resource.capacityReviewStatus ?? "unreviewed",
    capacityNotes: resource.capacityNotes,
    capacityReviewedAt: resource.capacityReviewedAt,
    capacityReviewedByUserId: resource.capacityReviewedByUserId,
    rules: resource.rules,
    sortOrder: resource.sortOrder,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  };
}

export function safeTransportZone(zone: Doc<"transportZones">) {
  return {
    zoneId: zone._id,
    resourceId: zone.resourceId,
    name: zone.name,
    description: zone.description,
    capacity: zone.capacity,
    preferredTags: zone.preferredTags,
    sortOrder: zone.sortOrder,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
  };
}

export function safeMoveSpace(space: Doc<"moveSpaces">, showNotes: boolean) {
  return {
    spaceId: space._id,
    kind: space.kind,
    name: space.name,
    aliases: space.aliases,
    notes: showNotes ? space.notes : undefined,
    floorLevel: space.floorLevel,
    sortOrder: space.sortOrder,
    status: space.status,
    transportResourceId: space.transportResourceId,
    transportZoneId: space.transportZoneId,
    linkedPlanEntityId: space.linkedPlanEntityId,
    capacity: space.capacity,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
}

export function safeSaleListing(listing: Doc<"saleListings">) {
  return {
    listingId: listing._id,
    itemId: listing.itemId,
    status: listing.status,
    platform: listing.platform,
    platformLabel: listing.platformLabel,
    listingTitle: listing.listingTitle,
    listingDescription: listing.listingDescription,
    category: listing.category,
    condition: listing.condition,
    locationLabel: listing.locationLabel,
    selectedPhotoIds: listing.selectedPhotoIds,
    listingUrl: listing.listingUrl,
    listedAt: listing.listedAt,
    lastRefreshedAt: listing.lastRefreshedAt,
    suggestedPriceLowCents: listing.suggestedPriceLowCents,
    suggestedPriceHighCents: listing.suggestedPriceHighCents,
    officialPriceCents: listing.officialPriceCents,
    currency: listing.currency,
    pricingConfidence: listing.pricingConfidence,
    priceDecisionSource: listing.priceDecisionSource,
    userOverrodePrice: listing.userOverrodePrice,
    researchDepth: listing.researchDepth,
    researchSourceCount: listing.researchSourceCount,
    researchSources: listing.researchSources,
    researchedAt: listing.researchedAt,
    researchedByApiKeyId: listing.researchedByApiKeyId,
    researchedByLabel: listing.researchedByLabel,
    researchNotes: listing.researchNotes,
    interestedCount: listing.interestedCount,
    inquiryNotes: listing.inquiryNotes,
    offerNotes: listing.offerNotes,
    buyerNotes: listing.buyerNotes,
    pickupStatus: listing.pickupStatus,
    soldPriceCents: listing.soldPriceCents,
    soldAt: listing.soldAt,
    needsMorePhotos: listing.needsMorePhotos,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  };
}

export function safeAssignment(assignment: Doc<"boxItems">) {
  return {
    assignmentId: assignment._id,
    boxId: assignment.boxId,
    itemId: assignment.itemId,
    quantity: assignment.quantity,
    notes: assignment.notes,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}

export function safePlanningSuggestion(suggestion: Doc<"aiPlanningSuggestions">) {
  return {
    suggestionId: suggestion._id,
    aiJobId: suggestion.aiJobId,
    type: suggestion.type,
    status: suggestion.status,
    itemId: suggestion.itemId,
    boxId: suggestion.boxId,
    confidence: suggestion.confidence,
    reasoning: suggestion.reasoning,
    assumptions: suggestion.assumptions,
    estimateDraft: suggestion.estimateDraft,
    assignmentDraft: suggestion.assignmentDraft,
    reviewedAt: suggestion.reviewedAt,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  };
}

export function safeAiJob(job: Doc<"aiJobs">) {
  return {
    aiJobId: job._id,
    type: job.type,
    status: job.status,
    modality: job.modality,
    provider: job.provider,
    model: job.model,
    inputSummary: job.inputSummary,
    outputSummary: job.outputSummary,
    confidence: job.confidence,
    reviewStatus: job.reviewStatus,
    tokenUsage: job.tokenUsage,
    cost: job.cost,
    maxCostCents: job.maxCostCents,
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
    error: job.error,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    canceledAt: job.canceledAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export function safeAiTextSuggestion(suggestion: Doc<"aiTextSuggestions">) {
  return {
    suggestionId: suggestion._id,
    aiJobId: suggestion.aiJobId,
    type: suggestion.type,
    status: suggestion.status,
    sourceLine: suggestion.sourceLine,
    sourceIndex: suggestion.sourceIndex,
    confidence: suggestion.confidence,
    reasoning: suggestion.reasoning,
    itemDraft: suggestion.itemDraft,
    boxDraft: suggestion.boxDraft,
    approvedItemId: suggestion.approvedItemId,
    approvedBoxId: suggestion.approvedBoxId,
    reviewedAt: suggestion.reviewedAt,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  };
}

export function safeAiPhotoSuggestion(suggestion: Doc<"aiPhotoSuggestions">) {
  return {
    suggestionId: suggestion._id,
    photoId: suggestion.photoId,
    aiJobId: suggestion.aiJobId,
    type: suggestion.type,
    status: suggestion.status,
    sourceDerivativeVariant: suggestion.sourceDerivativeVariant,
    sourceSummary: suggestion.sourceSummary,
    confidence: suggestion.confidence,
    reasoning: suggestion.reasoning,
    itemDraft: suggestion.itemDraft,
    boxDraft: suggestion.boxDraft,
    duplicatePhotoIds: suggestion.duplicatePhotoIds,
    approvedItemId: suggestion.approvedItemId,
    approvedBoxId: suggestion.approvedBoxId,
    reviewedAt: suggestion.reviewedAt,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  };
}

export function safePhoto(photo: Doc<"itemPhotos">) {
  return {
    photoId: photo._id,
    itemId: photo.itemId,
    boxId: photo.boxId,
    spaceId: photo.spaceId,
    transportResourceId: photo.transportResourceId,
    transportZoneId: photo.transportZoneId,
    room: photo.room,
    documentationProfileTypes: photo.documentationProfileTypes,
    photoType: photo.photoType,
    privacyLevel: photo.privacyLevel,
    visibilityScope: photo.visibilityScope,
    verificationStatus: photo.verificationStatus,
    caption: photo.caption,
    width: photo.width,
    height: photo.height,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    capturedAt: photo.capturedAt,
    uploadedAt: photo.createdAt,
    updatedAt: photo.updatedAt,
  };
}

export function safeExportJob(job: Doc<"exportJobs">) {
  return {
    exportJobId: job._id,
    moveId: job.moveId,
    documentationProfileId: job.documentationProfileId,
    type: job.type,
    format: job.format,
    status: job.status,
    filename: job.filename,
    mimeType: job.mimeType,
    rowCount: job.rowCount,
    sizeBytes: job.sizeBytes,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    expiresAt: job.expiresAt,
  };
}

export function safeApiShareLink(link: Doc<"shareLinks">) {
  const safe = safeShareLinkMetadata(link);
  return {
    shareLinkId: safe._id,
    moveId: safe.moveId,
    documentationProfileId: safe.documentationProfileId,
    scope: safe.scope,
    tokenPreview: safe.tokenPreview,
    label: safe.label,
    role: safe.role,
    status: safe.status,
    allowedActions: safe.allowedActions,
    expiresAt: safe.expiresAt,
    revokedAt: safe.revokedAt,
    accessCount: safe.accessCount,
    lastAccessedAt: safe.lastAccessedAt,
    createdAt: safe.createdAt,
    updatedAt: safe.updatedAt,
  };
}

export async function safeApiShareLinkComment(
  ctx: MutationCtx,
  comment: Doc<"shareLinkComments">
) {
  const [link, profile] = await Promise.all([
    ctx.db.get(comment.shareLinkId),
    ctx.db.get(comment.documentationProfileId),
  ]);
  return {
    commentId: comment._id,
    shareLinkId: comment.shareLinkId,
    documentationProfileId: comment.documentationProfileId,
    shareLabel: link?.label,
    profileName: profile?.name,
    role: comment.role,
    authorLabel: comment.authorLabel,
    body: comment.body,
    createdAt: comment.createdAt,
  };
}

export function artifactForApiExport(job: Doc<"exportJobs">) {
  if (job.status !== "completed" || !job.artifactText) {
    throw new Error("Export artifact is not ready.");
  }
  if (job.expiresAt && job.expiresAt < Date.now()) {
    throw new Error("Export artifact has expired.");
  }
  return {
    ...safeExportJob(job),
    artifactText: job.artifactText,
    encoding: "utf-8",
  };
}

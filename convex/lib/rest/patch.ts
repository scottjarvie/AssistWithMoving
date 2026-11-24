import type {
  Doc,
  Id,
} from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { authenticateApiKey } from "../apiKeyAuth";
import {
  roundEstimate,
  weightBoundsFromEstimate,
} from "../estimateEngine";
import {
  buildMovePatch,
  measurementProvenanceSources,
  normalizeBoxCode,
  normalizeItemName,
  normalizeOptionalText,
  normalizeRuleList,
  normalizeSortOrder,
  normalizedSearchName,
} from "../moveFields";
import type { PlanningSuggestionApprovalInput } from "../aiPlanningSuggestionWorkflow";
import { bodyRecord as bodyObject } from "./core";
import {
  requireApiItem,
  requireApiBox,
  requireApiTransportResource,
} from "./require";
import {
  parseDimensionsIn,
  optionalNumber,
  positiveNumber,
  asString,
  optionalString,
  externalItemKeyFromInput,
  parseMoveType,
  parseUnitSystem,
  parseItemStatus,
  parsePlannedItemStatus,
  parseDisposition,
  parseSaleListingStatus,
  parseSaleListingPlatform,
  parseSaleResearchDepth,
  parseSaleResearchSources,
  parsePhotoIdArray,
  parseCondition,
  parseBoxStatus,
  parseMovePersonRole,
  parsePhotoType,
  parsePhotoPrivacyLevel,
  parsePhotoVisibilityScope,
  parsePhotoSource,
  parseExifHandlingStatus,
  parsePhotoVerificationStatus,
  parseConfidence,
  parsePlanningConfidence,
  parseFragility,
  parsePlanningDefaultKeys,
  parseDocumentationProfileTypes,
  parseTransportResourceType,
  parseCapacityReviewStatus,
  parseCapacity,
  parseStringArray,
  removeUndefined,
  includesLiteral,
} from "./parse";

// Fill the weight range (low 75% / high 135%) from the point estimate when the
// caller didn't send explicit bounds — so the REST/MCP AI can send just
// estimatedWeightLb. Mirrors items.ts. Explicit bounds are never overwritten.
export function addRestDerivedWeightBounds(body: Record<string, unknown>) {
  const bounds = weightBoundsFromEstimate(optionalNumber(body.estimatedWeightLb));
  if (!bounds) {
    return body;
  }
  if (
    body.estimatedWeightLowLb === undefined ||
    body.estimatedWeightLowLb === null
  ) {
    body.estimatedWeightLowLb = bounds.low;
  }
  if (
    body.estimatedWeightHighLb === undefined ||
    body.estimatedWeightHighLb === null
  ) {
    body.estimatedWeightHighLb = bounds.high;
  }
  return body;
}

export function addRestDerivedEstimatedVolume(body: Record<string, unknown>) {
  if (body.estimatedVolumeCuFt !== undefined && body.estimatedVolumeCuFt !== null) {
    return body;
  }
  const dimensions = bodyObject(body.dimensionsIn);
  const length = optionalNumber(dimensions.lengthIn);
  const width = optionalNumber(dimensions.widthIn);
  const height = optionalNumber(dimensions.heightIn);
  if (!length || !width || !height) {
    return body;
  }
  body.estimatedVolumeCuFt = roundEstimate((length * width * height) / 1728);
  return body;
}

const setupArchiveMessage =
  "Archiving a move isn't supported via this endpoint — archive it in the app.";

export function setupMoveStatus(value: unknown): Doc<"moves">["status"] {
  if (value === undefined) return "planning";
  return (
    buildMovePatch(
      { status: value },
      { archivedStatusMessage: setupArchiveMessage },
    ).status ?? "planning"
  );
}

export function setupMovePatch(
  body: Record<string, unknown>,
  notes: string | undefined,
): Partial<Doc<"moves">> {
  const notesPatch = body.notes === null && notes === undefined ? null : notes;
  const patch = buildMovePatch(
    {
      title: body.title,
      status: body.status,
      origin: body.origin,
      destination: body.destination,
      dateStart: body.dateStart,
      dateEnd: body.dateEnd,
      documentationProfileTypes: body.documentationProfileTypes,
      moveLevelWeightAllowanceLb: body.moveLevelWeightAllowanceLb,
      ...(body.notes !== undefined ||
      body.originRooms !== undefined ||
      body.destinationRooms !== undefined
        ? { notes: notesPatch }
        : {}),
    },
    { archivedStatusMessage: setupArchiveMessage },
  );
  if (body.type !== undefined) {
    patch.type = parseMoveType(body.type) ?? "other";
  }
  if (body.unitSystem !== undefined) {
    patch.unitSystem = parseUnitSystem(body.unitSystem) ?? "imperial";
  }
  return patch;
}

export function movePatch(body: unknown): Partial<Doc<"moves">> {
  return buildMovePatch(bodyObject(body));
}

export function transportResourcePatch(
  body: unknown,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>
): Partial<Doc<"transportResources">> {
  const input = bodyObject(body);
  const now = Date.now();
  const patch: Partial<Doc<"transportResources">> = { updatedAt: now };
  if (input.type !== undefined) {
    const type = parseTransportResourceType(input.type);
    if (!type) throw new Error("Invalid transport resource type.");
    patch.type = type;
  }
  if (input.name !== undefined) {
    const name = normalizeOptionalText(asString(input.name));
    if (!name) throw new Error("name cannot be empty.");
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(asString(input.description));
  }
  if (input.capacity !== undefined) {
    patch.capacity = parseCapacity(input.capacity) ?? {};
  }
  if (input.capacityReviewStatus !== undefined) {
    const status = parseCapacityReviewStatus(input.capacityReviewStatus);
    if (!status) throw new Error("Invalid capacityReviewStatus.");
    patch.capacityReviewStatus = status;
    patch.capacityReviewedAt = now;
    patch.capacityReviewedByUserId = auth.createdByUserId;
  }
  if (input.capacityNotes !== undefined) {
    patch.capacityNotes = normalizeOptionalText(asString(input.capacityNotes));
  }
  if (input.rules !== undefined) {
    patch.rules = normalizeRuleList(parseStringArray(input.rules) ?? []);
  }
  if (input.sortOrder !== undefined) {
    patch.sortOrder = normalizeSortOrder(optionalNumber(input.sortOrder));
  }
  return patch;
}

export async function transportZonePatch(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  body: unknown
): Promise<Partial<Doc<"transportZones">>> {
  const input = bodyObject(body);
  const patch: Partial<Doc<"transportZones">> = { updatedAt: Date.now() };
  if (input.resourceId !== undefined) {
    const resourceId = optionalString(input.resourceId);
    if (!resourceId) throw new Error("resourceId cannot be empty.");
    await requireApiTransportResource(ctx, householdId, moveId, resourceId);
    patch.resourceId = resourceId as Id<"transportResources">;
  }
  if (input.name !== undefined) {
    const name = normalizeOptionalText(asString(input.name));
    if (!name) throw new Error("name cannot be empty.");
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(asString(input.description));
  }
  if (input.capacity !== undefined) {
    patch.capacity = parseCapacity(input.capacity) ?? {};
  }
  if (input.preferredTags !== undefined) {
    patch.preferredTags = normalizeRuleList(parseStringArray(input.preferredTags) ?? []);
  }
  if (input.sortOrder !== undefined) {
    patch.sortOrder = normalizeSortOrder(optionalNumber(input.sortOrder));
  }
  return patch;
}

export function movePersonPatch(
  body: unknown,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>
): Partial<Doc<"movePeople">> {
  const input = bodyObject(body);
  const patch: Partial<Doc<"movePeople">> = {
    updatedByUserId: auth.createdByUserId,
    updatedByApiKeyId: auth.apiKeyId,
    updatedAt: Date.now(),
  };
  if (input.name !== undefined) {
    const name = normalizeOptionalText(asString(input.name));
    if (!name) throw new Error("name cannot be empty.");
    patch.name = name;
  }
  if (input.role !== undefined) {
    const role = parseMovePersonRole(input.role);
    if (!role) throw new Error("Invalid move person role.");
    patch.role = role;
  }
  if (input.email !== undefined) {
    patch.email = normalizeOptionalText(asString(input.email));
  }
  if (input.phone !== undefined) {
    patch.phone = normalizeOptionalText(asString(input.phone));
  }
  if (input.notes !== undefined) {
    patch.notes = normalizeOptionalText(asString(input.notes));
  }
  if (input.sortOrder !== undefined) {
    patch.sortOrder = normalizeSortOrder(optionalNumber(input.sortOrder));
  }
  if (input.archivedAt !== undefined) {
    patch.archivedAt = optionalNumber(input.archivedAt);
  }
  return patch;
}

function verificationNeeded(confidence: Doc<"items">["weightConfidence"]) {
  return confidence !== "manual" && confidence !== "actual";
}

function hasDimensionsIn(dimensions: Doc<"items">["dimensionsIn"] | undefined) {
  return Boolean(
    dimensions &&
      (dimensions.lengthIn !== undefined ||
        dimensions.widthIn !== undefined ||
        dimensions.heightIn !== undefined),
  );
}

function parseMeasurementProvenanceSource(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(measurementProvenanceSources, value)) {
    throw new Error("Unsupported measurement provenance sourceType.");
  }
  return value as NonNullable<
    NonNullable<Doc<"items">["measurementProvenance"]>["weight"]
  >["sourceType"];
}

function apiMeasurementProvenanceEntry({
  input,
  auth,
  now,
  fallbackSourceType,
  fallbackConfidence,
  fallbackLabel,
  fallbackNotes,
}: {
  input: Record<string, unknown>;
  auth: Awaited<ReturnType<typeof authenticateApiKey>>;
  now: number;
  fallbackSourceType: NonNullable<
    NonNullable<Doc<"items">["measurementProvenance"]>["weight"]
  >["sourceType"];
  fallbackConfidence: Doc<"items">["weightConfidence"];
  fallbackLabel: string;
  fallbackNotes?: string;
}): NonNullable<NonNullable<Doc<"items">["measurementProvenance"]>["weight"]> {
  const confidence =
    parsePlanningConfidence(input.confidence, "measurementProvenance.confidence") ??
    fallbackConfidence;
  const apiKeyLabel = `${auth.apiKeyName} (${auth.apiKeyTokenPreview})`;
  return {
    sourceType:
      parseMeasurementProvenanceSource(input.sourceType) ?? fallbackSourceType,
    confidence,
    label: normalizeOptionalText(asString(input.label)) ?? fallbackLabel,
    notes: normalizeOptionalText(asString(input.notes)) ?? fallbackNotes,
    recordedAt: optionalNumber(input.recordedAt) ?? now,
    recordedByUserId: auth.createdByUserId,
    recordedByApiKeyId: auth.apiKeyId,
    recordedByLabel:
      normalizeOptionalText(asString(input.recordedByLabel)) ??
      `API key: ${apiKeyLabel}`,
    needsVerification:
      input.needsVerification === undefined
        ? verificationNeeded(confidence)
        : Boolean(input.needsVerification),
  };
}

export function parseMeasurementProvenance(
  value: unknown,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  now: number,
): Doc<"items">["measurementProvenance"] | undefined {
  if (value === undefined) return undefined;
  const input = bodyObject(value);
  const provenance: NonNullable<Doc<"items">["measurementProvenance"]> = {};
  if (input.dimensions !== undefined) {
    provenance.dimensions = apiMeasurementProvenanceEntry({
      input: bodyObject(input.dimensions),
      auth,
      now,
      fallbackSourceType: "api",
      fallbackConfidence: "low",
      fallbackLabel: "Dimensions",
    });
  }
  if (input.weight !== undefined) {
    provenance.weight = apiMeasurementProvenanceEntry({
      input: bodyObject(input.weight),
      auth,
      now,
      fallbackSourceType: "api",
      fallbackConfidence: "low",
      fallbackLabel: "Weight",
    });
  }
  if (input.volume !== undefined) {
    provenance.volume = apiMeasurementProvenanceEntry({
      input: bodyObject(input.volume),
      auth,
      now,
      fallbackSourceType: "api",
      fallbackConfidence: "low",
      fallbackLabel: "Volume",
    });
  }
  return Object.keys(provenance).length ? provenance : undefined;
}

export function inferredApiMeasurementProvenance(
  body: Record<string, unknown>,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  now: number,
  existing?: Doc<"items">,
): Doc<"items">["measurementProvenance"] | undefined {
  const provenance: NonNullable<Doc<"items">["measurementProvenance"]> = {
    ...(existing?.measurementProvenance ?? {}),
  };
  let changed = false;
  const dimensions = parseDimensionsIn(body.dimensionsIn);
  if (body.dimensionsIn !== undefined && hasDimensionsIn(dimensions)) {
    changed = true;
    const confidence =
      parsePlanningConfidence(body.dimensionsConfidence, "dimensionsConfidence") ??
      "low";
    provenance.dimensions = apiMeasurementProvenanceEntry({
      input: {},
      auth,
      now,
      fallbackSourceType: "api",
      fallbackConfidence: confidence,
      fallbackLabel: "Dimensions",
      fallbackNotes: "Measurement values were supplied through the API.",
    });
  }
  if (
    body.actualWeightLb !== undefined ||
    body.estimatedWeightLb !== undefined ||
    body.estimatedWeightLowLb !== undefined ||
    body.estimatedWeightHighLb !== undefined
  ) {
    changed = true;
    const confidence =
      body.actualWeightLb !== undefined
        ? "actual"
        : (parsePlanningConfidence(body.weightConfidence, "weightConfidence") ??
          "low");
    provenance.weight = apiMeasurementProvenanceEntry({
      input: {},
      auth,
      now,
      fallbackSourceType: "api",
      fallbackConfidence: confidence,
      fallbackLabel: "Weight",
      fallbackNotes: "Weight values were supplied through the API.",
    });
  }
  if (
    body.estimatedVolumeCuFt !== undefined ||
    body.estimatedPackedVolumeCuFt !== undefined
  ) {
    changed = true;
    const confidence =
      parsePlanningConfidence(body.volumeConfidence, "volumeConfidence") ?? "low";
    provenance.volume = apiMeasurementProvenanceEntry({
      input: {},
      auth,
      now,
      fallbackSourceType: "api",
      fallbackConfidence: confidence,
      fallbackLabel: "Volume",
      fallbackNotes: "Volume values were supplied through the API.",
    });
  }
  return changed ? provenance : undefined;
}

export function itemPatch(
  body: unknown,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  existing?: Doc<"items">,
): Partial<Doc<"items">> {
  const input = bodyObject(body);
  // Recompute volume from dimensions + weight range from the point estimate when
  // those change without explicit values.
  addRestDerivedEstimatedVolume(input);
  addRestDerivedWeightBounds(input);
  const now = Date.now();
  const patch: Partial<Doc<"items">> = {
    updatedByUserId: auth.createdByUserId,
    updatedAt: now,
  };
  if (input.name !== undefined) {
    const name = normalizeItemName(String(input.name));
    patch.name = name;
    patch.normalizedName = normalizedSearchName(name);
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(asString(input.description));
  }
  if (input.room !== undefined) patch.room = normalizeOptionalText(asString(input.room));
  if (input.destinationRoom !== undefined) {
    patch.destinationRoom = normalizeOptionalText(asString(input.destinationRoom));
  }
  if (input.category !== undefined) {
    patch.category = normalizeOptionalText(asString(input.category));
  }
  if (input.disposition !== undefined) patch.disposition = parseDisposition(input.disposition);
  if (input.status !== undefined) patch.status = parseItemStatus(input.status);
  if (input.quantity !== undefined) patch.quantity = positiveNumber(input.quantity) ?? 1;
  if (input.condition !== undefined) patch.condition = parseCondition(input.condition);
  if (input.valueCents !== undefined) patch.valueCents = optionalNumber(input.valueCents);
  if (input.replacementValueCents !== undefined) {
    patch.replacementValueCents = optionalNumber(input.replacementValueCents);
  }
  if (input.serialNumber !== undefined) {
    patch.serialNumber = normalizeOptionalText(asString(input.serialNumber));
  }
  if (input.modelNumber !== undefined) {
    patch.modelNumber = normalizeOptionalText(asString(input.modelNumber));
  }
  if (input.dimensionsIn !== undefined) {
    patch.dimensionsIn = parseDimensionsIn(input.dimensionsIn);
  }
  if (input.measurementProvenance !== undefined) {
    patch.measurementProvenance = {
      ...(existing?.measurementProvenance ?? {}),
      ...parseMeasurementProvenance(input.measurementProvenance, auth, now),
    };
  }
  if (input.dimensionsConfidence !== undefined) {
    patch.dimensionsConfidence = parsePlanningConfidence(
      input.dimensionsConfidence,
      "dimensionsConfidence"
    );
  }
  if (input.estimatedWeightLb !== undefined) {
    patch.estimatedWeightLb = optionalNumber(input.estimatedWeightLb);
  }
  if (input.estimatedWeightLowLb !== undefined) {
    patch.estimatedWeightLowLb = optionalNumber(input.estimatedWeightLowLb);
  }
  if (input.estimatedWeightHighLb !== undefined) {
    patch.estimatedWeightHighLb = optionalNumber(input.estimatedWeightHighLb);
  }
  if (input.actualWeightLb !== undefined) {
    patch.actualWeightLb = optionalNumber(input.actualWeightLb);
  }
  if (input.estimatedVolumeCuFt !== undefined) {
    patch.estimatedVolumeCuFt = optionalNumber(input.estimatedVolumeCuFt);
  }
  if (input.estimatedPackedVolumeCuFt !== undefined) {
    patch.estimatedPackedVolumeCuFt = optionalNumber(input.estimatedPackedVolumeCuFt);
  }
  if (input.weightConfidence !== undefined) {
    patch.weightConfidence =
      parsePlanningConfidence(input.weightConfidence, "weightConfidence") ?? "none";
  }
  if (input.volumeConfidence !== undefined) {
    patch.volumeConfidence =
      parsePlanningConfidence(input.volumeConfidence, "volumeConfidence") ?? "none";
  }
  if (input.fragility !== undefined) {
    patch.fragility = parseFragility(input.fragility) ?? "low";
  }
  if (input.stackable !== undefined) patch.stackable = Boolean(input.stackable);
  if (input.hazardousFlag !== undefined) {
    patch.hazardousFlag = Boolean(input.hazardousFlag);
  }
  if (input.highValue !== undefined) patch.highValue = Boolean(input.highValue);
  if (input.requiresPersonalTransport !== undefined) {
    patch.requiresPersonalTransport = Boolean(input.requiresPersonalTransport);
  }
  if (input.planningDefaultKeys !== undefined) {
    patch.planningDefaultKeys = parsePlanningDefaultKeys(input.planningDefaultKeys) ?? [];
  }
  if (input.needsReview !== undefined) patch.needsReview = Boolean(input.needsReview);
  if (input.reviewFlags !== undefined) {
    patch.reviewFlags = normalizeRuleList(parseStringArray(input.reviewFlags) ?? []);
  }
  if (input.privateNotes !== undefined) {
    patch.privateNotes = normalizeOptionalText(asString(input.privateNotes));
  }
  if (input.aiSummary !== undefined) {
    patch.aiSummary = normalizeOptionalText(asString(input.aiSummary));
  }
  if (input.aiTags !== undefined) {
    patch.aiTags = normalizeRuleList(parseStringArray(input.aiTags) ?? []);
  }
  if (input.externalSource !== undefined || input.externalId !== undefined) {
    const externalKey = externalItemKeyFromInput(input);
    patch.externalSource = externalKey?.externalSource;
    patch.externalId = externalKey?.externalId;
  }
  if (input.measurementProvenance === undefined) {
    const inferredProvenance = inferredApiMeasurementProvenance(
      input,
      auth,
      now,
      existing,
    );
    if (inferredProvenance) {
      patch.measurementProvenance = inferredProvenance;
    }
  }
  return patch;
}

export function plannedItemPatch(
  body: unknown,
  userId: Id<"users">
): Partial<Doc<"plannedItems">> {
  const input = bodyObject(body);
  const patch: Partial<Doc<"plannedItems">> = {
    updatedByUserId: userId,
    updatedAt: Date.now(),
  };
  if (input.name !== undefined) {
    const name = normalizeItemName(String(input.name));
    if (!name) {
      throw new Error("name is required.");
    }
    patch.name = name;
    patch.normalizedName = normalizedSearchName(name);
  }
  if (input.category !== undefined) {
    patch.category = normalizeOptionalText(asString(input.category));
  }
  if (input.subcategory !== undefined) {
    patch.subcategory = normalizeOptionalText(asString(input.subcategory));
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(asString(input.description));
  }
  if (input.dimensionsIn !== undefined) {
    patch.dimensionsIn = parseDimensionsIn(input.dimensionsIn);
  }
  if (input.dimensionsConfidence !== undefined) {
    patch.dimensionsConfidence = parsePlanningConfidence(
      input.dimensionsConfidence,
      "dimensionsConfidence"
    );
  }
  if (input.estimatedPriceCents !== undefined) {
    patch.estimatedPriceCents = optionalNumber(input.estimatedPriceCents);
  }
  if (input.url !== undefined) {
    patch.url = normalizeOptionalText(asString(input.url));
  }
  if (input.priority !== undefined) {
    patch.priority = normalizePlannedItemPriority(optionalNumber(input.priority));
  }
  if (input.notes !== undefined) {
    patch.notes = normalizeOptionalText(asString(input.notes));
  }
  if (input.status !== undefined) {
    patch.status = parsePlannedItemStatus(input.status) ?? "idea";
  }
  return patch;
}

export function boxPatch(body: unknown): Partial<Doc<"boxes">> {
  const input = bodyObject(body);
  // Recompute volume from dimensions when dims change without an explicit volume.
  addRestDerivedEstimatedVolume(input);
  const patch: Partial<Doc<"boxes">> = { updatedAt: Date.now() };
  if (input.code !== undefined) patch.code = normalizeBoxCode(String(input.code));
  if (input.label !== undefined) patch.label = normalizeOptionalText(asString(input.label));
  if (input.room !== undefined) patch.room = normalizeOptionalText(asString(input.room));
  if (input.destinationRoom !== undefined) {
    patch.destinationRoom = normalizeOptionalText(asString(input.destinationRoom));
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(asString(input.description));
  }
  if (input.status !== undefined) patch.status = parseBoxStatus(input.status);
  if (input.dimensionsIn !== undefined) {
    patch.dimensionsIn = parseDimensionsIn(input.dimensionsIn) as Doc<"boxes">["dimensionsIn"];
  }
  if (input.estimatedWeightLb !== undefined) {
    patch.estimatedWeightLb = optionalNumber(input.estimatedWeightLb);
  }
  if (input.actualWeightLb !== undefined) {
    patch.actualWeightLb = optionalNumber(input.actualWeightLb);
  }
  if (input.estimatedVolumeCuFt !== undefined) {
    patch.estimatedVolumeCuFt = optionalNumber(input.estimatedVolumeCuFt);
  }
  if (input.assignedResourceId !== undefined) {
    patch.assignedResourceId = optionalString(input.assignedResourceId) as
      | Id<"transportResources">
      | undefined;
  }
  if (input.assignedZoneId !== undefined) {
    patch.assignedZoneId = optionalString(input.assignedZoneId) as
      | Id<"transportZones">
      | undefined;
  }
  if (input.assignmentLocked !== undefined) {
    patch.assignmentLocked = Boolean(input.assignmentLocked);
  }
  if (input.assignmentOverrideReason !== undefined) {
    patch.assignmentOverrideReason = normalizeOptionalText(
      asString(input.assignmentOverrideReason)
    );
  }
  return patch;
}

export async function photoAttachPatch(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    reviewedByUserId: Id<"users">;
    body: unknown;
  }
): Promise<Partial<Doc<"itemPhotos">>> {
  const input = bodyObject(args.body);
  const now = Date.now();
  const patch: Partial<Doc<"itemPhotos">> = { updatedAt: now };

  if (input.itemId !== undefined) {
    const itemId = optionalString(input.itemId) as Id<"items"> | undefined;
    if (itemId) {
      await requireApiItem(ctx, args.householdId, args.moveId, itemId);
    }
    patch.itemId = itemId;
  }
  if (input.boxId !== undefined) {
    const boxId = optionalString(input.boxId) as Id<"boxes"> | undefined;
    if (boxId) {
      await requireApiBox(ctx, args.householdId, args.moveId, boxId);
    }
    patch.boxId = boxId;
  }
  if (input.spaceId !== undefined) {
    const spaceId = optionalString(input.spaceId) as Id<"moveSpaces"> | undefined;
    if (spaceId) {
      const space = await ctx.db.get(spaceId);
      if (
        !space ||
        space.householdId !== args.householdId ||
        space.moveId !== args.moveId ||
        space.status === "archived"
      ) {
        throw new Error("Space not found.");
      }
    }
    patch.spaceId = spaceId;
  }
  if (input.transportResourceId !== undefined) {
    const transportResourceId = optionalString(input.transportResourceId) as
      | Id<"transportResources">
      | undefined;
    if (transportResourceId) {
      const resource = await ctx.db.get(transportResourceId);
      if (
        !resource ||
        resource.householdId !== args.householdId ||
        resource.moveId !== args.moveId ||
        resource.archivedAt
      ) {
        throw new Error("Transport resource not found.");
      }
    }
    patch.transportResourceId = transportResourceId;
  }
  if (input.transportZoneId !== undefined) {
    const transportZoneId = optionalString(input.transportZoneId) as
      | Id<"transportZones">
      | undefined;
    if (transportZoneId) {
      const zone = await ctx.db.get(transportZoneId);
      if (
        !zone ||
        zone.householdId !== args.householdId ||
        zone.moveId !== args.moveId ||
        zone.archivedAt
      ) {
        throw new Error("Transport zone not found.");
      }
    }
    patch.transportZoneId = transportZoneId;
  }
  if (input.room !== undefined) {
    patch.room = normalizeOptionalText(asString(input.room));
  }
  if (input.claimId !== undefined) {
    patch.claimId = normalizeOptionalText(asString(input.claimId));
  }
  if (input.documentationProfileTypes !== undefined) {
    patch.documentationProfileTypes = parseDocumentationProfileTypes(
      input.documentationProfileTypes
    );
  }
  if (input.caption !== undefined) {
    patch.caption = normalizeOptionalText(asString(input.caption));
  }
  if (input.photoType !== undefined) {
    const photoType = parsePhotoType(input.photoType);
    if (!photoType) throw new Error("Unsupported photoType.");
    patch.photoType = photoType;
  }
  if (input.privacyLevel !== undefined) {
    const privacyLevel = parsePhotoPrivacyLevel(input.privacyLevel);
    if (!privacyLevel) throw new Error("Unsupported privacyLevel.");
    patch.privacyLevel = privacyLevel;
  }
  if (input.visibilityScope !== undefined) {
    const visibilityScope = parsePhotoVisibilityScope(input.visibilityScope);
    if (!visibilityScope) throw new Error("Unsupported visibilityScope.");
    patch.visibilityScope = visibilityScope;
  }
  if (input.source !== undefined) {
    const source = parsePhotoSource(input.source);
    if (!source) throw new Error("Unsupported source.");
    patch.source = source;
  }
  if (input.exifHandlingStatus !== undefined) {
    const exifHandlingStatus = parseExifHandlingStatus(input.exifHandlingStatus);
    if (!exifHandlingStatus) throw new Error("Unsupported exifHandlingStatus.");
    patch.exifHandlingStatus = exifHandlingStatus;
  }
  if (input.confidence !== undefined) {
    const confidence = parseConfidence(input.confidence);
    if (!confidence) throw new Error("Unsupported confidence.");
    patch.confidence = confidence;
  }
  if (input.notes !== undefined) {
    patch.notes = normalizeOptionalText(asString(input.notes));
  }
  if (input.verificationStatus !== undefined) {
    const verificationStatus = parsePhotoVerificationStatus(
      input.verificationStatus
    );
    if (!verificationStatus) throw new Error("Unsupported verificationStatus.");
    patch.verificationStatus = verificationStatus;
    patch.reviewedAt = now;
    patch.reviewedByUserId = args.reviewedByUserId;
  }
  if (input.aiProcessed !== undefined) {
    patch.aiProcessed = Boolean(input.aiProcessed);
  }
  if (input.capturedAt !== undefined) {
    patch.capturedAt = optionalNumber(input.capturedAt);
  }

  return patch;
}

export function normalizePlannedItemPriority(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(4, Math.max(1, Math.round(value)));
}

function assertRestPriceCents(value: number | undefined, label: string) {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a non-negative whole number of cents.`);
  }
}

function optionalPriceCents(
  body: Record<string, unknown>,
  key:
    | "officialPriceCents"
    | "soldPriceCents"
    | "suggestedPriceLowCents"
    | "suggestedPriceHighCents",
) {
  const value = body[key];
  if (value !== undefined && value !== null && typeof value !== "number") {
    throw new Error(`${key} must be a number of cents.`);
  }
  const cents = optionalNumber(value);
  assertRestPriceCents(cents, key);
  return cents;
}

export function saleListingPatchFromBody(
  body: Record<string, unknown>,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
): Partial<Doc<"saleListings">> {
  const patch: Partial<Doc<"saleListings">> = {};
  if (body.status !== undefined) {
    patch.status = parseSaleListingStatus(body.status) ?? "needsPrep";
  }
  if (body.platform !== undefined) {
    patch.platform = parseSaleListingPlatform(body.platform) ?? "facebookMarketplace";
  }
  if (body.platformLabel !== undefined) {
    patch.platformLabel = normalizeOptionalText(asString(body.platformLabel));
  }
  if (body.listingTitle !== undefined) {
    patch.listingTitle = normalizeOptionalText(asString(body.listingTitle));
  }
  if (body.listingDescription !== undefined) {
    patch.listingDescription = normalizeOptionalText(asString(body.listingDescription));
  }
  if (body.category !== undefined) {
    patch.category = normalizeOptionalText(asString(body.category));
  }
  if (body.condition !== undefined) {
    patch.condition = normalizeOptionalText(asString(body.condition));
  }
  if (body.locationLabel !== undefined) {
    patch.locationLabel = normalizeOptionalText(asString(body.locationLabel));
  }
  if (body.selectedPhotoIds !== undefined) {
    patch.selectedPhotoIds = parsePhotoIdArray(body.selectedPhotoIds) ?? [];
  }
  if (body.listingUrl !== undefined) {
    patch.listingUrl = normalizeOptionalText(asString(body.listingUrl));
  }
  if (body.listedAt !== undefined) patch.listedAt = optionalNumber(body.listedAt);
  if (body.lastRefreshedAt !== undefined) {
    patch.lastRefreshedAt = optionalNumber(body.lastRefreshedAt);
  }
  if (body.suggestedPriceLowCents !== undefined) {
    patch.suggestedPriceLowCents = optionalPriceCents(
      body,
      "suggestedPriceLowCents",
    );
  }
  if (body.suggestedPriceHighCents !== undefined) {
    patch.suggestedPriceHighCents = optionalPriceCents(
      body,
      "suggestedPriceHighCents",
    );
  }
  if (body.officialPriceCents !== undefined) {
    patch.officialPriceCents = optionalPriceCents(body, "officialPriceCents");
  }
  if (body.currency !== undefined) {
    const currency = normalizeOptionalText(asString(body.currency))?.toUpperCase();
    patch.currency = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  }
  if (body.pricingConfidence !== undefined) {
    patch.pricingConfidence = parseConfidence(body.pricingConfidence) ?? "none";
  }
  if (body.priceDecisionSource !== undefined) {
    patch.priceDecisionSource = normalizeOptionalText(asString(body.priceDecisionSource));
  }
  if (body.userOverrodePrice !== undefined) {
    patch.userOverrodePrice = Boolean(body.userOverrodePrice);
  }
  if (body.researchDepth !== undefined) {
    patch.researchDepth = parseSaleResearchDepth(body.researchDepth) ?? "none";
  }
  if (body.researchSources !== undefined) {
    patch.researchSources = parseSaleResearchSources(body.researchSources) ?? [];
    patch.researchSourceCount = patch.researchSources.length;
  }
  if (body.researchSourceCount !== undefined) {
    patch.researchSourceCount = Math.max(
      0,
      Math.floor(optionalNumber(body.researchSourceCount) ?? 0),
    );
  }
  if (
    body.researchDepth !== undefined ||
    body.researchSources !== undefined ||
    body.researchSourceCount !== undefined ||
    body.researchNotes !== undefined
  ) {
    patch.researchedAt = optionalNumber(body.researchedAt) ?? Date.now();
    patch.researchedByApiKeyId = auth.apiKeyId;
    patch.researchedByLabel = `API key: ${auth.apiKeyName} (${auth.apiKeyTokenPreview})`;
  }
  if (body.researchNotes !== undefined) {
    patch.researchNotes = normalizeOptionalText(asString(body.researchNotes));
  }
  if (body.interestedCount !== undefined) {
    patch.interestedCount = Math.max(
      0,
      Math.floor(optionalNumber(body.interestedCount) ?? 0),
    );
  }
  if (body.inquiryNotes !== undefined) {
    patch.inquiryNotes = normalizeOptionalText(asString(body.inquiryNotes));
  }
  if (body.offerNotes !== undefined) {
    patch.offerNotes = normalizeOptionalText(asString(body.offerNotes));
  }
  if (body.buyerNotes !== undefined) {
    patch.buyerNotes = normalizeOptionalText(asString(body.buyerNotes));
  }
  if (body.pickupStatus !== undefined) {
    patch.pickupStatus = normalizeOptionalText(asString(body.pickupStatus));
  }
  if (body.soldPriceCents !== undefined) {
    patch.soldPriceCents = optionalPriceCents(body, "soldPriceCents");
  }
  if (body.soldAt !== undefined) patch.soldAt = optionalNumber(body.soldAt);
  if (body.needsMorePhotos !== undefined) {
    patch.needsMorePhotos = Boolean(body.needsMorePhotos);
  }
  return patch;
}

export function parsePlanningApprovals(body: unknown): PlanningSuggestionApprovalInput[] {
  const input = bodyObject(body);
  const rows = Array.isArray(input.approvals) ? input.approvals : [];
  if (!rows.length) {
    throw new Error("approvals must include at least one suggestion.");
  }
  if (rows.length > 100) {
    throw new Error("Planning suggestion approvals are limited to 100 rows.");
  }
  return rows.map((row) => {
    const approval = bodyObject(row);
    const suggestionId = optionalString(approval.suggestionId);
    if (!suggestionId) {
      throw new Error("approval.suggestionId is required.");
    }
    return {
      suggestionId: suggestionId as Id<"aiPlanningSuggestions">,
      estimateDraft: parseEstimateDraftPatch(approval.estimateDraft),
      assignmentDraft: parseAssignmentDraftPatch(approval.assignmentDraft),
      assignmentOverrideReason: normalizeOptionalText(
        asString(approval.assignmentOverrideReason)
      ),
    };
  });
}

function parseEstimateDraftPatch(
  value: unknown
): PlanningSuggestionApprovalInput["estimateDraft"] {
  if (value === undefined) return undefined;
  const input = bodyObject(value);
  return removeUndefined({
    category: normalizeOptionalText(asString(input.category)),
    estimatedWeightLb: optionalNumber(input.estimatedWeightLb),
    estimatedWeightLowLb: optionalNumber(input.estimatedWeightLowLb),
    estimatedWeightHighLb: optionalNumber(input.estimatedWeightHighLb),
    estimatedVolumeCuFt: optionalNumber(input.estimatedVolumeCuFt),
    estimatedPackedVolumeCuFt: optionalNumber(input.estimatedPackedVolumeCuFt),
    weightConfidence: parsePlanningConfidence(
      input.weightConfidence,
      "estimateDraft.weightConfidence"
    ),
    volumeConfidence: parsePlanningConfidence(
      input.volumeConfidence,
      "estimateDraft.volumeConfidence"
    ),
  });
}

function parseAssignmentDraftPatch(
  value: unknown
): PlanningSuggestionApprovalInput["assignmentDraft"] {
  if (value === undefined) return undefined;
  const input = bodyObject(value);
  return removeUndefined({
    assignedResourceId: optionalString(input.assignedResourceId) as
      | Id<"transportResources">
      | undefined,
    assignedZoneId: optionalString(input.assignedZoneId) as
      | Id<"transportZones">
      | undefined,
    assignmentWarnings: parseStringArray(input.assignmentWarnings),
    assignmentHardBlocks: parseStringArray(input.assignmentHardBlocks),
    weightPercent: optionalNumber(input.weightPercent),
    volumePercent: optionalNumber(input.volumePercent),
    overrideReason: normalizeOptionalText(asString(input.overrideReason)),
  });
}

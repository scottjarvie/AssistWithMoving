import type {
  Doc,
  Id,
} from "../../_generated/dataModel";
import {
  shareLinkActions,
  type ShareLinkAction,
} from "../documentation";
import {
  boxStatuses,
  documentationProfileTypes,
  exifHandlingStatuses,
  itemConditions,
  itemDispositions,
  itemFragilities,
  itemStatuses,
  normalizeDocumentationProfileTypes,
  normalizeOptionalText,
  planningDefaultKeys,
  photoPrivacyLevels,
  photoSources,
  photoTypes,
  photoVerificationStatuses,
  photoVisibilityScopes,
  moveSpaceKinds,
  saleListingPlatforms,
  saleListingStatuses,
  saleResearchDepths,
  moveTypes,
  pcsBranches,
  pcsDependentStatuses,
  pcsShipmentTypes,
  transportResourcePresetKeys,
  transportResourceTypes,
} from "../moveFields";
import type { ShareLinkRole } from "../shareLinks";
import { deriveTransportCapacity } from "../../transportResources";
import { bodyRecord as bodyObject } from "./core";
import {
  boxContainerTypes,
  exportJobTypes as restExportJobTypes,
  shareLinkRoles as restShareLinkRoles,
  plannedItemStatuses as restPlannedItemStatuses,
  movePersonRoles as restMovePersonRoles,
  estimateConfidences as restEstimateConfidences,
  aiPlanningSuggestionStatuses as restPlanningSuggestionStatuses,
  aiJobStatuses as restAiJobStatuses,
  aiTextSuggestionStatuses as restAiSuggestionStatuses,
  shareLinkStatuses as restShareLinkStatuses,
  shareLinkScopes as restShareLinkScopes,
} from "../../../shared/move-vocabulary.mjs";

export type RestExportJobType = (typeof restExportJobTypes)[number];

export function parseDimensionsIn(
  value: unknown
): Doc<"items">["dimensionsIn"] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("dimensionsIn must be an object.");
  }
  const input = value as Record<string, unknown>;
  const dimensions = removeUndefined({
    lengthIn: optionalNumber(input.lengthIn),
    widthIn: optionalNumber(input.widthIn),
    heightIn: optionalNumber(input.heightIn),
  });
  return Object.keys(dimensions).length ? dimensions : undefined;
}

export function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function positiveNumber(value: unknown) {
  const number = optionalNumber(value);
  return number && number > 0 ? number : undefined;
}

export function createMoveWeightAllowanceLb(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  throw new Error("moveLevelWeightAllowanceLb must be a positive number.");
}

export function boundedInteger(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), min), max);
}

export function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function requiredBodyString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value.trim();
}

function normalizeExternalKeyPart(value: unknown, label: string) {
  if (value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string when provided.`);
  }
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.slice(0, 160) : undefined;
}

export function externalItemKeyFromInput(input: Record<string, unknown>) {
  const hasSource = input.externalSource !== undefined;
  const hasId = input.externalId !== undefined;
  if (!hasSource && !hasId) return null;

  const externalSource = normalizeExternalKeyPart(
    input.externalSource,
    "externalSource"
  );
  const externalId = normalizeExternalKeyPart(input.externalId, "externalId");
  if (!externalSource && !externalId) return null;
  if (!externalSource || !externalId) {
    throw new Error("externalSource and externalId must be provided together.");
  }
  return { externalSource, externalId };
}

export function parseBoxContainerType(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(boxContainerTypes, value)) {
    throw new Error("containerType must be carton|plasticTote|bin|wardrobe|dishPack|crate|other.");
  }
  return value as (typeof boxContainerTypes)[number];
}

export function parseMoveType(value: unknown) {
  return includesLiteral(moveTypes, value) ? (value as Doc<"moves">["type"]) : undefined;
}

export function parseUnitSystem(value: unknown) {
  return value === "imperial" || value === "metric"
    ? (value as Doc<"moves">["unitSystem"])
    : undefined;
}

export function parsePcsBranch(value: unknown) {
  return includesLiteral(pcsBranches, value)
    ? (value as Doc<"moves">["pcsBranch"])
    : undefined;
}

export function parsePcsDependentStatus(value: unknown) {
  return includesLiteral(pcsDependentStatuses, value)
    ? (value as Doc<"moves">["pcsDependentStatus"])
    : undefined;
}

export function parsePcsShipmentType(value: unknown) {
  return includesLiteral(pcsShipmentTypes, value)
    ? (value as Doc<"moves">["pcsShipmentType"])
    : undefined;
}

export function parseItemStatus(value: unknown) {
  return includesLiteral(itemStatuses, value)
    ? (value as Doc<"items">["status"])
    : undefined;
}

export function parsePlannedItemStatus(value: unknown) {
  return includesLiteral(restPlannedItemStatuses, value)
    ? (value as Doc<"plannedItems">["status"])
    : undefined;
}

export function parseDisposition(value: unknown) {
  return includesLiteral(itemDispositions, value)
    ? (value as Doc<"items">["disposition"])
    : undefined;
}

export function parseMoveSpaceKind(value: unknown) {
  return includesLiteral(moveSpaceKinds, value)
    ? (value as Doc<"moveSpaces">["kind"])
    : undefined;
}

export function parseMoveSpaceStatus(value: unknown) {
  return value === "active" || value === "archived"
    ? (value as Doc<"moveSpaces">["status"])
    : undefined;
}

export function parseSaleListingStatus(value: unknown) {
  return includesLiteral(saleListingStatuses, value)
    ? (value as Doc<"saleListings">["status"])
    : undefined;
}

export function parseSaleListingPlatform(value: unknown) {
  return includesLiteral(saleListingPlatforms, value)
    ? (value as Doc<"saleListings">["platform"])
    : undefined;
}

export function parseSaleResearchDepth(value: unknown) {
  return includesLiteral(saleResearchDepths, value)
    ? (value as Doc<"saleListings">["researchDepth"])
    : undefined;
}

export function parseSaleResearchSources(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 25).map((entry) => {
    const source = bodyObject(entry);
    return {
      title: normalizeOptionalText(asString(source.title)),
      url: normalizeOptionalText(asString(source.url)),
      summary: normalizeOptionalText(asString(source.summary)),
      priceCents: optionalNumber(source.priceCents),
      checkedAt: optionalNumber(source.checkedAt),
    };
  });
}

export function parsePhotoIdArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 20) as Id<"itemPhotos">[];
}

export function parseCondition(value: unknown) {
  return includesLiteral(itemConditions, value)
    ? (value as Doc<"items">["condition"])
    : undefined;
}

export function parseBoxStatus(value: unknown) {
  return includesLiteral(boxStatuses, value)
    ? (value as Doc<"boxes">["status"])
    : undefined;
}

export function parseMovePersonRole(value: unknown) {
  return includesLiteral(restMovePersonRoles, value)
    ? (value as Doc<"movePeople">["role"])
    : undefined;
}

export function parsePhotoType(value: unknown) {
  return includesLiteral(photoTypes, value)
    ? (value as Doc<"itemPhotos">["photoType"])
    : undefined;
}

export function parsePhotoPrivacyLevel(value: unknown) {
  return includesLiteral(photoPrivacyLevels, value)
    ? (value as Doc<"itemPhotos">["privacyLevel"])
    : undefined;
}

export function parsePhotoVisibilityScope(value: unknown) {
  return includesLiteral(photoVisibilityScopes, value)
    ? (value as Doc<"itemPhotos">["visibilityScope"])
    : undefined;
}

export function parsePhotoSource(value: unknown) {
  return includesLiteral(photoSources, value)
    ? (value as Doc<"itemPhotos">["source"])
    : undefined;
}

export function parseExifHandlingStatus(value: unknown) {
  return includesLiteral(exifHandlingStatuses, value)
    ? (value as Doc<"itemPhotos">["exifHandlingStatus"])
    : undefined;
}

export function parsePhotoVerificationStatus(value: unknown) {
  return includesLiteral(photoVerificationStatuses, value)
    ? (value as Doc<"itemPhotos">["verificationStatus"])
    : undefined;
}

export function parseConfidence(value: unknown) {
  return includesLiteral(restEstimateConfidences, value)
    ? (value as Doc<"itemPhotos">["confidence"])
    : undefined;
}

export function parsePlanningSuggestionStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(restPlanningSuggestionStatuses, value)) {
    throw new Error("Unsupported planning suggestion status.");
  }
  return value as Doc<"aiPlanningSuggestions">["status"];
}

export function parseAiJobStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(restAiJobStatuses, value)) {
    throw new Error("Unsupported AI job status.");
  }
  return value as Doc<"aiJobs">["status"];
}

export function parseAiSuggestionStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(restAiSuggestionStatuses, value)) {
    throw new Error("Unsupported AI suggestion status.");
  }
  return value as Doc<"aiTextSuggestions">["status"];
}

export function parsePlanningConfidence(value: unknown, label: string) {
  if (value === undefined || value === "") return undefined;
  if (value === "estimated") return "low";
  if (!includesLiteral(restEstimateConfidences, value)) {
    throw new Error(`Unsupported ${label}.`);
  }
  return value as Doc<"aiPlanningSuggestions">["confidence"];
}

export function parseFragility(value: unknown): Doc<"items">["fragility"] | undefined {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(itemFragilities, value)) {
    throw new Error("Unsupported fragility.");
  }
  return value as Doc<"items">["fragility"];
}

export function parsePlanningDefaultKeys(
  value: unknown,
): Doc<"items">["planningDefaultKeys"] | undefined {
  return parseLiteralArray(
    value,
    planningDefaultKeys,
    "planningDefaultKeys",
  ) as Doc<"items">["planningDefaultKeys"] | undefined;
}

export function parseDocumentationProfileTypes(value: unknown) {
  const values = parseLiteralArray(
    value,
    documentationProfileTypes,
    "documentationProfileTypes",
  );
  return normalizeDocumentationProfileTypes(values);
}

export function parseExportJobType(value: unknown) {
  return includesLiteral(restExportJobTypes, value)
    ? (value as RestExportJobType)
    : undefined;
}

export function parseLiteralArray<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  label: string
): TValue[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  const entries: TValue[] = [];
  for (const entry of value) {
    if (!includesLiteral(allowed, entry)) {
      throw new Error(`Unsupported ${label} value.`);
    }
    entries.push(entry as TValue);
  }
  return Array.from(new Set(entries));
}

export function parseShareLinkStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(restShareLinkStatuses, value)) {
    throw new Error("Unsupported share link status.");
  }
  return value as (typeof restShareLinkStatuses)[number];
}

export function parseShareLinkScope(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(restShareLinkScopes, value)) {
    throw new Error("Unsupported share link scope.");
  }
  return value as (typeof restShareLinkScopes)[number];
}

export function parseShareLinkRole(value: unknown): ShareLinkRole | undefined {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(restShareLinkRoles, value)) {
    throw new Error("Unsupported share link role.");
  }
  return value as ShareLinkRole;
}

export function parseShareLinkActions(value: unknown): ShareLinkAction[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("allowedActions must be an array.");
  }
  const actions: ShareLinkAction[] = [];
  for (const action of value) {
    if (!includesLiteral(shareLinkActions, action)) {
      throw new Error("Unsupported share link action.");
    }
    actions.push(action as ShareLinkAction);
  }
  return Array.from(new Set(actions));
}

export function parseTransportResourceType(value: unknown) {
  return includesLiteral(transportResourceTypes, value)
    ? (value as Doc<"transportResources">["type"])
    : undefined;
}

export function parseTransportResourcePresetKey(value: unknown) {
  return includesLiteral(transportResourcePresetKeys, value)
    ? (value as (typeof transportResourcePresetKeys)[number])
    : undefined;
}

export function parseCapacityReviewStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (value === "unreviewed" || value === "estimated" || value === "confirmed") {
    return value;
  }
  throw new Error("Invalid capacityReviewStatus.");
}

export function parseCapacity(value: unknown):
  | Doc<"transportResources">["capacity"]
  | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const input = value as Record<string, unknown>;
  const capacity: Doc<"transportResources">["capacity"] = {};
  const maxWeightLb = optionalNumber(input.maxWeightLb);
  const maxVolumeCuFt = optionalNumber(input.maxVolumeCuFt);
  const maxItemCount = optionalNumber(input.maxItemCount);
  if (maxWeightLb !== undefined) capacity.maxWeightLb = maxWeightLb;
  if (maxVolumeCuFt !== undefined) capacity.maxVolumeCuFt = maxVolumeCuFt;
  if (maxItemCount !== undefined) capacity.maxItemCount = maxItemCount;
  if (input.weightIsUnlimited !== undefined) {
    capacity.weightIsUnlimited = Boolean(input.weightIsUnlimited);
  }
  if (input.volumeIsUnlimited !== undefined) {
    capacity.volumeIsUnlimited = Boolean(input.volumeIsUnlimited);
  }

  if (
    input.dimensions &&
    typeof input.dimensions === "object" &&
    !Array.isArray(input.dimensions)
  ) {
    const dimensionsInput = input.dimensions as Record<string, unknown>;
    const dimensions: NonNullable<
      Doc<"transportResources">["capacity"]["dimensions"]
    > = {};
    const lengthIn = optionalNumber(dimensionsInput.lengthIn);
    const widthIn = optionalNumber(dimensionsInput.widthIn);
    const heightIn = optionalNumber(dimensionsInput.heightIn);
    if (lengthIn !== undefined) dimensions.lengthIn = lengthIn;
    if (widthIn !== undefined) dimensions.widthIn = widthIn;
    if (heightIn !== undefined) dimensions.heightIn = heightIn;
    if (Object.keys(dimensions).length) {
      capacity.dimensions = dimensions;
    }
  }

  // Same rule as the web editors / boxes / items: when cargo dimensions are
  // given but no max volume, the available cubic feet is derived from L×W×H so
  // agent-created transports get a usable volume ceiling too.
  return deriveTransportCapacity(capacity);
}

export function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : undefined;
}

export function parseIdArray(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Expected an array of IDs.");
  }
  const ids = value.filter((entry): entry is string => typeof entry === "string");
  if (ids.length !== value.length) {
    throw new Error("ID arrays may only contain strings.");
  }
  return ids;
}

export function removeUndefined<TValue extends Record<string, unknown>>(value: TValue) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as {
    [TKey in keyof TValue as undefined extends TValue[TKey] ? TKey : TKey]:
      | Exclude<TValue[TKey], undefined>
      | undefined;
  };
}

export function includesLiteral(values: readonly string[], value: unknown) {
  return typeof value === "string" && values.includes(value);
}

import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";

export const moveTypes = [
  "pcs",
  "local",
  "longDistance",
  "storage",
  "estate",
  "decluttering",
  "claimsInventory",
  "other",
] as const;

export const transportResourceTypes = [
  "truck",
  "trailer",
  "personalVehicle",
  "professionalMovers",
  "militaryMovers",
  "storage",
  "dump",
  "sell",
  "donate",
  "free",
  "freeGiveaway",
  "unknown",
  "custom",
] as const;

export const transportResourcePresetKeys = [
  "boxTruck",
  "pickupTruck",
  "trailer7x16",
  "personalVehicle",
  "professionalMovers",
  "militaryMovers",
  "storageUnit",
  "sell",
  "donate",
  "dump",
  "freeGiveaway",
  "unknown",
] as const;

export const planningDefaultKeys = [
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
] as const;

export const planningDefaultHandlings = [
  "personalTransport",
  "keepAccessible",
  "evidenceRequired",
  "restrictedReview",
  "moverAllowedWithReview",
] as const;

export const itemDispositions = [
  "undecided",
  "take",
  "sell",
  "donate",
  "dump",
  "free",
  "storage",
  "mover",
  "personalTransport",
] as const;

export const itemStatuses = [
  "draft",
  "active",
  "packed",
  "staged",
  "loaded",
  "delivered",
  "missing",
  "damaged",
  "archived",
] as const;

export const itemConditions = [
  "unknown",
  "new",
  "excellent",
  "good",
  "fair",
  "poor",
  "damaged",
] as const;

export const estimateConfidences = [
  "none",
  "low",
  "medium",
  "high",
  "manual",
  "actual",
] as const;

export const measurementProvenanceSources = [
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
] as const;

export const itemFragilities = ["low", "medium", "high"] as const;

export const itemCreatedViaValues = [
  "manual",
  "bulkImport",
  "textAI",
  "photoAI",
  "api",
  "mcp",
] as const;

export const moveSpaceKinds = [
  "originRoom",
  "destinationRoom",
  "yardOutdoor",
  "storage",
  "transportResource",
  "transportZone",
  "custom",
] as const;

export const moveSpaceStatuses = ["active", "archived"] as const;

export const saleListingStatuses = [
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
] as const;

export const saleListingPlatforms = [
  "facebookMarketplace",
  "craigslist",
  "offerUp",
  "nextdoor",
  "ebay",
  "other",
] as const;

export const saleResearchDepths = [
  "none",
  "quick",
  "standard",
  "deep",
] as const;

export const boxStatuses = [
  "open",
  "packing",
  "sealed",
  "staged",
  "loaded",
  "delivered",
  "missing",
  "damaged",
  "archived",
] as const;

export const photoTypes = [
  "item",
  "serialNumber",
  "condition",
  "damage",
  "boxContents",
  "boxLabel",
  "receipt",
  "room",
  "blueprint",
  "other",
] as const;

export const photoPrivacyLevels = [
  "normal",
  "moverVisible",
  "reportVisible",
  "claimOnly",
  "sensitive",
  "hiddenFromGuests",
  "private",
] as const;

export const photoVisibilityScopes = [
  "household",
  "moveCollaborators",
  "documentationScoped",
  "private",
] as const;

export const photoSources = [
  "manualUpload",
  "photoAI",
  "api",
  "mcp",
  "import",
] as const;

export const exifHandlingStatuses = [
  "pending",
  "stripped",
  "retained",
  "failed",
  "notApplicable",
] as const;

export const photoVerificationStatuses = [
  "unreviewed",
  "verified",
  "needsReview",
  "rejected",
] as const;

export const aiJobTypes = [
  "photoIntake",
  "inventoryExtraction",
  "itemCategorization",
  "loadPlanSuggestions",
  "documentationDraft",
  "claimsReview",
  "generalReview",
] as const;

export const aiJobStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;

export const aiJobModalities = ["text", "vision", "structured"] as const;

export const aiJobReviewStatuses = [
  "unreviewed",
  "accepted",
  "edited",
  "rejected",
] as const;

export const aiTextSuggestionTypes = ["item", "box"] as const;

export const aiTextSuggestionStatuses = [
  "pending",
  "approved",
  "edited",
  "rejected",
] as const;

export const aiPhotoSuggestionTypes = [
  "item",
  "box",
  "boxContents",
  "duplicateCandidate",
  "evidenceGap",
] as const;

export const aiPhotoSuggestionStatuses = [
  "pending",
  "approved",
  "edited",
  "rejected",
] as const;

export const aiPlanningSuggestionTypes = ["estimate", "assignment"] as const;

export const aiPlanningSuggestionStatuses = [
  "pending",
  "approved",
  "edited",
  "rejected",
] as const;

export const documentationProfileTypes = [
  "personalFullRecord",
  "pcsMove",
  "movingCompany",
  "employerRelocation",
  "insuranceClaim",
  "donationPickup",
  "sellOrGiveaway",
  "storageInventory",
  "loadCrew",
] as const;

export const pcsBranches = [
  "army",
  "navy",
  "airForce",
  "marineCorps",
  "coastGuard",
  "spaceForce",
  "noaa",
  "publicHealthService",
  "other",
] as const;

export const pcsShipmentTypes = [
  "hhg",
  "ppm",
  "partialPpm",
  "storage",
  "mixed",
  "other",
] as const;

export const pcsDependentStatuses = [
  "withDependents",
  "withoutDependents",
  "unknown",
] as const;

export function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 2000) : undefined;
}

export function normalizeRuleList(rules: string[]) {
  return Array.from(
    new Set(
      rules
        .map((rule) => rule.trim())
        .filter(Boolean)
        .map((rule) => rule.slice(0, 160))
    )
  );
}

export function normalizeDocumentationProfileTypes(
  profileTypes: readonly (typeof documentationProfileTypes)[number][] | undefined
) {
  if (!profileTypes?.length) {
    return [];
  }

  const allowed = new Set(documentationProfileTypes);
  return Array.from(
    new Set(profileTypes.filter((type) => allowed.has(type)))
  );
}

/**
 * Validate and normalize a planning-default tag list written by an agent.
 *
 * These tags are the vocabulary a connected AI uses to say "this belonging is
 * first-night essential", "do not let movers touch this", "this needs evidence
 * before loading". Every downstream consumer — packets, inventory filters, the
 * load planner, `moveQuestions` — reads them as a closed set, so an unknown key
 * must be **refused**, never silently stored: a stored typo would look like a
 * successful tag to the AI and to the person, and would then be invisible to
 * every filter that was supposed to act on it.
 *
 * `undefined` in, `undefined` out. The caller uses that to mean "the field was
 * absent from this write, leave whatever is stored alone" — which is what keeps
 * a partial correction (say, of a room name) from erasing tags it never
 * mentioned. An explicit empty array is a deliberate clear.
 */
export function normalizePlanningDefaultKeys(
  value: readonly string[] | undefined,
  options: {
    label?: string;
    error?: (message: string) => Error;
  } = {}
): PlanningDefaultKeyValue[] | undefined {
  if (value === undefined) return undefined;
  const label = options.label ?? "planningDefaultKeys";
  const fail = options.error ?? ((message: string) => new Error(message));
  if (!Array.isArray(value)) {
    throw fail(`${label} must be an array of planning default keys.`);
  }
  const allowed = new Set<string>(planningDefaultKeys);
  const normalized: PlanningDefaultKeyValue[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !allowed.has(entry)) {
      throw fail(
        `Unsupported ${label} value ${JSON.stringify(entry)}. Use one of: ${planningDefaultKeys.join(", ")}.`
      );
    }
    const key = entry as PlanningDefaultKeyValue;
    if (!normalized.includes(key)) normalized.push(key);
  }
  return normalized;
}

export type PlanningDefaultKeyValue = (typeof planningDefaultKeys)[number];

type MovePatchInput = {
  title?: unknown;
  status?: unknown;
  origin?: unknown;
  destination?: unknown;
  distanceMiles?: unknown;
  travelMinutes?: unknown;
  dateStart?: unknown;
  dateEnd?: unknown;
  notes?: unknown;
  documentationProfileTypes?: unknown;
  moveLevelWeightAllowanceLb?: unknown;
};

type MovePatchOptions = {
  now?: number;
  error?: (message: string) => Error;
  archivedStatusMessage?: string;
};

function patchText(
  value: unknown,
  fieldName: string,
  error: (message: string) => Error,
) {
  if (value === null) return undefined;
  if (typeof value !== "string") {
    throw error(`${fieldName} must be a string.`);
  }
  return normalizeOptionalText(value);
}

function patchRequiredTitle(value: unknown, error: (message: string) => Error) {
  if (typeof value !== "string") {
    throw error("title must be a string.");
  }
  const title = value.trim();
  if (!title) throw error("title cannot be empty.");
  return title.slice(0, 2000);
}

function patchFiniteNumber(
  value: unknown,
  fieldName: "distanceMiles" | "travelMinutes",
  error: (message: string) => Error,
) {
  if (value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  throw error(`${fieldName} must be a non-negative number, or null to clear.`);
}

function patchPositiveNumber(
  value: unknown,
  fieldName: "moveLevelWeightAllowanceLb",
  error: (message: string) => Error,
) {
  if (value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  throw error(`${fieldName} must be a positive number, or null to clear.`);
}

function patchDocumentationProfiles(
  value: unknown,
  error: (message: string) => Error,
) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw error("documentationProfileTypes must be an array.");
  }
  const allowed = new Set<string>(documentationProfileTypes);
  const entries: (typeof documentationProfileTypes)[number][] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !allowed.has(entry)) {
      throw error("Unsupported documentationProfileTypes value.");
    }
    entries.push(entry as (typeof documentationProfileTypes)[number]);
  }
  return normalizeDocumentationProfileTypes(entries);
}

export function buildMovePatch(
  input: MovePatchInput,
  options: MovePatchOptions = {},
): Partial<Doc<"moves">> {
  const error = options.error ?? ((message: string) => new Error(message));
  const patch: Partial<Doc<"moves">> = { updatedAt: options.now ?? Date.now() };
  if (input.title !== undefined) patch.title = patchRequiredTitle(input.title, error);
  if (input.status !== undefined) {
    if (
      input.status !== "planning" &&
      input.status !== "active" &&
      input.status !== "completed"
    ) {
      if (input.status === "archived") {
        throw error(
          options.archivedStatusMessage ??
            "Archiving a move isn't supported via PATCH — archive it in the app.",
        );
      }
      throw error("status must be one of planning|active|completed.");
    }
    patch.status = input.status;
  }
  if (input.origin !== undefined) patch.origin = patchText(input.origin, "origin", error);
  if (input.destination !== undefined) {
    patch.destination = patchText(input.destination, "destination", error);
  }
  if (input.distanceMiles !== undefined) {
    patch.distanceMiles = patchFiniteNumber(input.distanceMiles, "distanceMiles", error);
  }
  if (input.travelMinutes !== undefined) {
    patch.travelMinutes = patchFiniteNumber(input.travelMinutes, "travelMinutes", error);
  }
  if (input.dateStart !== undefined) {
    patch.dateStart = patchText(input.dateStart, "dateStart", error);
  }
  if (input.dateEnd !== undefined) {
    patch.dateEnd = patchText(input.dateEnd, "dateEnd", error);
  }
  if (input.notes !== undefined) {
    const notes = patchText(input.notes, "notes", error);
    if (input.notes === null || notes !== undefined) {
      patch.notes = notes;
    }
  }
  if (input.documentationProfileTypes !== undefined) {
    patch.documentationProfileTypes = patchDocumentationProfiles(
      input.documentationProfileTypes,
      error,
    );
  }
  if (input.moveLevelWeightAllowanceLb !== undefined) {
    patch.moveLevelWeightAllowanceLb = patchPositiveNumber(
      input.moveLevelWeightAllowanceLb,
      "moveLevelWeightAllowanceLb",
      error,
    );
  }
  return patch;
}

export function defaultDocumentationProfilesForMoveType(
  type: (typeof moveTypes)[number]
) {
  switch (type) {
    case "pcs":
      return ["pcsMove", "movingCompany", "loadCrew"] as const;
    case "local":
    case "longDistance":
      return ["movingCompany", "loadCrew"] as const;
    case "storage":
      return ["storageInventory", "movingCompany"] as const;
    case "estate":
      return ["donationPickup", "sellOrGiveaway", "storageInventory"] as const;
    case "decluttering":
      return ["donationPickup", "sellOrGiveaway"] as const;
    case "claimsInventory":
      return ["insuranceClaim", "personalFullRecord"] as const;
    case "other":
      return ["personalFullRecord"] as const;
  }
}

export function normalizeSortOrder(sortOrder: number | undefined) {
  return typeof sortOrder === "number" && Number.isFinite(sortOrder)
    ? sortOrder
    : Date.now();
}

export const moveTypeValidator = v.union(
  v.literal("pcs"),
  v.literal("local"),
  v.literal("longDistance"),
  v.literal("storage"),
  v.literal("estate"),
  v.literal("decluttering"),
  v.literal("claimsInventory"),
  v.literal("other")
);

export const moveStatusValidator = v.union(
  v.literal("planning"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("archived")
);

export const unitSystemValidator = v.union(
  v.literal("imperial"),
  v.literal("metric")
);

export const documentationProfileTypeValidator = v.union(
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

export const pcsBranchValidator = v.union(
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

export const pcsShipmentTypeValidator = v.union(
  v.literal("hhg"),
  v.literal("ppm"),
  v.literal("partialPpm"),
  v.literal("storage"),
  v.literal("mixed"),
  v.literal("other")
);

export const pcsDependentStatusValidator = v.union(
  v.literal("withDependents"),
  v.literal("withoutDependents"),
  v.literal("unknown")
);

export const transportResourceTypeValidator = v.union(
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

export const transportResourcePresetKeyValidator = v.union(
  v.literal("boxTruck"),
  v.literal("pickupTruck"),
  v.literal("trailer7x16"),
  v.literal("personalVehicle"),
  v.literal("professionalMovers"),
  v.literal("militaryMovers"),
  v.literal("storageUnit"),
  v.literal("sell"),
  v.literal("donate"),
  v.literal("dump"),
  v.literal("freeGiveaway"),
  v.literal("unknown")
);

export const planningDefaultKeyValidator = v.union(
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

export const planningDefaultHandlingValidator = v.union(
  v.literal("personalTransport"),
  v.literal("keepAccessible"),
  v.literal("evidenceRequired"),
  v.literal("restrictedReview"),
  v.literal("moverAllowedWithReview")
);

export const itemDispositionValidator = v.union(
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

export const itemStatusValidator = v.union(
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

export const itemConditionValidator = v.union(
  v.literal("unknown"),
  v.literal("new"),
  v.literal("excellent"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("poor"),
  v.literal("damaged")
);

export const estimateConfidenceValidator = v.union(
  v.literal("none"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("manual"),
  v.literal("actual")
);

export const measurementProvenanceSourceValidator = v.union(
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

export const itemFragilityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high")
);

export const itemCreatedViaValidator = v.union(
  v.literal("manual"),
  v.literal("bulkImport"),
  v.literal("textAI"),
  v.literal("photoAI"),
  v.literal("api"),
  v.literal("mcp")
);

export const moveSpaceKindValidator = v.union(
  v.literal("originRoom"),
  v.literal("destinationRoom"),
  v.literal("yardOutdoor"),
  v.literal("storage"),
  v.literal("transportResource"),
  v.literal("transportZone"),
  v.literal("custom")
);

export const moveSpaceStatusValidator = v.union(
  v.literal("active"),
  v.literal("archived")
);

export const saleListingStatusValidator = v.union(
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

export const saleListingPlatformValidator = v.union(
  v.literal("facebookMarketplace"),
  v.literal("craigslist"),
  v.literal("offerUp"),
  v.literal("nextdoor"),
  v.literal("ebay"),
  v.literal("other")
);

export const saleResearchDepthValidator = v.union(
  v.literal("none"),
  v.literal("quick"),
  v.literal("standard"),
  v.literal("deep")
);

export const boxStatusValidator = v.union(
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

export const photoTypeValidator = v.union(
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

export const photoPrivacyLevelValidator = v.union(
  v.literal("normal"),
  v.literal("moverVisible"),
  v.literal("reportVisible"),
  v.literal("claimOnly"),
  v.literal("sensitive"),
  v.literal("hiddenFromGuests"),
  v.literal("private")
);

export const photoVisibilityScopeValidator = v.union(
  v.literal("household"),
  v.literal("moveCollaborators"),
  v.literal("documentationScoped"),
  v.literal("private")
);

export const photoSourceValidator = v.union(
  v.literal("manualUpload"),
  v.literal("photoAI"),
  v.literal("api"),
  v.literal("mcp"),
  v.literal("import")
);

export const exifHandlingStatusValidator = v.union(
  v.literal("pending"),
  v.literal("stripped"),
  v.literal("retained"),
  v.literal("failed"),
  v.literal("notApplicable")
);

export const photoVerificationStatusValidator = v.union(
  v.literal("unreviewed"),
  v.literal("verified"),
  v.literal("needsReview"),
  v.literal("rejected")
);

export const aiJobTypeValidator = v.union(
  v.literal("photoIntake"),
  v.literal("inventoryExtraction"),
  v.literal("itemCategorization"),
  v.literal("loadPlanSuggestions"),
  v.literal("documentationDraft"),
  v.literal("claimsReview"),
  v.literal("generalReview")
);

export const aiJobStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("canceled")
);

export const aiJobModalityValidator = v.union(
  v.literal("text"),
  v.literal("vision"),
  v.literal("structured")
);

export const aiJobReviewStatusValidator = v.union(
  v.literal("unreviewed"),
  v.literal("accepted"),
  v.literal("edited"),
  v.literal("rejected")
);

export const aiTextSuggestionTypeValidator = v.union(
  v.literal("item"),
  v.literal("box")
);

export const aiTextSuggestionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("edited"),
  v.literal("rejected")
);

export const aiPhotoSuggestionTypeValidator = v.union(
  v.literal("item"),
  v.literal("box"),
  v.literal("boxContents"),
  v.literal("duplicateCandidate"),
  v.literal("evidenceGap")
);

export const aiPhotoSuggestionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("edited"),
  v.literal("rejected")
);

export const aiPlanningSuggestionTypeValidator = v.union(
  v.literal("estimate"),
  v.literal("assignment")
);

export const aiPlanningSuggestionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("edited"),
  v.literal("rejected")
);

export function normalizeItemName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 160);
}

export function normalizedSearchName(name: string) {
  return normalizeItemName(name).toLowerCase();
}

export function normalizeBoxCode(code: string) {
  return code
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 24);
}

// Items use a full-word "item-0000" denotation, distinct from the letter-prefixed
// unit codes (B = box, T = tote, …). Zero-padded to 4 digits.
export function formatItemCode(sequence: number) {
  return `item-${String(Math.max(1, Math.trunc(sequence))).padStart(4, "0")}`;
}

// A unit (box/tote/…) code may never start with the letter "I": that prefix is
// reserved so a unit code can't be mistaken for an item code (item-0001).
export function isReservedUnitCode(code: string) {
  return code.trim().toUpperCase().startsWith("I");
}

export const movePersonRoleValidator = v.union(
  v.literal("owner"),
  v.literal("householdMember"),
  v.literal("helper"),
  v.literal("mover"),
  v.literal("contact")
);

export const capacityReviewStatusValidator = v.union(
  v.literal("unreviewed"),
  v.literal("estimated"),
  v.literal("confirmed")
);

export const dimensionsValidator = v.object({
  lengthIn: v.optional(v.number()),
  widthIn: v.optional(v.number()),
  heightIn: v.optional(v.number()),
});

export const capacityValidator = v.object({
  maxWeightLb: v.optional(v.number()),
  maxVolumeCuFt: v.optional(v.number()),
  maxAreaSqFt: v.optional(v.number()),
  dimensions: v.optional(dimensionsValidator),
  weightIsUnlimited: v.optional(v.boolean()),
  volumeIsUnlimited: v.optional(v.boolean()),
});

// Structured start/end location for a move. All subfields optional so the
// column can be present-but-partial; moves.origin/destination strings are kept
// for back-compat and remain the canonical values for the public MCP/REST contract.
export const structuredLocationValidator = v.object({
  label: v.optional(v.string()),
  street: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  country: v.optional(v.string()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
});

export const transportTripStatuses = [
  "planned",
  "loaded",
  "departed",
  "arrived",
  "unloaded",
  "cancelled",
] as const;

export const transportTripStatusValidator = v.union(
  v.literal("planned"),
  v.literal("loaded"),
  v.literal("departed"),
  v.literal("arrived"),
  v.literal("unloaded"),
  v.literal("cancelled")
);

export function normalizeStructuredLocation(
  location:
    | {
        label?: string;
        street?: string;
        city?: string;
        state?: string;
        postalCode?: string;
        country?: string;
        latitude?: number;
        longitude?: number;
      }
    | undefined
) {
  if (!location) {
    return undefined;
  }
  const normalized = {
    label: normalizeOptionalText(location.label),
    street: normalizeOptionalText(location.street),
    city: normalizeOptionalText(location.city),
    state: normalizeOptionalText(location.state),
    postalCode: normalizeOptionalText(location.postalCode),
    country: normalizeOptionalText(location.country),
    latitude:
      typeof location.latitude === "number" && Number.isFinite(location.latitude)
        ? location.latitude
        : undefined,
    longitude:
      typeof location.longitude === "number" &&
      Number.isFinite(location.longitude)
        ? location.longitude
        : undefined,
  };
  const hasAny = Object.values(normalized).some((value) => value !== undefined);
  return hasAny ? normalized : undefined;
}

// Derive a human-readable single-line address string from structured fields,
// used for back-compat write-through into moves.origin / moves.destination.
export function structuredLocationToDisplay(
  location:
    | {
        label?: string;
        street?: string;
        city?: string;
        state?: string;
        postalCode?: string;
        country?: string;
      }
    | undefined
) {
  if (!location) {
    return undefined;
  }
  if (location.label?.trim()) {
    return location.label.trim().slice(0, 2000);
  }
  const cityState = [location.city?.trim(), location.state?.trim()]
    .filter(Boolean)
    .join(", ");
  const parts = [
    location.street?.trim(),
    cityState,
    location.postalCode?.trim(),
    location.country?.trim(),
  ].filter(Boolean);
  const display = parts.join(" · ");
  return display ? display.slice(0, 2000) : undefined;
}

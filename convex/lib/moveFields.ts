import { v } from "convex/values";

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

export const itemFragilities = ["low", "medium", "high"] as const;

export const itemCreatedViaValues = [
  "manual",
  "bulkImport",
  "photoAI",
  "api",
  "mcp",
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

export const itemFragilityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high")
);

export const itemCreatedViaValidator = v.union(
  v.literal("manual"),
  v.literal("bulkImport"),
  v.literal("photoAI"),
  v.literal("api"),
  v.literal("mcp")
);

export function normalizeItemName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 160);
}

export function normalizedSearchName(name: string) {
  return normalizeItemName(name).toLowerCase();
}

export const movePersonRoleValidator = v.union(
  v.literal("owner"),
  v.literal("householdMember"),
  v.literal("helper"),
  v.literal("mover"),
  v.literal("contact")
);

export const dimensionsValidator = v.object({
  lengthIn: v.optional(v.number()),
  widthIn: v.optional(v.number()),
  heightIn: v.optional(v.number()),
});

export const capacityValidator = v.object({
  maxWeightLb: v.optional(v.number()),
  maxVolumeCuFt: v.optional(v.number()),
  dimensions: v.optional(dimensionsValidator),
  weightIsUnlimited: v.optional(v.boolean()),
  volumeIsUnlimited: v.optional(v.boolean()),
});

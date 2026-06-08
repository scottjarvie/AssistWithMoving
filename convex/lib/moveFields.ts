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
  "storage",
  "dump",
  "sell",
  "donate",
  "free",
  "unknown",
  "custom",
] as const;

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

export const transportResourceTypeValidator = v.union(
  v.literal("truck"),
  v.literal("trailer"),
  v.literal("personalVehicle"),
  v.literal("professionalMovers"),
  v.literal("storage"),
  v.literal("dump"),
  v.literal("sell"),
  v.literal("donate"),
  v.literal("free"),
  v.literal("unknown"),
  v.literal("custom")
);

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

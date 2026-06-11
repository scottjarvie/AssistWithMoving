import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import {
  documentationProfileTypes,
  itemDispositions,
  itemStatuses,
  normalizeOptionalText,
  planningDefaultKeys,
} from "./moveFields";

export const documentationFieldKeys = [
  "moveSummary",
  "pcsFields",
  "rooms",
  "items",
  "boxes",
  "loadAssignments",
  "photos",
  "estimatedValues",
  "purchaseValues",
  "serialNumbers",
  "privateNotes",
  "conditionAndDamage",
  "auditSummary",
] as const;

export const documentationImageRules = [
  "none",
  "thumbsOnly",
  "reviewedEvidence",
  "allAllowed",
] as const;

export const shareLinkActions = [
  "view",
  "viewPlan",
  "download",
  "statusUpdate",
  "comment",
  "uploadEvidence",
] as const;

export const documentationProfileStatuses = [
  "draft",
  "active",
  "archived",
] as const;

export const shareLinkStatuses = ["active", "revoked"] as const;

export const shareLinkScopes = ["move", "profile"] as const;

export type DocumentationProfileType = (typeof documentationProfileTypes)[number];
export type DocumentationFieldKey = (typeof documentationFieldKeys)[number];
export type DocumentationImageRule = (typeof documentationImageRules)[number];
export type ShareLinkAction = (typeof shareLinkActions)[number];
export type DocumentationProfileStatus =
  (typeof documentationProfileStatuses)[number];
export type ShareLinkStatus = (typeof shareLinkStatuses)[number];
export type ShareLinkScope = (typeof shareLinkScopes)[number];

export type DocumentationFilters = {
  dispositions?: (typeof itemDispositions)[number][];
  statuses?: (typeof itemStatuses)[number][];
  planningDefaultKeys?: (typeof planningDefaultKeys)[number][];
  room?: string;
  destinationRoom?: string;
};

export type DocumentationProfileConfig = {
  name: string;
  includedFields: DocumentationFieldKey[];
  imageRule: DocumentationImageRule;
  filters: DocumentationFilters;
  allowedActions: ShareLinkAction[];
  disclaimer?: string;
};

export const documentationFieldKeyValidator = v.union(
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

export const documentationImageRuleValidator = v.union(
  v.literal("none"),
  v.literal("thumbsOnly"),
  v.literal("reviewedEvidence"),
  v.literal("allAllowed")
);

export const shareLinkActionValidator = v.union(
  v.literal("view"),
  v.literal("viewPlan"),
  v.literal("download"),
  v.literal("statusUpdate"),
  v.literal("comment"),
  v.literal("uploadEvidence")
);

export const documentationProfileStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived")
);

export const shareLinkStatusValidator = v.union(
  v.literal("active"),
  v.literal("revoked")
);

export const shareLinkScopeValidator = v.union(
  v.literal("move"),
  v.literal("profile")
);

export const documentationFiltersValidator = v.object({
  dispositions: v.optional(
    v.array(
      v.union(
        v.literal("undecided"),
        v.literal("take"),
        v.literal("sell"),
        v.literal("donate"),
        v.literal("dump"),
        v.literal("free"),
        v.literal("storage"),
        v.literal("mover"),
        v.literal("personalTransport")
      )
    )
  ),
  statuses: v.optional(
    v.array(
      v.union(
        v.literal("draft"),
        v.literal("active"),
        v.literal("packed"),
        v.literal("staged"),
        v.literal("loaded"),
        v.literal("delivered"),
        v.literal("missing"),
        v.literal("damaged"),
        v.literal("archived")
      )
    )
  ),
  planningDefaultKeys: v.optional(
    v.array(
      v.union(
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
      )
    )
  ),
  room: v.optional(v.string()),
  destinationRoom: v.optional(v.string()),
});

const defaultDisclaimer =
  "This packet is a scoped move record. It may omit private fields, unrelated household data, or photos that were not selected for this recipient.";

export function defaultDocumentationProfileConfig(
  type: DocumentationProfileType
): DocumentationProfileConfig {
  switch (type) {
    case "personalFullRecord":
      return {
        name: "Personal full record",
        includedFields: [...documentationFieldKeys],
        imageRule: "allAllowed",
        filters: {},
        allowedActions: ["view", "download"],
      };
    case "pcsMove":
      return {
        name: "PCS / HHG / PPM support",
        includedFields: [
          "moveSummary",
          "pcsFields",
          "items",
          "boxes",
          "loadAssignments",
          "photos",
          "estimatedValues",
          "conditionAndDamage",
          "auditSummary",
        ],
        imageRule: "reviewedEvidence",
        filters: {},
        allowedActions: ["view", "download", "uploadEvidence"],
        disclaimer: defaultDisclaimer,
      };
    case "movingCompany":
      return {
        name: "Moving company",
        includedFields: [
          "moveSummary",
          "rooms",
          "items",
          "boxes",
          "loadAssignments",
          "photos",
          "conditionAndDamage",
        ],
        imageRule: "thumbsOnly",
        filters: { dispositions: ["take", "mover"] },
        allowedActions: ["view", "download", "statusUpdate", "uploadEvidence"],
        disclaimer: defaultDisclaimer,
      };
    case "employerRelocation":
      return {
        name: "Employer relocation",
        includedFields: [
          "moveSummary",
          "items",
          "boxes",
          "loadAssignments",
          "estimatedValues",
        ],
        imageRule: "none",
        filters: {},
        allowedActions: ["view", "download"],
        disclaimer: defaultDisclaimer,
      };
    case "insuranceClaim":
      return {
        name: "Insurance / claims",
        includedFields: [
          "moveSummary",
          "items",
          "boxes",
          "photos",
          "estimatedValues",
          "purchaseValues",
          "serialNumbers",
          "conditionAndDamage",
          "auditSummary",
        ],
        imageRule: "reviewedEvidence",
        filters: { statuses: ["missing", "damaged"] },
        allowedActions: ["view", "download", "uploadEvidence"],
        disclaimer: defaultDisclaimer,
      };
    case "donationPickup":
      return {
        name: "Donation pickup",
        includedFields: ["moveSummary", "items", "boxes", "photos"],
        imageRule: "thumbsOnly",
        filters: { dispositions: ["donate"] },
        allowedActions: ["view", "download", "statusUpdate"],
        disclaimer: defaultDisclaimer,
      };
    case "sellOrGiveaway":
      return {
        name: "Sell / giveaway",
        includedFields: ["items", "photos", "conditionAndDamage"],
        imageRule: "thumbsOnly",
        filters: { dispositions: ["sell", "free"] },
        allowedActions: ["view", "comment"],
        disclaimer: defaultDisclaimer,
      };
    case "storageInventory":
      return {
        name: "Storage manifest",
        includedFields: [
          "moveSummary",
          "rooms",
          "items",
          "boxes",
          "loadAssignments",
          "photos",
        ],
        imageRule: "thumbsOnly",
        filters: { dispositions: ["storage"] },
        allowedActions: ["view", "download", "statusUpdate"],
        disclaimer: defaultDisclaimer,
      };
    case "loadCrew":
      return {
        name: "Load crew",
        includedFields: [
          "moveSummary",
          "rooms",
          "boxes",
          "loadAssignments",
          "photos",
          "conditionAndDamage",
        ],
        imageRule: "thumbsOnly",
        filters: {},
        allowedActions: ["view", "statusUpdate", "uploadEvidence"],
        disclaimer: defaultDisclaimer,
      };
  }
}

export function normalizeDocumentationProfileConfig({
  type,
  name,
  includedFields,
  imageRule,
  filters,
  allowedActions,
  disclaimer,
}: {
  type: DocumentationProfileType;
  name?: string;
  includedFields?: DocumentationFieldKey[];
  imageRule?: DocumentationImageRule;
  filters?: DocumentationFilters;
  allowedActions?: ShareLinkAction[];
  disclaimer?: string;
}) {
  const defaults = defaultDocumentationProfileConfig(type);

  return {
    name: normalizeOptionalText(name) ?? defaults.name,
    includedFields: normalizeAllowedList(
      includedFields,
      documentationFieldKeys,
      defaults.includedFields
    ),
    imageRule: imageRule ?? defaults.imageRule,
    filters: normalizeDocumentationFilters(filters ?? defaults.filters),
    allowedActions: normalizeAllowedList(
      allowedActions,
      shareLinkActions,
      defaults.allowedActions
    ),
    disclaimer:
      normalizeOptionalText(disclaimer) ??
      normalizeOptionalText(defaults.disclaimer),
  };
}

export function normalizeDocumentationFilters(
  filters: DocumentationFilters | undefined
) {
  const normalized: DocumentationFilters = {};
  const dispositions = normalizeAllowedList(
    filters?.dispositions,
    itemDispositions
  );
  const statuses = normalizeAllowedList(filters?.statuses, itemStatuses);
  const normalizedPlanningDefaultKeys = normalizeAllowedList(
    filters?.planningDefaultKeys,
    planningDefaultKeys
  );
  const room = normalizeOptionalText(filters?.room);
  const destinationRoom = normalizeOptionalText(filters?.destinationRoom);

  if (dispositions.length) normalized.dispositions = dispositions;
  if (statuses.length) normalized.statuses = statuses;
  if (normalizedPlanningDefaultKeys.length) {
    normalized.planningDefaultKeys = normalizedPlanningDefaultKeys;
  }
  if (room) normalized.room = room;
  if (destinationRoom) normalized.destinationRoom = destinationRoom;

  return normalized;
}

export function normalizeShareLinkActions(
  actions: ShareLinkAction[] | undefined,
  profileAllowedActions: ShareLinkAction[]
) {
  const requested = normalizeAllowedList(
    actions,
    shareLinkActions,
    profileAllowedActions
  );
  const profileAllowed = new Set(profileAllowedActions);
  const constrained = requested.filter((action) => profileAllowed.has(action));
  return constrained.length ? constrained : [...profileAllowedActions];
}

export function assertShareLinkActive(
  link: {
    status: ShareLinkStatus;
    expiresAt: number;
    revokedAt?: number;
  },
  now = Date.now()
) {
  if (link.status === "revoked" || link.revokedAt) {
    throw new Error("Share link has been revoked.");
  }
  if (link.expiresAt <= now) {
    throw new Error("Share link has expired.");
  }
}

export async function hashShareToken(token: string) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateShareToken() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function shareTokenPreview(token: string) {
  return token.slice(-8);
}

export function safeShareLinkResult(args: {
  shareLinkId: Id<"shareLinks">;
  token: string;
}) {
  return {
    shareLinkId: args.shareLinkId,
    token: args.token,
    tokenPreview: shareTokenPreview(args.token),
  };
}

function normalizeAllowedList<TValue extends string>(
  values: readonly TValue[] | undefined,
  allowed: readonly TValue[],
  fallback: readonly TValue[] = []
) {
  const allowedSet = new Set(allowed);
  const normalized = Array.from(
    new Set((values ?? []).filter((value) => allowedSet.has(value)))
  );
  return normalized.length ? normalized : [...fallback];
}

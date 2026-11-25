// Ordered value lists used by Moving's backend and API-key connector.

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
];

export const aiPlanningSuggestionStatuses = [
  "pending",
  "approved",
  "edited",
  "rejected",
];

export const aiJobStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
];

export const aiTextSuggestionStatuses = [
  "pending",
  "approved",
  "edited",
  "rejected",
];

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
];

export const itemFragilities = ["low", "medium", "high"];

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
];

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
];

export const estimateConfidences = [
  "none",
  "low",
  "medium",
  "high",
  "manual",
  "actual",
];

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
];

export const moveSpaceKinds = [
  "originRoom",
  "destinationRoom",
  "yardOutdoor",
  "storage",
  "transportResource",
  "transportZone",
  "custom",
];

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
];

export const saleListingPlatforms = [
  "facebookMarketplace",
  "craigslist",
  "offerUp",
  "nextdoor",
  "ebay",
  "other",
];

export const saleResearchDepths = [
  "none",
  "quick",
  "standard",
  "deep",
];

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
];

export const documentationImageRules = [
  "none",
  "thumbsOnly",
  "reviewedEvidence",
  "allAllowed",
];

export const documentationProfileStatuses = [
  "draft",
  "active",
  "archived",
];

export const shareLinkActions = [
  "view",
  "viewPlan",
  "download",
  "statusUpdate",
  "comment",
  "uploadEvidence",
];

export const shareLinkStatuses = ["active", "revoked"];

export const shareLinkScopes = ["move", "profile"];

export const boxContainerTypes = [
  "carton",
  "plasticTote",
  "bin",
  "wardrobe",
  "dishPack",
  "crate",
  "other",
];

export const exportJobTypes = [
  "inventory",
  "boxes",
  "assignments",
  "documentationProfile",
];

export const shareLinkRoles = [
  "owner",
  "admin",
  "editor",
  "packer",
  "viewer",
  "guest",
];

export const plannedItemStatuses = [
  "idea",
  "decided",
  "purchased",
  "dropped",
];

export const movePersonRoles = [
  "owner",
  "householdMember",
  "helper",
  "mover",
  "contact",
];

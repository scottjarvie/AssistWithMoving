export const itemDispositionOptions = [
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

export const itemStatusOptions = [
  "draft",
  "active",
  "packed",
  "loaded",
  "delivered",
  "missing",
  "damaged",
  "archived",
] as const;

export const itemConditionOptions = [
  "unknown",
  "new",
  "excellent",
  "good",
  "fair",
  "poor",
  "damaged",
] as const;

export const estimateConfidenceOptions = [
  "none",
  "low",
  "medium",
  "high",
  "manual",
  "actual",
] as const;

export const itemFragilityOptions = ["low", "medium", "high"] as const;

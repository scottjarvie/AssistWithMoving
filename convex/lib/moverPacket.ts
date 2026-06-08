export type MoverPacketMode = "movingCompany" | "loadCrew" | "owner";

export type MoverPacketItemInput = {
  name: string;
  quantity: number;
  room?: string;
  destinationRoom?: string;
  status: string;
  condition: string;
  disposition: string;
  fragility: "low" | "medium" | "high";
  highValue: boolean;
  hazardousFlag: boolean;
  requiresPersonalTransport: boolean;
  planningDefaultKeys: string[];
  needsReview: boolean;
  reviewFlags: string[];
};

export function moverFlagsForItem(item: MoverPacketItemInput) {
  const flags = new Set<string>();
  if (item.fragility === "high") flags.add("fragile");
  if (item.highValue || item.planningDefaultKeys.includes("highValue")) {
    flags.add("high value");
  }
  if (
    item.requiresPersonalTransport ||
    item.disposition === "personalTransport" ||
    item.planningDefaultKeys.includes("doNotLetMoversTouch")
  ) {
    flags.add("do not move");
  }
  if (item.planningDefaultKeys.includes("firstNight")) flags.add("first night");
  if (item.hazardousFlag || item.planningDefaultKeys.includes("restrictedReview")) {
    flags.add("restricted review");
  }
  if (item.status === "damaged" || item.condition === "damaged") {
    flags.add("damage noted");
  }
  if (item.status === "missing") flags.add("missing");
  if (item.needsReview || item.reviewFlags.length) flags.add("needs review");
  return Array.from(flags);
}

export function moverBoxExceptionLevel({
  flags,
  warnings,
  assignedResource,
}: {
  flags: string[];
  warnings: string[];
  assignedResource?: string;
}) {
  if (warnings.length || flags.includes("do not move") || flags.includes("missing")) {
    return "blocker";
  }
  if (!assignedResource || flags.length) {
    return "attention";
  }
  return "clear";
}

export function shouldShowMoverContents(mode: MoverPacketMode) {
  return mode !== "loadCrew";
}

export function shouldShowMoverPrivateFields(mode: MoverPacketMode) {
  return mode === "owner";
}

export type DispositionPipelineKind =
  | "sell"
  | "free"
  | "donate"
  | "dump"
  | "storage";

export type DispositionPipelineItem = {
  itemId: string;
  name: string;
  room?: string;
  category?: string;
  disposition: string;
  status: string;
  quantity: number;
  valueCents?: number;
  replacementValueCents?: number;
  deletedAt?: number;
};

export type DispositionPipelineBox = {
  boxId: string;
  code?: string;
  assignedResourceId?: string;
  status: string;
  archivedAt?: number;
};

export type DispositionPipelineMembership = {
  itemId: string;
  boxId: string;
};

export type DispositionPipelinePhoto = {
  itemId?: string;
  archivedAt?: number;
};

export type DispositionPipelineResource = {
  resourceId: string;
  type: string;
  archivedAt?: number;
};

export type DispositionPipelineProfile = {
  profileId: string;
  type: string;
  status: string;
  archivedAt?: number;
};

export type DispositionPipelineShareLink = {
  shareLinkId: string;
  documentationProfileId?: string;
  status: string;
  expiresAt: number;
  revokedAt?: number;
};

export type DispositionPipelineInput = {
  items: DispositionPipelineItem[];
  boxes: DispositionPipelineBox[];
  memberships: DispositionPipelineMembership[];
  photos: DispositionPipelinePhoto[];
  resources: DispositionPipelineResource[];
  profiles: DispositionPipelineProfile[];
  shareLinks: DispositionPipelineShareLink[];
  now: number;
};

export type DispositionPipelineAction = {
  key: string;
  label: string;
  count: number;
  severity: "ok" | "info" | "warning" | "critical";
  anchor: string;
  help: string;
};

export type DispositionPipelineHighlight = {
  itemId: string;
  name: string;
  room?: string;
  category?: string;
  status: string;
  quantity: number;
  hasPhoto: boolean;
  boxed: boolean;
  assignedToPipeline: boolean;
};

export type DispositionPipelineGroup = {
  key: DispositionPipelineKind;
  label: string;
  description: string;
  profileType?: "donationPickup" | "sellOrGiveaway" | "storageInventory";
  manifestKind?: "donation" | "sellFree" | "storage";
  itemCount: number;
  quantity: number;
  totalValueCents: number;
  photoCount: number;
  boxedCount: number;
  assignedCount: number;
  readyCount: number;
  activeProfileCount: number;
  activeShareLinkCount: number;
  actions: DispositionPipelineAction[];
  highlights: DispositionPipelineHighlight[];
};

export type DispositionPipelineSummary = {
  groups: DispositionPipelineGroup[];
  topActions: Array<DispositionPipelineAction & { groupKey: DispositionPipelineKind; groupLabel: string }>;
  counts: {
    itemCount: number;
    quantity: number;
    actionCount: number;
    readyCount: number;
    activeShareLinkCount: number;
    totalValueCents: number;
  };
};

const groupConfigs: Record<
  DispositionPipelineKind,
  {
    label: string;
    description: string;
    profileType?: DispositionPipelineGroup["profileType"];
    manifestKind?: DispositionPipelineGroup["manifestKind"];
    resourceTypes: string[];
  }
> = {
  sell: {
    label: "Sell",
    description: "Items intended for sale, listing, and buyer pickup.",
    profileType: "sellOrGiveaway",
    manifestKind: "sellFree",
    resourceTypes: ["sell"],
  },
  free: {
    label: "Free / giveaway",
    description: "Items offered through a limited pickup or giveaway link.",
    profileType: "sellOrGiveaway",
    manifestKind: "sellFree",
    resourceTypes: ["free", "freeGiveaway"],
  },
  donate: {
    label: "Donation",
    description: "Donation pickup, drop-off, and delivered records.",
    profileType: "donationPickup",
    manifestKind: "donation",
    resourceTypes: ["donate"],
  },
  dump: {
    label: "Dump run",
    description: "Disposal items that need a dump or special-disposal run.",
    resourceTypes: ["dump"],
  },
  storage: {
    label: "Storage",
    description: "Items leaving the living space for storage inventory.",
    profileType: "storageInventory",
    manifestKind: "storage",
    resourceTypes: ["storage"],
  },
};

const pickupProgressStatuses = new Set(["staged", "loaded", "delivered"]);
const completeStatuses = new Set(["delivered"]);

export function summarizeDispositionPipelines(
  input: DispositionPipelineInput
): DispositionPipelineSummary {
  const activeItems = input.items.filter(
    (item) => !item.deletedAt && item.status !== "archived"
  );
  const activeBoxes = input.boxes.filter((box) => !box.archivedAt);
  const activeBoxById = new Map(activeBoxes.map((box) => [box.boxId, box]));
  const activeResources = input.resources.filter((resource) => !resource.archivedAt);
  const resourceTypeById = new Map(
    activeResources.map((resource) => [resource.resourceId, resource.type])
  );
  const activePhotosByItemId = groupActivePhotosByItemId(input.photos);
  const activeProfiles = input.profiles.filter(
    (profile) => profile.status === "active" && !profile.archivedAt
  );
  const activeLinksByProfileId = groupActiveLinksByProfileId(input.shareLinks, input.now);
  const membershipByItemId = new Map<string, DispositionPipelineMembership[]>();

  for (const membership of input.memberships) {
    if (!activeBoxById.has(membership.boxId)) {
      continue;
    }
    const current = membershipByItemId.get(membership.itemId) ?? [];
    current.push(membership);
    membershipByItemId.set(membership.itemId, current);
  }

  const groups = dispositionPipelineKinds().map((key) => {
    const config = groupConfigs[key];
    const groupItems = activeItems.filter((item) => item.disposition === key);
    const activeProfileIds = activeProfiles
      .filter((profile) => profile.type === config.profileType)
      .map((profile) => profile.profileId);
    const activeShareLinkCount = activeProfileIds.reduce(
      (sum, profileId) => sum + (activeLinksByProfileId.get(profileId)?.length ?? 0),
      0
    );
    const enrichedItems = groupItems.map((item) =>
      enrichPipelineItem({
        item,
        memberships: membershipByItemId.get(item.itemId) ?? [],
        activeBoxById,
        activePhotosByItemId,
        resourceTypeById,
        pipelineResourceTypes: config.resourceTypes,
      })
    );
    const actions = actionsForGroup({
      key,
      items: enrichedItems,
      activeShareLinkCount,
    });

    return {
      key,
      label: config.label,
      description: config.description,
      profileType: config.profileType,
      manifestKind: config.manifestKind,
      itemCount: groupItems.length,
      quantity: groupItems.reduce((sum, item) => sum + item.quantity, 0),
      totalValueCents: groupItems.reduce(
        (sum, item) => sum + (item.valueCents ?? item.replacementValueCents ?? 0),
        0
      ),
      photoCount: enrichedItems.filter((item) => item.hasPhoto).length,
      boxedCount: enrichedItems.filter((item) => item.boxed).length,
      assignedCount: enrichedItems.filter((item) => item.assignedToPipeline).length,
      readyCount: readyCountForGroup(key, enrichedItems, activeShareLinkCount),
      activeProfileCount: activeProfileIds.length,
      activeShareLinkCount,
      actions,
      highlights: enrichedItems
        .filter((item) => !completeStatuses.has(item.status))
        .sort(comparePipelineHighlights)
        .slice(0, 5),
    };
  });

  const topActions = groups
    .flatMap((group) =>
      group.actions
        .filter((action) => action.count > 0)
        .map((action) => ({
          ...action,
          groupKey: group.key,
          groupLabel: group.label,
        }))
    )
    .sort((left, right) => {
      const severityDelta =
        severityRank(right.severity) - severityRank(left.severity);
      return severityDelta || right.count - left.count;
    })
    .slice(0, 6);

  return {
    groups,
    topActions,
    counts: {
      itemCount: groups.reduce((sum, group) => sum + group.itemCount, 0),
      quantity: groups.reduce((sum, group) => sum + group.quantity, 0),
      actionCount: groups.reduce(
        (sum, group) =>
          sum + group.actions.filter((action) => action.count > 0).length,
        0
      ),
      readyCount: groups.reduce((sum, group) => sum + group.readyCount, 0),
      activeShareLinkCount: groups.reduce(
        (sum, group) => sum + group.activeShareLinkCount,
        0
      ),
      totalValueCents: groups.reduce(
        (sum, group) => sum + group.totalValueCents,
        0
      ),
    },
  };
}

export function dispositionPipelineKinds(): DispositionPipelineKind[] {
  return ["sell", "free", "donate", "dump", "storage"];
}

function groupActivePhotosByItemId(photos: DispositionPipelinePhoto[]) {
  const byItemId = new Map<string, DispositionPipelinePhoto[]>();
  for (const photo of photos) {
    if (!photo.itemId || photo.archivedAt) {
      continue;
    }
    const current = byItemId.get(photo.itemId) ?? [];
    current.push(photo);
    byItemId.set(photo.itemId, current);
  }
  return byItemId;
}

function groupActiveLinksByProfileId(
  links: DispositionPipelineShareLink[],
  now: number
) {
  const byProfileId = new Map<string, DispositionPipelineShareLink[]>();
  for (const link of links) {
    if (
      !link.documentationProfileId ||
      link.status !== "active" ||
      link.revokedAt ||
      link.expiresAt <= now
    ) {
      continue;
    }
    const current = byProfileId.get(link.documentationProfileId) ?? [];
    current.push(link);
    byProfileId.set(link.documentationProfileId, current);
  }
  return byProfileId;
}

function enrichPipelineItem({
  item,
  memberships,
  activeBoxById,
  activePhotosByItemId,
  resourceTypeById,
  pipelineResourceTypes,
}: {
  item: DispositionPipelineItem;
  memberships: DispositionPipelineMembership[];
  activeBoxById: Map<string, DispositionPipelineBox>;
  activePhotosByItemId: Map<string, DispositionPipelinePhoto[]>;
  resourceTypeById: Map<string, string>;
  pipelineResourceTypes: string[];
}): DispositionPipelineHighlight {
  const activeBoxes = memberships
    .map((membership) => activeBoxById.get(membership.boxId))
    .filter((box): box is DispositionPipelineBox => Boolean(box));
  const assignedToPipeline = activeBoxes.some((box) => {
    const resourceType = box.assignedResourceId
      ? resourceTypeById.get(box.assignedResourceId)
      : undefined;
    return resourceType ? pipelineResourceTypes.includes(resourceType) : false;
  });

  return {
    itemId: item.itemId,
    name: item.name,
    room: item.room,
    category: item.category,
    status: item.status,
    quantity: item.quantity,
    hasPhoto: (activePhotosByItemId.get(item.itemId)?.length ?? 0) > 0,
    boxed: activeBoxes.length > 0,
    assignedToPipeline,
  };
}

function actionsForGroup({
  key,
  items,
  activeShareLinkCount,
}: {
  key: DispositionPipelineKind;
  items: DispositionPipelineHighlight[];
  activeShareLinkCount: number;
}): DispositionPipelineAction[] {
  switch (key) {
    case "sell": {
      const photoNeeded = items.filter((item) => !item.hasPhoto).length;
      const readyToList = items.filter(
        (item) =>
          item.hasPhoto &&
          !pickupProgressStatuses.has(item.status) &&
          item.status !== "missing" &&
          item.status !== "damaged"
      ).length;
      const pickupProgress = items.filter((item) =>
        pickupProgressStatuses.has(item.status)
      ).length;
      return [
        action("salePhotosNeeded", "To photograph for sale", photoNeeded, "warning", "#add-photos", "Add item photos before listing sale items."),
        action("readyToList", "Ready to list", readyToList, "info", "#sale-listing", "Items with photos and no pickup/completion status yet."),
        action("listedOrSold", "Listed / sold progress", pickupProgress, "ok", "#sale-status", "Use the sale workflow to track listing, buyer, and handoff progress."),
      ];
    }
    case "free": {
      const photoNeeded = items.filter((item) => !item.hasPhoto).length;
      const readyForPickup = items.filter(
        (item) => item.hasPhoto && !completeStatuses.has(item.status)
      ).length;
      return [
        action("giveawayPhotosNeeded", "Giveaway photos needed", photoNeeded, "warning", "#add-photos", "Add photos so recipients can understand what is being offered."),
        action("freePickupLink", "Free pickup link", items.length && activeShareLinkCount === 0 ? 1 : 0, "critical", "#documentation-packets", "Create a scoped sell/giveaway share link before public pickup coordination."),
        action("readyForPickup", "Ready for pickup", readyForPickup, "info", "#move-day", "Items with photos that can be claimed or picked up."),
      ];
    }
    case "donate": {
      const needsPacking = items.filter((item) => !item.boxed).length;
      const packed = items.filter(
        (item) => item.boxed && !completeStatuses.has(item.status)
      ).length;
      const delivered = items.filter((item) => completeStatuses.has(item.status)).length;
      return [
        action("donationPacked", "Donation packed", needsPacking, "warning", "#boxes", "Box donation items before pickup or drop-off."),
        action("donationReady", "Donation pickup ready", packed, "info", "#load-plan", "Boxed donation items that can move to pickup or drop-off."),
        action("donationDelivered", "Donation delivered", delivered, "ok", "#move-day", "Delivered donation items are complete for the current manifest."),
      ];
    }
    case "dump": {
      const dumpRun = items.filter(
        (item) => !completeStatuses.has(item.status)
      ).length;
      const assigned = items.filter((item) => item.assignedToPipeline).length;
      return [
        action("dumpRun", "Dump run", dumpRun, "warning", "#load-plan", "Collect active dump items into a dump resource or run."),
        action("dumpAssigned", "Assigned to dump bucket", assigned, "info", "#load-plan", "Dump items already tied to a dump planning resource."),
      ];
    }
    case "storage": {
      const unboxed = items.filter((item) => !item.boxed).length;
      const unassigned = items.filter(
        (item) => item.boxed && !item.assignedToPipeline
      ).length;
      const ready = items.filter((item) => item.boxed && item.assignedToPipeline)
        .length;
      return [
        action("storageUnboxed", "Storage items to box", unboxed, "warning", "#boxes", "Box storage items before treating the storage manifest as findable."),
        action("storageUnassigned", "Storage boxes unassigned", unassigned, "warning", "#load-plan", "Assign storage boxes to a storage resource or zone."),
        action("storageReady", "Storage organized", ready, "ok", "#load-plan", "Boxed storage items assigned to storage resources."),
      ];
    }
  }
}

function readyCountForGroup(
  key: DispositionPipelineKind,
  items: DispositionPipelineHighlight[],
  activeShareLinkCount: number
) {
  switch (key) {
    case "sell":
      return items.filter((item) => item.hasPhoto && !completeStatuses.has(item.status))
        .length;
    case "free":
      return activeShareLinkCount > 0
        ? items.filter((item) => item.hasPhoto && !completeStatuses.has(item.status))
            .length
        : 0;
    case "donate":
      return items.filter((item) => item.boxed && !completeStatuses.has(item.status))
        .length;
    case "dump":
      return items.filter((item) => item.assignedToPipeline).length;
    case "storage":
      return items.filter((item) => item.boxed && item.assignedToPipeline).length;
  }
}

function action(
  key: string,
  label: string,
  count: number,
  severity: DispositionPipelineAction["severity"],
  anchor: string,
  help: string
): DispositionPipelineAction {
  return { key, label, count, severity, anchor, help };
}

function comparePipelineHighlights(
  left: DispositionPipelineHighlight,
  right: DispositionPipelineHighlight
) {
  const leftScore = highlightScore(left);
  const rightScore = highlightScore(right);
  return rightScore - leftScore || left.name.localeCompare(right.name);
}

function highlightScore(item: DispositionPipelineHighlight) {
  return (item.hasPhoto ? 0 : 4) + (item.boxed ? 0 : 2) + (item.assignedToPipeline ? 0 : 1);
}

function severityRank(severity: DispositionPipelineAction["severity"]) {
  switch (severity) {
    case "critical":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
    case "ok":
      return 0;
  }
}

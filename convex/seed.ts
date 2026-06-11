import { v } from "convex/values";

import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { appRoleForEmail } from "./lib/admin";
import {
  demoHouseholdName,
  demoSeedScenarioSummary,
  demoSeedScenarios,
  type DemoSeedBox,
  type DemoSeedItem,
  type DemoSeedScenario,
} from "./lib/demoSeed";
import { normalizeDocumentationProfileConfig } from "./lib/documentation";
import {
  defaultDocumentationProfilesForMoveType,
  normalizeItemName,
  normalizedSearchName,
  normalizeRuleList,
} from "./lib/moveFields";
import { getTransportResourcePreset } from "./lib/transportPresets";
import { insertMissingMovePlanningDefaults } from "./movePlanningDefaults";

type SeedCounts = {
  households: number;
  householdMemberships: number;
  moves: number;
  movePlanningDefaults: number;
  documentationProfiles: number;
  transportResources: number;
  transportZones: number;
  boxes: number;
  items: number;
  boxItems: number;
  itemPhotos: number;
  auditLogs: number;
  deleted: Partial<Record<TableNames, number>>;
};

export const seedDemoData = mutation({
  args: {
    reset: v.optional(v.boolean()),
    confirm: v.literal("movingmanifest-dev-seed"),
  },
  handler: async (ctx, args) => {
    const user = await upsertSeedUser(ctx);
    const counts = emptyCounts();

    if (args.reset !== false) {
      await cleanupExistingDemoData(ctx, user._id, counts);
    }

    const now = Date.now();
    const householdId = await ctx.db.insert("households", {
      name: demoHouseholdName,
      slug: "movingmanifest-demo",
      createdByUserId: user._id,
      ownerUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    counts.households += 1;

    await ctx.db.insert("householdMemberships", {
      householdId,
      userId: user._id,
      role: "owner",
      status: "active",
      createdByUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    counts.householdMemberships += 1;

    await ctx.db.patch(user._id, {
      defaultHouseholdId: householdId,
      updatedAt: now,
      lastSeenAt: now,
    });

    const moveIds: Id<"moves">[] = [];
    for (const [index, scenario] of demoSeedScenarios.entries()) {
      const moveId = await seedScenario(ctx, {
        householdId,
        scenario,
        sortIndex: index,
        userId: user._id,
        counts,
      });
      moveIds.push(moveId);
    }

    await recordSeedAudit(ctx, {
      householdId,
      userId: user._id,
      counts,
    });

    return {
      householdId,
      moveIds,
      summary: demoSeedScenarioSummary(),
      counts,
    };
  },
});

async function seedScenario(
  ctx: MutationCtx,
  {
    householdId,
    scenario,
    sortIndex,
    userId,
    counts,
  }: {
    householdId: Id<"households">;
    scenario: DemoSeedScenario;
    sortIndex: number;
    userId: Id<"users">;
    counts: SeedCounts;
  }
) {
  const now = Date.now() + sortIndex;
  const moveId = await ctx.db.insert("moves", {
    householdId,
    title: scenario.title,
    type: scenario.type,
    status: "planning",
    origin: scenario.origin,
    destination: scenario.destination,
    dateStart: scenario.dateStart,
    dateEnd: scenario.dateEnd,
    unitSystem: "imperial",
    documentationProfileTypes: scenario.documentationProfileTypes,
    moveLevelWeightAllowanceLb: scenario.pcs?.weightAllowanceLb,
    pcsBranch: scenario.pcs?.branch,
    pcsRankPayGrade: scenario.pcs?.rankPayGrade,
    pcsDependentStatus: scenario.pcs?.dependentStatus,
    pcsShipmentType: scenario.pcs?.shipmentType,
    pcsOrdersNumber: scenario.pcs?.ordersNumber,
    pcsAllowanceNotes: scenario.pcs?.allowanceNotes,
    pcsTransportationOfficeNotes: scenario.pcs?.transportationOfficeNotes,
    pcsRestrictedItemsNotes: scenario.pcs?.restrictedItemsNotes,
    proGearNotes: scenario.pcs?.proGearNotes,
    notes: scenario.notes,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });
  counts.moves += 1;

  counts.movePlanningDefaults += (
    await insertMissingMovePlanningDefaults(ctx, { householdId, moveId })
  ).length;
  counts.documentationProfiles += await seedDocumentationProfiles(ctx, {
    householdId,
    moveId,
    scenario,
    userId,
    now,
  });

  const resources = await seedTransportResources(ctx, {
    householdId,
    moveId,
    scenario,
    userId,
    now,
    counts,
  });
  const boxes = await seedBoxes(ctx, {
    householdId,
    moveId,
    scenario,
    userId,
    now,
    resources,
    counts,
  });
  await seedItems(ctx, {
    householdId,
    moveId,
    scenario,
    userId,
    now,
    boxes,
    counts,
  });

  return moveId;
}

async function seedDocumentationProfiles(
  ctx: MutationCtx,
  {
    householdId,
    moveId,
    scenario,
    userId,
    now,
  }: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    scenario: DemoSeedScenario;
    userId: Id<"users">;
    now: number;
  }
) {
  const profileTypes = scenario.documentationProfileTypes.length
    ? scenario.documentationProfileTypes
    : [...defaultDocumentationProfilesForMoveType(scenario.type)];

  let count = 0;
  for (const type of profileTypes) {
    const config = normalizeDocumentationProfileConfig({ type });
    await ctx.db.insert("documentationProfiles", {
      householdId,
      moveId,
      type,
      name: config.name,
      status: "active",
      includedFields: config.includedFields,
      imageRule: config.imageRule,
      filters: config.filters,
      allowedActions: config.allowedActions,
      disclaimer: config.disclaimer,
      ownerNotes: `Seeded profile for ${scenario.title}.`,
      exportHistory: [],
      createdByUserId: userId,
      createdAt: now + count,
      updatedAt: now + count,
    });
    count += 1;
  }
  return count;
}

async function seedTransportResources(
  ctx: MutationCtx,
  {
    householdId,
    moveId,
    scenario,
    userId,
    now,
    counts,
  }: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    scenario: DemoSeedScenario;
    userId: Id<"users">;
    now: number;
    counts: SeedCounts;
  }
) {
  const byPreset = new Map<
    string,
    {
      resourceId: Id<"transportResources">;
      zoneIds: Id<"transportZones">[];
    }
  >();

  for (const [index, presetKey] of scenario.transportPresets.entries()) {
    const preset = getTransportResourcePreset(presetKey);
    const resourceId = await ctx.db.insert("transportResources", {
      householdId,
      moveId,
      type: preset.type,
      name: preset.name,
      description: preset.description,
      capacity: preset.capacity,
      rules: normalizeRuleList(preset.rules),
      sortOrder: now + index,
      createdByUserId: userId,
      createdAt: now + index,
      updatedAt: now + index,
    });
    counts.transportResources += 1;

    const zoneIds: Id<"transportZones">[] = [];
    for (const [zoneIndex, zone] of preset.zones.entries()) {
      const zoneId = await ctx.db.insert("transportZones", {
        householdId,
        moveId,
        resourceId,
        name: zone.name,
        description: zone.description,
        capacity: {},
        preferredTags: normalizeRuleList(zone.preferredTags ?? []),
        sortOrder: now + index + zoneIndex,
        createdByUserId: userId,
        createdAt: now + index + zoneIndex,
        updatedAt: now + index + zoneIndex,
      });
      zoneIds.push(zoneId);
      counts.transportZones += 1;
    }

    byPreset.set(presetKey, { resourceId, zoneIds });
  }

  return byPreset;
}

async function seedBoxes(
  ctx: MutationCtx,
  {
    householdId,
    moveId,
    scenario,
    userId,
    now,
    resources,
    counts,
  }: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    scenario: DemoSeedScenario;
    userId: Id<"users">;
    now: number;
    resources: Map<
      string,
      { resourceId: Id<"transportResources">; zoneIds: Id<"transportZones">[] }
    >;
    counts: SeedCounts;
  }
) {
  const byCode = new Map<string, Id<"boxes">>();
  for (const [index, box] of scenario.boxes.entries()) {
    const assignment = box.presetKey ? resources.get(box.presetKey) : undefined;
    const boxId = await ctx.db.insert("boxes", {
      householdId,
      moveId,
      code: box.code,
      label: box.label,
      room: box.room,
      destinationRoom: box.destinationRoom,
      description: `${scenario.title} seed box.`,
      moveDayNote: moveDayNoteForBox(box),
      status: box.status ?? "open",
      estimatedWeightLb: box.estimatedWeightLb,
      estimatedVolumeCuFt: box.estimatedVolumeCuFt,
      assignedResourceId: assignment?.resourceId,
      assignedZoneId: assignment?.zoneIds[0],
      assignmentLocked: Boolean(assignment),
      assignmentWarnings: [],
      assignmentHardBlocks: [],
      assignmentValidatedAt: now + index,
      sealedAt: box.status === "sealed" ? now + index : undefined,
      createdByUserId: userId,
      createdAt: now + index,
      updatedAt: now + index,
    });
    byCode.set(box.code, boxId);
    counts.boxes += 1;
  }
  return byCode;
}

async function seedItems(
  ctx: MutationCtx,
  {
    householdId,
    moveId,
    scenario,
    userId,
    now,
    boxes,
    counts,
  }: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    scenario: DemoSeedScenario;
    userId: Id<"users">;
    now: number;
    boxes: Map<string, Id<"boxes">>;
    counts: SeedCounts;
  }
) {
  for (const [index, item] of scenario.items.entries()) {
    const name = normalizeItemName(item.name);
    const itemId = await ctx.db.insert("items", {
      householdId,
      moveId,
      name,
      normalizedName: normalizedSearchName(name),
      description: `${scenario.title} seed item.`,
      room: item.room,
      destinationRoom: item.destinationRoom,
      category: item.category,
      disposition: item.disposition,
      status: item.status ?? "active",
      quantity: item.quantity ?? 1,
      condition: item.condition ?? "unknown",
      valueCents: item.valueCents,
      replacementValueCents: item.replacementValueCents,
      serialNumber: item.serialNumber,
      modelNumber: item.modelNumber,
      estimatedWeightLb: item.estimatedWeightLb,
      estimatedVolumeCuFt: item.estimatedVolumeCuFt,
      weightConfidence: item.estimatedWeightLb ? "medium" : "none",
      volumeConfidence: item.estimatedVolumeCuFt ? "medium" : "none",
      fragility: item.fragility ?? "low",
      stackable: item.fragility !== "high",
      hazardousFlag: false,
      highValue: item.highValue ?? false,
      requiresPersonalTransport: item.requiresPersonalTransport ?? false,
      planningDefaultKeys: item.planningDefaultKeys ?? [],
      needsReview: Boolean(item.reviewFlags?.length),
      reviewFlags: item.reviewFlags ?? [],
      privateNotes: item.privateNotes,
      aiTags: [scenario.key, item.category.toLowerCase()],
      createdVia: "bulkImport",
      reviewedAt: item.reviewFlags?.length ? undefined : now + index,
      createdByUserId: userId,
      updatedByUserId: userId,
      createdAt: now + index,
      updatedAt: now + index,
    });
    counts.items += 1;

    const boxId = item.boxCode ? boxes.get(item.boxCode) : undefined;
    if (boxId) {
      await ctx.db.insert("boxItems", {
        householdId,
        moveId,
        boxId,
        itemId,
        quantity: item.quantity ?? 1,
        notes: `Seeded into ${item.boxCode}.`,
        createdAt: now + index,
        updatedAt: now + index,
      });
      counts.boxItems += 1;
    }

    counts.itemPhotos += await seedPhotoMetadata(ctx, {
      householdId,
      moveId,
      itemId,
      boxId,
      item,
      scenario,
      userId,
      now: now + index,
    });
  }
}

async function seedPhotoMetadata(
  ctx: MutationCtx,
  {
    householdId,
    moveId,
    itemId,
    boxId,
    item,
    scenario,
    userId,
    now,
  }: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    itemId: Id<"items">;
    boxId?: Id<"boxes">;
    item: DemoSeedItem;
    scenario: DemoSeedScenario;
    userId: Id<"users">;
    now: number;
  }
) {
  let count = 0;
  for (const photoType of item.photoTypes ?? []) {
    const privacy = photoPrivacyForType(photoType);
    await ctx.db.insert("itemPhotos", {
      householdId,
      moveId,
      itemId,
      boxId,
      documentationProfileTypes: scenario.documentationProfileTypes,
      originalStorageKey: `demo/${scenario.key}/${slugify(item.name)}-${photoType}.jpg`,
      originalBucket: "demo-metadata-only",
      derivativeRefs: {},
      derivativeStatus: "pending",
      width: 1600,
      height: 1200,
      mimeType: "image/jpeg",
      sizeBytes: 512000,
      caption: `${item.name} - ${photoType}`,
      photoType,
      privacyLevel: privacy.privacyLevel,
      visibilityScope: privacy.visibilityScope,
      source: "import",
      exifHandlingStatus: "notApplicable",
      confidence: "manual",
      notes: "Seed metadata only; no storage object is created.",
      verificationStatus: photoType === "damage" ? "needsReview" : "verified",
      aiProcessed: false,
      capturedAt: now + count,
      uploadedByUserId: userId,
      reviewedByUserId: photoType === "damage" ? undefined : userId,
      reviewedAt: photoType === "damage" ? undefined : now + count,
      createdAt: now + count,
      updatedAt: now + count,
    });
    count += 1;
  }
  return count;
}

async function upsertSeedUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Seed requires a Convex identity. Use scripts/seed.mjs.");
  }
  if (
    identity.issuer !== "movingmanifest-seed" ||
    !identity.subject.startsWith("seed:")
  ) {
    throw new Error("Demo seed requires the local seed identity.");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  const email = identity.email ?? "demo@movingmanifest.local";
  const name = identity.name ?? "MovingManifest Demo Owner";

  if (existing) {
    await ctx.db.patch(existing._id, {
      email,
      name,
      appRole: appRoleForEmail(email, existing.appRole),
      status: "active",
      updatedAt: now,
      lastSeenAt: now,
    });
    return (await ctx.db.get(existing._id))!;
  }

  const userId = await ctx.db.insert("users", {
    clerkUserId: identity.subject,
    email,
    name,
    appRole: appRoleForEmail(email),
    status: "active",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  });
  return (await ctx.db.get(userId))!;
}

async function cleanupExistingDemoData(
  ctx: MutationCtx,
  userId: Id<"users">,
  counts: SeedCounts
) {
  const demoHouseholds = (
    await ctx.db
      .query("households")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect()
  ).filter((household) => household.name === demoHouseholdName);

  for (const household of demoHouseholds) {
    await cleanupHousehold(ctx, household, counts);
  }
}

async function cleanupHousehold(
  ctx: MutationCtx,
  household: Doc<"households">,
  counts: SeedCounts
) {
  const householdId = household._id;
  await deleteMatching(ctx, "aiTextSuggestions", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "aiPhotoSuggestions", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "aiPlanningSuggestions", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "aiJobs", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "photoUploadSessions", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "itemPhotos", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "boxItems", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "boxes", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "items", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "transportZones", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "transportResources", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "movePlanningDefaults", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "movePeople", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "documentationProfiles", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "shareLinks", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "exportJobs", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "apiIdempotencyKeys", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "apiKeys", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "moves", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "householdBillingProfiles", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "householdInvitations", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "householdMemberships", (doc) => doc.householdId === householdId, counts);
  await deleteMatching(ctx, "auditLogs", (doc) => doc.householdId === householdId, counts);
  await ctx.db.delete(householdId);
  counts.deleted.households = (counts.deleted.households ?? 0) + 1;
}

async function deleteMatching<T extends TableNames>(
  ctx: MutationCtx,
  table: T,
  predicate: (doc: Doc<T>) => boolean,
  counts: SeedCounts
) {
  const docs = await ctx.db.query(table).collect();
  let deleted = 0;
  for (const doc of docs) {
    if (predicate(doc)) {
      await ctx.db.delete(doc._id);
      deleted += 1;
    }
  }
  if (deleted > 0) {
    counts.deleted[table] = (counts.deleted[table] ?? 0) + deleted;
  }
}

async function recordSeedAudit(
  ctx: MutationCtx,
  {
    householdId,
    userId,
    counts,
  }: {
    householdId: Id<"households">;
    userId: Id<"users">;
    counts: SeedCounts;
  }
) {
  await ctx.db.insert("auditLogs", {
    householdId,
    actorType: "user",
    actorUserId: userId,
    category: "system",
    action: "demo_seed.created",
    objectTable: "households",
    objectId: householdId,
    metadata: {
      summary: demoSeedScenarioSummary(),
      counts,
    },
    createdAt: Date.now(),
  });
  counts.auditLogs += 1;
}

function emptyCounts(): SeedCounts {
  return {
    households: 0,
    householdMemberships: 0,
    moves: 0,
    movePlanningDefaults: 0,
    documentationProfiles: 0,
    transportResources: 0,
    transportZones: 0,
    boxes: 0,
    items: 0,
    boxItems: 0,
    itemPhotos: 0,
    auditLogs: 0,
    deleted: {},
  };
}

function moveDayNoteForBox(box: DemoSeedBox) {
  if (box.status === "damaged") return "Inspect before claim export.";
  if (box.status === "delivered") return "Confirm unit location and condition.";
  if (box.status === "staged") return "Ready for pickup or loading.";
  return "Seeded box for product walkthrough.";
}

function photoPrivacyForType(
  photoType: NonNullable<DemoSeedItem["photoTypes"]>[number]
): Pick<Doc<"itemPhotos">, "privacyLevel" | "visibilityScope"> {
  if (photoType === "serialNumber") {
    return { privacyLevel: "sensitive", visibilityScope: "private" };
  }
  if (photoType === "damage" || photoType === "receipt") {
    return {
      privacyLevel: "claimOnly",
      visibilityScope: "documentationScoped",
    };
  }
  if (photoType === "boxContents") {
    return { privacyLevel: "moverVisible", visibilityScope: "moveCollaborators" };
  }
  return { privacyLevel: "reportVisible", visibilityScope: "documentationScoped" };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

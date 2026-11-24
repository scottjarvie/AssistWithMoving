import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { authenticateApiKey } from "../apiKeyAuth";
import {
  moveIdFromRestBodyOrQuery,
  type RestRequestInput,
} from "./core";

export async function requireApiMove(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">
) {
  const move = await ctx.db.get(moveId);
  if (!move || move.householdId !== householdId || move.status === "archived") {
    throw new Error("Move not found.");
  }
  return move;
}

export async function requireApiPlan(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  planIdSegment: string
) {
  const plan = await ctx.db.get(planIdSegment as Id<"floorPlans">);
  if (
    !plan ||
    plan.householdId !== auth.householdId ||
    plan.archivedAt ||
    plan.status !== "active"
  ) {
    throw new Error("Plan not found.");
  }
  if (auth.moveId && auth.moveId !== plan.moveId) {
    throw new Error("Plan not found.");
  }
  await requireApiMove(ctx, auth.householdId, plan.moveId);
  return plan;
}

export async function requireApiItem(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  itemIdSegment: string
) {
  const item = await ctx.db.get(itemIdSegment as Id<"items">);
  if (!item || item.householdId !== householdId || item.moveId !== moveId || item.deletedAt) {
    throw new Error("Item not found.");
  }
  return item;
}

export async function requireApiPlannedItem(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  plannedItemIdSegment: string,
  includeArchived = false
) {
  const plannedItem = await ctx.db.get(plannedItemIdSegment as Id<"plannedItems">);
  if (
    !plannedItem ||
    plannedItem.householdId !== householdId ||
    plannedItem.moveId !== moveId ||
    (!includeArchived && plannedItem.archivedAt)
  ) {
    throw new Error("Planned item not found.");
  }
  return plannedItem;
}

export async function requireApiItemById(
  ctx: MutationCtx,
  householdId: Id<"households">,
  itemIdSegment: string
) {
  const item = await ctx.db.get(itemIdSegment as Id<"items">);
  if (!item || item.householdId !== householdId || item.deletedAt) {
    throw new Error("Item not found.");
  }
  return item;
}

export async function requireApiBox(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  boxIdSegment: string
) {
  const box = await ctx.db.get(boxIdSegment as Id<"boxes">);
  if (!box || box.householdId !== householdId || box.moveId !== moveId || box.archivedAt) {
    throw new Error("Box not found.");
  }
  return box;
}

export async function requireApiBoxById(
  ctx: MutationCtx,
  householdId: Id<"households">,
  boxIdSegment: string
) {
  const box = await ctx.db.get(boxIdSegment as Id<"boxes">);
  if (!box || box.householdId !== householdId || box.archivedAt) {
    throw new Error("Box not found.");
  }
  return box;
}

export async function requireApiMovePerson(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  personIdSegment: string,
  includeArchived = false
) {
  const person = await ctx.db.get(personIdSegment as Id<"movePeople">);
  if (
    !person ||
    person.householdId !== householdId ||
    person.moveId !== moveId ||
    (!includeArchived && person.archivedAt)
  ) {
    throw new Error("Move person not found.");
  }
  return person;
}

export async function requireApiPhotoById(
  ctx: MutationCtx,
  householdId: Id<"households">,
  photoIdSegment: string
) {
  const photo = await ctx.db.get(photoIdSegment as Id<"itemPhotos">);
  if (!photo || photo.householdId !== householdId || photo.archivedAt) {
    throw new Error("Photo not found.");
  }
  return photo;
}

export async function requireApiTransportResource(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  resourceIdSegment: string
) {
  const resource = await ctx.db.get(
    resourceIdSegment as Id<"transportResources">
  );
  if (
    !resource ||
    resource.householdId !== householdId ||
    resource.moveId !== moveId ||
    resource.archivedAt
  ) {
    throw new Error("Transport resource not found.");
  }
  return resource;
}

export async function requireApiTransportZone(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  zoneIdSegment: string
) {
  const zone = await ctx.db.get(zoneIdSegment as Id<"transportZones">);
  if (
    !zone ||
    zone.householdId !== householdId ||
    zone.moveId !== moveId ||
    zone.archivedAt
  ) {
    throw new Error("Transport zone not found.");
  }
  return zone;
}

export async function requireApiDocumentationProfile(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    documentationProfileId?: Id<"documentationProfiles">;
  }
) {
  if (!args.documentationProfileId) {
    throw new Error("Documentation profile export requires a profile.");
  }
  const profile = await ctx.db.get(args.documentationProfileId);
  if (
    !profile ||
    profile.householdId !== args.householdId ||
    profile.moveId !== args.moveId ||
    profile.status === "archived"
  ) {
    throw new Error("Documentation profile not found.");
  }
  return profile;
}

export async function requireApiExportJob(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  exportIdSegment: string
) {
  const job = await ctx.db.get(exportIdSegment as Id<"exportJobs">);
  if (!job || job.householdId !== householdId || job.moveId !== moveId) {
    throw new Error("Export job not found.");
  }
  return job;
}

export async function requireApiShareLink(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  shareLinkIdSegment: string
) {
  const link = await ctx.db.get(shareLinkIdSegment as Id<"shareLinks">);
  if (!link || link.householdId !== householdId || link.moveId !== moveId) {
    throw new Error("Share link not found.");
  }
  return link;
}

export function requiredQueryMoveId(query: Record<string, string>) {
  if (!query.moveId) {
    throw new Error("moveId query parameter is required.");
  }
  return query.moveId as Id<"moves">;
}

export function assertApiObjectMoveAccess(
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  objectMoveId: Id<"moves">
) {
  if (auth.moveId && auth.moveId !== objectMoveId) {
    throw new Error("API key is not allowed for this operation.");
  }
}

export function assertRequestedMoveMatches(
  args: RestRequestInput,
  objectMoveId: Id<"moves">,
  message: string
) {
  const requestedMoveId = optionalRequestMoveId(args);
  if (requestedMoveId && requestedMoveId !== objectMoveId) {
    throw new Error(message);
  }
}

function optionalRequestMoveId(args: RestRequestInput) {
  return moveIdFromRestBodyOrQuery({
    body: args.body,
    query: args.query,
  }) as Id<"moves"> | undefined;
}

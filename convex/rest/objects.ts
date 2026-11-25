import type {
  Doc,
  Id,
} from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
import { convertItemToBoxCore } from "../boxes";
import { normalizeOptionalText } from "../lib/moveFields";
import {
  bodyRecord as bodyObject,
  paginate,
  restError,
  restOk,
  type RestRequestInput,
} from "../lib/rest/core";
import { archiveApiAssignment } from "./boxes";
import {
  requireApiItem,
  requireApiItemById,
  requireApiBoxById,
  requireApiPhotoById,
  requireApiExportJob,
  requiredQueryMoveId,
  assertApiObjectMoveAccess,
  assertRequestedMoveMatches,
} from "../lib/rest/require";
import {
  safeItem,
  safeBox,
  safePhoto,
  safeExportJob,
  artifactForApiExport,
} from "../lib/rest/safe";
import {
  itemPatch,
  boxPatch,
  photoAttachPatch,
} from "../lib/rest/patch";
import { auditApiWrite } from "../lib/rest/audit";
import {
  positiveNumber,
  asString,
  parseBoxContainerType,
} from "../lib/rest/parse";

export async function routeTopLevelItem(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  itemIdSegment?: string,
  actionSegment?: string,
  extraSegment?: string,
) {
  if (!itemIdSegment) {
    return restError({ status: 404, code: "not_found", message: "Item not found." });
  }
  const item = await requireApiItemById(ctx, auth.householdId, itemIdSegment);
  assertApiObjectMoveAccess(auth, item.moveId);
  assertRequestedMoveMatches(args, item.moveId, "Item not found.");

  if (args.method === "POST" && actionSegment === "convert-to-box" && !extraSegment) {
    const body = bodyObject(args.body);
    const containerType = parseBoxContainerType(body.containerType);
    const result = await convertItemToBoxCore(
      ctx,
      item,
      containerType,
      auth.createdByUserId,
      Date.now(),
      "agent",
    );
    return restOk({ data: result }, 201);
  }

  if (actionSegment) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Item route not found.",
    });
  }

  if (args.method === "GET") {
    return restOk({ data: safeItem(item, auth.visibility) });
  }

  if (args.method === "PATCH") {
    const patch = itemPatch(args.body, auth, item);
    await ctx.db.patch(item._id, patch);
    const updated = await ctx.db.get(item._id);
    await auditApiWrite(
      ctx,
      auth,
      item.moveId,
      "item.api_updated",
      "items",
      item._id,
      { route: "top_level", changedKeys: Object.keys(patch) }
    );
    return restOk({ data: updated ? safeItem(updated, auth.visibility) : { itemId: item._id } });
  }

  if (args.method === "DELETE") {
    const now = Date.now();
    await ctx.db.patch(item._id, {
      deletedAt: now,
      updatedAt: now,
      updatedByUserId: auth.createdByUserId,
    });
    await auditApiWrite(
      ctx,
      auth,
      item.moveId,
      "item.api_deleted",
      "items",
      item._id,
      { route: "top_level" }
    );
    return restOk({ data: { deleted: true, itemId: item._id } });
  }

  return restError({ status: 404, code: "not_found", message: "Item route not found." });
}

export async function routeTopLevelBox(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  boxIdSegment?: string,
  nestedSegment?: string,
  nestedIdSegment?: string
) {
  if (!boxIdSegment) {
    return restError({ status: 404, code: "not_found", message: "Box not found." });
  }
  const box = await requireApiBoxById(ctx, auth.householdId, boxIdSegment);
  assertApiObjectMoveAccess(auth, box.moveId);
  assertRequestedMoveMatches(args, box.moveId, "Box not found.");

  if (nestedSegment === "items") {
    return await routeTopLevelBoxItems(ctx, args, auth, box, nestedIdSegment);
  }

  if (nestedSegment) {
    return restError({ status: 404, code: "not_found", message: "Box route not found." });
  }

  if (args.method === "GET") {
    return restOk({ data: safeBox(box) });
  }

  if (args.method === "PATCH") {
    const patch = boxPatch(args.body);
    await ctx.db.patch(box._id, patch);
    const updated = await ctx.db.get(box._id);
    await auditApiWrite(
      ctx,
      auth,
      box.moveId,
      "box.api_updated",
      "boxes",
      box._id,
      { route: "top_level", changedKeys: Object.keys(patch) }
    );
    return restOk({ data: updated ? safeBox(updated) : { boxId: box._id } });
  }

  return restError({ status: 404, code: "not_found", message: "Box route not found." });
}

async function routeTopLevelBoxItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  box: Doc<"boxes">,
  itemIdSegment?: string
) {
  if (args.method === "POST" && !itemIdSegment) {
    const body = bodyObject(args.body);
    const itemId = String(body.itemId ?? "") as Id<"items">;
    const item = await requireApiItem(ctx, auth.householdId, box.moveId, itemId);
    const now = Date.now();
    const existing = await ctx.db
      .query("boxItems")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .collect();
    const current = existing.find((entry) => entry.moveId === box.moveId);
    const patch = {
      boxId: box._id,
      quantity: positiveNumber(body.quantity) ?? 1,
      notes: normalizeOptionalText(asString(body.notes)),
      updatedAt: now,
    };

    if (current) {
      await ctx.db.patch(current._id, patch);
      await auditApiWrite(
        ctx,
        auth,
        box.moveId,
        "assignment.api_upserted",
        "boxItems",
        current._id,
        { route: "top_level_box", boxId: box._id, itemId: item._id }
      );
      return restOk({ data: { assignmentId: current._id } });
    }

    const assignmentId = await ctx.db.insert("boxItems", {
      householdId: auth.householdId,
      moveId: box.moveId,
      itemId: item._id,
      ...patch,
      createdAt: now,
    });
    await auditApiWrite(
      ctx,
      auth,
      box.moveId,
      "assignment.api_upserted",
      "boxItems",
      assignmentId,
      { route: "top_level_box", boxId: box._id, itemId: item._id }
    );
    return restOk({ data: { assignmentId } }, 201);
  }

  if (args.method === "DELETE" && itemIdSegment) {
    const item = await requireApiItem(ctx, auth.householdId, box.moveId, itemIdSegment);
    const assignments = await ctx.db
      .query("boxItems")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .collect();
    const assignment = assignments.find(
      (entry) => entry.moveId === box.moveId && entry.boxId === box._id
    );
    if (!assignment) {
      throw new Error("Assignment not found.");
    }

    const archiveId = await archiveApiAssignment(ctx, auth, assignment);
    await auditApiWrite(
      ctx,
      auth,
      box.moveId,
      "assignment.api_archived",
      "boxItems",
      assignment._id,
      { route: "top_level_box", boxId: box._id, itemId: item._id }
    );
    return restOk({ data: { deleted: true, archived: true, archiveId, assignmentId: assignment._id } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Box item route not found.",
  });
}

export async function routeListPhotos(
  ctx: MutationCtx,
  args: RestRequestInput,
  moveId: Id<"moves">,
) {
  const photos = await ctx.db
    .query("itemPhotos")
    .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
    .order("desc")
    .collect();
  return restOk(
    paginate(
      photos.filter((photo) => !photo.archivedAt).map((photo) => ({
        photoId: photo._id,
        itemId: photo.itemId,
        boxId: photo.boxId,
        spaceId: photo.spaceId,
        transportResourceId: photo.transportResourceId,
        transportZoneId: photo.transportZoneId,
        room: photo.room,
        photoType: photo.photoType,
        privacyLevel: photo.privacyLevel,
        verificationStatus: photo.verificationStatus,
        caption: photo.caption,
        width: photo.width,
        height: photo.height,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        capturedAt: photo.capturedAt,
        uploadedAt: photo.createdAt,
      })),
      args.query
    )
  );
}

export async function routeTopLevelPhoto(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  photoIdSegment?: string,
  actionSegment?: string
) {
  if (!photoIdSegment) {
    return restError({ status: 404, code: "not_found", message: "Photo not found." });
  }
  if (args.method !== "POST" || actionSegment !== "attach") {
    return restError({
      status: 404,
      code: "not_found",
      message: "Photo route not found.",
    });
  }

  const photo = await requireApiPhotoById(ctx, auth.householdId, photoIdSegment);
  assertApiObjectMoveAccess(auth, photo.moveId);
  assertRequestedMoveMatches(args, photo.moveId, "Photo not found.");
  const patch = await photoAttachPatch(ctx, {
    householdId: auth.householdId,
    moveId: photo.moveId,
    reviewedByUserId: auth.createdByUserId,
    body: args.body,
  });
  if (!Object.keys(patch).some((key) => key !== "updatedAt")) {
    return restError({
      status: 400,
      code: "empty_photo_patch",
      message: "Provide at least one photo attachment or metadata field.",
    });
  }
  await ctx.db.patch(photo._id, patch);
  const updated = await ctx.db.get(photo._id);
  await auditApiWrite(
    ctx,
    auth,
    photo.moveId,
    "photo.api_attached",
    "itemPhotos",
    photo._id,
    { changedKeys: Object.keys(patch) }
  );
  return restOk({ data: updated ? safePhoto(updated) : { photoId: photo._id } });
}

export async function routeTopLevelExport(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  exportIdSegment?: string
) {
  if (!exportIdSegment) {
    return restError({ status: 404, code: "not_found", message: "Export not found." });
  }
  const moveId = requiredQueryMoveId(args.query);
  const job = await requireApiExportJob(ctx, auth.householdId, moveId, exportIdSegment);
  return restOk({
    data:
      args.query.download === "1" || args.query.download === "true"
        ? artifactForApiExport(job)
        : safeExportJob(job),
  });
}

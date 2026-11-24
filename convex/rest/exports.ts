import {
  readAccess,
  readConnection,
  connectionAccess,
  accessState,
  keyScopes,
} from "../lib/carriedAccess";
import { previewPublicPacket } from "../publicPackets";
import { checkPublishing } from "../lib/publishingCheck";
import type {
  Doc,
  Id,
} from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
import {
  assignmentCsvRows,
  boxCsvRows,
  csvFromRows,
  exportFilename,
  exportMimeType,
  inventoryCsvRows,
  type ExportVisibility,
} from "../lib/exportRows";
import { normalizeOptionalText } from "../lib/moveFields";
import {
  createGeneratedShareLink,
  revokeShareLinkRecord,
} from "../lib/shareLinks";
import {
  bodyRecord as bodyObject,
  paginate,
  restError,
  restOk,
  type RestRequestInput,
} from "../lib/rest/core";
import {
  type RestExportJobType,
  optionalNumber,
  asString,
  optionalString,
  parseExportJobType,
  parseShareLinkStatus,
  parseShareLinkScope,
  parseShareLinkRole,
  parseShareLinkActions,
} from "../lib/rest/parse";
import {
  requireApiDocumentationProfile,
  requireApiExportJob,
  requireApiShareLink,
} from "../lib/rest/require";
import {
  safeExportJob,
  safeApiShareLink,
  safeApiShareLinkComment,
  artifactForApiExport,
} from "../lib/rest/safe";
import { auditApiWrite } from "../lib/rest/audit";

export async function routeExports(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  exportIdSegment?: string,
  actionSegment?: string
) {
  if (args.method === "GET" && !exportIdSegment) {
    const jobs = await ctx.db
      .query("exportJobs")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        jobs
          .filter((job) => job.householdId === auth.householdId)
          .map((job) => safeExportJob(job)),
        args.query
      )
    );
  }

  if (args.method === "POST" && !exportIdSegment) {
    const body = bodyObject(args.body);
    const result = await createApiCsvExport(ctx, {
      auth,
      moveId,
      type: parseExportJobType(body.type) ?? "inventory",
      documentationProfileId: optionalString(body.documentationProfileId) as
        | Id<"documentationProfiles">
        | undefined,
    });
    return restOk({ data: result }, 201);
  }

  if (args.method === "GET" && exportIdSegment) {
    const job = await requireApiExportJob(
      ctx,
      auth.householdId,
      moveId,
      exportIdSegment
    );
    if (actionSegment === "download") {
      return restOk({ data: artifactForApiExport(job) });
    }
    return restOk({ data: safeExportJob(job) });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Export route not found.",
  });
}

export async function routeShareLinks(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  shareLinkIdSegment?: string,
  actionSegment?: string
) {
  if (
    args.method === "GET" &&
    shareLinkIdSegment === "comments" &&
    !actionSegment
  ) {
    return await routeShareLinkComments(ctx, args, auth, moveId);
  }

  if (args.method === "GET" && shareLinkIdSegment && actionSegment === "comments") {
    const link = await requireApiShareLink(
      ctx,
      auth.householdId,
      moveId,
      shareLinkIdSegment
    );
    return await routeShareLinkComments(ctx, args, auth, moveId, link._id);
  }

  if (args.method === "GET" && !shareLinkIdSegment) {
    const links = await ctx.db
      .query("shareLinks")
      .withIndex("by_move_status", (q) => q.eq("moveId", moveId))
      .collect();
    const status = parseShareLinkStatus(args.query.status);
    return restOk(
      paginate(
        links
          .filter(
            (link) =>
              link.householdId === auth.householdId &&
              (!status || link.status === status)
          )
          .map((link) => safeApiShareLink(link)),
        args.query
      )
    );
  }

  if (args.method === "GET" && shareLinkIdSegment && !actionSegment) {
    const link = await requireApiShareLink(
      ctx,
      auth.householdId,
      moveId,
      shareLinkIdSegment
    );
    return restOk({ data: safeApiShareLink(link) });
  }

  if (args.method === "POST" && !shareLinkIdSegment) {
    const body = bodyObject(args.body);
    const documentationProfileId = optionalString(body.documentationProfileId) as
      | Id<"documentationProfiles">
      | undefined;
    const expiresAt =
      optionalNumber(body.expiresAt) ?? Date.now() + 30 * 24 * 60 * 60 * 1000;
    const outgoing = await previewPublicPacket(ctx, { shareLinkId: "pending" as Id<"shareLinks">, householdId: auth.householdId, moveId, documentationProfileId, scope: parseShareLinkScope(body.scope) ?? (documentationProfileId ? "profile" : "move"), role: parseShareLinkRole(body.role) ?? "guest", allowedActions: parseShareLinkActions(body.allowedActions) ?? ["view", "download"], expiresAt, label: normalizeOptionalText(asString(body.label)) });
    checkPublishing(outgoing, body.acknowledgeContactDetails);
    // Read current power again beside the visibility write. These reads and
    // the stored packet version participate in this Convex transaction's OCC.
    const ownerFloor = await readAccess(ctx, auth.createdByUserId);
    const callingConnection = await readConnection(ctx, auth.createdByUserId, `key:${auth.apiKeyId}`);
    const current = ownerFloor && callingConnection ? connectionAccess(ownerFloor, callingConnection) : null;
    const callingKey = await ctx.db.get(auth.apiKeyId);
    if (!current || !callingConnection || callingKey?.credentialRetiredAt !== undefined || accessState(current, callingConnection) !== "active" || !keyScopes(current).includes("exports/create") || current.revision !== auth.version) throw new Error("Missing power exports/create: this connection changed or publishing is stopped. Only the person can restore it at https://movingmanifest.com/settings/ai.");
    const result = await createGeneratedShareLink(
      ctx,
      {
        householdId: auth.householdId,
        moveId,
        documentationProfileId,
        scope:
          parseShareLinkScope(body.scope) ??
          (documentationProfileId ? "profile" : "move"),
        label: normalizeOptionalText(asString(body.label)),
        role: parseShareLinkRole(body.role) ?? "guest",
        allowedActions: parseShareLinkActions(body.allowedActions),
        expiresAt,
      },
      {
        type: "apiKey",
        apiKeyId: auth.apiKeyId,
        userId: auth.createdByUserId,
      }
    );
    return restOk(
      {
        data: {
          ...result,
          url: `/share/${result.token}`,
          expiresAt,
        },
      },
      201
    );
  }

  if (
    shareLinkIdSegment &&
    ((args.method === "DELETE" && !actionSegment) ||
      (args.method === "POST" && actionSegment === "revoke"))
  ) {
    const link = await revokeShareLinkRecord(
      ctx,
      {
        householdId: auth.householdId,
        moveId,
        shareLinkId: shareLinkIdSegment as Id<"shareLinks">,
      },
      {
        type: "apiKey",
        apiKeyId: auth.apiKeyId,
        userId: auth.createdByUserId,
      }
    );
    return restOk({ data: { revoked: true, shareLink: safeApiShareLink(link) } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Share link route not found.",
  });
}

async function routeShareLinkComments(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  shareLinkId?: Id<"shareLinks">
) {
  const documentationProfileId = optionalString(
    args.query.documentationProfileId
  ) as Id<"documentationProfiles"> | undefined;
  const comments = await ctx.db
    .query("shareLinkComments")
    .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
    .order("desc")
    .collect();
  const page = paginate(
    comments.filter(
      (comment) =>
        comment.householdId === auth.householdId &&
        (!shareLinkId || comment.shareLinkId === shareLinkId) &&
        (!documentationProfileId ||
          comment.documentationProfileId === documentationProfileId)
    ),
    args.query
  );

  return restOk({
    ...page,
    data: await Promise.all(
      page.data.map((comment) => safeApiShareLinkComment(ctx, comment))
    ),
  });
}

async function createApiCsvExport(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    type: RestExportJobType;
    documentationProfileId?: Id<"documentationProfiles">;
  }
) {
  const [items, boxes, boxItems, resources, zones] = await Promise.all([
    ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .collect(),
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .collect(),
    ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", args.moveId))
      .collect(),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect(),
  ]);
  const profile =
    args.type === "documentationProfile"
      ? await requireApiDocumentationProfile(ctx, {
          householdId: args.auth.householdId,
          moveId: args.moveId,
          documentationProfileId: args.documentationProfileId,
        })
      : null;
  const visibility = apiExportVisibility(profile);
  const activeItems = items.filter((item) => !item.deletedAt);
  const activeBoxes = boxes.filter((box) => !box.archivedAt);
  const filteredItems = profile
    ? activeItems.filter((item) => itemMatchesProfile(item, profile))
    : activeItems;
  const resourceNameById = new Map(
    resources.map((resource) => [resource._id, resource.name])
  );
  const zoneNameById = new Map(zones.map((zone) => [zone._id, zone.name]));
  const rows = rowsForExport({
    type: args.type,
    items: filteredItems,
    boxes: activeBoxes,
    boxItems,
    resourceNameById,
    zoneNameById,
    visibility,
  });
  const artifactText = csvFromRows(rows);
  const now = Date.now();
  const filename = exportFilename({
    type: args.type,
    format: "csv",
    slug: profile?.name ?? args.type,
  });
  const exportJobId = await ctx.db.insert("exportJobs", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    documentationProfileId: profile?._id,
    type: args.type,
    format: "csv",
    status: "completed",
    version: 1,
    filename,
    mimeType: exportMimeType("csv"),
    artifactText,
    rowCount: Math.max(rows.length - 1, 0),
    sizeBytes: artifactText.length,
    filters: profile?.filters,
    createdByUserId: args.auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  });

  if (profile) {
    await ctx.db.patch(profile._id, {
      exportHistory: [
        {
          exportJobId: String(exportJobId),
          format: "csv" as const,
          createdByUserId: args.auth.createdByUserId,
          createdAt: now,
        },
        ...profile.exportHistory,
      ].slice(0, 25),
      updatedAt: now,
    });
  }

  await auditApiWrite(ctx, args.auth, args.moveId, "export.api_completed", "exportJobs", exportJobId, {
    type: args.type,
    format: "csv",
    rowCount: Math.max(rows.length - 1, 0),
    documentationProfileId: profile?._id,
  });

  return {
    exportJobId,
    filename,
    rowCount: Math.max(rows.length - 1, 0),
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  };
}

function apiExportVisibility(
  profile: Doc<"documentationProfiles"> | null
): ExportVisibility {
  if (!profile) {
    return { values: false, serials: false, privateNotes: false };
  }
  return {
    values:
      profile.includedFields.includes("estimatedValues") ||
      profile.includedFields.includes("purchaseValues"),
    serials: profile.includedFields.includes("serialNumbers"),
    privateNotes: profile.includedFields.includes("privateNotes"),
  };
}

function itemMatchesProfile(
  item: Doc<"items">,
  profile: Doc<"documentationProfiles">
) {
  const filters = profile.filters;
  if (filters.dispositions?.length && !filters.dispositions.includes(item.disposition)) {
    return false;
  }
  if (filters.statuses?.length && !filters.statuses.includes(item.status)) {
    return false;
  }
  if (
    filters.planningDefaultKeys?.length &&
    !filters.planningDefaultKeys.some((key) => item.planningDefaultKeys.includes(key))
  ) {
    return false;
  }
  if (filters.room && item.room !== filters.room) {
    return false;
  }
  if (filters.destinationRoom && item.destinationRoom !== filters.destinationRoom) {
    return false;
  }
  return true;
}

function rowsForExport({
  type,
  items,
  boxes,
  boxItems,
  resourceNameById,
  zoneNameById,
  visibility,
}: {
  type: RestExportJobType;
  items: Doc<"items">[];
  boxes: Doc<"boxes">[];
  boxItems: Doc<"boxItems">[];
  resourceNameById: Map<Id<"transportResources">, string>;
  zoneNameById: Map<Id<"transportZones">, string>;
  visibility: ExportVisibility;
}) {
  switch (type) {
    case "inventory":
    case "documentationProfile":
      return inventoryCsvRows(items, visibility);
    case "boxes":
      return boxCsvRows(
        boxes.map((box) => ({
          ...box,
          assignedResource: box.assignedResourceId
            ? resourceNameById.get(box.assignedResourceId)
            : undefined,
          assignedZone: box.assignedZoneId ? zoneNameById.get(box.assignedZoneId) : undefined,
        }))
      );
    case "assignments":
      return assignmentCsvRows(
        boxes.map((box) => ({
          boxCode: box.code,
          boxLabel: box.label,
          boxStatus: box.status,
          assignedResource: box.assignedResourceId
            ? resourceNameById.get(box.assignedResourceId)
            : undefined,
          assignedZone: box.assignedZoneId ? zoneNameById.get(box.assignedZoneId) : undefined,
          itemCount: boxItems
            .filter((membership) => membership.boxId === box._id)
            .reduce((total, membership) => total + membership.quantity, 0),
          estimatedWeightLb: box.actualWeightLb ?? box.estimatedWeightLb,
        }))
      );
  }
}

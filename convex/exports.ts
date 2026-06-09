import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { assertHouseholdEntitlement } from "./lib/billing";
import {
  assignmentCsvRows,
  boxCsvRows,
  csvFromRows,
  exportFilename,
  exportMimeType,
  inventoryCsvRows,
  type ExportJobType,
  type ExportVisibility,
} from "./lib/exportRows";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

const exportJobTypeValidator = v.union(
  v.literal("inventory"),
  v.literal("boxes"),
  v.literal("assignments"),
  v.literal("documentationProfile"),
);

export const createCsv = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    type: exportJobTypeValidator,
    documentationProfileId: v.optional(v.id("documentationProfiles")),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:create",
    );
    if (policy.actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    await assertHouseholdEntitlement(ctx, {
      householdId: args.householdId,
      dimension: "exportJobsMonthly",
    });

    const [move, items, boxes, boxItems, resources, zones] = await Promise.all([
      ctx.db.get(args.moveId),
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

    if (!move || move.householdId !== args.householdId) {
      throw new Error("Move not found.");
    }

    const profile =
      args.type === "documentationProfile"
        ? await requireExportProfile(ctx, args)
        : null;
    const visibility = exportVisibilityFor({
      profile,
      roleVisibility: policy.visibility,
    });
    const activeItems = items.filter((item) => !item.deletedAt);
    const activeBoxes = boxes.filter((box) => !box.archivedAt);
    const filteredItems = profile
      ? activeItems.filter((item) => itemMatchesProfile(item, profile))
      : activeItems;
    const resourceNameById = new Map(
      resources.map((resource) => [resource._id, resource.name]),
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
      householdId: args.householdId,
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
      createdByUserId: policy.actor.userId,
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
            createdByUserId: policy.actor.userId,
            createdAt: now,
          },
          ...profile.exportHistory,
        ].slice(0, 25),
        updatedAt: now,
      });
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: policy.actor.userId,
      category: "export",
      action: "export_job.completed",
      objectTable: "exportJobs",
      objectId: exportJobId,
      metadata: {
        type: args.type,
        format: "csv",
        rowCount: Math.max(rows.length - 1, 0),
        documentationProfileId: profile?._id,
      },
    });

    return {
      exportJobId,
      filename,
      rowCount: Math.max(rows.length - 1, 0),
    };
  },
});

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:read",
    );
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const jobs = await ctx.db
      .query("exportJobs")
      .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(limit);

    return jobs.map((job) => ({
      exportJobId: job._id,
      type: job.type,
      format: job.format,
      status: job.status,
      filename: job.filename,
      rowCount: job.rowCount,
      sizeBytes: job.sizeBytes,
      documentationProfileId: job.documentationProfileId,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
    }));
  },
});

export const getArtifact = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    exportJobId: v.id("exportJobs"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:read",
    );
    const job = await ctx.db.get(args.exportJobId);
    if (
      !job ||
      job.householdId !== args.householdId ||
      job.moveId !== args.moveId
    ) {
      throw new Error("Export job not found.");
    }
    if (job.status !== "completed" || !job.artifactText) {
      throw new Error("Export artifact is not ready.");
    }
    if (job.expiresAt && job.expiresAt < Date.now()) {
      throw new Error("Export artifact has expired.");
    }

    return {
      exportJobId: job._id,
      filename:
        job.filename ?? exportFilename({ type: job.type, format: job.format }),
      mimeType: job.mimeType ?? exportMimeType(job.format),
      artifactText: job.artifactText,
      rowCount: job.rowCount,
      sizeBytes: job.sizeBytes,
      completedAt: job.completedAt,
    };
  },
});

async function requireExportProfile(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    documentationProfileId?: Id<"documentationProfiles">;
  },
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

function exportVisibilityFor({
  profile,
  roleVisibility,
}: {
  profile: Doc<"documentationProfiles"> | null;
  roleVisibility: {
    estimatedValue: boolean;
    purchaseValue: boolean;
    serialNumber: boolean;
    privateNotes: boolean;
  };
}): ExportVisibility {
  if (!profile) {
    return {
      values: roleVisibility.estimatedValue || roleVisibility.purchaseValue,
      serials: roleVisibility.serialNumber,
      privateNotes: roleVisibility.privateNotes,
    };
  }

  return {
    values:
      roleVisibility.estimatedValue &&
      (profile.includedFields.includes("estimatedValues") ||
        profile.includedFields.includes("purchaseValues")),
    serials:
      roleVisibility.serialNumber &&
      profile.includedFields.includes("serialNumbers"),
    privateNotes:
      roleVisibility.privateNotes &&
      profile.includedFields.includes("privateNotes"),
  };
}

function itemMatchesProfile(
  item: Doc<"items">,
  profile: Doc<"documentationProfiles">,
) {
  const filters = profile.filters;
  if (
    filters.dispositions?.length &&
    !filters.dispositions.includes(item.disposition)
  ) {
    return false;
  }
  if (filters.statuses?.length && !filters.statuses.includes(item.status)) {
    return false;
  }
  if (
    filters.planningDefaultKeys?.length &&
    !filters.planningDefaultKeys.some((key) =>
      item.planningDefaultKeys.includes(key),
    )
  ) {
    return false;
  }
  if (filters.room && item.room !== filters.room) {
    return false;
  }
  if (
    filters.destinationRoom &&
    item.destinationRoom !== filters.destinationRoom
  ) {
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
  type: ExportJobType;
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
          assignedZone: box.assignedZoneId
            ? zoneNameById.get(box.assignedZoneId)
            : undefined,
        })),
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
          assignedZone: box.assignedZoneId
            ? zoneNameById.get(box.assignedZoneId)
            : undefined,
          itemCount: boxItems
            .filter((membership) => membership.boxId === box._id)
            .reduce((total, membership) => total + membership.quantity, 0),
          estimatedWeightLb: box.actualWeightLb ?? box.estimatedWeightLb,
        })),
      );
  }
}

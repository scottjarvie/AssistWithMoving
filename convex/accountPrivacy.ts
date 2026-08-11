import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  accountDeletionScheduledAt,
  accountExportExpiresAt,
  accountExportFilename,
  anonymizedUserPatch,
  assertDeletionConfirmation,
  redactItemForExport,
  retentionPolicy,
  summarizeExportPackage,
} from "./lib/accountPrivacy";
import { recordAuditEvent } from "./lib/audit";
import { requireCurrentUser } from "./lib/auth";
import { visibilityForHouseholdRole } from "./lib/roles";

export const status = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const [exports, pendingDeletion] = await Promise.all([
      ctx.db
        .query("accountExportJobs")
        .withIndex("by_user_created", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(10),
      ctx.db
        .query("accountDeletionRequests")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", "pending")
        )
        .order("desc")
        .first(),
    ]);

    return {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        status: user.status,
        appRole: user.appRole,
        createdAt: user.createdAt,
        lastSeenAt: user.lastSeenAt,
      },
      exports: exports.map((job) => ({
        exportJobId: job._id,
        status: job.status,
        filename: job.filename,
        sizeBytes: job.sizeBytes,
        summary: job.summary,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        expiresAt: job.expiresAt,
      })),
      pendingDeletion: pendingDeletion
        ? {
            requestId: pendingDeletion._id,
            requestedAt: pendingDeletion.requestedAt,
            scheduledDeletionAt: pendingDeletion.scheduledDeletionAt,
          }
        : null,
      deletionConfirmation: ACCOUNT_DELETION_CONFIRMATION,
      retentionPolicy,
    };
  },
});

export const createAccountExport = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();
    const packageData = await buildAccountExportPackage(ctx, user);
    const summary = summarizeExportPackage(packageData);
    const artifactText = JSON.stringify(packageData, null, 2);
    const exportJobId = await ctx.db.insert("accountExportJobs", {
      userId: user._id,
      status: "completed",
      format: "json",
      filename: accountExportFilename(now),
      artifactText,
      sizeBytes: artifactText.length,
      summary,
      createdAt: now,
      completedAt: now,
      expiresAt: accountExportExpiresAt(now),
    });

    await recordAuditEvent(ctx, {
      actorType: "user",
      actorUserId: user._id,
      category: "export",
      action: "account_export.completed",
      objectTable: "accountExportJobs",
      objectId: exportJobId,
      metadata: summary,
    });

    return {
      exportJobId,
      filename: accountExportFilename(now),
      sizeBytes: artifactText.length,
      summary,
      expiresAt: accountExportExpiresAt(now),
    };
  },
});

export const getAccountExportArtifact = query({
  args: {
    exportJobId: v.id("accountExportJobs"),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const job = await ctx.db.get(args.exportJobId);

    if (!job || job.userId !== user._id) {
      throw new ConvexError("Account export not found.");
    }
    if (job.status !== "completed" || !job.artifactText) {
      throw new ConvexError("Account export is not ready.");
    }
    if (job.expiresAt < Date.now()) {
      throw new ConvexError("Account export has expired.");
    }

    return {
      exportJobId: job._id,
      filename: job.filename,
      mimeType: "application/json;charset=utf-8",
      artifactText: job.artifactText,
      sizeBytes: job.sizeBytes,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
    };
  },
});

export const requestAccountDeletion = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const existing = await ctx.db
      .query("accountDeletionRequests")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending")
      )
      .order("desc")
      .first();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("accountDeletionRequests", {
      userId: user._id,
      status: "pending",
      requestedAt: now,
      scheduledDeletionAt: accountDeletionScheduledAt(now),
    });

    await recordAuditEvent(ctx, {
      actorType: "user",
      actorUserId: user._id,
      category: "auth",
      action: "account_deletion.requested",
      objectTable: "accountDeletionRequests",
      objectId: requestId,
      metadata: { scheduledDeletionAt: accountDeletionScheduledAt(now) },
    });

    return requestId;
  },
});

export const cancelAccountDeletion = mutation({
  args: {
    requestId: v.id("accountDeletionRequests"),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.userId !== user._id || request.status !== "pending") {
      throw new ConvexError("Pending deletion request not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      status: "cancelled",
      cancelledAt: now,
    });

    await recordAuditEvent(ctx, {
      actorType: "user",
      actorUserId: user._id,
      category: "auth",
      action: "account_deletion.cancelled",
      objectTable: "accountDeletionRequests",
      objectId: args.requestId,
    });
  },
});

export const completeAccountDeletion = mutation({
  args: {
    requestId: v.id("accountDeletionRequests"),
    confirmation: v.string(),
  },
  handler: async (ctx, args) => {
    assertDeletionConfirmation(args.confirmation);
    const user = await requireCurrentUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.userId !== user._id || request.status !== "pending") {
      throw new ConvexError("Pending deletion request not found.");
    }

    const now = Date.now();
    const [
      revokedApiKeyCount,
      revokedShareLinkCount,
      disabledMembershipCount,
      disabledMoveGrantCount,
      disabledMoveParticipantCount,
    ] = await Promise.all([
      revokeUserApiKeys(ctx, user._id, now),
      revokeUserShareLinks(ctx, user._id, now),
      disableUserMemberships(ctx, user._id, now),
      disableUserMoveGrants(ctx, user._id, now),
      disableUserMoveParticipants(ctx, user._id, now),
    ]);

    const completedSummary = {
      revokedApiKeyCount,
      revokedShareLinkCount,
      disabledMembershipCount,
      disabledMoveGrantCount,
      disabledMoveParticipantCount,
    };

    await ctx.db.patch(user._id, anonymizedUserPatch(now));
    await ctx.db.patch(args.requestId, {
      status: "completed",
      completedAt: now,
      revokedApiKeyCount,
      revokedShareLinkCount,
      disabledMembershipCount,
      disabledMoveGrantCount,
      completedSummary,
    });

    await recordAuditEvent(ctx, {
      actorType: "user",
      actorUserId: user._id,
      category: "auth",
      action: "account_deletion.completed",
      objectTable: "accountDeletionRequests",
      objectId: args.requestId,
      metadata: completedSummary,
    });

    return completedSummary;
  },
});

async function buildAccountExportPackage(
  ctx: MutationCtx,
  user: Doc<"users">
) {
  const memberships = await activeMembershipsForUser(ctx, user._id);
  const householdIds = memberships.map((membership) => membership.householdId);
  const roleByHousehold = new Map(
    memberships.map((membership) => [membership.householdId, membership.role])
  );
  const households = (
    await Promise.all(householdIds.map((householdId) => ctx.db.get(householdId)))
  ).filter((household): household is Doc<"households"> => Boolean(household));
  const householdData = await Promise.all(
    households.map((household) =>
      exportHouseholdData(ctx, household, roleByHousehold.get(household._id)!)
    )
  );

  const flattened = householdData.reduce(
    (acc, entry) => {
      acc.moves.push(...entry.moves);
      acc.items.push(...entry.items);
      acc.boxes.push(...entry.boxes);
      acc.boxItems.push(...entry.boxItems);
      acc.photos.push(...entry.photos);
      acc.exportJobs.push(...entry.exportJobs);
      acc.apiKeys.push(...entry.apiKeys);
      acc.shareLinks.push(...entry.shareLinks);
      acc.queueItems.push(...entry.queueItems);
      acc.queueActivities.push(...entry.queueActivities);
      return acc;
    },
    {
      moves: [] as unknown[],
      items: [] as unknown[],
      boxes: [] as unknown[],
      boxItems: [] as unknown[],
      photos: [] as unknown[],
      exportJobs: [] as unknown[],
      apiKeys: [] as unknown[],
      shareLinks: [] as unknown[],
      queueItems: [] as unknown[],
      queueActivities: [] as unknown[],
    }
  );

  return {
    exportedAt: new Date().toISOString(),
    retentionPolicy,
    account: {
      id: user._id,
      email: user.email,
      name: user.name,
      appRole: user.appRole,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastSeenAt: user.lastSeenAt,
    },
    memberships: memberships.map((membership) => ({
      id: membership._id,
      householdId: membership.householdId,
      role: membership.role,
      status: membership.status,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    })),
    households: householdData.map((entry) => entry.household),
    ...flattened,
  };
}

async function exportHouseholdData(
  ctx: MutationCtx,
  household: Doc<"households">,
  role: Doc<"householdMemberships">["role"]
) {
  const [
    moves,
    items,
    boxes,
    boxItems,
    photos,
    exportJobs,
    apiKeys,
    shareLinks,
    queueItems,
    queueActivities,
  ] = await Promise.all([
    ctx.db
      .query("moves")
      .withIndex("by_household_status", (q) =>
        q.eq("householdId", household._id)
      )
      .collect(),
    ctx.db
      .query("items")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .collect(),
    ctx.db
      .query("boxes")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .collect(),
    ctx.db
      .query("boxItems")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .collect(),
    ctx.db
      .query("itemPhotos")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .collect(),
    ctx.db
      .query("exportJobs")
      .withIndex("by_household_created", (q) =>
        q.eq("householdId", household._id)
      )
      .collect(),
    ctx.db
      .query("apiKeys")
      .withIndex("by_household_status", (q) =>
        q.eq("householdId", household._id)
      )
      .collect(),
    ctx.db
      .query("shareLinks")
      .withIndex("by_household_status", (q) =>
        q.eq("householdId", household._id)
      )
      .collect(),
    ctx.db
      .query("queueItems")
      .withIndex("by_household_updated", (q) =>
        q.eq("householdId", household._id),
      )
      .collect(),
    ctx.db
      .query("queueActivities")
      .withIndex("by_household_created", (q) =>
        q.eq("householdId", household._id),
      )
      .collect(),
  ]);
  const visibility = visibilityForHouseholdRole(role);

  return {
    household: {
      id: household._id,
      name: household.name,
      slug: household.slug,
      ownerUserId: household.ownerUserId,
      createdAt: household.createdAt,
      updatedAt: household.updatedAt,
      archivedAt: household.archivedAt,
    },
    moves: moves.map((move) => ({
      id: move._id,
      householdId: move.householdId,
      title: move.title,
      type: move.type,
      status: move.status,
      origin: move.origin,
      destination: move.destination,
      dateStart: move.dateStart,
      dateEnd: move.dateEnd,
      unitSystem: move.unitSystem,
      documentationProfileTypes: move.documentationProfileTypes,
      pcsBranch: move.pcsBranch,
      pcsRankPayGrade: move.pcsRankPayGrade,
      pcsDependentStatus: move.pcsDependentStatus,
      pcsShipmentType: move.pcsShipmentType,
      moveLevelWeightAllowanceLb: move.moveLevelWeightAllowanceLb,
      createdAt: move.createdAt,
      updatedAt: move.updatedAt,
      archivedAt: move.archivedAt,
    })),
    items: items.map((item) => redactItemForExport(item, role)),
    boxes: boxes.map((box) => ({
      id: box._id,
      moveId: box.moveId,
      code: box.code,
      label: box.label,
      room: box.room,
      destinationRoom: box.destinationRoom,
      status: box.status,
      estimatedWeightLb: box.estimatedWeightLb,
      actualWeightLb: box.actualWeightLb,
      estimatedVolumeCuFt: box.estimatedVolumeCuFt,
      assignedResourceId: box.assignedResourceId,
      assignedZoneId: box.assignedZoneId,
      createdAt: box.createdAt,
      updatedAt: box.updatedAt,
      archivedAt: box.archivedAt,
    })),
    boxItems: boxItems.map((membership) => ({
      id: membership._id,
      moveId: membership.moveId,
      boxId: membership.boxId,
      itemId: membership.itemId,
      quantity: membership.quantity,
      notes: membership.notes,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    })),
    photos: photos
      .filter((photo) =>
        visibility.sensitivePhotos
          ? true
          : !["sensitive", "private"].includes(photo.privacyLevel)
      )
      .map((photo) => ({
        id: photo._id,
        moveId: photo.moveId,
        itemId: photo.itemId,
        boxId: photo.boxId,
        room: photo.room,
        width: photo.width,
        height: photo.height,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        caption: photo.caption,
        photoType: photo.photoType,
        privacyLevel: photo.privacyLevel,
        visibilityScope: photo.visibilityScope,
        verificationStatus: photo.verificationStatus,
        capturedAt: photo.capturedAt,
        createdAt: photo.createdAt,
        updatedAt: photo.updatedAt,
        archivedAt: photo.archivedAt,
      })),
    exportJobs: exportJobs.map((job) => ({
      id: job._id,
      moveId: job.moveId,
      type: job.type,
      format: job.format,
      status: job.status,
      filename: job.filename,
      rowCount: job.rowCount,
      sizeBytes: job.sizeBytes,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
    })),
    apiKeys: visibility.apiKeys
      ? apiKeys.map((key) => ({
          id: key._id,
          moveId: key.moveId,
          name: key.name,
          tokenPreview: key.tokenPreview,
          scopes: key.scopes,
          status: key.status,
          expiresAt: key.expiresAt,
          revokedAt: key.revokedAt,
          lastUsedAt: key.lastUsedAt,
          lastUsedAction: key.lastUsedAction,
          createdAt: key.createdAt,
          updatedAt: key.updatedAt,
        }))
      : [],
    shareLinks: shareLinks.map((link) => ({
      id: link._id,
      moveId: link.moveId,
      documentationProfileId: link.documentationProfileId,
      scope: link.scope,
      tokenPreview: link.tokenPreview,
      label: link.label,
      role: link.role,
      status: link.status,
      allowedActions: link.allowedActions,
      expiresAt: link.expiresAt,
      revokedAt: link.revokedAt,
      accessCount: link.accessCount,
      lastAccessedAt: link.lastAccessedAt,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    })),
    queueItems: queueItems.map((item) => ({
      id: item._id,
      moveId: item.moveId,
      ownerUserId: item.ownerUserId,
      directive: item.directive,
      summary: item.summary,
      state: item.state,
      priority: item.priority,
      contextKind: item.contextKind,
      contextRefId: item.contextRefId,
      contextLabel: item.contextLabel,
      domainKind: item.domainKind,
      domainRefType: item.domainRefType,
      domainRefId: item.domainRefId,
      requiredAction: item.requiredAction,
      nextStep: item.nextStep,
      waitingReason: item.waitingReason,
      latestHumanResponse: item.latestHumanResponse,
      resultSummary: item.resultSummary,
      resultRefs: item.resultRefs,
      terminalReason: item.terminalReason,
      failureCode: item.failureCode,
      failureMessage: item.failureMessage,
      attemptCount: item.attemptCount,
      maxAttempts: item.maxAttempts,
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      completedAt: item.completedAt,
    })),
    queueActivities: queueActivities.map((activity) => ({
      id: activity._id,
      queueItemId: activity.queueItemId,
      moveId: activity.moveId,
      type: activity.type,
      actorType: activity.actorType,
      actorUserId: activity.actorUserId,
      actorLabel: activity.actorLabel,
      fromState: activity.fromState,
      toState: activity.toState,
      message: activity.message,
      failureCode: activity.failureCode,
      resultRefCount: activity.resultRefCount,
      createdAt: activity.createdAt,
    })),
  };
}

async function activeMembershipsForUser(ctx: MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("householdMemberships")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "active")
    )
    .collect();
}

async function revokeUserApiKeys(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number
) {
  const keys = await ctx.db
    .query("apiKeys")
    .withIndex("by_created_by", (q) => q.eq("createdByUserId", userId))
    .collect();
  const activeKeys = keys.filter((key) => key.status === "active");
  await Promise.all(
    activeKeys.map((key) =>
      ctx.db.patch(key._id, {
        status: "revoked",
        revokedAt: key.revokedAt ?? now,
        revokedByUserId: key.revokedByUserId ?? userId,
        updatedAt: now,
      })
    )
  );
  return activeKeys.length;
}

async function revokeUserShareLinks(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number
) {
  const links = await ctx.db.query("shareLinks").collect();
  const activeLinks = links.filter(
    (link) => link.createdByUserId === userId && link.status === "active"
  );
  await Promise.all(
    activeLinks.map((link) =>
      ctx.db.patch(link._id, {
        status: "revoked",
        revokedAt: link.revokedAt ?? now,
        revokedByUserId: link.revokedByUserId ?? userId,
        updatedAt: now,
      })
    )
  );
  return activeLinks.length;
}

async function disableUserMemberships(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number
) {
  const memberships = await activeMembershipsForUser(ctx, userId);
  await Promise.all(
    memberships.map((membership) =>
      ctx.db.patch(membership._id, {
        status: "disabled",
        updatedAt: now,
      })
    )
  );
  return memberships.length;
}

async function disableUserMoveGrants(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number
) {
  const statuses: Doc<"moveRoleGrants">["status"][] = ["active", "invited"];
  const grants = (
    await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query("moveRoleGrants")
          .withIndex("by_user_status", (q) =>
            q.eq("userId", userId).eq("status", status)
          )
          .collect()
      )
    )
  ).flat();
  await Promise.all(
    grants.map((grant) =>
      ctx.db.patch(grant._id, {
        status: "disabled",
        updatedAt: now,
      })
    )
  );
  return grants.length;
}

// Mirror disableUserMoveGrants for the unified moveParticipants table so a
// purged/anonymized account loses its move-only (and household-backed) move
// access too. Without this, a moveOnly guest's access would survive an account
// disable because it lives only here, not in householdMemberships/moveRoleGrants.
async function disableUserMoveParticipants(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number
) {
  const statuses: Doc<"moveParticipants">["status"][] = ["active", "invited"];
  const participants = (
    await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query("moveParticipants")
          .withIndex("by_user_status", (q) =>
            q.eq("userId", userId).eq("status", status)
          )
          .collect()
      )
    )
  ).flat();
  await Promise.all(
    participants.map((participant) =>
      ctx.db.patch(participant._id, {
        status: "disabled",
        updatedAt: now,
      })
    )
  );
  return participants.length;
}

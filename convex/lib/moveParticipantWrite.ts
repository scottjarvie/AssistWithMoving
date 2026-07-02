// Shared core for adding a move participant, called by BOTH the web mutation
// (convex/moveParticipants.ts) and the OAuth gateway tool (convex/mcpTools*.ts)
// so the two surfaces enforce identical rules (grant ceiling, householdBacked
// membership creation, pending-by-email). The caller is responsible for
// authorizing the actor (requireMovePermission / requireMoveForSubject) and
// passing the actor's resolved effective role — this enforces the ceiling.
import { ConvexError } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordAuditEvent } from "./audit";
import {
  activateHouseholdMemberForUser,
  findActiveUserByEmail,
} from "./householdInvitations";
import type { ManagedHouseholdMemberRole } from "./householdMembers";
import {
  normalizeCollaboratorEmail,
  resolveParticipantGrant,
  type MoveParticipantAccessKind,
  type MoveParticipantType,
} from "./participants";
import type { HouseholdRole } from "./roles";

export type AddMoveParticipantParams = {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  actorUserId: Id<"users">;
  actorRole: HouseholdRole;
  actorApiKeyId?: Id<"apiKeys">;
  email: string;
  name?: string;
  participantType: MoveParticipantType;
  role?: HouseholdRole;
  accessKind?: MoveParticipantAccessKind;
  canRunMyQueue?: boolean;
  // "user" for the web path, "agent" for the gateway/REST path.
  actorKind: "user" | "agent";
};

export async function addMoveParticipant(
  ctx: MutationCtx,
  params: AddMoveParticipantParams,
): Promise<{ participantId: Id<"moveParticipants">; status: "active" | "invited" }> {
  const email = normalizeCollaboratorEmail(params.email);
  if (!email) throw new ConvexError("Enter an email for this participant.");

  const grant = resolveParticipantGrant({
    type: params.participantType,
    requestedRole: params.role,
    requestedAccessKind: params.accessKind,
    actorRole: params.actorRole,
  });
  if (!grant.ok) throw new ConvexError(grant.reason);

  const name = params.name?.trim() || undefined;
  const initialCanRunQueueForUserIds = params.canRunMyQueue
    ? [params.actorUserId]
    : [];
  const now = Date.now();
  const existingUser = await findActiveUserByEmail(ctx, email);

  const findExisting = existingUser
    ? await ctx.db
        .query("moveParticipants")
        .withIndex("by_move_user", (q) =>
          q.eq("moveId", params.moveId).eq("userId", existingUser._id),
        )
        .unique()
    : await ctx.db
        .query("moveParticipants")
        .withIndex("by_move_email", (q) =>
          q.eq("moveId", params.moveId).eq("invitedEmail", email),
        )
        .unique();

  const baseFields = {
    householdId: params.householdId,
    moveId: params.moveId,
    role: grant.role,
    accessKind: grant.accessKind,
    participantType: params.participantType,
    invitedName: name,
    updatedByUserId: params.actorUserId,
    updatedByApiKeyId: params.actorApiKeyId,
    updatedAt: now,
  };

  let participantId: Id<"moveParticipants">;
  let status: "active" | "invited";

  if (existingUser) {
    status = "active";
    if (findExisting) {
      const canRunQueueForUserIds = params.canRunMyQueue
        ? Array.from(
            new Set([
              ...(findExisting.canRunQueueForUserIds ?? []),
              params.actorUserId,
            ]),
          )
        : (findExisting.canRunQueueForUserIds ?? []);
      await ctx.db.patch(findExisting._id, {
        ...baseFields,
        userId: existingUser._id,
        invitedEmail: email,
        status: "active",
        canRunQueueForUserIds,
      });
      participantId = findExisting._id;
    } else {
      participantId = await ctx.db.insert("moveParticipants", {
        ...baseFields,
        userId: existingUser._id,
        invitedEmail: email,
        status: "active",
        agentAccessStatus: "enabled",
        canRunQueueForUserIds: initialCanRunQueueForUserIds,
        invitedByUserId: params.actorUserId,
        createdByUserId: params.actorUserId,
        createdByApiKeyId: params.actorApiKeyId,
        claimedAt: now,
        createdAt: now,
      });
    }
    if (grant.accessKind === "householdBacked") {
      await activateHouseholdMemberForUser(ctx, {
        householdId: params.householdId,
        userId: existingUser._id,
        email,
        role: grant.role as ManagedHouseholdMemberRole,
        actor:
          params.actorKind === "agent" && params.actorApiKeyId
            ? {
                type: "apiKey",
                apiKeyId: String(params.actorApiKeyId),
                apiKeyRecordId: params.actorApiKeyId,
                createdByUserId: params.actorUserId,
              }
            : { type: "user", userId: params.actorUserId },
      });
    }
  } else {
    status = "invited";
    if (findExisting) {
      const canRunQueueForUserIds = params.canRunMyQueue
        ? Array.from(
            new Set([
              ...(findExisting.canRunQueueForUserIds ?? []),
              params.actorUserId,
            ]),
          )
        : (findExisting.canRunQueueForUserIds ?? []);
      await ctx.db.patch(findExisting._id, {
        ...baseFields,
        invitedEmail: email,
        status: "invited",
        canRunQueueForUserIds,
      });
      participantId = findExisting._id;
    } else {
      participantId = await ctx.db.insert("moveParticipants", {
        ...baseFields,
        invitedEmail: email,
        status: "invited",
        agentAccessStatus: "enabled",
        canRunQueueForUserIds: initialCanRunQueueForUserIds,
        invitedByUserId: params.actorUserId,
        createdByUserId: params.actorUserId,
        createdByApiKeyId: params.actorApiKeyId,
        createdAt: now,
      });
    }
  }

  await recordAuditEvent(ctx, {
    householdId: params.householdId,
    moveId: params.moveId,
    actorType: params.actorKind,
    actorUserId: params.actorUserId,
    actorApiKeyId: params.actorApiKeyId
      ? String(params.actorApiKeyId)
      : undefined,
    category: "household",
    action:
      findExisting?.status === "disabled"
        ? "move_participant.reactivated_via_invite"
        : existingUser
          ? "move_participant.added"
          : "move_participant.invited",
    objectTable: "moveParticipants",
    objectId: participantId,
    metadata: {
      email,
      role: grant.role,
      accessKind: grant.accessKind,
      participantType: params.participantType,
      canRunQueue:
        (findExisting?.canRunQueueForUserIds?.length ?? 0) > 0 ||
        initialCanRunQueueForUserIds.length > 0 ||
        Boolean(params.canRunMyQueue),
    },
  });

  return { participantId, status };
}

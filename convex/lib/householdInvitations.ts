import { ConvexError } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordAuditEvent } from "./audit";
import {
  normalizeCollaboratorEmail,
  type ManagedHouseholdMemberRole,
} from "./householdMembers";

type HouseholdAccessActor =
  | { type: "user"; userId: Id<"users"> }
  | {
      type: "apiKey";
      apiKeyId: string;
      apiKeyRecordId?: Id<"apiKeys">;
      createdByUserId?: Id<"users">;
    }
  | { type: "webhook" }
  | { type: "system" };

export type AddOrInviteHouseholdMemberResult =
  | {
      kind: "member";
      membershipId: Id<"householdMemberships">;
      userId: Id<"users">;
      email: string;
      role: ManagedHouseholdMemberRole;
      status: "active";
      reactivated: boolean;
    }
  | {
      kind: "invitation";
      invitationId: Id<"householdInvitations">;
      email: string;
      role: ManagedHouseholdMemberRole;
      status: "invited";
      alreadyInvited: boolean;
    };

export type { HouseholdAccessActor };

function actorAuditFields(actor: HouseholdAccessActor) {
  return {
    actorType: actor.type,
    actorUserId: actor.type === "user" ? actor.userId : undefined,
    actorApiKeyId: actor.type === "apiKey" ? String(actor.apiKeyId) : undefined,
  };
}

export async function findActiveUserByEmail(
  ctx: MutationCtx,
  normalizedEmail: string,
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
    .unique();

  return user?.status === "active" ? user : null;
}

export async function activateHouseholdMemberForUser(
  ctx: MutationCtx,
  {
    householdId,
    userId,
    email,
    role,
    actor,
  }: {
    householdId: Id<"households">;
    userId: Id<"users">;
    email: string;
    role: ManagedHouseholdMemberRole;
    actor: HouseholdAccessActor;
  },
): Promise<Extract<AddOrInviteHouseholdMemberResult, { kind: "member" }>> {
  const now = Date.now();
  const existing = await ctx.db
    .query("householdMemberships")
    .withIndex("by_household_user", (q) =>
      q.eq("householdId", householdId).eq("userId", userId),
    )
    .unique();

  if (existing?.role === "owner") {
    throw new ConvexError(
      "Owner access cannot be changed from this collaborator manager.",
    );
  }

  if (existing) {
    await ctx.db.patch(existing._id, {
      role,
      status: "active",
      invitedEmail: email,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId,
      ...actorAuditFields(actor),
      category: "household",
      action: "household.member_reactivated",
      objectTable: "householdMemberships",
      objectId: existing._id,
      metadata: {
        targetUserId: userId,
        role,
        email,
      },
    });

    return {
      kind: "member",
      membershipId: existing._id,
      userId,
      email,
      role,
      status: "active",
      reactivated: true,
    };
  }

  const membershipId = await ctx.db.insert("householdMemberships", {
    householdId,
    userId,
    role,
    status: "active",
    invitedEmail: email,
    createdByUserId:
      actor.type === "user"
        ? actor.userId
        : actor.type === "apiKey"
          ? actor.createdByUserId
          : undefined,
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditEvent(ctx, {
    householdId,
    ...actorAuditFields(actor),
    category: "household",
    action: "household.member_added",
    objectTable: "householdMemberships",
    objectId: membershipId,
    metadata: {
      targetUserId: userId,
      role,
      email,
    },
  });

  return {
    kind: "member",
    membershipId,
    userId,
    email,
    role,
    status: "active",
    reactivated: false,
  };
}

async function createOrUpdatePendingInvitation(
  ctx: MutationCtx,
  {
    householdId,
    email,
    role,
    actor,
  }: {
    householdId: Id<"households">;
    email: string;
    role: ManagedHouseholdMemberRole;
    actor: HouseholdAccessActor;
  },
): Promise<Extract<AddOrInviteHouseholdMemberResult, { kind: "invitation" }>> {
  const now = Date.now();
  const existing = await ctx.db
    .query("householdInvitations")
    .withIndex("by_household_email_status", (q) =>
      q.eq("householdId", householdId).eq("invitedEmail", email).eq(
        "status",
        "invited",
      ),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      role,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId,
      ...actorAuditFields(actor),
      category: "household",
      action: "household.invitation_updated",
      objectTable: "householdInvitations",
      objectId: existing._id,
      metadata: { email, role },
    });

    return {
      kind: "invitation",
      invitationId: existing._id,
      email,
      role,
      status: "invited",
      alreadyInvited: true,
    };
  }

  const invitationId = await ctx.db.insert("householdInvitations", {
    householdId,
    invitedEmail: email,
    role,
    status: "invited",
    createdByUserId: actor.type === "user" ? actor.userId : undefined,
    createdByApiKeyId:
      actor.type === "apiKey" ? actor.apiKeyRecordId : undefined,
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditEvent(ctx, {
    householdId,
    ...actorAuditFields(actor),
    category: "household",
    action: "household.invitation_created",
    objectTable: "householdInvitations",
    objectId: invitationId,
    metadata: { email, role },
  });

  return {
    kind: "invitation",
    invitationId,
    email,
    role,
    status: "invited",
    alreadyInvited: false,
  };
}

export async function addOrInviteHouseholdMemberByEmail(
  ctx: MutationCtx,
  {
    householdId,
    email,
    role,
    actor,
  }: {
    householdId: Id<"households">;
    email: string;
    role: ManagedHouseholdMemberRole;
    actor: HouseholdAccessActor;
  },
): Promise<AddOrInviteHouseholdMemberResult> {
  const normalizedEmail = normalizeCollaboratorEmail(email);
  if (!normalizedEmail) {
    throw new ConvexError("Enter a collaborator email.");
  }

  const targetUser = await findActiveUserByEmail(ctx, normalizedEmail);
  if (targetUser) {
    if (actor.type === "user" && targetUser._id === actor.userId) {
      throw new ConvexError("You are already a member of this household.");
    }

    return await activateHouseholdMemberForUser(ctx, {
      householdId,
      userId: targetUser._id,
      email: normalizedEmail,
      role,
      actor,
    });
  }

  return await createOrUpdatePendingInvitation(ctx, {
    householdId,
    email: normalizedEmail,
    role,
    actor,
  });
}

export async function claimPendingHouseholdInvitationsForUser(
  ctx: MutationCtx,
  {
    userId,
    email,
    actorType,
  }: {
    userId: Id<"users">;
    email: string | undefined;
    actorType: "user" | "webhook";
  },
) {
  if (!email) {
    return [];
  }

  const normalizedEmail = normalizeCollaboratorEmail(email);
  if (!normalizedEmail) {
    return [];
  }

  const invitations = await ctx.db
    .query("householdInvitations")
    .withIndex("by_email_status", (q) =>
      q.eq("invitedEmail", normalizedEmail).eq("status", "invited"),
    )
    .collect();

  const claimed = [];
  for (const invitation of invitations) {
    const result = await activateHouseholdMemberForUser(ctx, {
      householdId: invitation.householdId,
      userId,
      email: normalizedEmail,
      role: invitation.role as ManagedHouseholdMemberRole,
      actor: actorType === "user" ? { type: "user", userId } : { type: "webhook" },
    });

    const now = Date.now();
    await ctx.db.patch(invitation._id, {
      status: "accepted",
      acceptedByUserId: userId,
      acceptedAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: invitation.householdId,
      actorType,
      actorUserId: actorType === "user" ? userId : undefined,
      category: "household",
      action: "household.invitation_accepted",
      objectTable: "householdInvitations",
      objectId: invitation._id,
      metadata: {
        email: normalizedEmail,
        membershipId: result.membershipId,
        role: invitation.role,
      },
    });

    claimed.push({
      invitationId: invitation._id,
      membershipId: result.membershipId,
      householdId: invitation.householdId,
    });
  }

  return claimed;
}

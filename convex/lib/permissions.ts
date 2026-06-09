import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  AuthorizationError,
  getActiveHouseholdMembership,
  requireCurrentUser,
} from "./auth";
import type { HouseholdRole, PermissionAction } from "./roles";
import {
  canPerformHouseholdAction,
  strongerHouseholdRole,
  visibilityForHouseholdRole,
} from "./roles";

export type UserActor = {
  type: "user";
  userId: Id<"users">;
  clerkUserId: string;
  appRole: "member" | "admin";
};

export type ApiKeyActor = {
  type: "apiKey";
  apiKeyId: string;
  scopes: string[];
};

export type Actor = UserActor | ApiKeyActor;

export const directConvexUserContextRequiredMessage =
  "Direct Convex functions require a signed-in user. Use the REST API for API-key automation.";

export type PermissionPolicy = {
  actor: Actor;
  householdId: Id<"households">;
  role: HouseholdRole;
  visibility: ReturnType<typeof visibilityForHouseholdRole>;
};

type MoveId = Id<"moves">;

export async function resolveUserActor(ctx: QueryCtx | MutationCtx) {
  const user = await requireCurrentUser(ctx);

  return {
    type: "user",
    userId: user._id,
    clerkUserId: user.clerkUserId,
    appRole: user.appRole,
  } satisfies UserActor;
}

export async function requireHouseholdPermission(
  ctx: QueryCtx | MutationCtx,
  householdId: Id<"households">,
  action: PermissionAction,
): Promise<PermissionPolicy> {
  const actor = await resolveUserActor(ctx);
  const membership = await getActiveHouseholdMembership(
    ctx.db,
    householdId,
    actor.userId,
  );

  if (!membership || !canPerformHouseholdAction(membership.role, action)) {
    throw new AuthorizationError(`Requires ${action} permission.`);
  }

  return {
    actor,
    householdId,
    role: membership.role,
    visibility: visibilityForHouseholdRole(membership.role),
  };
}

export function requireSignedInUserActor(actor: Actor): UserActor {
  if (actor.type !== "user") {
    throw new AuthorizationError(directConvexUserContextRequiredMessage);
  }

  return actor;
}

export async function requireMovePermission(
  ctx: QueryCtx | MutationCtx,
  householdId: Id<"households">,
  moveId: MoveId,
  action: PermissionAction,
): Promise<PermissionPolicy & { moveId: MoveId }> {
  const basePolicy = await requireHouseholdPermission(
    ctx,
    householdId,
    "household:read",
  );

  const userActor = requireSignedInUserActor(basePolicy.actor);
  const moveGrant = await ctx.db
    .query("moveRoleGrants")
    .withIndex("by_move_user", (q) =>
      q.eq("moveId", moveId).eq("userId", userActor.userId),
    )
    .unique();

  const effectiveRole =
    moveGrant?.status === "active"
      ? strongerHouseholdRole(basePolicy.role, moveGrant.role)
      : basePolicy.role;

  if (!canPerformHouseholdAction(effectiveRole, action)) {
    throw new AuthorizationError(
      `Requires ${action} permission for this move.`,
    );
  }

  return {
    ...basePolicy,
    moveId,
    role: effectiveRole,
    visibility: visibilityForHouseholdRole(effectiveRole),
  };
}

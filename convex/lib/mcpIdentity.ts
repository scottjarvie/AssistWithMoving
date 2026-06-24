// Identity bridge for the OAuth MCP gateway. Inside a gateway tool handler
// Convex strips `ctx.auth` (component-isolation boundary), so the gateway
// injects the verified Clerk subject as a tool argument instead. These helpers
// mirror convex/lib/permissions.ts but resolve the user from that injected
// `subject` rather than from `ctx.auth` — so an agent acting as the user gets
// exactly the same household/move permissions the web app grants that user.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { AuthorizationError, getActiveHouseholdMembership } from "./auth";
import type { PermissionAction, HouseholdRole } from "./roles";
import {
  canPerformHouseholdAction,
  strongerHouseholdRole,
  visibilityForHouseholdRole,
} from "./roles";

type Ctx = QueryCtx | MutationCtx;

export type McpUserActor = {
  type: "user";
  userId: Id<"users">;
  clerkUserId: string;
};

export type McpPermissionPolicy = {
  actor: McpUserActor;
  user: { _id: Id<"users">; clerkUserId: string };
  householdId: Id<"households">;
  role: HouseholdRole;
  visibility: ReturnType<typeof visibilityForHouseholdRole>;
};

// Resolve the Convex user for an injected Clerk subject (same lookup the web
// side does via ctx.auth.getUserIdentity().subject — both land on one user).
export async function getUserBySubject(ctx: Ctx, subject: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", subject))
    .unique();
}

export async function requireUserBySubject(ctx: Ctx, subject: string | null) {
  if (!subject) {
    throw new AuthorizationError("No caller identity on this MCP request.");
  }
  const user = await getUserBySubject(ctx, subject);
  if (!user) {
    throw new AuthorizationError(
      "No MovingManifest account is linked to this sign-in yet. Open the app once while signed in, then retry.",
    );
  }
  return user;
}

// Household-scoped permission, resolved from the Clerk subject. Mirrors
// requireHouseholdPermission.
export async function requireHouseholdForSubject(
  ctx: Ctx,
  subject: string | null,
  householdId: Id<"households">,
  action: PermissionAction,
): Promise<McpPermissionPolicy> {
  const user = await requireUserBySubject(ctx, subject);
  const membership = await getActiveHouseholdMembership(
    ctx.db,
    householdId,
    user._id,
  );
  if (!membership || !canPerformHouseholdAction(membership.role, action)) {
    throw new AuthorizationError(`Requires ${action} permission.`);
  }
  return {
    actor: { type: "user", userId: user._id, clerkUserId: user.clerkUserId },
    user: { _id: user._id, clerkUserId: user.clerkUserId },
    householdId,
    role: membership.role,
    visibility: visibilityForHouseholdRole(membership.role),
  };
}

// Move-scoped permission, resolved from the Clerk subject. Mirrors
// requireMovePermission: a move-level grant can raise the user's effective role
// above their household role.
export async function requireMoveForSubject(
  ctx: Ctx,
  subject: string | null,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  action: PermissionAction,
): Promise<McpPermissionPolicy & { moveId: Id<"moves"> }> {
  const base = await requireHouseholdForSubject(
    ctx,
    subject,
    householdId,
    "household:read",
  );

  // Confirm the move actually belongs to this household before granting any
  // access. Without this, passing a foreign moveId alongside your own
  // householdId would read another household's data. Centralizing the guard
  // here means every move-scoped gateway tool inherits it.
  const move = await ctx.db.get(moveId);
  if (!move || move.householdId !== householdId) {
    throw new AuthorizationError("Move not found in this household.");
  }

  const moveGrant = await ctx.db
    .query("moveRoleGrants")
    .withIndex("by_move_user", (q) =>
      q.eq("moveId", moveId).eq("userId", base.actor.userId),
    )
    .unique();

  const effectiveRole =
    moveGrant?.status === "active"
      ? strongerHouseholdRole(base.role, moveGrant.role)
      : base.role;

  if (!canPerformHouseholdAction(effectiveRole, action)) {
    throw new AuthorizationError(
      `Requires ${action} permission for this move.`,
    );
  }

  return {
    ...base,
    role: effectiveRole,
    visibility: visibilityForHouseholdRole(effectiveRole),
    moveId,
  };
}

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { HouseholdRole } from "./roles";
import { householdRoleAtLeast } from "./roles";

type Reader = QueryCtx["db"] | MutationCtx["db"];

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Not authorized.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    return null;
  }

  return await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
}

export async function requireCurrentUser(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);

  if (!user) {
    throw new AuthenticationRequiredError();
  }

  return user;
}

export async function getActiveHouseholdMembership(
  db: Reader,
  householdId: Id<"households">,
  userId: Id<"users">
) {
  const membership = await db
    .query("householdMemberships")
    .withIndex("by_household_user", (q) =>
      q.eq("householdId", householdId).eq("userId", userId)
    )
    .unique();

  if (membership?.status !== "active") {
    return null;
  }

  return membership;
}

export async function requireHouseholdRole(
  ctx: QueryCtx | MutationCtx,
  householdId: Id<"households">,
  minimumRole: HouseholdRole
) {
  const user = await requireCurrentUser(ctx);
  const membership = await getActiveHouseholdMembership(
    ctx.db,
    householdId,
    user._id
  );

  if (!membership || !householdRoleAtLeast(membership.role, minimumRole)) {
    throw new AuthorizationError(
      `Requires ${minimumRole} access to this household.`
    );
  }

  return { user, membership };
}

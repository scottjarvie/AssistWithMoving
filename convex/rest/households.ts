import {
  summaryFor,
  uploadPolicy,
} from "../usageLimits";
import apiToolAccess from "../../shared/api-tool-access.json";
import { apiKeyScopes } from "../lib/apiKeys";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
import {
  normalizeCollaboratorEmail,
  parseManagedHouseholdMemberRole,
} from "../lib/householdMembers";
import { addOrInviteHouseholdMemberByEmail } from "../lib/householdInvitations";
import {
  bodyRecord as bodyObject,
  restError,
  restOk,
  type RestRequestInput,
} from "../lib/rest/core";
import { safeMove } from "../lib/rest/safe";
import { requiredBodyString } from "../lib/rest/parse";

export async function routeHouseholds(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  householdIdSegment?: string,
  nested?: string,
  nestedId?: string
) {
  const householdId = householdIdSegment as Id<"households"> | undefined;
  if (!householdId || nested !== "members" || nestedId) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Household route not found.",
    });
  }
  if (householdId !== auth.householdId) {
    return restError({
      status: 403,
      code: "forbidden",
      message: "API key is not scoped to this household.",
    });
  }

  if (args.method === "GET") {
    return restOk({
      data: await listApiHouseholdMembers(ctx, householdId),
    });
  }

  if (args.method === "POST") {
    return await routeAddHouseholdMember(ctx, args, auth, householdId);
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Household member route not found.",
  });
}

async function listApiHouseholdMembers(
  ctx: MutationCtx,
  householdId: Id<"households">
) {
  const memberships = await ctx.db
    .query("householdMemberships")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();
  const invitations = await ctx.db
    .query("householdInvitations")
    .withIndex("by_household_status", (q) =>
      q.eq("householdId", householdId).eq("status", "invited")
    )
    .collect();

  const members = await Promise.all(
    memberships
      .filter((membership) => membership.status !== "disabled")
      .map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        return {
          membershipId: membership._id,
          invitationId: null,
          userId: membership.userId,
          email: user?.email ?? membership.invitedEmail ?? null,
          name: user?.name ?? null,
          role: membership.role,
          status: membership.status,
          createdAt: membership.createdAt,
          updatedAt: membership.updatedAt,
        };
      })
  );

  const pendingInvitations = invitations.map((invitation) => ({
    membershipId: null,
    invitationId: invitation._id,
    userId: null,
    email: invitation.invitedEmail,
    name: null,
    role: invitation.role,
    status: invitation.status,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  }));

  return [...members, ...pendingInvitations].sort((left, right) => {
    if (left.role === "owner") return -1;
    if (right.role === "owner") return 1;
    if (left.status === "invited" && right.status !== "invited") return 1;
    if (right.status === "invited" && left.status !== "invited") return -1;
    return (left.email ?? left.name ?? "").localeCompare(
      right.email ?? right.name ?? ""
    );
  });
}

async function routeAddHouseholdMember(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  householdId: Id<"households">
) {
  const body = bodyObject(args.body);
  const normalizedEmail = normalizeCollaboratorEmail(
    requiredBodyString(body.email, "email is required.")
  );
  if (!normalizedEmail) {
    throw new Error("Enter a collaborator email.");
  }

  const role = parseManagedHouseholdMemberRole(
    requiredBodyString(body.role, "role is required.")
  );
  if (!role) {
    throw new Error("Owner access cannot be granted from the API.");
  }

  const result = await addOrInviteHouseholdMemberByEmail(ctx, {
    householdId,
    email: normalizedEmail,
    role,
    actor: {
      type: "apiKey",
      apiKeyId: auth.actor.apiKeyId,
      apiKeyRecordId: auth.apiKeyId,
      createdByUserId: auth.createdByUserId,
    },
  });

  if (result.kind === "member") {
    return restOk(
      {
        data: {
          membershipId: result.membershipId,
          userId: result.userId,
          email: result.email,
          role: result.role,
          status: result.status,
          reactivated: result.reactivated,
        },
      },
      result.reactivated ? 200 : 201
    );
  }

  return restOk(
    {
      data: {
        invitationId: result.invitationId,
        email: result.email,
        role: result.role,
        status: result.status,
        alreadyInvited: result.alreadyInvited,
        requiresSignup: true,
      },
    },
    result.alreadyInvited ? 200 : 202
  );
}

export async function routeMe(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>
) {
  const [household, restrictedMove] = await Promise.all([
    auth.scopes.includes("moves/read") && auth.householdVisible ? ctx.db.get(auth.householdId) : Promise.resolve(null),
    auth.moveId && auth.scopes.includes("moves/read") ? ctx.db.get(auth.moveId) : Promise.resolve(null),
  ]);
  return restOk({
    data: {
      uploadLimits: auth.status === "active" && auth.scopes.includes("photos/write") ? await uploadPolicy(ctx, auth.householdId) : null,
      storage: auth.status === "active" && auth.scopes.includes("photos/write") ? await summaryFor(ctx, auth.householdId) : null,
      household: household
        ? {
            householdId: household._id,
            name: household.name,
            slug: household.slug,
          }
        : null,
      apiKey: {
        apiKeyId: auth.apiKeyId,
        version: auth.version,
        status: auth.status,
        changedAt: auth.changedAt ?? null,
        revokedAt: auth.revokedAt ?? null,
        pausedAt: auth.pausedAt ?? null,
        settings: "https://movingmanifest.com/settings/ai",
        tools: Object.entries(apiToolAccess).filter(([name, tool]) => !tool.websiteOnly && (["get_api_context", "get_api_capabilities", "reduce_connection"].includes(name) || (auth.status === "active" && tool.scopes.every(scope => auth.scopes.includes(scope as typeof apiKeyScopes[number]))))).map(([name]) => name),
        heldBack: Object.entries(apiToolAccess).filter(([name, tool]) => tool.websiteOnly || (!["get_api_context", "get_api_capabilities", "reduce_connection"].includes(name) && (auth.status !== "active" || tool.scopes.some(scope => !auth.scopes.includes(scope as typeof apiKeyScopes[number]))))).map(([tool, access]) => ({ tool, missingPower: access.websiteOnly ? "website-only" : access.scopes.length === 0 ? "active connection" : access.scopes.filter(scope => !auth.scopes.includes(scope as typeof apiKeyScopes[number])).join(", ") || access.scopes.join(", "), reason: access.websiteOnly ? "Household invitations stay website-only" : auth.status === "active" ? "Power removed" : auth.status })),
        expiresAt: auth.expiresAt ?? null,
        scopes: auth.scopes,
        moveRestricted: auth.moveRestricted,
        moveId: auth.scopes.includes("moves/read") ? auth.moveId : undefined,
        createdByUserId: auth.createdByUserId,
      },
      restrictedMove:
        restrictedMove && restrictedMove.householdId === auth.householdId
          ? safeMove(restrictedMove)
          : null,
      generatedAt: Date.now(),
    },
  });
}

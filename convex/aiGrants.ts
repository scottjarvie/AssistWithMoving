/**
 * Product grants for a person's chosen AI.
 *
 * The person-facing half of the boundary described in `convex/lib/aiGrants.ts`:
 * approving a grant, seeing what each connection has actually done, and
 * revoking it so the next call fails. The enforcement half lives in
 * `convex/mcpPlanning.ts`, which re-reads these rows on every tool call.
 *
 * Grants are per person, not per household: an owner and a helper each approve
 * their own AI, and neither inherits the other's.
 */
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";
import { recordAuditEvent } from "./lib/audit";
import {
  GRANT_BOUNDARY_VERSION,
  buildConsentSnapshot,
  describeGrantBoundary,
  findPermittingGrant,
  movingScopes,
  type MovingScope,
} from "./lib/aiGrants";
import { CLIENT_REGISTRATION_LABELS } from "./lib/mcpClientIdentity";
import {
  aiGrantActivityType,
  mcpClientRegistrationMethod,
  movingGrantScope,
} from "./schema";

/** One person can hold a handful of connections; more is a list nobody reads. */
const MAX_ACTIVE_GRANTS = 8;
const MAX_ACTIVITY_ROWS = 50;
const ACTIVITY_TTL_MS = 90 * 24 * 60 * 60 * 1_000;
/** Default life of a grant. Long enough to be useful, short enough to lapse. */
const DEFAULT_GRANT_DAYS = 90;
const MAX_GRANT_DAYS = 365;

function grantIsActive(grant: Doc<"aiGrants">, now: number) {
  if (grant.status !== "active") return false;
  if (grant.expiresAt !== undefined && grant.expiresAt <= now) return false;
  return true;
}

/** What the owner sees. Never includes another person's grant or a credential. */
function shapeGrant(grant: Doc<"aiGrants">, now: number) {
  const active = grantIsActive(grant, now);
  return {
    grantId: grant._id,
    label: grant.label,
    status: grant.status === "revoked" ? "revoked" : active ? "active" : "expired",
    scopes: grant.scopes,
    moveScope: grant.moveScope,
    moveIds: grant.moveIds ?? [],
    clientId: grant.clientId ?? null,
    observedClientName: grant.observedClientName ?? null,
    registrationMethod: grant.registrationMethod ?? null,
    registrationMethodLabel: grant.registrationMethod
      ? CLIENT_REGISTRATION_LABELS[grant.registrationMethod]
      : null,
    clientMetadataDigest: grant.clientMetadataDigest ?? null,
    consentBoundaryVersion: grant.consentBoundaryVersion,
    consentSnapshot: grant.consentSnapshot,
    approvedAt: grant.approvedAt,
    expiresAt: grant.expiresAt ?? null,
    lastUsedAt: grant.lastUsedAt ?? null,
    lastToolName: grant.lastToolName ?? null,
    useCount: grant.useCount,
    revokedAt: grant.revokedAt ?? null,
    revokedReason: grant.revokedReason ?? null,
    note: grant.note ?? null,
    version: grant.version,
  };
}

async function appendGrantActivity(
  ctx: MutationCtx,
  grant: Doc<"aiGrants">,
  entry: {
    type: (typeof aiGrantActivityType)["type"] extends never ? never : string;
    message: string;
    outcome: "allowed" | "refused" | "recorded";
    scope?: MovingScope;
    toolName?: string;
    moveId?: Id<"moves">;
    refusalCode?: string;
    clientId?: string;
    clientLabel?: string;
  },
) {
  const now = Date.now();
  await ctx.db.insert("aiGrantActivities", {
    grantId: grant._id,
    ownerUserId: grant.ownerUserId,
    householdId: grant.householdId,
    moveId: entry.moveId,
    type: entry.type as never,
    scope: entry.scope,
    toolName: entry.toolName,
    clientId: entry.clientId ?? grant.clientId,
    clientLabel: entry.clientLabel ?? grant.observedClientName ?? grant.label,
    message: entry.message,
    outcome: entry.outcome,
    refusalCode: entry.refusalCode,
    createdAt: now,
    expiresAt: now + ACTIVITY_TTL_MS,
  });
}

// ---------------------------------------------------------------------------
// Enforcement-side reads. These are internal on purpose: they take a caller
// identity as an argument, and an argument is only trustworthy because nothing
// outside this deployment can supply it.
// ---------------------------------------------------------------------------

/**
 * Every currently-valid grant for one person, optionally narrowed to the OAuth
 * client that is calling. Read fresh on every discovery and every tool call —
 * that freshness is what makes revocation immediate.
 */
export async function activeGrantsForUser(
  ctx: QueryCtx | MutationCtx,
  ownerUserId: Id<"users">,
  clientId: string | undefined,
  now: number,
) {
  const rows = await ctx.db
    .query("aiGrants")
    .withIndex("by_owner_status_updated", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("status", "active"),
    )
    .order("desc")
    .take(MAX_ACTIVE_GRANTS * 2);
  return rows.filter((grant) => {
    if (!grantIsActive(grant, now)) return false;
    // A grant already bound to another client is that client's authority, not
    // this one's. An unbound grant is claimable by the first client that uses it.
    if (grant.clientId && clientId && grant.clientId !== clientId) return false;
    return true;
  });
}

export const grantsForPrincipal = internalQuery({
  args: {
    subject: v.string(),
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.subject))
      .unique();
    if (!user || user.status !== "active") {
      return { grants: [], scopes: [] as MovingScope[] };
    }
    const now = Date.now();
    const grants = await activeGrantsForUser(ctx, user._id, args.clientId, now);
    const scopes = [...new Set(grants.flatMap((grant) => grant.scopes))];
    return {
      grants: grants.map((grant) => ({
        grantId: grant._id,
        label: grant.label,
        scopes: grant.scopes,
        moveScope: grant.moveScope,
        moveIds: (grant.moveIds ?? []).map(String),
        expiresAt: grant.expiresAt ?? null,
        boundClientId: grant.clientId ?? null,
      })),
      scopes,
    };
  },
});

/**
 * Record that a grant was used, and bind it to the calling client the first
 * time. Binding on first use is what turns "I approved an AI" into "this one
 * connection", so revoking it cannot disturb another.
 */
export const noteGrantUse = internalMutation({
  args: {
    subject: v.string(),
    toolName: v.string(),
    scope: movingGrantScope,
    moveId: v.optional(v.id("moves")),
    clientId: v.string(),
    clientName: v.optional(v.string()),
    registrationMethod: v.optional(mcpClientRegistrationMethod),
    clientMetadataDigest: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.subject))
      .unique();
    if (!user) return null;
    const now = Date.now();
    const grants = await activeGrantsForUser(ctx, user._id, args.clientId, now);
    // Resolve the same grant the enforcement path just used, so the receipt
    // records the authority that actually permitted the call.
    const permitting = findPermittingGrant(
      grants.map((row) => ({
        doc: row,
        scopes: row.scopes,
        moveScope: row.moveScope,
        moveIds: (row.moveIds ?? []).map(String),
        status: row.status,
        expiresAt: row.expiresAt,
      })),
      args.scope,
      args.moveId ? String(args.moveId) : undefined,
      now,
    );
    if (!permitting) return null;
    const grant = permitting.doc;
    const newlyBound = !grant.clientId;
    await ctx.db.patch(grant._id, {
      lastUsedAt: now,
      lastToolName: args.toolName,
      useCount: (grant.useCount ?? 0) + 1,
      clientId: grant.clientId ?? args.clientId,
      registrationMethod: args.registrationMethod ?? grant.registrationMethod,
      clientMetadataDigest:
        args.clientMetadataDigest ?? grant.clientMetadataDigest,
      // The client names itself. It is a label, never an authorization.
      observedClientName: args.clientName ?? grant.observedClientName,
      updatedAt: now,
      // Version deliberately does not move here. It tracks the person's own
      // edits, so a busy AI cannot churn it and make their Revoke button fail
      // an optimistic-concurrency check. Revoking must never lose a race with
      // the connection being revoked.
    });
    if (newlyBound) {
      await appendGrantActivity(ctx, grant, {
        type: "clientBound",
        outcome: "recorded",
        message: `${args.clientName ?? "A connected AI"} connected using this grant (${
          args.registrationMethod
            ? CLIENT_REGISTRATION_LABELS[args.registrationMethod].toLowerCase()
            : "unknown registration"
        }).`,
        clientId: args.clientId,
        clientLabel: args.clientName,
      });
    }
    await appendGrantActivity(ctx, grant, {
      type: "scopeUsed",
      outcome: "allowed",
      scope: args.scope,
      toolName: args.toolName,
      moveId: args.moveId,
      clientId: args.clientId,
      clientLabel: args.clientName,
      message: `Used ${args.toolName} under ${args.scope}.`,
    });
    return { grantId: grant._id };
  },
});

/**
 * Record a refusal so a person can see the boundary working, not just trust
 * that it does. Refusals are the most useful rows on the activity list.
 */
export const noteGrantRefusal = internalMutation({
  args: {
    subject: v.string(),
    toolName: v.string(),
    refusalCode: v.string(),
    scope: v.optional(movingGrantScope),
    clientId: v.string(),
    clientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.subject))
      .unique();
    if (!user) return null;
    const rows = await ctx.db
      .query("aiGrants")
      .withIndex("by_owner_updated", (q) => q.eq("ownerUserId", user._id))
      .order("desc")
      .take(MAX_ACTIVE_GRANTS * 2);
    // Attribute the refusal to the grant the client is bound to when there is
    // one. With no grant at all there is nothing to attach it to, and inventing
    // a row to hold a refusal would be its own kind of dishonesty.
    const grant = rows.find((row) => row.clientId === args.clientId);
    if (!grant) return null;
    await appendGrantActivity(ctx, grant, {
      type: "refused",
      outcome: "refused",
      scope: args.scope,
      toolName: args.toolName,
      refusalCode: args.refusalCode,
      clientId: args.clientId,
      clientLabel: args.clientName,
      message: `Refused ${args.toolName}: ${args.refusalCode}.`,
    });
    return { grantId: grant._id };
  },
});

// ---------------------------------------------------------------------------
// Person-facing grant management.
// ---------------------------------------------------------------------------

export const describeBoundary = query({
  args: {},
  handler: async () => describeGrantBoundary(),
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();
    const rows = await ctx.db
      .query("aiGrants")
      .withIndex("by_owner_updated", (q) => q.eq("ownerUserId", user._id))
      .order("desc")
      .take(40);
    const grants = rows.map((row) => shapeGrant(row, now));
    return {
      ...describeGrantBoundary(),
      grants,
      activeCount: grants.filter((grant) => grant.status === "active").length,
      maxActive: MAX_ACTIVE_GRANTS,
    };
  },
});

export const listActivity = query({
  args: { grantId: v.optional(v.id("aiGrants")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 25), 1), MAX_ACTIVITY_ROWS);
    const rows = args.grantId
      ? await ctx.db
          .query("aiGrantActivities")
          .withIndex("by_grant_created", (q) => q.eq("grantId", args.grantId!))
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("aiGrantActivities")
          .withIndex("by_owner_created", (q) => q.eq("ownerUserId", user._id))
          .order("desc")
          .take(limit);
    return {
      activity: rows
        .filter((row) => row.ownerUserId === user._id)
        .map((row) => ({
          grantId: row.grantId,
          type: row.type,
          scope: row.scope ?? null,
          toolName: row.toolName ?? null,
          clientLabel: row.clientLabel ?? null,
          message: row.message,
          outcome: row.outcome,
          refusalCode: row.refusalCode ?? null,
          createdAt: row.createdAt,
        })),
    };
  },
});

export const approve = mutation({
  args: {
    householdId: v.id("households"),
    label: v.string(),
    scopes: v.array(movingGrantScope),
    moveScope: v.union(v.literal("allMoves"), v.literal("selectedMoves")),
    moveIds: v.optional(v.array(v.id("moves"))),
    expiresInDays: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const membership = await ctx.db
      .query("householdMemberships")
      .withIndex("by_household_user", (q) =>
        q.eq("householdId", args.householdId).eq("userId", user._id),
      )
      .unique();
    if (!membership || membership.status !== "active") {
      throw new ConvexError("You are not an active member of that household.");
    }

    const label = args.label.trim();
    if (!label || label.length > 80) {
      throw new ConvexError("Give this connection a short name you'll recognise.");
    }
    const scopes = [...new Set(args.scopes)];
    if (scopes.length === 0) {
      throw new ConvexError("Choose at least one thing this AI may do.");
    }
    for (const scope of scopes) {
      if (!movingScopes.includes(scope)) {
        throw new ConvexError("That is not an Assist With Moving scope.");
      }
    }

    // Selected moves must be moves this person can actually reach. Approving a
    // grant is not a way to discover that a move exists.
    let moveIds: Id<"moves">[] | undefined;
    if (args.moveScope === "selectedMoves") {
      const requested = [...new Set(args.moveIds ?? [])];
      if (requested.length === 0) {
        throw new ConvexError("Choose at least one move, or grant all moves.");
      }
      if (requested.length > 25) {
        throw new ConvexError("Select 25 moves or fewer for one connection.");
      }
      for (const moveId of requested) {
        const move = await ctx.db.get(moveId);
        if (!move || move.householdId !== args.householdId) {
          throw new ConvexError("That move is not available in this household.");
        }
      }
      moveIds = requested;
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("aiGrants")
      .withIndex("by_owner_status_updated", (q) =>
        q.eq("ownerUserId", user._id).eq("status", "active"),
      )
      .take(MAX_ACTIVE_GRANTS * 2);
    if (existing.filter((row) => grantIsActive(row, now)).length >= MAX_ACTIVE_GRANTS) {
      throw new ConvexError(
        `You already have ${MAX_ACTIVE_GRANTS} active AI connections. Revoke one first.`,
      );
    }

    const days = Math.min(
      Math.max(Math.trunc(args.expiresInDays ?? DEFAULT_GRANT_DAYS), 1),
      MAX_GRANT_DAYS,
    );
    const grantId = await ctx.db.insert("aiGrants", {
      ownerUserId: user._id,
      householdId: args.householdId,
      label,
      scopes,
      moveScope: args.moveScope,
      moveIds,
      status: "active",
      consentBoundaryVersion: GRANT_BOUNDARY_VERSION,
      consentSnapshot: buildConsentSnapshot(scopes),
      expiresAt: now + days * 24 * 60 * 60 * 1_000,
      approvedAt: now,
      useCount: 0,
      note: args.note?.trim().slice(0, 500) || undefined,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const grant = await ctx.db.get(grantId);
    if (grant) {
      await appendGrantActivity(ctx, grant, {
        type: "approved",
        outcome: "recorded",
        message: `You approved “${label}” for ${scopes.length} ${
          scopes.length === 1 ? "operation" : "operations"
        } on ${
          args.moveScope === "allMoves" ? "all your moves" : `${moveIds?.length} selected`
        }. Nothing is connected until an AI signs in with it.`,
      });
    }
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      actorType: "user",
      actorUserId: user._id,
      category: "ai",
      action: "ai_grant.approved",
      objectTable: "aiGrants",
      objectId: grantId,
      metadata: { scopes, moveScope: args.moveScope, moveCount: moveIds?.length ?? null },
    });
    return { grantId };
  },
});

export const revoke = mutation({
  args: {
    grantId: v.id("aiGrants"),
    expectedVersion: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const grant = await ctx.db.get(args.grantId);
    if (!grant || grant.ownerUserId !== user._id) {
      throw new ConvexError("That AI connection is not available.");
    }
    if (args.expectedVersion !== undefined && grant.version !== args.expectedVersion) {
      throw new ConvexError("This connection changed. Reload and try again.");
    }
    if (grant.status === "revoked") return { grantId: grant._id, alreadyRevoked: true };
    const now = Date.now();
    const reason = args.reason?.trim().slice(0, 300) || "Revoked by the owner.";
    await ctx.db.patch(grant._id, {
      status: "revoked",
      revokedAt: now,
      revokedByUserId: user._id,
      revokedReason: reason,
      updatedAt: now,
      version: grant.version + 1,
    });
    // Attribution survives revocation on purpose. Taking away future access is
    // not a reason to erase the record of work already done.
    await appendGrantActivity(ctx, grant, {
      type: "revoked",
      outcome: "recorded",
      message: `You revoked “${grant.label}”. The next call from this AI will be refused.`,
    });
    await recordAuditEvent(ctx, {
      householdId: grant.householdId,
      actorType: "user",
      actorUserId: user._id,
      category: "ai",
      action: "ai_grant.revoked",
      objectTable: "aiGrants",
      objectId: grant._id,
      metadata: { reason },
    });
    return { grantId: grant._id, alreadyRevoked: false };
  },
});

/** Bounded maintenance for the activity trail. Not a product delete path. */
export const cleanupExpiredActivity = internalMutation({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 200), 1), 500);
    const rows = await ctx.db
      .query("aiGrantActivities")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(limit);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length, hasMore: rows.length === limit };
  },
});

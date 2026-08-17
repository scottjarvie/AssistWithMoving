/**
 * Identity and grant enforcement shared by every canonical `/mcp` tool.
 *
 * Extracted so the planning tools, the Queue-work tools, and the archive tool
 * all pass through exactly one gate. A tool that reaches the database without
 * coming through here is a bug, not a shortcut.
 */
import { ConvexError, v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { activeGrantsForUser } from "../aiGrants";
import { findPermittingGrant, grantError, type MovingScope } from "./aiGrants";
import { requireMoveForSubject, requireUserBySubject } from "./mcpIdentity";

export const MCP_ERROR_MARKER = "MCP_MOVING_ERROR:";

/**
 * The verified caller, injected by the transport after it checks the OAuth
 * token. A client cannot supply this: every function taking it is internal, so
 * nothing outside this deployment can call one.
 */
export const mcpPrincipalValidator = v.object({
  issuer: v.string(),
  subject: v.string(),
  clientId: v.string(),
  clientName: v.optional(v.string()),
});

export type McpPrincipal = {
  issuer: string;
  subject: string;
  clientId: string;
  clientName?: string;
};

type Ctx = QueryCtx | MutationCtx;

export function mcpError(
  code: string,
  message: string,
  recovery: string,
): never {
  throw new ConvexError(
    `${MCP_ERROR_MARKER}${JSON.stringify({ code, message, recovery })}`,
  );
}

export function normalizedIssuer(value: string | undefined) {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

export async function requireMcpUser(ctx: Ctx, principal: McpPrincipal) {
  const configuredIssuer = normalizedIssuer(
    process.env.CLERK_JWT_ISSUER_DOMAIN ?? process.env.CLERK_FRONTEND_API_URL,
  );
  if (!configuredIssuer || normalizedIssuer(principal.issuer) !== configuredIssuer) {
    mcpError(
      "AUTH_REQUIRED",
      "This OAuth identity is not valid for Assist With Moving.",
      "Reconnect to the canonical Assist With Moving MCP endpoint and sign in again.",
    );
  }
  try {
    const user = await requireUserBySubject(ctx, principal.subject);
    if (user.status !== "active") {
      mcpError(
        "FORBIDDEN",
        "This Assist With Moving account is not active.",
        "Open Assist With Moving directly or ask the account owner to restore access.",
      );
    }
    return user;
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    mcpError(
      "MOVING_IDENTITY_NOT_FOUND",
      "No active Assist With Moving profile is linked to this sign-in.",
      "Open Assist With Moving once while signed in, then reconnect your AI.",
    );
  }
}

/**
 * The product ceiling, re-read from the database on every single call.
 *
 * This is deliberately not derived from the token. Clerk issues identity-only
 * scopes, and even a token claiming more would not widen anything: authority is
 * whatever the person's current grant row says, right now. That is what makes
 * revocation immediate rather than "immediate once the access token expires".
 *
 * A grant limited to selected moves cannot be walked sideways by naming a
 * different move, and two half-permissions never sum into one.
 */
export async function requireMcpGrant(
  ctx: Ctx,
  principal: McpPrincipal,
  scope: MovingScope,
  moveId?: Id<"moves">,
) {
  const user = await requireMcpUser(ctx, principal);
  const now = Date.now();
  const grants = await activeGrantsForUser(ctx, user._id, principal.clientId, now);
  if (grants.length === 0) grantError("noGrant");
  const permitting = findPermittingGrant(
    grants.map((grant) => ({
      doc: grant,
      scopes: grant.scopes,
      moveScope: grant.moveScope,
      moveIds: (grant.moveIds ?? []).map(String),
      status: grant.status,
      expiresAt: grant.expiresAt,
    })),
    scope,
    moveId ? String(moveId) : undefined,
    now,
  );
  if (!permitting) {
    const holdsScope = grants.some((grant) => grant.scopes.includes(scope));
    grantError(holdsScope ? "outOfMoveScope" : "outOfScope");
  }
  return { user, grant: permitting.doc };
}

/**
 * Does this connection hold Queue-work authority for one move?
 *
 * The non-throwing sibling of `requireMcpGrant`, for the places where the
 * absence of a scope changes what we report rather than refusing the call —
 * a complete save whose Queue transition is simply left to the person.
 */
export async function hasQueueWorkGrant(
  ctx: Ctx,
  principal: McpPrincipal,
  moveId: Id<"moves">,
) {
  try {
    const user = await requireUserBySubject(ctx, principal.subject);
    const now = Date.now();
    const grants = await activeGrantsForUser(ctx, user._id, principal.clientId, now);
    return (
      findPermittingGrant(
        grants.map((grant) => ({
          doc: grant,
          scopes: grant.scopes,
          moveScope: grant.moveScope,
          moveIds: (grant.moveIds ?? []).map(String),
          status: grant.status,
          expiresAt: grant.expiresAt,
        })),
        "moving.queue.work",
        String(moveId),
        now,
      ) !== null
    );
  } catch {
    return false;
  }
}

export async function requireMcpMove(
  ctx: Ctx,
  principal: McpPrincipal,
  moveId: Id<"moves">,
  action: "inventory:read" | "inventory:edit" | "plan:read" | "plan:edit" | "queue:read" | "queue:run",
  scope: MovingScope,
) {
  const { grant } = await requireMcpGrant(ctx, principal, scope, moveId);
  const move = await ctx.db.get(moveId);
  if (!move || move.archivedAt !== undefined) {
    mcpError(
      "NOT_FOUND",
      "That active move is not available.",
      "Call get_move_brief without a moveId and choose one of the returned moves.",
    );
  }
  try {
    const policy = await requireMoveForSubject(
      ctx,
      principal.subject,
      move.householdId,
      moveId,
      action,
    );
    return { move, policy, grant };
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    mcpError(
      "FORBIDDEN",
      "This connection cannot use that move for the requested operation.",
      "Choose a move returned by get_move_brief or ask the owner to adjust access.",
    );
  }
}


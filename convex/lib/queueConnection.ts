import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  accessState,
  connectionAccess,
  oauthIdentity,
  oauthScopes,
  readAccess,
  readConnection,
} from "./carriedAccess";
import { oauthClientIdFromClaims } from "./mcpClientIdentity";
/** Recheck the persisted gateway's current grant before reads or writes. */
export async function requireQueueConnection(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  caller: { claims?: Record<string, unknown> },
  moveId: Id<"moves">,
  suggest: boolean,
  baseScope: "moving.queue.work" | "moving.work.write" = "moving.queue.work",
) {
  const clientId = oauthClientIdFromClaims(caller.claims) ?? "";
  const identity = oauthIdentity(clientId);
  const root = await readAccess(ctx, userId);
  const connection = await readConnection(ctx, userId, identity);
  if (!root || !connection)
    throw new ConvexError("A current Queue connection is required.");
  const access = connectionAccess(root, connection);
  const scopes = oauthScopes(access);
  if (
    accessState(access, connection) !== "active" ||
    !scopes.includes(baseScope) ||
    (access.moveIds && !access.moveIds.includes(moveId))
  )
    throw new ConvexError(
      "This connection cannot access Queue work on this move.",
    );
  if (suggest && !scopes.includes("moving.suggestions.propose"))
    throw new ConvexError(
      "Propose suggestions is off; requested work remains available.",
    );
  return identity;
}

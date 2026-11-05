import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { SETTINGS_REFUSAL } from "./connectionReduction";

/** Convex validates the Clerk issuer, signature and convex audience first.
 * Only Clerk's session-bound token has sid; URL-shaped azp is also a valid
 * OAuth client id and proves nothing about a website session. The native
 * Clerk Convex integration supplies sid, unlike legacy JWT templates.
 * https://clerk.com/docs/guides/sessions/session-tokens
 * https://clerk.com/docs/guides/sessions/jwt-templates
 */
export async function requirePersonConnectionManagement(ctx: MutationCtx | QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || typeof identity.sid !== "string" || !/^sess_.+/.test(identity.sid) || identity.sts === "pending" || identity.client_id !== undefined || identity.clientId !== undefined || identity.scope !== undefined || identity.scp !== undefined || (identity.azp !== undefined && (typeof identity.azp !== "string" || !/^https?:\/\//.test(identity.azp))) || identity.tokenType === "oauth") throw new ConvexError(SETTINGS_REFUSAL);
}

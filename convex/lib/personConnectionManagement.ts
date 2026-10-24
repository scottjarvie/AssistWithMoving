import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { SETTINGS_REFUSAL } from "./connectionReduction";

/** Website session JWTs have no OAuth client_id. OAuth access tokens must never
 * gain person-side connection administration if an auth provider changes. */
export async function requirePersonConnectionManagement(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || identity.client_id !== undefined || identity.clientId !== undefined || identity.scope !== undefined || identity.scp !== undefined || (identity.azp !== undefined && (typeof identity.azp !== "string" || !/^https?:\/\//.test(identity.azp))) || identity.tokenType === "oauth") throw new ConvexError(SETTINGS_REFUSAL);
}

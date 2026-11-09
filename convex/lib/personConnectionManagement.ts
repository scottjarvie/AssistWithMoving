import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { SETTINGS_REFUSAL } from "./connectionReduction";
import {
  hasOAuthSessionMarkers,
  MOVING_WEBSITE_ORIGINS,
  MOVING_LOCAL_LIVE_ORIGINS,
  MOVING_LOCAL_SANDBOX_ORIGINS,
  websiteAuthorizedParty,
} from "../../shared/person-session";

const websiteOrigins = [
  ...MOVING_WEBSITE_ORIGINS,
  ...MOVING_LOCAL_LIVE_ORIGINS,
  ...MOVING_LOCAL_SANDBOX_ORIGINS,
];
/** Convex verifies the Clerk issuer, signature and convex audience first.
 * Native website sessions carry sid and can omit azp entirely. OAuth markers,
 * a foreign authorized party, or a pending session never establish person proof.
 */
export async function requirePersonConnectionManagement(
  ctx: MutationCtx | QueryCtx,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (
    !identity ||
    typeof identity.sid !== "string" ||
    !/^sess_.+/.test(identity.sid) ||
    identity.sts === "pending" ||
    hasOAuthSessionMarkers(identity) ||
    !websiteAuthorizedParty(identity.azp, websiteOrigins)
  )
    throw new ConvexError(SETTINGS_REFUSAL);
}

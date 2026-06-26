// Durable invite-claim (MOVE-352).
//
// The pending-invite claim (households + move participants) is keyed on the
// invitee's VERIFIED email. After the invite-theft fix (MOVE-335) the only
// trusted sources for that email are the Clerk session JWT and the Clerk
// webhook. In this deployment the "convex" JWT template carries no `email`
// claim and the webhook is unconfigured, so a brand-new invitee's first signup
// has no trusted email and `claimPendingMoveParticipantsForUser` silently
// no-ops — they sign up and never see the move they were invited to.
//
// This action closes that gap WITHOUT trusting the client: it reads the caller's
// own Clerk user id from the authenticated identity, fetches the server-attested
// verified primary email straight from the Clerk Backend API, and runs the same
// email-keyed claim the webhook would. The client calls it once after
// users.upsertCurrent. It is a graceful no-op when CLERK_SECRET_KEY is unset
// (dev without the secret keeps relying on the JWT email if present — nothing
// breaks), so it's safe to ship and wire before the secret is provisioned.
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { appRoleForEmail } from "./lib/admin";
import { recordAuditEvent } from "./lib/audit";
import { claimPendingHouseholdInvitationsForUser } from "./lib/householdInvitations";
import { normalizeCollaboratorEmail } from "./lib/householdMembers";
import { claimPendingMoveParticipantsForUser } from "./lib/moveParticipantClaim";

type ClerkEmailAddress = {
  id: string;
  email_address: string;
  verification?: { status?: string | null } | null;
};

type ClerkUserResponse = {
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
};

export type SyncEmailAndClaimResult = {
  // ok=false means we could not reach a trusted email source (no identity, no
  // secret, or the Backend API call failed) — the caller should just keep
  // relying on the JWT/webhook path.
  ok: boolean;
  // Whether a verified email was found + applied this run.
  emailApplied: boolean;
  // How many pending invites/participations were claimed as a result.
  claimed: number;
};

/**
 * Pull the caller's server-attested verified primary email from Clerk and run
 * the pending invite/participant claim. Public action; the client calls it right
 * after users.upsertCurrent. Acts ONLY on the authenticated caller's own Clerk
 * id, so it cannot be used to claim someone else's invites. No-op (ok:false)
 * when there is no signed-in identity or CLERK_SECRET_KEY is unset.
 */
export const syncEmailAndClaim = action({
  args: {},
  handler: async (ctx): Promise<SyncEmailAndClaimResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false, emailApplied: false, claimed: 0 };

    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) return { ok: false, emailApplied: false, claimed: 0 };

    let verifiedEmail: string | undefined;
    try {
      const response = await fetch(
        `https://api.clerk.com/v1/users/${encodeURIComponent(identity.subject)}`,
        { headers: { Authorization: `Bearer ${secret}` } },
      );
      if (!response.ok) return { ok: false, emailApplied: false, claimed: 0 };

      const clerkUser = (await response.json()) as ClerkUserResponse;
      const addresses = clerkUser.email_addresses ?? [];
      const primary =
        addresses.find((a) => a.id === clerkUser.primary_email_address_id) ??
        addresses.find((a) => a.verification?.status === "verified");
      if (primary && primary.verification?.status === "verified") {
        verifiedEmail = primary.email_address;
      }
    } catch {
      // Network / parse failure — fail soft, the JWT/webhook path still applies.
      return { ok: false, emailApplied: false, claimed: 0 };
    }

    if (!verifiedEmail) return { ok: true, emailApplied: false, claimed: 0 };

    const claimed: number = await ctx.runMutation(
      internal.clerkIdentity.applyVerifiedEmailAndClaim,
      { clerkUserId: identity.subject, email: verifiedEmail },
    );
    return { ok: true, emailApplied: true, claimed };
  },
});

/**
 * Server-attested apply step. The email here was fetched from the Clerk Backend
 * API by the action above (NEVER from client args), so it is safe to store and
 * to claim invitations with. Sets the user's email if it changed, then runs the
 * email-keyed claim for both pending household invitations and move
 * participations. Returns the number of things claimed.
 */
export const applyVerifiedEmailAndClaim = internalMutation({
  args: { clerkUserId: v.string(), email: v.string() },
  handler: async (ctx, args): Promise<number> => {
    const normalized = normalizeCollaboratorEmail(args.email);
    if (!normalized) return 0;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) =>
        q.eq("clerkUserId", args.clerkUserId),
      )
      .unique();
    if (!user) return 0;

    if (user.email !== normalized) {
      await ctx.db.patch(user._id, {
        email: normalized,
        appRole: appRoleForEmail(normalized, user.appRole),
        updatedAt: Date.now(),
      });
      await recordAuditEvent(ctx, {
        actorType: "user",
        actorUserId: user._id,
        category: "auth",
        action: "clerk_user.email_synced",
        objectTable: "users",
        objectId: user._id,
        metadata: { source: "clerk_backend_api" },
      });
    }

    const households = await claimPendingHouseholdInvitationsForUser(ctx, {
      userId: user._id,
      email: normalized,
      actorType: "user",
    });
    const participants = await claimPendingMoveParticipantsForUser(ctx, {
      userId: user._id,
      email: normalized,
      actorType: "user",
    });

    return households.length + participants.length;
  },
});

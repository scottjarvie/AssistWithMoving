import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { appRoleForEmail } from "./lib/admin";
import { getCurrentUser } from "./lib/auth";
import { claimPendingHouseholdInvitationsForUser } from "./lib/householdInvitations";
import { claimPendingMoveParticipantsForUser } from "./lib/moveParticipantClaim";

export const current = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

export const upsertCurrent = mutation({
  args: {
    // NOTE: a client-supplied `email` is intentionally NOT trusted for the
    // stored email or for claiming invites. It would let any signed-in user
    // assert someone else's address and inherit invitations meant for them.
    // The email is taken ONLY from the verified Clerk identity (and the
    // server-to-server Clerk webhook). The arg is accepted for back-compat but
    // ignored for anything security-sensitive.
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Authentication required.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    // Only an email the identity provider has VERIFIED is trustworthy enough to
    // store (other users' invite-matching keys off it) or to claim invites with.
    // If the JWT doesn't attest a verified email, the Clerk webhook
    // (upsertFromWebhook) will fill it in from the verified primary address.
    const verifiedEmail =
      identity.emailVerified === true && typeof identity.email === "string"
        ? identity.email
        : undefined;
    const name = args.name ?? identity.name;
    const imageUrl = args.imageUrl ?? identity.pictureUrl;

    if (existing) {
      // Never downgrade a previously-verified email to undefined just because
      // this particular token lacked the claim.
      const email = verifiedEmail ?? existing.email;
      await ctx.db.patch(existing._id, {
        email,
        name,
        imageUrl,
        appRole: appRoleForEmail(email, existing.appRole),
        updatedAt: now,
        lastSeenAt: now,
      });

      await claimPendingHouseholdInvitationsForUser(ctx, {
        userId: existing._id,
        email: verifiedEmail,
        actorType: "user",
      });
      await claimPendingMoveParticipantsForUser(ctx, {
        userId: existing._id,
        email: verifiedEmail,
        actorType: "user",
      });

      return existing._id;
    }

    const userId = await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      email: verifiedEmail,
      name,
      imageUrl,
      appRole: appRoleForEmail(verifiedEmail),
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });

    await claimPendingHouseholdInvitationsForUser(ctx, {
      userId,
      email: verifiedEmail,
      actorType: "user",
    });
    await claimPendingMoveParticipantsForUser(ctx, {
      userId,
      email: verifiedEmail,
      actorType: "user",
    });

    return userId;
  },
});

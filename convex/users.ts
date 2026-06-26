import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { appRoleForEmail } from "./lib/admin";
import { recordAuditEvent } from "./lib/audit";
import { getCurrentUser } from "./lib/auth";
import { claimPendingHouseholdInvitationsForUser } from "./lib/householdInvitations";
import { normalizeCollaboratorEmail } from "./lib/householdMembers";
import { claimPendingMoveParticipantsForUser } from "./lib/moveParticipantClaim";

export const current = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Make every signed-in user's tenant container exist implicitly, so nobody is
// ever asked to "set up a household" (it's invisible plumbing in the product's
// model — there are just moves and participants). Creates a personal container
// ONLY for a user with no access at all. Does NOT create one for someone who
// already has access via participation or has a pending invite waiting to be
// claimed — they belong in the inviter's container, not a stray empty one.
async function ensureUserHasContainer(
  ctx: MutationCtx,
  { userId, clientEmail }: { userId: Id<"users">; clientEmail: string | undefined },
) {
  const membership = await ctx.db
    .query("householdMemberships")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "active"),
    )
    .first();
  if (membership) return;

  // Already has move access as a participant → they're in someone else's tenant.
  const participant = await ctx.db
    .query("moveParticipants")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "active"),
    )
    .first();
  if (participant) return;

  // A pending invite for this user's (client-asserted, read-only — never trusted
  // to GRANT anything) email means the claim will place them; don't pre-create.
  const normalizedEmail = clientEmail
    ? normalizeCollaboratorEmail(clientEmail)
    : "";
  if (normalizedEmail) {
    const pendingParticipant = await ctx.db
      .query("moveParticipants")
      .withIndex("by_email_status", (q) =>
        q.eq("invitedEmail", normalizedEmail).eq("status", "invited"),
      )
      .first();
    const pendingInvite = await ctx.db
      .query("householdInvitations")
      .withIndex("by_email_status", (q) =>
        q.eq("invitedEmail", normalizedEmail).eq("status", "invited"),
      )
      .first();
    if (pendingParticipant || pendingInvite) return;
  }

  // Genuinely new user with no access anywhere → give them their own container.
  const now = Date.now();
  const user = await ctx.db.get(userId);
  const baseName =
    user?.name?.trim() ||
    (user?.email ? user.email.split("@")[0] : undefined) ||
    "My";
  const name = `${baseName}'s workspace`;
  const householdId = await ctx.db.insert("households", {
    name,
    slug: slugify(name),
    createdByUserId: userId,
    ownerUserId: userId,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("householdMemberships", {
    householdId,
    userId,
    role: "owner",
    status: "active",
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });
  if (!user?.defaultHouseholdId) {
    await ctx.db.patch(userId, { defaultHouseholdId: householdId, updatedAt: now });
  }
  await recordAuditEvent(ctx, {
    householdId,
    actorType: "user",
    actorUserId: userId,
    category: "household",
    action: "household.auto_created",
    objectTable: "households",
    objectId: householdId,
  });
}

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
    // The email from the SIGNED Clerk token (identity). Trusted because it's in
    // the JWT Clerk signed, NOT the client-passed args.email (which is spoofable
    // — that was the invite-theft vector). Accept it unless the token explicitly
    // marks it unverified; many JWT templates carry `email` but omit
    // `email_verified`, so requiring emailVerified===true silently dropped every
    // claim (the bug that left invited people unable to see their move).
    const tokenEmail =
      typeof identity.email === "string" && identity.emailVerified !== false
        ? identity.email
        : undefined;
    const name = args.name ?? identity.name;
    const imageUrl = args.imageUrl ?? identity.pictureUrl;

    if (existing) {
      // Self-healing: claim against the token email if present, else the email
      // already stored from a trusted source (the Clerk webhook). So even if a
      // given token lacks an email claim, the pending invite is picked up on the
      // next load once any trusted source has populated the address.
      const claimEmail = tokenEmail ?? existing.email ?? undefined;
      const email = tokenEmail ?? existing.email;
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
        email: claimEmail,
        actorType: "user",
      });
      await claimPendingMoveParticipantsForUser(ctx, {
        userId: existing._id,
        email: claimEmail,
        actorType: "user",
      });
      await ensureUserHasContainer(ctx, {
        userId: existing._id,
        clientEmail: args.email,
      });

      return existing._id;
    }

    const userId = await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      email: tokenEmail,
      name,
      imageUrl,
      appRole: appRoleForEmail(tokenEmail),
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });

    await claimPendingHouseholdInvitationsForUser(ctx, {
      userId,
      email: tokenEmail,
      actorType: "user",
    });
    await claimPendingMoveParticipantsForUser(ctx, {
      userId,
      email: tokenEmail,
      actorType: "user",
    });
    await ensureUserHasContainer(ctx, { userId, clientEmail: args.email });

    return userId;
  },
});

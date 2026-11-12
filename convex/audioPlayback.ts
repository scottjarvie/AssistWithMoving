import { resolveMoveAccess } from "./lib/moveAccess";
import { canPerformHouseholdAction, visibilityForHouseholdRole } from "./lib/roles";
import { readConnection, connectionAccess, accessState, keyScopes } from "./lib/carriedAccess";
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requirePersonConnectionManagement } from "./lib/personConnectionManagement";
import { requireUserBySubject, requireMoveForSubject } from "./lib/mcpIdentity";
import { requireMcpGrant } from "./lib/mcpGrantAccess";
import { canViewPhotoAssets } from "./lib/photoVisibility";
import { audioPlaybackTtlMs } from "../shared/media-limits.mjs";

const mintArgs = { photoId: v.id("itemPhotos"), subject: v.string(), clientId: v.optional(v.string()), apiKeyId: v.optional(v.id("apiKeys")), agent: v.boolean() };
async function readable(ctx: QueryCtx | MutationCtx, cap: Pick<Doc<"audioPlaybackCapabilities">, "photoId" | "subject" | "clientId" | "apiKeyId" | "agent">) {
  const photo = await ctx.db.get(cap.photoId);
  if (!photo || photo.archivedAt || photo.mediaKind !== "audio") throw new ConvexError("Audio attachment not found.");
  const policy = cap.agent
    ? await requireMoveForSubject(ctx, cap.subject, photo.householdId, photo.moveId, "inventory:read")
    : await personPolicy(ctx, cap.subject, photo);
  if (cap.apiKeyId) {
    const key = await ctx.db.get(cap.apiKeyId);
    const creator = key ? await ctx.db.get(key.createdByUserId) : null;
    const root = key?.accessOwnerId ? await ctx.db.get(key.accessOwnerId) : null;
    const connection = key ? await readConnection(ctx, key.createdByUserId, `key:${key._id}`) : null;
    const access = root && connection ? connectionAccess(root, connection) : null;
    if (!key || creator?.status !== "active" || key.credentialRetiredAt !== undefined || key.householdId !== photo.householdId || !access || accessState(access, connection) !== "active" || !keyScopes(access).includes("inventory/read") || (access.moveIds && !access.moveIds.includes(photo.moveId)) || policy.actor.userId !== key.createdByUserId) throw new ConvexError("Audio unavailable to this key.");
  } else if (cap.agent) {
    if (!cap.clientId) throw new ConvexError("Reconnect this AI to read audio.");
    await requireMcpGrant(ctx, { subject: cap.subject, clientId: cap.clientId, issuer: process.env.CLERK_JWT_ISSUER_DOMAIN ?? process.env.CLERK_FRONTEND_API_URL ?? "" }, "moving.evidence.read", photo.moveId);
  }
  if (!canViewPhotoAssets(photo, policy.visibility)) throw new ConvexError("Audio attachment not found.");
  return photo;
}
async function personPolicy(ctx: QueryCtx | MutationCtx, subject: string, photo: Doc<"itemPhotos">) {
  // Internal playback requests have no browser auth; resolve the original person's
  // current membership without applying the separate agent-access switch.
  const user = await requireUserBySubject(ctx, subject);
  if (user.status !== "active") throw new ConvexError("Audio unavailable.");
  const policy = await resolveMoveAccess(ctx, user._id, photo.householdId, photo.moveId);
  if (!canPerformHouseholdAction(policy.role, "inventory:read")) throw new ConvexError("Audio unavailable.");
  return { ...policy, visibility: visibilityForHouseholdRole(policy.role), actor: { userId: user._id } };
}
export const mint = internalMutation({ args: mintArgs, handler: async (ctx, args) => {
  const photo = await readable(ctx, args);
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = Date.now() + audioPlaybackTtlMs;
  await ctx.db.insert("audioPlaybackCapabilities", { ...args, token, expiresAt });
  return { url: new URL(`/api/audio/${token}`, process.env.APP_URL ?? "https://movingmanifest.com").href, expiresAt, mimeType: photo.mimeType, durationSeconds: photo.audioDurationSeconds ?? null, transcript: null };
} });
export const resolve = internalQuery({ args: { token: v.string() }, handler: async (ctx, args) => {
  const cap = await ctx.db.query("audioPlaybackCapabilities").withIndex("by_token", q => q.eq("token", args.token)).unique();
  if (!cap || cap.expiresAt <= Date.now()) throw new ConvexError("Audio link expired.");
  return await readable(ctx, cap);
} });
export const playback = action({ args: { householdId: v.id("households"), moveId: v.id("moves"), photoId: v.id("itemPhotos") }, handler: async (ctx, args): Promise<{ url: string; expiresAt: number; mimeType: string; durationSeconds: number | null; transcript: null }> => {
  await requirePersonConnectionManagement(ctx);
  await ctx.runQuery(internal.photos.getPhotoForDelivery, args);
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to play audio.");
  return ctx.runMutation(internal.audioPlayback.mint, { photoId: args.photoId, subject: identity.subject, agent: false });
} });

export const keySubject = internalQuery({ args: { apiKeyId: v.id("apiKeys") }, handler: async (ctx, args) => {
  const key = await ctx.db.get(args.apiKeyId);
  const user = key && await ctx.db.get(key.createdByUserId);
  if (!user) throw new ConvexError("Audio unavailable.");
  return user.clerkUserId;
} });

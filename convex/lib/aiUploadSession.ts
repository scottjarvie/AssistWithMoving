import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { McpPrincipal } from "./mcpGrantAccess";

const principalValidator = v.object({ issuer: v.string(), subject: v.string(), clientId: v.string(), clientName: v.optional(v.string()) });
export const uploadAuthorizationValidator = v.object({ principal: principalValidator, token: v.string(), sha256: v.string(), width: v.optional(v.number()), height: v.optional(v.number()), uploadSessionId: v.optional(v.id("photoUploadSessions")) });
export type UploadAuthorization = Infer<typeof uploadAuthorizationValidator>;
export function uploadUnavailable(): never { throw new ConvexError({ code: "INVALID_UPLOAD", message: "Upload not found or no longer available to this connection." }); }
export function sameUploadPrincipal(a: McpPrincipal, b: McpPrincipal) { return a.subject === b.subject && a.issuer === b.issuer && a.clientId === b.clientId; }

/** Only connection entry points call this; ordinary lifecycle callers never do. */
export async function requireAiUploadSession(ctx: QueryCtx | MutationCtx, args: {
  principal?: McpPrincipal; token?: string; uploadSessionId?: Id<"photoUploadSessions">;
  actorUserId?: Id<"users">; moveId?: Id<"moves">; householdId?: Id<"households">; operationId?: string;
  declaration?: Pick<UploadAuthorization, "sha256" | "width" | "height">;
  begin?: boolean; allowOrdinary?: boolean;
}) {
  let session = args.uploadSessionId ? await ctx.db.get(args.uploadSessionId) : null;
  if (args.allowOrdinary) {
    if (!session && args.operationId && args.actorUserId && args.householdId && args.moveId) {
      const key = `${args.moveId}:${args.actorUserId}:${args.operationId}`;
      session = await ctx.db.query("photoUploadSessions").withIndex("by_household_operation", q => q.eq("householdId", args.householdId!).eq("operationId", key)).unique();
    }
    if (!session?.aiUpload) return null;
  }
  const principal = args.principal ?? session?.aiUpload?.principal;
  const moveId = args.moveId ?? session?.moveId;
  if (!principal || !moveId || (!args.principal && !args.token)) return uploadUnavailable();
  // Lazy loading keeps connection-only initialization out of person/job paths.
  const { requireMcpMove } = await import("./mcpGrantAccess");
  const access = await requireMcpMove(ctx, principal, moveId, "inventory:edit", "moving.work.write");
  if (args.actorUserId && args.actorUserId !== access.policy.actor.userId) return uploadUnavailable();
  if (args.householdId && args.householdId !== access.move.householdId) return uploadUnavailable();
  if (args.operationId && !session) {
    const key = `${moveId}:${access.policy.actor.userId}:${args.operationId}`;
    session = await ctx.db.query("photoUploadSessions").withIndex("by_household_operation", q => q.eq("householdId", access.move.householdId).eq("operationId", key)).unique();
  }
  if (args.uploadSessionId && !session) return uploadUnavailable();
  if (session) {
    const binding = session.aiUpload;
    if (!binding || !sameUploadPrincipal(principal, binding.principal) || session.moveId !== moveId || session.householdId !== access.move.householdId || session.createdByUserId !== access.policy.actor.userId) return uploadUnavailable();
    if (args.operationId && session.operationId !== `${moveId}:${access.policy.actor.userId}:${args.operationId}`) return uploadUnavailable();
    if (args.token !== undefined && (args.token !== binding.token || binding.attemptKey !== session.originalStorageKey || ((!args.principal || !session.completedPhotoId) && Math.min(binding.expiresAt ?? session.expiresAt, session.expiresAt) <= Date.now()))) return uploadUnavailable();
    if (args.declaration && (args.declaration.sha256 !== binding.sha256 || args.declaration.width !== binding.width || args.declaration.height !== binding.height)) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "This operationId already names different media." });
    if (!args.begin && !session.completedPhotoId && (session.status !== "authorized" || session.expiresAt <= Date.now())) return uploadUnavailable();
    // A URL capability is the PUT credential. A supplied browser/other identity
    // must not be used to impersonate the connection that owns that capability.
    if (!args.principal) {
      const identity = await ctx.auth.getUserIdentity();
      if (identity) {
        const { oauthClientIdFromClaims } = await import("./mcpClientIdentity");
        if (identity.subject !== principal.subject || identity.issuer.replace(/\/+$/, "") !== principal.issuer.replace(/\/+$/, "") || oauthClientIdFromClaims(identity) !== principal.clientId) return uploadUnavailable();
      }
    }
  }
  return { ...access, session, principal };
}

export function uploadBinding(previous: Doc<"photoUploadSessions"> | null, auth: UploadAuthorization, key: string, expiresAt: number): NonNullable<Doc<"photoUploadSessions">["aiUpload"]> {
  const old = previous?.aiUpload;
  if (old?.attemptKey === key && (old.expiresAt ?? previous!.expiresAt) > Date.now()) return old;
  return { principal: auth.principal, token: auth.token, sha256: auth.sha256, width: auth.width, height: auth.height, attemptKey: key, expiresAt, transferred: false };
}
export function uploadActor(session: Doc<"photoUploadSessions">) {
  const binding = session.aiUpload!;
  return { apiKeyId: "mcp-oauth", createdByUserId: session.createdByUserId, oauthCaller: { subject: binding.principal.subject, claims: { client_id: binding.principal.clientId } }, uploadAuthorization: { principal: binding.principal, token: binding.token, sha256: binding.sha256, width: binding.width, height: binding.height, uploadSessionId: session._id } };
}

export async function checkAiUploadFile(ctx: QueryCtx | MutationCtx, householdId: Id<"households">, input: {
  operationId: string; sha256: string; sizeBytes: number; mimeType: string;
  width?: number; height?: number; audioKind?: "audio" | "voicenote";
}) {
  const { assertOriginalUploadFileShape, assertImageDimensions } = await import("./mediaStorage");
  const { relayCap, sha256Pattern } = await import("./aiUploadCaps");
  const { limitsFor } = await import("../usageLimits");
  const { checkFileSize } = await import("./usageLimits/core");
  if (!sha256Pattern.test(input.sha256) || !input.operationId.trim() || !Number.isSafeInteger(input.sizeBytes)) return uploadUnavailable();
  let shape;
  try {
    shape = assertOriginalUploadFileShape(input, Number.MAX_SAFE_INTEGER);
    assertImageDimensions({ mediaKind: shape.mediaKind, width: input.width, height: input.height });
  } catch (error) { throw new ConvexError({ code: "INVALID_UPLOAD", message: error instanceof Error ? error.message : "Invalid upload declaration." }); }
  const info = await limitsFor(ctx, householdId);
  const kind = shape.mediaKind === "audio" ? input.audioKind ?? "audio" : shape.mediaKind;
  const refusal = checkFileSize(kind, input.sizeBytes, relayCap(kind, info.site, info.override));
  if (refusal) throw new ConvexError(refusal);
}

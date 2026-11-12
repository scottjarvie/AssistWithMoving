import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { mcpPrincipalValidator, requireMcpMove, type McpPrincipal } from "./lib/mcpGrantAccess";
import { limitsFor } from "./usageLimits";
import { assertOriginalUploadFileShape } from "./lib/mediaStorage";
import { checkFileSize } from "./lib/usageLimits/core";
import { relayCap, filesCap, singleFileCount, sha256Pattern, emptyByteCount, successStatus, refusalStatus, sha256Hex, decodeInline } from "./lib/aiUploadCaps";
import { refusalOf } from "./lib/usageLimits/refusal";

const file = v.object({ operationId: v.string(), sizeBytes: v.number(), mimeType: v.string(), sha256: v.string(), audioKind: v.optional(v.union(v.literal("audio"), v.literal("voicenote"))) });
const sessionArgs = { uploadSessionId: v.id("photoUploadSessions"), principal: mcpPrincipalValidator };
function invalid(message: string): never { throw new ConvexError({ code: "INVALID_UPLOAD", message }); }
function samePrincipal(a: McpPrincipal, b: McpPrincipal) { return a.subject === b.subject && a.issuer === b.issuer && a.clientId === b.clientId; }
export const preflight = internalQuery({
  args: { principal: mcpPrincipalValidator, moveId: v.id("moves"), files: v.array(file), single: v.boolean() },
  handler: async (ctx, args) => {
    const { move, policy } = await requireMcpMove(ctx, args.principal, args.moveId, "inventory:edit", "moving.work.write");
    const info = await limitsFor(ctx, move.householdId);
    const maximum = args.single ? singleFileCount : filesCap(info.site, info.override);
    if (!args.files.length || args.files.length > maximum) throw new ConvexError({ code: "REQUEST_TOO_LARGE", message: `Send between ${singleFileCount} and ${maximum} files.` });
    // Route bounds are unconditional: no hold or session exists at this point.
    for (const input of args.files) {
      const kind = input.audioKind ?? input.mimeType.split("/").shift()!;
      const refusal = checkFileSize(kind, input.sizeBytes, relayCap(kind, info.site, info.override));
      if (refusal) throw new ConvexError(refusal);
    }
    return { householdId: move.householdId, apiActor: { apiKeyId: `canonical:${args.principal.clientId}`, createdByUserId: policy.actor.userId, oauthCaller: { subject: args.principal.subject, claims: { client_id: args.principal.clientId } } } };
  },
});

export const bind = internalMutation({
  args: { ...sessionArgs, sha256: v.string(), token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.uploadSessionId);
    if (!session) return invalid("Upload session not found.");
    await requireMcpMove(ctx, args.principal, session.moveId, "inventory:edit", "moving.work.write");
    if (session.aiUpload) {
      if (session.aiUpload.sha256 !== args.sha256 || !samePrincipal(session.aiUpload.principal, args.principal)) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "This operationId already names different media." });
      return session.aiUpload.token;
    }
    await ctx.db.patch(session._id, { aiUpload: { sha256: args.sha256, principal: args.principal, token: args.token, transferred: false } });
    return args.token;
  },
});

type Receipt = { operationId: string; ok: boolean; uploadSessionId?: Id<"photoUploadSessions">; uploadUrl?: string; expiresAt?: number; error?: unknown };
export const begin = internalAction({
  args: { principal: mcpPrincipalValidator, moveId: v.id("moves"), files: v.array(file), single: v.boolean() },
  handler: async (ctx, args): Promise<{ receipts: Receipt[] }> => {
    const scope = await ctx.runQuery(internal.aiUploads.preflight, args);
    const receipts: Receipt[] = [];
    for (const input of args.files) {
      try {
        if (!sha256Pattern.test(input.sha256) || !input.operationId.trim()) invalid("Supply a lowercase SHA-256 and a nonempty operationId.");
        assertOriginalUploadFileShape(input);
        const init = await ctx.runAction(internal.photos.initUploadForActor, { householdId: scope.householdId, moveId: args.moveId, apiActor: scope.apiActor, operationId: `canonical-upload:${args.principal.clientId}:${input.operationId}`, sizeBytes: input.sizeBytes, mimeType: input.mimeType, audioKind: input.audioKind });
        if (init.refusal) throw new ConvexError(init.refusal);
        const uploadSessionId = init.uploadSessionId as Id<"photoUploadSessions">;
        const token = await ctx.runMutation(internal.aiUploads.bind, { uploadSessionId, principal: args.principal, sha256: input.sha256, token: crypto.randomUUID() });
        const session = await ctx.runQuery(internal.aiUploads.resolve, { uploadSessionId, principal: args.principal });
        const url = new URL("/api/ai-upload", process.env.APP_URL ?? "https://movingmanifest.com");
        url.searchParams.set("session", uploadSessionId); url.searchParams.set("token", token);
        receipts.push({ operationId: input.operationId, ok: true, uploadSessionId, uploadUrl: url.href, expiresAt: session.expiresAt });
      } catch (error) {
        receipts.push({ operationId: input.operationId, ok: false, error: refusalOf(error) ?? (error instanceof ConvexError ? error.data : { code: "UPLOAD_FAILED", message: "Upload could not begin. Retry the same operationId." }) });
      }
    }
    return { receipts };
  },
});

export const resolve = internalQuery({
  args: { uploadSessionId: v.id("photoUploadSessions"), principal: v.optional(mcpPrincipalValidator), token: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Doc<"photoUploadSessions">> => {
    const session = await ctx.db.get(args.uploadSessionId);
    const upload = session?.aiUpload;
    if (!session || !upload || (args.principal ? !samePrincipal(args.principal, upload.principal) : args.token !== upload.token)) return invalid("Upload not found.");
    await requireMcpMove(ctx, upload.principal, session.moveId, "inventory:edit", "moving.work.write");
    if (args.token && session.expiresAt <= Date.now()) return invalid("Upload link expired.");
    if (!session.completedPhotoId && (session.status !== "authorized" || session.expiresAt <= Date.now())) return invalid("Upload expired or refused. Begin again with the same operationId.");
    return session;
  },
});
export const transferred = internalMutation({
  args: { uploadSessionId: v.id("photoUploadSessions"), token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.uploadSessionId);
    if (!session?.aiUpload || session.aiUpload.token !== args.token) return invalid("Upload not found.");
    await requireMcpMove(ctx, session.aiUpload.principal, session.moveId, "inventory:edit", "moving.work.write");
    await ctx.db.patch(session._id, { aiUpload: { ...session.aiUpload, transferred: true } });
  },
});
export const finish = internalAction({
  args: sessionArgs,
  handler: async (ctx, args): Promise<unknown> => {
    const session = await ctx.runQuery(internal.aiUploads.resolve, args);
    if (!session.aiUpload?.transferred) return invalid("PUT the complete original before finishing.");
    const scope = await ctx.runQuery(internal.aiUploads.preflight, { principal: args.principal, moveId: session.moveId, single: true, files: [{ operationId: session.operationId!, sizeBytes: session.expectedSizeBytes, mimeType: session.expectedMimeType, sha256: session.aiUpload.sha256, audioKind: session.audioKind }] });
    const result = await ctx.runAction(internal.photos.finalizeUploadForActor, { householdId: session.householdId, moveId: session.moveId, uploadSessionId: session._id, apiActor: scope.apiActor, source: "mcp", originalHash: session.aiUpload.sha256 });
    if (result.refusal) throw new ConvexError(result.refusal);
    return result;
  },
});

/** Ordinary session, ordinary object key, ordinary expiry and cleanup. */
export async function handlePut(ctx: ActionCtx, request: Request): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const url = new URL(request.url), token = url.searchParams.get("token") ?? "";
    const uploadSessionId = url.searchParams.get("session") as Id<"photoUploadSessions">;
    const session = await ctx.runQuery(internal.aiUploads.resolve, { uploadSessionId, token });
    const upload = session.aiUpload!;
    if (Number(request.headers.get("content-length")) !== session.expectedSizeBytes) invalid("Send the declared Content-Length.");
    await ctx.runQuery(internal.aiUploads.preflight, { principal: upload.principal, moveId: session.moveId, single: true, files: [{ operationId: session.operationId!, sizeBytes: session.expectedSizeBytes, mimeType: session.expectedMimeType, sha256: upload.sha256, audioKind: session.audioKind }] });
    const reader = request.body?.getReader();
    if (!reader) return invalid("Send the original bytes.");
    const bytes = new Uint8Array(session.expectedSizeBytes);
    let offset = emptyByteCount;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value.length > bytes.length - offset) invalid("Bytes exceed the declared size.");
        bytes.set(value, offset); offset += value.length;
      }
    } finally { await reader.cancel(); }
    if (offset !== bytes.length) invalid("Bytes do not match the declared size.");
    await transfer(ctx, session, bytes, token);
    return Response.json({ ok: true }, { headers, status: successStatus });
  } catch (error) {
    return Response.json({ error: error instanceof ConvexError ? error.data : { code: "UPLOAD_FAILED", message: "Upload unavailable. Keep the original and retry the same operation." } }, { headers, status: refusalStatus });
  }
}

async function transfer(ctx: ActionCtx, session: Doc<"photoUploadSessions">, bytes: Uint8Array<ArrayBuffer>, token: string) {
    const upload = session.aiUpload!;
    const uploadSessionId = session._id;
    const digest = await sha256Hex(bytes);
    if (digest !== upload.sha256) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "Bytes do not match the operation's SHA-256." });
    if (session.completedPhotoId || upload.transferred) return;
    const scope = await ctx.runQuery(internal.aiUploads.preflight, { principal: upload.principal, moveId: session.moveId, single: true, files: [{ operationId: session.operationId!, sizeBytes: session.expectedSizeBytes, mimeType: session.expectedMimeType, sha256: upload.sha256, audioKind: session.audioKind }] });
    const init = await ctx.runAction(internal.photos.initUploadForActor, { householdId: session.householdId, moveId: session.moveId, apiActor: scope.apiActor, operationId: session.operationId!.split(`${session.moveId}:${session.createdByUserId}:`).pop(), mimeType: session.expectedMimeType, sizeBytes: session.expectedSizeBytes, audioKind: session.audioKind });
    if (init.refusal) throw new ConvexError(init.refusal);
    const response = await fetch(init.uploadUrl, { method: "PUT", headers: init.headers, body: bytes, redirect: "error" });
    if (!response.ok) invalid("Storage did not accept the original. Retry the same upload.");
    await ctx.runMutation(internal.aiUploads.transferred, { uploadSessionId, token });
}

export const inline = internalAction({
  args: { principal: mcpPrincipalValidator, moveId: v.id("moves"), input: file, base64: v.string() },
  handler: async (ctx, args): Promise<unknown> => {
    // Validate the declaration and encoded bound before decoding or reserving.
    await ctx.runQuery(internal.aiUploads.preflight, { principal: args.principal, moveId: args.moveId, single: true, files: [args.input] });
    const bytes = decodeInline(args.base64, args.input.sizeBytes);
    if (await sha256Hex(bytes) !== args.input.sha256) return invalid("Inline bytes do not match the declared SHA-256.");
    const result = await ctx.runAction(internal.aiUploads.begin, { principal: args.principal, moveId: args.moveId, single: true, files: [args.input] });
    const receipt = result.receipts.at(emptyByteCount)!;
    if (!receipt.ok) throw new ConvexError(receipt.error as string);
    const session = await ctx.runQuery(internal.aiUploads.resolve, { principal: args.principal, uploadSessionId: receipt.uploadSessionId! });
    if (!session.aiUpload!.transferred) await transfer(ctx, session, bytes, session.aiUpload!.token);
    return ctx.runAction(internal.aiUploads.finish, { principal: args.principal, uploadSessionId: session._id });
  },
});

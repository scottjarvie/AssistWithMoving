import type { TestConvex } from "convex-test";
import type schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";
import { api, internal } from "../../convex/_generated/api";
import { registerTools } from "../../mcp-server/assistwithmoving-mcp.mjs";
import { DEFAULT_REMOTE_MEDIA_BYTES } from "../../mcp-server/media-ingress.mjs";
import { transportLimits } from "../../shared/media-limits.mjs";
import { uploadPolicyLine } from "../../shared/upload-policy.mjs";
import { MAX_HOSTED_MCP_REQUEST_BYTES } from "../../src/lib/mcp-input-limits";
import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";

/** Run this identical probe on a main checkout to regenerate the numeric fixture. */
export async function probeUploadBounds(f: {
 t: TestConvex<typeof schema>; person: Pick<TestConvex<typeof schema>, "action">;
 scope: { householdId: Id<"households">; moveId: Id<"moves"> }; member: Id<"users">;
}) {
 const policy = await f.t.query(internal.usageLimits.policyInternal, { householdId: f.scope.householdId });
 const numeric = { files: policy.maxFileBytes, batchItems: policy.mcpBatchMaxItems, batchBytes: policy.mcpBatchMaxBytes };
 const { generateApiKeySecret, apiKeyPrefix, hashApiKey } = await import("../../convex/lib/apiKeys");
 const secret = generateApiKeySecret();
 const keyId = await f.t.run(async ctx => ctx.db.insert("apiKeys", { householdId: f.scope.householdId, name: "Example connection", prefix: apiKeyPrefix(secret), tokenPreview: "synthetic", secretHash: await hashApiKey(secret), scopes: ["moves/read", "inventory/read", "photos/write"], scopeChoice: "chosen", status: "active", createdByUserId: f.member, createdAt: Date.now(), updatedAt: Date.now() }));
 await f.t.mutation(internal.apiKeys.connectCallingKey, { apiKeyId: keyId });
 for (let i = 0; i < 2; i++) await f.t.mutation(internal.aiGrants.continueBootstrap, { ownerUserId: f.member });
 const website: Record<string, boolean[]> = {}, apiBegin: Record<string, boolean[]> = {};
 for (const [kind, mimeType] of [["image", "image/png"], ["audio", "audio/wav"], ["voicenote", "audio/wav"], ["video", "video/mp4"]]) {
  website[kind] = []; apiBegin[kind] = [];
  for (const sizeBytes of [policy.maxFileBytes[kind], policy.maxFileBytes[kind] + 1]) {
   const body = { operationId: `probe-${kind}-${sizeBytes}`, mimeType, sizeBytes, audioKind: kind === "voicenote" ? "voicenote" as const : undefined };
   try { await f.person.action(api.photos.initUpload, { ...f.scope, ...body }); website[kind].push(true); }
   catch { website[kind].push(false); }
   const response = await f.t.action(internal.restApiActions.handle, { method: "POST", path: "/uploads/init", query: {}, authorization: `Bearer ${secret}`, body: { ...body, operationId: `key-${body.operationId}`, moveId: f.scope.moveId } });
   apiBegin[kind].push(response.status === 201);
  }
 }
 const shapes: Record<string, { files: Record<string, number>; maximumItems: number | null; schemaMaxBytes: number | null; policyResolved: boolean }> = {};
 const names = ["start_photo_upload", "finalize_photo_upload", "upload_evidence_file", "upload_evidence_image", "upload_evidence_images", "upload_photo", "upload_image", "upload_photos", "upload_images"];
 registerTools({ registerTool(name: string, config: { inputSchema: Record<string, z.ZodType>; description: string }) {
  if (!names.includes(name)) return;
  const broad = ["start_photo_upload", "finalize_photo_upload", "upload_evidence_file"].includes(name);
  const batch = ["upload_evidence_images", "upload_photos", "upload_images"].includes(name);
  const array = config.inputSchema.images;
  let maximumItems: number | null = null;
  if (array) { maximumItems = 0; for (let count = 1; count <= 128; count++) { if (!array.safeParse(Array.from({ length: count }, () => ({ fileBase64: "AAAA" }))).success) break; maximumItems = count; } }
  shapes[name] = { files: broad ? policy.maxFileBytes : { image: policy.maxFileBytes.image }, maximumItems, schemaMaxBytes: config.inputSchema.sizeBytes instanceof z.ZodNumber ? config.inputSchema.sizeBytes.maxValue : null, policyResolved: config.description.includes(uploadPolicyLine(policy, { batch, kinds: broad ? undefined : ["image"] })) };
 } }, { baseUrl: "https://example.invalid", apiKey: "" }, { uploadLimits: policy });
 const sharp = (await import("sharp")).default;
 const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
 const legacy = await f.t.action(internal.mcpToolsImages.addImages, { ...f.scope, operationId: "legacy-probe", caller: { subject: "synthetic-member", claims: { client_id: "example-client" } }, images: [{ base64: png.toString("base64"), mimeType: "image/png" }] });
 const canonicalSource = readFileSync("convex/httpRoutes/mcp.ts", "utf8");
 const constantSource = /const MAX_MCP_REQUEST_BYTES = ([\d_]+)\s*\*\s*([\d_]+)/.exec(canonicalSource) ?? (existsSync("convex/lib/aiUploadCaps.ts") ? /const canonicalRequestBytes = ([\d_]+)\s*\*\s*([\d_]+)/.exec(readFileSync("convex/lib/aiUploadCaps.ts", "utf8")) : null);
 if (!constantSource) throw new Error("Canonical request ceiling was not found.");
 return { numeric, website, apiBegin, tools: shapes, legacy: { accepted: legacy.results[0].ok, files: legacy.uploadLimits!.maxFileBytes, batchItems: legacy.uploadLimits!.mcpBatchMaxItems, batchBytes: legacy.uploadLimits!.mcpBatchMaxBytes }, transports: { image: transportLimits.image, audio: transportLimits.audio, video: transportLimits.video, publicFetchDefault: DEFAULT_REMOTE_MEDIA_BYTES, hostedJson: MAX_HOSTED_MCP_REQUEST_BYTES, canonicalJson: Number(constantSource[1].replaceAll("_", "")) * Number(constantSource[2].replaceAll("_", "")) } };
}

import { ConvexError } from "convex/values";
import { DEFAULT_LIMITS, effectiveFileCap } from "./usageLimits/core";
import { siteDefaults } from "../../shared/media-limits.mjs";
/** Reuse the canonical MCP request ceiling for the small first-party relay. */
export const canonicalRequestBytes = 512 * 1024;
export const uploadFilesPerCall = DEFAULT_LIMITS.mcpBatchMaxItems;
export const singleFileCount = 1;
export const emptyByteCount = 0;
export const sha256Pattern = /^[a-f0-9]{64}$/;
export const successStatus = 200;
export const refusalStatus = 400;
export function normalizeUploadBound(value: unknown, ceiling: number, fallback = ceiling): number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 1 && value <= ceiling ? value : fallback;
}
export function relayCap(kind: string, site: Parameters<typeof effectiveFileCap>[2], override: Parameters<typeof effectiveFileCap>[3]) {
  return normalizeUploadBound(effectiveFileCap(kind, siteDefaults, site, override), canonicalRequestBytes);
}

export const unavailableStatus = 503;
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}
export function decodeInline(base64: string, size: number): Uint8Array<ArrayBuffer> {
  if (base64.length !== Math.ceil(size / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new ConvexError({ code: "INVALID_UPLOAD", message: "Supply canonical base64 for the declared size." });
  const bytes = new Uint8Array(size);
  const block = 4096;
  let offset = 0;
  for (let at = 0; at < base64.length; at += block) {
    const decoded = atob(base64.slice(at, at + block));
    for (let i = 0; i < decoded.length; i++) bytes[offset++] = decoded.charCodeAt(i);
  }
  if (offset !== size) throw new ConvexError({ code: "INVALID_UPLOAD", message: "Inline size does not match." });
  return bytes;
}

export function filesCap(site: Parameters<typeof effectiveFileCap>[2], override: Parameters<typeof effectiveFileCap>[3]) {
  return normalizeUploadBound(override?.mcpBatchMaxItems ?? site?.mcpBatchMaxItems, uploadFilesPerCall);
}

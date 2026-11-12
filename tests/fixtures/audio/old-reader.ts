// Public reader snapshot from 3b41f84 for backend/website rollout compatibility.
import { usageLimitError, type UsageLimitError } from "../../../convex/lib/usageLimits/core";

export function oldUploadRefusal(error: unknown): { code: string; message: string } | null {
  if (!error || typeof error !== "object") return null;
  const outer = error as { data?: unknown; code?: string; message?: string };
  let data = outer.data ?? outer;
  if (typeof data === "string") {
    const code = data.match(/\[(USAGE_LIMIT_REACHED|FILE_TOO_LARGE|REQUEST_TOO_LARGE)\]$/)?.[1];
    if (code) return { code, message: data.replace(/ \[.*\]$/, "") };
    try { data = JSON.parse(data); } catch { return null; }
  }
  if (!data || typeof data !== "object") return null;
  const refusal = data as { code: string; message: string; batchTotalUnknown?: boolean };
  if (refusal.code === "USAGE_LIMIT_REACHED" && refusal.batchTotalUnknown) return { code: refusal.code, message: refusal.message };
  if (refusal.code === "USAGE_LIMIT_REACHED") return { code: refusal.code, message: usageLimitError(data as UsageLimitError).message };
  if (refusal.code === "FILE_TOO_LARGE" || refusal.code === "REQUEST_TOO_LARGE") return { code: refusal.code, message: refusal.message };
  return null;
}

export function oldIsRetryableUploadError(
  error: unknown,
  signal?: AbortSignal,
): boolean {
  if (signal?.aborted || oldUploadRefusal(error)) return false;
  const name = (error as { name?: string } | null)?.name;
  if (name === "AbortError") return false;
  const message = String(
    (error as { message?: string } | null)?.message ?? error,
  ).toLowerCase();
  const permanent = [
    "too large",
    "unsupported",
    "not allowed",
    "not configured",
    "permission",
    "forbidden",
    "invalid api key",
    "unauthorized",
    "did not return a photo id",
  ];
  if (permanent.some((needle) => message.includes(needle))) return false;
  return true;
}


export function oldFriendlyUploadError(error: unknown): string {
  const refusal = oldUploadRefusal(error);
  if (refusal) return refusal.message;
  const raw = error instanceof Error && error.message ? error.message : "";
  const lower = raw.toLowerCase();
  if (lower.includes("too large")) return "That file is too large to upload.";
  if (lower.includes("unsupported") || lower.includes("not allowed")) {
    return "That file type can't be uploaded.";
  }
  if (
    lower.includes("forbidden") ||
    lower.includes("signature") ||
    lower.includes("403")
  ) {
    return "Storage rejected the upload. Tap retry.";
  }
  if (
    lower.includes("timed out") ||
    lower.includes("timeout")
  ) {
    return "Upload timed out. Check your connection and tap retry.";
  }
  if (
    lower.includes("network") ||
    lower.includes("failed to fetch") ||
    raw === ""
  ) {
    return "Network problem during upload. Tap retry.";
  }
  return "Upload failed. Tap retry.";
}

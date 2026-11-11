import { usageLimitError, type UsageLimitError } from "../../convex/lib/usageLimits/core";

export function uploadRefusal(error: unknown): { code: string; message: string } | null {
  if (!error || typeof error !== "object") return null;
  const outer = error as { data?: unknown; code?: string; message?: string };
  let data = outer.data ?? outer;
  if (typeof data === "string") {
    const code = data.match(/\[(USAGE_LIMIT_REACHED|FILE_TOO_LARGE|REQUEST_TOO_LARGE)\]$/)?.[1];
    if (code) return { code, message: data.replace(/ \[.*\]$/, "") };
    try { data = JSON.parse(data); } catch { return null; }
  }
  if (!data || typeof data !== "object") return null;
  const refusal = data as { code: string; message: string };
  if (refusal.code === "USAGE_LIMIT_REACHED") return { code: refusal.code, message: usageLimitError(data as UsageLimitError).message };
  if (refusal.code === "FILE_TOO_LARGE" || refusal.code === "REQUEST_TOO_LARGE") return { code: refusal.code, message: refusal.message };
  return null;
}

import { ConvexError } from "convex/values";
import { mcpLimitText, type UsageLimitError, type FileTooLarge, type RequestTooLarge } from "./core";
type AudioRefusal = { code: "AUDIO_TOO_LONG" | "INVALID_AUDIO_CONTAINER" | "AUDIO_HAS_VIDEO"; message: string };
export type UploadRefusal = AudioRefusal | UsageLimitError | FileTooLarge | RequestTooLarge | { code: "OPERATION_CONFLICT" | "OPERATION_ID_REQUIRED"; message: string };
export function refusalOf(error: unknown): UploadRefusal | null {
  if (!(error instanceof ConvexError) || !error.data || typeof error.data !== "object") return null;
  const data = error.data as UploadRefusal;
  return ["AUDIO_TOO_LONG", "INVALID_AUDIO_CONTAINER", "AUDIO_HAS_VIDEO", "USAGE_LIMIT_REACHED", "FILE_TOO_LARGE", "REQUEST_TOO_LARGE", "OPERATION_CONFLICT", "OPERATION_ID_REQUIRED"].includes(data.code) ? data : null;
}
export function aiRefusal(refusal: UploadRefusal) {
  return { isError: true as const, structuredContent: refusal, content: [{ type: "text" as const, text: refusal.code === "USAGE_LIMIT_REACHED" ? mcpLimitText(refusal) : refusal.code === "FILE_TOO_LARGE" ? `${refusal.kind} file too large: ${refusal.got} bytes; maximum ${refusal.max} bytes.` : refusal.message }] };
}
export function personRefusal(refusal: UploadRefusal): never {
  if (["AUDIO_TOO_LONG", "INVALID_AUDIO_CONTAINER", "AUDIO_HAS_VIDEO"].includes(refusal.code)) throw new ConvexError(refusal);
  // The live client knows readable string errors. Keep those readable during a
  // backend-first rollout; new readers additionally recognize the code suffix.
  throw new ConvexError(`${refusal.code === "FILE_TOO_LARGE" ? "That file is too large to upload. " : ""}${refusal.message} [${refusal.code}]`);
}

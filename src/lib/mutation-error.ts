import { ConvexError, type Value } from "convex/values";

export const offlineMutationMessage =
  "You appear to be offline — check your connection and try again.";

function convexErrorMessage(error: ConvexError<Value>) {
  const { data } = error;
  if (typeof data === "string" && data.trim()) {
    return data;
  }
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string" &&
    data.message.trim()
  ) {
    return data.message;
  }
  return null;
}

export function describeMutationError(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    return convexErrorMessage(error) ?? fallback;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return offlineMutationMessage;
  }
  if (error instanceof TypeError) {
    return offlineMutationMessage;
  }
  return fallback;
}

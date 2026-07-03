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
  // Only network-shaped TypeErrors mean "offline" — a plain coding bug
  // (e.g. reading a property of undefined) inside a try block must fall
  // through to the caller's fallback instead of masquerading as a
  // connectivity problem.
  if (
    error instanceof TypeError &&
    /fetch|network|load failed|connection/i.test(error.message)
  ) {
    return offlineMutationMessage;
  }
  return fallback;
}

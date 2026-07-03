import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { describeMutationError, offlineMutationMessage } from "@/lib/mutation-error";

describe("describeMutationError", () => {
  it.each([
    {
      name: "ConvexError string data",
      error: new ConvexError("Use a valid email address."),
      expected: "Use a valid email address.",
    },
    {
      name: "ConvexError object message data",
      error: new ConvexError({ message: "That address could not be parsed" }),
      expected: "That address could not be parsed",
    },
    {
      name: "network TypeError",
      error: new TypeError("Failed to fetch"),
      expected: offlineMutationMessage,
    },
    {
      name: "random Error",
      error: new Error("database stack leaked"),
      expected: "Try that again.",
    },
  ])("returns the safe message for $name", ({ error, expected }) => {
    expect(describeMutationError(error, "Try that again.")).toBe(expected);
  });

  it("never returns an unexpected raw Error message", () => {
    expect(
      describeMutationError(
        new Error("Sensitive backend detail"),
        "Use the safe fallback.",
      ),
    ).toBe("Use the safe fallback.");
  });
});

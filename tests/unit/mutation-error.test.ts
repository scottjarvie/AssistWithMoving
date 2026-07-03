import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

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
    {
      name: "coding-bug TypeError while online",
      error: new TypeError("Cannot read properties of undefined (reading 'foo')"),
      expected: "Try that again.",
    },
    {
      name: "ConvexError with whitespace-only string data",
      error: new ConvexError("   "),
      expected: "Try that again.",
    },
    {
      name: "ConvexError with whitespace-only object message",
      error: new ConvexError({ message: "  " }),
      expected: "Try that again.",
    },
    {
      name: "thrown string",
      error: "boom",
      expected: "Try that again.",
    },
    {
      name: "thrown undefined",
      error: undefined,
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

describe("describeMutationError offline handling", () => {
  it("returns the offline message for any error while navigator reports offline", () => {
    const onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    try {
      expect(describeMutationError(new Error("anything"), "fallback")).toBe(
        offlineMutationMessage,
      );
    } finally {
      onLine.mockRestore();
    }
  });

  it("still prefers a ConvexError message while offline", () => {
    const onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    try {
      expect(
        describeMutationError(new ConvexError("Name is required."), "fallback"),
      ).toBe("Name is required.");
    } finally {
      onLine.mockRestore();
    }
  });
});

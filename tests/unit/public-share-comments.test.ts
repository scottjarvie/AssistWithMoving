import { describe, expect, it } from "vitest";

import {
  assertPublicShareCanComment,
  maxPublicShareCommentAuthorLength,
  maxPublicShareCommentLength,
  normalizePublicShareComment,
  normalizePublicShareCommentAuthor,
} from "../../convex/lib/publicShareComments";

describe("public share comments", () => {
  it("requires explicit comment action", () => {
    expect(() => assertPublicShareCanComment(["view"])).toThrow(
      "Share link does not allow comments."
    );
    expect(() => assertPublicShareCanComment(["view", "comment"])).not.toThrow();
  });

  it("normalizes bounded comment text", () => {
    expect(normalizePublicShareComment("  Pickup window changed.\r\nCall first.  ")).toBe(
      "Pickup window changed.\nCall first."
    );
    expect(() => normalizePublicShareComment("   ")).toThrow(
      "Comment cannot be empty."
    );
    expect(() =>
      normalizePublicShareComment("a".repeat(maxPublicShareCommentLength + 1))
    ).toThrow(`Comment must be ${maxPublicShareCommentLength} characters or fewer.`);
  });

  it("normalizes optional author labels without requiring identity", () => {
    expect(normalizePublicShareCommentAuthor("  Driver dispatch  ")).toBe(
      "Driver dispatch"
    );
    expect(normalizePublicShareCommentAuthor("   ")).toBeUndefined();
    expect(
      normalizePublicShareCommentAuthor(
        "a".repeat(maxPublicShareCommentAuthorLength + 5)
      )
    ).toHaveLength(maxPublicShareCommentAuthorLength);
  });
});

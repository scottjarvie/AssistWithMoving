import { describe, expect, it } from "vitest";

import {
  selectDerivativeRef,
  shouldUseOriginalFallback,
} from "../../convex/lib/photoDelivery";

describe("photo delivery", () => {
  it("selects the requested derivative when available", () => {
    expect(
      selectDerivativeRef(
        {
          thumb: "thumb.webp",
          card: "card.webp",
        },
        "card"
      )
    ).toEqual({ ref: "card.webp", variant: "card" });
  });

  it("falls back to larger derivatives before smaller thumbnails", () => {
    expect(
      selectDerivativeRef(
        {
          thumb: "thumb.webp",
          full: "full.webp",
        },
        "card"
      )
    ).toEqual({ ref: "full.webp", variant: "full" });
  });

  it("requires sensitive-photo visibility for original fallback", () => {
    expect(shouldUseOriginalFallback({ canViewOriginal: true })).toBe(true);
    expect(shouldUseOriginalFallback({ canViewOriginal: false })).toBe(false);
  });
});

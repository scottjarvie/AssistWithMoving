import { describe, expect, it } from "vitest";

import {
  cloudflareImageDeliveryBaseUrl,
  cloudflareImageDeliveryUrl,
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

  it("builds default Cloudflare Images delivery URLs", () => {
    expect(
      cloudflareImageDeliveryUrl({
        accountHash: "hash_123",
        imageId: "image-123",
        variant: "card",
      })
    ).toBe("https://imagedelivery.net/hash_123/image-123/card");
  });

  it("builds custom delivery base URLs when a full base path is configured", () => {
    expect(
      cloudflareImageDeliveryUrl({
        deliveryBaseUrl:
          "https://movingmanifest.com/cdn-cgi/imagedelivery/hash_123/",
        imageId: "image-123",
        variant: "detail",
      })
    ).toBe(
      "https://movingmanifest.com/cdn-cgi/imagedelivery/hash_123/image-123/detail"
    );
  });

  it("builds Cloudflare custom-domain delivery bases from domain and account hash", () => {
    expect(
      cloudflareImageDeliveryBaseUrl({
        accountHash: "hash_123",
        deliveryDomain: "movingmanifest.com",
      })
    ).toBe("https://movingmanifest.com/cdn-cgi/imagedelivery/hash_123");
  });

  it("returns null until Cloudflare delivery config and image ids exist", () => {
    expect(
      cloudflareImageDeliveryUrl({
        accountHash: "hash_123",
        variant: "thumb",
      })
    ).toBeNull();
    expect(
      cloudflareImageDeliveryUrl({
        imageId: "image-123",
        variant: "thumb",
      })
    ).toBeNull();
  });

  it("encodes custom Cloudflare image id paths without exposing raw percent characters", () => {
    expect(
      cloudflareImageDeliveryUrl({
        accountHash: "hash_123",
        imageId: "moves/one/photo%id",
        variant: "full",
      })
    ).toBe("https://imagedelivery.net/hash_123/moves/one/photo%25id/full");
  });
});

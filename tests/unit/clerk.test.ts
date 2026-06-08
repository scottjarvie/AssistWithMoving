import { describe, expect, it } from "vitest";

import { normalizeClerkUser } from "../../convex/lib/clerk";

describe("normalizeClerkUser", () => {
  it("uses Clerk primary email and full name when available", () => {
    expect(
      normalizeClerkUser({
        id: "user_123",
        first_name: "Ada",
        last_name: "Lovelace",
        primary_email_address_id: "email_primary",
        email_addresses: [
          { id: "email_other", email_address: "other@example.com" },
          { id: "email_primary", email_address: "ada@example.com" },
        ],
        image_url: "https://img.example.com/ada.png",
        updated_at: 123,
      })
    ).toEqual({
      clerkUserId: "user_123",
      email: "ada@example.com",
      name: "Ada Lovelace",
      imageUrl: "https://img.example.com/ada.png",
      sourceUpdatedAt: 123,
    });
  });

  it("falls back to username or email for display name", () => {
    expect(
      normalizeClerkUser({
        id: "user_456",
        username: "jarvie",
        email_addresses: [{ id: "email_1", email_address: "sj@example.com" }],
      })
    ).toMatchObject({
      clerkUserId: "user_456",
      email: "sj@example.com",
      name: "jarvie",
    });
  });
});

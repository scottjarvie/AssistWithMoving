import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ClerkWebhookPayloadError,
  normalizeClerkOrganization,
  normalizeClerkOrganizationFromMembership,
  normalizeClerkOrganizationMembership,
  normalizeClerkPublicUserFromMembership,
  normalizeClerkUser,
  verifyClerkWebhookRequest,
} from "../../convex/lib/clerk";

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

  it("normalizes Clerk organization metadata without linking app access", () => {
    expect(
      normalizeClerkOrganization({
        id: "org_123",
        name: "Jarvie Household",
        slug: "jarvie-household",
        image_url: "https://img.example.com/org.png",
        updated_at: 456,
      })
    ).toEqual({
      clerkOrganizationId: "org_123",
      name: "Jarvie Household",
      slug: "jarvie-household",
      imageUrl: "https://img.example.com/org.png",
      sourceUpdatedAt: 456,
    });
  });

  it("normalizes Clerk organization memberships and public user data", () => {
    const payload = {
      id: "orgmem_123",
      role: "org:admin",
      organization: {
        id: "org_123",
        name: "PCS Household",
        slug: "pcs-household",
      },
      public_user_data: {
        user_id: "user_123",
        first_name: "Scott",
        last_name: "Jarvie",
        image_url: "https://img.example.com/scott.png",
        identifier: "scott@example.com",
      },
      updated_at: 789,
    };

    expect(normalizeClerkOrganizationFromMembership(payload)).toEqual({
      clerkOrganizationId: "org_123",
      name: "PCS Household",
      slug: "pcs-household",
      imageUrl: undefined,
      sourceUpdatedAt: undefined,
    });
    expect(normalizeClerkPublicUserFromMembership(payload)).toEqual({
      clerkUserId: "user_123",
      email: "scott@example.com",
      name: "Scott Jarvie",
      imageUrl: "https://img.example.com/scott.png",
      sourceUpdatedAt: 789,
    });
    expect(normalizeClerkOrganizationMembership(payload)).toEqual({
      clerkOrganizationMembershipId: "orgmem_123",
      clerkOrganizationId: "org_123",
      clerkUserId: "user_123",
      rawRole: "org:admin",
      sourceUpdatedAt: 789,
    });
  });

  it("rejects organization membership payloads that cannot be mapped safely", () => {
    expect(() =>
      normalizeClerkOrganizationMembership({
        id: "orgmem_missing",
        public_user_data: { user_id: "user_123" },
      })
    ).toThrow(ClerkWebhookPayloadError);
    expect(() =>
      normalizeClerkOrganizationMembership({
        id: "orgmem_missing",
        organization: { id: "org_123" },
      })
    ).toThrow(ClerkWebhookPayloadError);
  });

  it("verifies signed Clerk webhook requests and rejects tampered signatures", async () => {
    const signingSecret = `whsec_${Buffer.from(
      "movingmanifest-test-secret"
    ).toString("base64")}`;
    const payload = JSON.stringify({
      type: "user.created",
      data: { id: "user_123" },
    });
    const eventId = "evt_test_123";
    const timestamp = Math.floor(Date.now() / 1000).toString();

    await expect(
      verifyClerkWebhookRequest(
        clerkWebhookRequest({
          payload,
          eventId,
          timestamp,
          signature: signClerkWebhook({
            payload,
            eventId,
            timestamp,
            signingSecret,
          }),
        }),
        signingSecret
      )
    ).resolves.toMatchObject({
      type: "user.created",
      data: { id: "user_123" },
    });

    await expect(
      verifyClerkWebhookRequest(
        clerkWebhookRequest({
          payload,
          eventId,
          timestamp,
          signature: "v1,tampered",
        }),
        signingSecret
      )
    ).rejects.toThrow();
  });
});

function clerkWebhookRequest({
  payload,
  eventId,
  timestamp,
  signature,
}: {
  payload: string;
  eventId: string;
  timestamp: string;
  signature: string;
}) {
  return new Request("https://convex.example.com/clerk-webhook", {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      "svix-id": eventId,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    },
  });
}

function signClerkWebhook({
  payload,
  eventId,
  timestamp,
  signingSecret,
}: {
  payload: string;
  eventId: string;
  timestamp: string;
  signingSecret: string;
}) {
  const key = Buffer.from(signingSecret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key)
    .update(`${eventId}.${timestamp}.${payload}`)
    .digest("base64")}`;
}

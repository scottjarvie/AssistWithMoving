import { describe, expect, it } from "vitest";

import { oauthIdentityClaimsFromRequest } from "../../convex/http";

function jwtWithPayload(payload: Record<string, unknown>) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value), "utf8")
      .toString("base64url")
      .replace(/=+$/, "");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

function bearerRequest(token: string) {
  return new Request("https://movingmanifest.test/api/v1/items", {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

describe("OAuth REST identity claims", () => {
  it("extracts OAuth client and token ids from Clerk access-token JWT claims", () => {
    const request = bearerRequest(
      jwtWithPayload({
        sub: "user_123",
        azp: "oauth-client-abc",
        jti: "token-xyz",
      })
    );

    expect(oauthIdentityClaimsFromRequest(request)).toEqual({
      oauthClientId: "oauth-client-abc",
      oauthTokenId: "token-xyz",
    });
  });

  it("accepts alternate OAuth client id claim names used by providers", () => {
    expect(
      oauthIdentityClaimsFromRequest(
        bearerRequest(
          jwtWithPayload({
            client_id: "registered-client",
          })
        )
      )
    ).toMatchObject({ oauthClientId: "registered-client" });

    expect(
      oauthIdentityClaimsFromRequest(
        bearerRequest(
          jwtWithPayload({
            cid: "fallback-client",
          })
        )
      )
    ).toMatchObject({ oauthClientId: "fallback-client" });
  });

  it("does not invent OAuth claims for opaque or malformed bearer tokens", () => {
    expect(oauthIdentityClaimsFromRequest(bearerRequest("opaque-token"))).toEqual({
      oauthClientId: undefined,
      oauthTokenId: undefined,
    });
  });
});

/**
 * Three token outcomes on the canonical /mcp door, not two.
 *
 * `verifyOAuth` used to wrap the whole verification in one catch and answer 401
 * to all of it. A JWKS fetch that failed because Clerk was briefly unreachable
 * came back as "The Assist With Moving OAuth token is invalid for this
 * resource" — telling a client holding a perfectly good token to go and get a
 * new one. It cannot: the same outage breaks the authorization endpoint too, so
 * it loops until the outage ends, and reports the site as broken meanwhile.
 *
 * These tests read the source rather than driving the handler, because the
 * handler needs a Convex action context and a live issuer. That is a weaker
 * instrument than an integration test and is chosen deliberately: it is strong
 * enough to catch the specific regression of somebody collapsing the classifier
 * back into a single catch.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "convex", "httpRoutes", "mcp.ts"),
  "utf8",
);

describe("the canonical door can say it is unavailable", () => {
  it("has a 503 response and did not have one before", () => {
    expect(source).toMatch(/function serviceUnavailable\(/);
    expect(source).toMatch(/status: 503/);
  });

  it("tells the client to try again rather than to re-authorize", () => {
    const message =
      /The authorization server could not be reached\. Try again shortly\./;
    expect(source).toMatch(message);
  });

  it("sends Retry-After so the retry is not a guess", () => {
    expect(source).toMatch(/"Retry-After"/);
  });

  it("uses an error code that means transient, not invalid", () => {
    expect(source).toMatch(/error: "temporarily_unavailable"/);
  });
});

describe("the classifier decides which outcome applies", () => {
  it("enumerates token faults positively, so an unknown error is an outage", () => {
    expect(source).toMatch(/function isTokenFault\(/);
    for (const klass of [
      "TokenFault",
      "joseErrors.JWTExpired",
      "joseErrors.JWTClaimValidationFailed",
      "joseErrors.JWTInvalid",
      "joseErrors.JWSInvalid",
      "joseErrors.JWSSignatureVerificationFailed",
      "joseErrors.JWKSNoMatchingKey",
      "joseErrors.JWKSMultipleMatchingKeys",
    ]) {
      expect(source, `isTokenFault must name ${klass}`).toContain(klass);
    }
  });

  it("routes a non-token error to 503 before it can reach the 401", () => {
    expect(source).toMatch(/if \(!isTokenFault\(error\)\) \{[\s\S]*?serviceUnavailable\(\)/);
  });

  it("still answers 401 for a genuinely bad or expired token", () => {
    expect(source).toMatch(/The Assist With Moving OAuth token expired\./);
    expect(source).toMatch(
      /challenge\(resource, "invalid_token", description\)/,
    );
  });

  it("tags its own claim checks so they are not mistaken for an outage", () => {
    // Every hand-thrown check inside verifyOAuth must be a TokenFault. A plain
    // Error would now be read as "Clerk is down" and answered with a 503.
    const body = source.slice(
      source.indexOf("async function verifyOAuth"),
      source.indexOf("function canonicalJson"),
    );
    expect(body.length).toBeGreaterThan(200);
    expect(body).not.toMatch(/throw new Error\(/);
    expect(body).toMatch(/throw new TokenFault\(/);
  });
});

describe("an unconfigured endpoint is our fault, and says so", () => {
  it("does not let a missing environment variable become a bare 500", () => {
    const body = source.slice(
      source.indexOf("async function handleMcp"),
      source.indexOf("async function handleMcp") + 1600,
    );
    expect(body).toMatch(/try \{[\s\S]*?requiredUrl\("MCP_RESOURCE_URL"\)/);
    expect(body).toMatch(/serviceUnavailable\(/);
  });

  it("names configuration rather than blaming the caller's token", () => {
    expect(source).toMatch(
      /This Assist With Moving endpoint is not configured yet\. Try again shortly\./,
    );
  });
});

describe("the messages stay safe to put in a header", () => {
  it("keeps every challenge and unavailable string plain ASCII", () => {
    const strings = [
      ...source.matchAll(/error_description: "([^"]+)"/g),
      ...source.matchAll(/serviceUnavailable\(\s*"([^"]+)"/g),
      ...source.matchAll(/description = "([^"]+)"/g),
    ].map((match) => match[1]);
    expect(strings.length).toBeGreaterThan(0);
    for (const value of strings) {
      expect(/^[\x20-\x7E]*$/.test(value), `non-ASCII: ${value}`).toBe(true);
    }
  });
});

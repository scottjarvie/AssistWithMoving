import { describe, expect, it } from "vitest";

import {
  contentSecurityPolicy,
  normalizeContentSecurityPolicyMode,
  securityHeadersForMode,
} from "@/lib/security-headers";

describe("security headers", () => {
  it("defaults to report-only CSP until production origins settle", () => {
    const headers = securityHeadersForMode(undefined);

    expect(normalizeContentSecurityPolicyMode(undefined)).toBe("report-only");
    expect(headers).toContainEqual({
      key: "Content-Security-Policy-Report-Only",
      value: contentSecurityPolicy,
    });
    expect(headers.some((header) => header.key === "Content-Security-Policy")).toBe(
      false
    );
  });

  it("can emit an enforced CSP header for final launch hardening", () => {
    const headers = securityHeadersForMode("enforce");

    expect(normalizeContentSecurityPolicyMode("enforce")).toBe("enforce");
    expect(headers).toContainEqual({
      key: "Content-Security-Policy",
      value: contentSecurityPolicy,
    });
    expect(
      headers.some((header) => header.key === "Content-Security-Policy-Report-Only")
    ).toBe(false);
  });

  it("keeps invalid CSP modes in report-only mode", () => {
    expect(normalizeContentSecurityPolicyMode("strict")).toBe("report-only");
    expect(securityHeadersForMode("strict")).toContainEqual({
      key: "Content-Security-Policy-Report-Only",
      value: contentSecurityPolicy,
    });
  });

  it("keeps the required browser hardening headers together", () => {
    const headers = securityHeadersForMode(undefined);

    expect(headers).toEqual(
      expect.arrayContaining([
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000",
        },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Cross-Origin-Opener-Policy",
          value: "same-origin-allow-popups",
        },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      ])
    );
  });
});

import { expect, test } from "@playwright/test";

const expectedHeaders = [
  ["strict-transport-security", /max-age=63072000/],
  ["x-content-type-options", /^nosniff$/],
  ["x-frame-options", /^DENY$/],
  ["referrer-policy", /^strict-origin-when-cross-origin$/],
  ["permissions-policy", /camera=\(self\)/],
  ["permissions-policy", /microphone=\(\)/],
  ["permissions-policy", /geolocation=\(\)/],
  ["permissions-policy", /payment=\(\)/],
  ["permissions-policy", /usb=\(\)/],
  ["cross-origin-opener-policy", /^same-origin-allow-popups$/],
  ["x-permitted-cross-domain-policies", /^none$/],
] as const;

test("public pages include baseline browser security headers", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response, "home page response").not.toBeNull();

  const headers = response!.headers();
  for (const [header, pattern] of expectedHeaders) {
    expect(headers[header], `${header} header`).toMatch(pattern);
  }
  expect(headers["content-security-policy"]).toBeUndefined();

  const reportOnlyCsp = headers["content-security-policy-report-only"];
  expect(reportOnlyCsp, "report-only CSP header").toBeDefined();
  expect(reportOnlyCsp).toContain("default-src 'self'");
  expect(reportOnlyCsp).toContain("frame-ancestors 'none'");
  expect(reportOnlyCsp).toContain("object-src 'none'");
  expect(reportOnlyCsp).toContain("connect-src 'self' https: wss:");
});

test("protected app redirects keep baseline browser security headers", async ({
  page,
}) => {
  const response = await page.goto("/app/dashboard");
  expect(response, "dashboard redirect response").not.toBeNull();

  const headers = response!.headers();
  for (const [header, pattern] of expectedHeaders) {
    expect(headers[header], `${header} header`).toMatch(pattern);
  }
  expect(headers["content-security-policy-report-only"]).toContain(
    "default-src 'self'"
  );
});

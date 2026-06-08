export type ContentSecurityPolicyMode = "report-only" | "enforce";

export type SecurityHeader = {
  key: string;
  value: string;
};

export const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
    "https://*.clerk.services",
    "https://vercel.live",
  ].join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  [
    "frame-src",
    "'self'",
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
    "https://*.clerk.services",
  ].join(" "),
  "media-src 'self' blob: https:",
  "manifest-src 'self'",
].join("; ");

export function normalizeContentSecurityPolicyMode(
  value: string | undefined
): ContentSecurityPolicyMode {
  return value === "enforce" ? "enforce" : "report-only";
}

export function securityHeadersForMode(
  inputMode: string | undefined
): SecurityHeader[] {
  const mode = normalizeContentSecurityPolicyMode(inputMode);
  return [
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000",
    },
    {
      key:
        mode === "enforce"
          ? "Content-Security-Policy"
          : "Content-Security-Policy-Report-Only",
      value: contentSecurityPolicy,
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
    },
    {
      key: "Cross-Origin-Opener-Policy",
      value: "same-origin-allow-popups",
    },
    {
      key: "X-Permitted-Cross-Domain-Policies",
      value: "none",
    },
  ];
}

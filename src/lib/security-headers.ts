export type ContentSecurityPolicyMode = "report-only" | "enforce";

export type SecurityHeader = {
  key: string;
  value: string;
};

const clerkSourceList = [
  "https://*.clerk.accounts.dev",
  "https://*.clerk.com",
  "https://*.clerk.services",
  "https://clerk.movingmanifest.com",
  "https://accounts.movingmanifest.com",
];

const scriptSourceList = [
  "'self'",
  "'unsafe-inline'",
  "'unsafe-eval'",
  ...clerkSourceList,
  "https://vercel.live",
];

export const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  ["script-src", ...scriptSourceList].join(" "),
  ["script-src-elem", ...scriptSourceList].join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  ["frame-src", "'self'", ...clerkSourceList].join(" "),
  "media-src 'self' blob: https:",
  "manifest-src 'self'",
  "report-uri /api/csp-report",
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

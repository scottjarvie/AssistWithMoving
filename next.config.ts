import type { NextConfig } from "next";

import { securityHeadersForMode } from "./src/lib/security-headers";

const convexHttpActionsUrl = process.env.CONVEX_HTTP_ACTIONS_URL;
const securityHeaders = securityHeadersForMode(
  process.env.CONTENT_SECURITY_POLICY_MODE
);

const localMode = process.env.NODE_ENV === "development" ? process.env.LOCAL_DEVELOPMENT_MODE : undefined;
const nextConfig: NextConfig = {
  ...(localMode ? { distDir: `.next-local-${localMode}`, outputFileTracingRoot: process.cwd(), allowedDevOrigins: ["local.movingmanifest.com", "moving.localhost"] } : {}),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    if (!convexHttpActionsUrl) return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: `${convexHttpActionsUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

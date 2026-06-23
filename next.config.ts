import type { NextConfig } from "next";

import { securityHeadersForMode } from "./src/lib/security-headers";

const convexHttpActionsUrl = process.env.CONVEX_HTTP_ACTIONS_URL;
const securityHeaders = securityHeadersForMode(
  process.env.CONTENT_SECURITY_POLICY_MODE
);

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/floor-plan-draft",
        destination: "/floorplans",
        permanent: false,
      },
    ];
  },
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

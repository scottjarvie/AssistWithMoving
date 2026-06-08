import type { NextConfig } from "next";

const convexHttpActionsUrl = process.env.CONVEX_HTTP_ACTIONS_URL;

const nextConfig: NextConfig = {
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

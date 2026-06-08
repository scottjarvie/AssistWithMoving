import type { MetadataRoute } from "next";

import { product } from "@/lib/product";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${product.domain}`;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/app",
          "/settings",
          "/sign-in",
          "/sign-up",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

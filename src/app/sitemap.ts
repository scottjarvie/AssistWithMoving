import type { MetadataRoute } from "next";

import { product } from "@/lib/product";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${product.domain}`;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    ["", 1],
    ["/features", 0.8],
    ["/ai", 0.9],
    ["/ai/start", 0.8],
    ["/api", 0.7],
    ["/mcp", 0.7],
    ["/pcs-moving", 0.8],
    ["/claims-inventory", 0.8],
    ["/privacy", 0.5],
    ["/terms", 0.5],
  ] as const;

  return routes.map(([route, priority]) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority,
  }));
}

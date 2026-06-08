import type { MetadataRoute } from "next";

import { product } from "@/lib/product";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${product.domain}`;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}

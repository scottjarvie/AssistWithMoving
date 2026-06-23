import type { AuthConfig } from "convex/server";

const clerkIssuer = process.env.CLERK_JWT_ISSUER_DOMAIN!;
const mcpResourceIds = mcpResourceIdsForAuth();

export default {
  providers: [
    {
      domain: clerkIssuer,
      applicationID: "convex",
    },
    ...mcpResourceIds.map((resourceId) => ({
      domain: clerkIssuer,
      applicationID: resourceId,
    })),
  ],
} satisfies AuthConfig;

export function mcpResourceIdsForAuth() {
  const ids = new Set<string>();
  addResourceId(ids, process.env.MOVINGMANIFEST_MCP_RESOURCE_ID);
  addResourceId(
    ids,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/mcp`
      : "https://movingmanifest.com/api/mcp"
  );
  return [...ids];
}

function addResourceId(ids: Set<string>, value?: string) {
  const normalized = value?.trim().replace(/\/+$/, "");
  if (normalized) ids.add(normalized);
}

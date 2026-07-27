import { expect, test } from "@playwright/test";

const marketingRoutes = ["/", "/mcp/guide", "/faq"] as const;

function isClerkVendorUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl);
  const hostname = url.hostname;
  const isDevelopmentMiddlewareHandshake =
    url.pathname === "/v1/client/handshake" &&
    url.searchParams.get("__clerk_hs_reason") === "dev-browser-missing";

  if (isDevelopmentMiddlewareHandshake) {
    return false;
  }

  return (
    hostname.endsWith(".clerk.accounts.dev") ||
    hostname === "clerk.accounts.dev" ||
    hostname.endsWith(".clerk-telemetry.com") ||
    hostname === "clerk-telemetry.com"
  );
}

function isConvexWebSocket(rawUrl: string): boolean {
  const hostname = new URL(rawUrl).hostname;
  return (
    hostname.endsWith(".convex.cloud") ||
    hostname === "convex.cloud" ||
    hostname.endsWith(".convex.site") ||
    hostname === "convex.site"
  );
}

for (const route of marketingRoutes) {
  test(`${route} loads without Clerk or Convex vendors`, async ({ page }) => {
    const clerkRequests: string[] = [];
    const convexWebSockets: string[] = [];

    page.on("request", (request) => {
      if (isClerkVendorUrl(request.url())) {
        clerkRequests.push(request.url());
      }
    });
    page.on("websocket", (webSocket) => {
      if (isConvexWebSocket(webSocket.url())) {
        convexWebSockets.push(webSocket.url());
      }
    });

    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.ok()).toBe(true);

    expect(clerkRequests, `Clerk requests observed on ${route}`).toEqual([]);
    expect(
      convexWebSockets,
      `Convex WebSockets observed on ${route}`,
    ).toEqual([]);
  });
}

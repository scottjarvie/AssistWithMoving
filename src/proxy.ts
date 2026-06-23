import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { shouldRouteMcpSetupRequestToEndpoint } from "@/lib/mcp-endpoint-routing";

const isProtectedRoute = createRouteMatcher([
  "/app(.*)",
  "/settings(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (
    shouldRouteMcpSetupRequestToEndpoint({
      pathname: request.nextUrl.pathname,
      method: request.method,
      accept: request.headers.get("accept"),
      authorization: request.headers.get("authorization"),
      contentType: request.headers.get("content-type"),
      mcpProtocolVersion: request.headers.get("mcp-protocol-version"),
      mcpSessionId: request.headers.get("mcp-session-id"),
      nextRouterPrefetch: request.headers.get("next-router-prefetch"),
      nextRouterStateTree: request.headers.get("next-router-state-tree"),
      rsc: request.headers.get("rsc"),
      search: request.nextUrl.search,
    })
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/mcp";
    return NextResponse.rewrite(url);
  }

  if (!isProtectedRoute(request)) {
    return;
  }

  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) {
    return redirectToSignIn();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

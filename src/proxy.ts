import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { localPublicAuthEnabled, localLiveProxy } from "@/lib/localLiveAuth";
import { NextRequest, type NextFetchEvent } from "next/server";
import { NextResponse } from "next/server";

import { getCompatibilityRedirectUrl } from "@/lib/canonical-domain";

const isProtectedRoute = createRouteMatcher([
  "/app(.*)",
  "/settings(.*)",
  "/admin(.*)",
]);

const hostedProxy = clerkMiddleware(async (auth, request) => {
  // Clerk's current production identity is bound to movingmanifest.com. Until
  // an explicit OAuth/provider cutover is approved, make the Assist family
  // domain a safe entry door instead of rendering a broken Clerk shell there.
  // A temporary redirect keeps a future canonical-host migration reversible.
  const compatibilityUrl = getCompatibilityRedirectUrl(
    request.url,
    request.headers.get("host"),
  );
  if (compatibilityUrl) {
    return NextResponse.redirect(compatibilityUrl, 307);
  }

  const { isAuthenticated, redirectToSignIn } = await auth();

  if (isProtectedRoute(request) && !isAuthenticated) {
    return redirectToSignIn();
  }
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return localPublicAuthEnabled() ? localLiveProxy(request) : hostedProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

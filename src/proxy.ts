import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getCompatibilityRedirectUrl } from "@/lib/canonical-domain";

const isProtectedRoute = createRouteMatcher([
  "/app(.*)",
  "/settings(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
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

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

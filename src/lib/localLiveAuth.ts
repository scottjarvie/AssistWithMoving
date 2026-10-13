import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { NextResponse, type NextRequest } from "next/server";
const PRIVATE_CACHE_CONTROL = "private, no-store";
const isPrivatePath = (pathname: string) => /^\/(?:app|settings)(?:\/|$)/.test(pathname);

// Public verification material belongs to this site's production Clerk instance.
// Never infer an issuer or fetch URL from an unverified token.
export const LOCAL_LIVE_ISSUER = "https://clerk.movingmanifest.com";
export const LOCAL_LIVE_ORIGINS = [
  "https://local.movingmanifest.com",
  "http://127.0.0.1:3828",
  "http://localhost:3828",
] as const;
const publicKeys = createRemoteJWKSet(new URL(`${LOCAL_LIVE_ISSUER}/.well-known/jwks.json`), { timeoutDuration: 5000 });

export const LOCAL_SANDBOX_ISSUER = "https://glorious-swine-50.clerk.accounts.dev";
export const LOCAL_SANDBOX_ORIGINS = ["http://moving.localhost:3827"] as const;
const sandboxPublicKeys = createRemoteJWKSet(new URL(`${LOCAL_SANDBOX_ISSUER}/.well-known/jwks.json`), { timeoutDuration: 5000 });
export function localSandboxEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "development" && env.LOCAL_DEVELOPMENT_MODE === "sandbox"
    && !env.VERCEL && !env.CI && !env.CLERK_SECRET_KEY
    && env.CONVEX_DEPLOYMENT === "anonymous:anonymous-moving-completion-20261007"
    && env.NEXT_PUBLIC_CONVEX_URL === "http://127.0.0.1:4321";
}
export function localPublicAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return localLiveEnabled(env) || localSandboxEnabled(env);
}

export function localLiveEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "development" && env.LOCAL_DEVELOPMENT_MODE === "live"
    && !env.VERCEL && !env.CI && !env.CLERK_SECRET_KEY
    && env.CONVEX_DEPLOYMENT === "prod:fine-crocodile-51"
    && env.NEXT_PUBLIC_CONVEX_URL === "https://fine-crocodile-51.convex.cloud";
}

/** Clerk's documented manual session verification. Convex separately verifies
 * its own audience-specific token and enforces ownership for every record. */
export async function verifyLocalSession(token: string | undefined, keys: JWTVerifyGetKey = localSandboxEnabled() ? sandboxPublicKeys : publicKeys, mode: "live" | "sandbox" = localSandboxEnabled() ? "sandbox" : "live") {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"], issuer: mode === "sandbox" ? LOCAL_SANDBOX_ISSUER : LOCAL_LIVE_ISSUER,
      requiredClaims: ["exp", "nbf", "iat", "sub", "sid", "azp"],
    });
    if (typeof payload.sub !== "string" || !payload.sub.startsWith("user_")
      || typeof payload.sid !== "string" || !payload.sid.startsWith("sess_")
      || !(mode === "sandbox" ? LOCAL_SANDBOX_ORIGINS : LOCAL_LIVE_ORIGINS).some(origin => origin === payload.azp)
      || payload.sts === "pending") return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

export async function localLiveProxy(request: NextRequest) {
  const host = request.headers.get("host");
  // Ports share cookies; each Sandbox uses a distinct local hostname.
  if (localSandboxEnabled() && ["localhost:3827", "127.0.0.1:3827"].includes(host ?? "")) {
    if (!["GET", "HEAD"].includes(request.method)) return new NextResponse("Use the dedicated Sandbox host", { status: 421 });
    const target=request.nextUrl.clone();target.hostname="moving.localhost";target.port="3827";
    return NextResponse.redirect(target,{headers:{"Cache-Control":PRIVATE_CACHE_CONTROL}});
  }
  if (!(localSandboxEnabled() ? LOCAL_SANDBOX_ORIGINS : LOCAL_LIVE_ORIGINS).some(origin => new URL(origin).host === host)) {
    return new NextResponse("Local Live accepts only its configured local host.", { status: 403 });
  }
  // This server operation needs Clerk's administrative API, not just a session
  // signature. Do not emulate it or fetch a production administrative secret.
  if (/^\/(?:api|trpc|files|mcp|admin|delete-account)(?:\/|$)/.test(request.nextUrl.pathname)) {
    return new NextResponse("Local server APIs, media and provider actions are unavailable in this mode.", {
      status: 503, headers: { "Cache-Control": PRIVATE_CACHE_CONTROL },
    });
  }
  if (isPrivatePath(request.nextUrl.pathname)) {
    const verified = await verifyLocalSession(request.cookies.get("__session")?.value);
    if (!verified) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = "";
      return NextResponse.redirect(url, { headers: { "Cache-Control": PRIVATE_CACHE_CONTROL } });
    }
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", PRIVATE_CACHE_CONTROL);
  return response;
}

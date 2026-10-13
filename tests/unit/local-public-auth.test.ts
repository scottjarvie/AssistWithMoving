// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { NextRequest } from "next/server";
import { LOCAL_LIVE_ISSUER, LOCAL_SANDBOX_ISSUER, localSandboxEnabled, localLiveEnabled, localLiveProxy, verifyLocalSession } from "@/lib/localLiveAuth";

let privateKey: CryptoKey;
let publicKey: CryptoKey;
beforeAll(async () => ({ privateKey, publicKey } = await generateKeyPair("RS256")));
async function token(overrides: Record<string, unknown> = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: "user_synthetic", sid: "sess_synthetic", azp: "https://local.movingmanifest.com", iss: LOCAL_LIVE_ISSUER, iat: now, nbf: now - 1, exp: now + 60, ...overrides })
    .setProtectedHeader({ alg: "RS256" }).sign(key);
}
const keys = async () => publicKey;

describe("local production session boundary", () => {
  it("accepts a signed current session and its refreshed replacement; no cookie after sign-out is unauthenticated", async () => {
    expect(await verifyLocalSession(await token(), keys)).toEqual({ userId: "user_synthetic", sessionId: "sess_synthetic" });
    expect(await verifyLocalSession(await token({ exp: Math.floor(Date.now() / 1000) + 120 }), keys)).not.toBeNull();
    expect(await verifyLocalSession(undefined, keys)).toBeNull();
  });
  it("rejects forged, expired, future, wrong-instance, wrong-origin and pending sessions", async () => {
    const other = await generateKeyPair("RS256");
    expect(await verifyLocalSession(await token({}, other.privateKey), keys)).toBeNull();
    for (const claims of [
      { exp: 1 }, { nbf: Math.floor(Date.now() / 1000) + 120 },
      { iss: "https://another-site.clerk.accounts.dev" }, { azp: "https://attacker.example" },
      { sts: "pending" }, { sub: "" }, { sid: "" }, { exp: undefined },
    ]) expect(await verifyLocalSession(await token(claims), keys)).toBeNull();
  });
  it("never activates in hosted, CI, Sandbox, wrong-backend or secret-bearing environments", () => {
    const env = { NODE_ENV: "development", LOCAL_DEVELOPMENT_MODE: "live", CONVEX_DEPLOYMENT: "prod:fine-crocodile-51", NEXT_PUBLIC_CONVEX_URL: "https://fine-crocodile-51.convex.cloud" };
    expect(localLiveEnabled(env)).toBe(true);
    for (const override of [{ NODE_ENV: "production" }, { VERCEL: "1" }, { CI: "1" }, { LOCAL_DEVELOPMENT_MODE: "sandbox" }, { CONVEX_DEPLOYMENT: "dev:other" }, { CLERK_SECRET_KEY: "synthetic-secret" }]) expect(localLiveEnabled({ ...env, ...override })).toBe(false);
  });
  it("rejects an unexpected host, redirects a signed-out private page, and refuses server account administration", async () => {
    const request = (pathname: string, host = "local.movingmanifest.com") => new NextRequest(`https://${host}${pathname}`, { headers: { host } });
    expect((await localLiveProxy(request("/app", "attacker.example"))).status).toBe(403);
    const signedOut = await localLiveProxy(request("/app"));
    expect(signedOut.status).toBe(307);
    expect(signedOut.headers.get("location")).toBe("https://local.movingmanifest.com/sign-in");
    expect(signedOut.headers.get("cache-control")).toContain("no-store");
    expect((await localLiveProxy(request("/api/admin/pro"))).status).toBe(503);
    expect((await localLiveProxy(request("/sign-in"))).status).toBe(200);
  });
});


describe("isolated local Sandbox authentication", () => {
  it("requires the exact development backend and refuses hosted, mixed or secret-bearing profiles", () => {
    const env = { NODE_ENV: "development", LOCAL_DEVELOPMENT_MODE: "sandbox", CONVEX_DEPLOYMENT: "anonymous:anonymous-moving-completion-20261007", NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:4321" };
    expect(localSandboxEnabled(env)).toBe(true);
    for (const override of [{ NODE_ENV: "production" }, { VERCEL: "1" }, { CI: "1" }, { CONVEX_DEPLOYMENT: "prod:fine-crocodile-51" }, { NEXT_PUBLIC_CONVEX_URL: "https://fine-crocodile-51.convex.cloud" }, { CLERK_SECRET_KEY: "synthetic-secret" }]) expect(localSandboxEnabled({ ...env, ...override })).toBe(false);
  });
  it("accepts only development issuer and test origin, never a production session", async () => {
    expect(await verifyLocalSession(await token({ iss: LOCAL_SANDBOX_ISSUER, azp: "http://moving.localhost:3827" }), keys, "sandbox")).not.toBeNull();
    expect(await verifyLocalSession(await token(), keys, "sandbox")).toBeNull();
    expect(await verifyLocalSession(await token({ iss: LOCAL_SANDBOX_ISSUER, azp: "http://localhost:3827" }), keys, "sandbox")).toBeNull();
    expect(await verifyLocalSession(await token({ iss: LOCAL_SANDBOX_ISSUER, azp: "https://local.movingmanifest.com" }), keys, "sandbox")).toBeNull();
  });
});

it("moves old Sandbox GET addresses to an isolated host without replaying writes",async()=>{
 const env={"NODE_ENV": "development", "LOCAL_DEVELOPMENT_MODE": "sandbox", "CONVEX_DEPLOYMENT": "anonymous:anonymous-moving-completion-20261007", "NEXT_PUBLIC_CONVEX_URL": "http://127.0.0.1:4321", "CLERK_SECRET_KEY": "", "CLERK_ISSUER_URL": "https://unrelated-instance.clerk.accounts.dev", "VERCEL": "", "CI": ""};
 for(const [name,value] of Object.entries(env)) vi.stubEnv(name,value);
 try {
  const read=new NextRequest("http://localhost:3827/queue",{headers:{host:"localhost:3827"}});
  const moved=await localLiveProxy(read);
  expect(moved.status).toBe(307);expect(moved.headers.get("location")).toBe("http://moving.localhost:3827/queue");
  const write=new NextRequest("http://localhost:3827/queue",{method:"POST",headers:{host:"localhost:3827"}});
  expect((await localLiveProxy(write)).status).toBe(421);
 } finally {vi.unstubAllEnvs();}
});

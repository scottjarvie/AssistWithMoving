/** Website origins owned by Moving. An OAuth client URL is not a website origin. */
export const MOVING_WEBSITE_ORIGINS = [
  "https://movingmanifest.com",
  "https://www.movingmanifest.com",
] as const;
export const MOVING_LOCAL_LIVE_ORIGINS = [
  "https://local.movingmanifest.com",
  "http://127.0.0.1:3828",
  "http://localhost:3828",
] as const;
export const MOVING_LOCAL_SANDBOX_ORIGINS = [
  "http://moving.localhost:3827",
] as const;

/** Native Clerk website sessions may omit azp. If supplied it must name this website. */
export function websiteAuthorizedParty(
  azp: unknown,
  origins: readonly string[],
) {
  return (
    azp === undefined || (typeof azp === "string" && origins.includes(azp))
  );
}
export function hasOAuthSessionMarkers(claims: Record<string, unknown>) {
  return (
    claims.client_id !== undefined ||
    claims.clientId !== undefined ||
    claims.scope !== undefined ||
    claims.scp !== undefined ||
    claims.tokenType === "oauth" ||
    claims.typ === "at+jwt"
  );
}

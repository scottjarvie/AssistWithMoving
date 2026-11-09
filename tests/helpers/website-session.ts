/** Synthetic values with the exact claim names observed in a real native
 * Clerk Convex website token in Plants, supplied in AWL-0016 lesson 17.
 * No token, account identifier or real claim value is retained here.
 */
export function nativeWebsiteClaims(
  subject = "user_synthetic",
  issuer = "https://synthetic.clerk.accounts.dev",
  sid = "sess_synthetic",
) {
  const now = Math.floor(Date.now() / 1000);
  return {
    aud: "convex",
    exp: now + 60,
    fva: [0, -1],
    iat: now,
    iss: issuer,
    nbf: now - 1,
    sid,
    sts: "active",
    sub: subject,
    v: 2,
  };
}
/** Convex maps the standard JWT iss/sub names to issuer/subject. */
export function nativeWebsiteIdentity(
  subject: string,
  issuer?: string,
  sid?: string,
) {
  const { iss, sub, ...claims } = nativeWebsiteClaims(subject, issuer, sid);
  return { ...claims, issuer: iss, subject: sub };
}

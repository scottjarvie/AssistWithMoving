import { describe, expect, it } from "vitest";

import {
  alternativeGroupResults,
  parseEnvNames,
  requiredGroupResults,
  trackedIssueDetail,
} from "../../scripts/vercel-env-readiness.mjs";

describe("Vercel env readiness", () => {
  it("parses Vercel env list output names without reading secret values", () => {
    const names = parseEnvNames(`
NEXT_PUBLIC_APP_URL              Encrypted  Production  1d ago
CLERK_SECRET_KEY                 Encrypted  Production  1d ago
`);

    expect(names.has("NEXT_PUBLIC_APP_URL")).toBe(true);
    expect(names.has("CLERK_SECRET_KEY")).toBe(true);
    expect(names.has("Production")).toBe(false);
  });

  it("keeps production missing groups routed to their source blocker issues", () => {
    const details = requiredGroupResults(new Set(), "production").map(
      (result) => result.detail
    );

    expect(details).toContain(
      "missing NEXT_PUBLIC_APP_URL; tracked by MOVE-59"
    );
    expect(details).toContain(
      "missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, CLERK_JWT_ISSUER_DOMAIN, CLERK_FRONTEND_API_URL, NEXT_PUBLIC_CLERK_SIGN_IN_URL, NEXT_PUBLIC_CLERK_SIGN_UP_URL, NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL, NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL; tracked by MOVE-63"
    );
  });

  it("routes preview missing groups through the Preview env blocker", () => {
    const details = requiredGroupResults(new Set(), "preview").map(
      (result) => result.detail
    );
    const webhookDetails = alternativeGroupResults(new Set(), "preview").map(
      (result) => result.detail
    );

    expect(trackedIssueDetail("MOVE-63", "preview")).toBe(
      "tracked by MOVE-106; source setup MOVE-63"
    );
    expect(details).toContain(
      "missing NEXT_PUBLIC_APP_URL; tracked by MOVE-106; source setup MOVE-59"
    );
    expect(details).toContain(
      "missing B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT, B2_REGION; tracked by MOVE-106; source setup MOVE-66"
    );
    expect(webhookDetails).toContain(
      "missing one of CLERK_WEBHOOK_SIGNING_SECRET, CLERK_WEBHOOK_SECRET; tracked by MOVE-106; source setup MOVE-68"
    );
  });
});

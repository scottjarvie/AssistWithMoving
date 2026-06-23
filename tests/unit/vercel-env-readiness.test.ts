import { describe, expect, it } from "vitest";

import {
  alternativeGroupResults,
  optionalGroupResults,
  parseEnvNames,
  productionLaunchGateResults,
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
    expect(details).toContain(
      "missing CONVEX_DEPLOY_KEY; tracked by MOVE-143"
    );
  });

  it("blocks production launch when the OAuth MCP toolset env name is missing", () => {
    expect(productionLaunchGateResults(new Set(), "production")).toEqual([
      {
        status: "blocked",
        label: "OAuth MCP trusted-helper toolset env",
        detail:
          "missing MOVINGMANIFEST_MCP_OAUTH_TOOLSET; set trusted-helper before hosted OAuth publish; tracked by MOVE-240",
      },
    ]);
  });

  it("passes the production launch gate when the OAuth MCP toolset env name is present", () => {
    expect(
      productionLaunchGateResults(
        new Set(["MOVINGMANIFEST_MCP_OAUTH_TOOLSET"]),
        "production"
      )
    ).toEqual([
      {
        status: "pass",
        label: "OAuth MCP trusted-helper toolset env",
        detail:
          "MOVINGMANIFEST_MCP_OAUTH_TOOLSET name present; value must be trusted-helper and is verified by npm run doctor:oauth-cutover",
      },
    ]);
  });

  it("routes preview missing groups through the Preview env blocker", () => {
    const details = requiredGroupResults(new Set(), "preview").map(
      (result) => result.detail
    );
    const webhookResults = alternativeGroupResults(new Set());

    expect(trackedIssueDetail("MOVE-63", "preview")).toBe(
      "tracked by MOVE-106; source setup MOVE-63"
    );
    expect(details).toContain(
      "missing NEXT_PUBLIC_APP_URL; tracked by MOVE-106; source setup MOVE-59"
    );
    expect(details).toContain(
      "missing B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT, B2_REGION; tracked by MOVE-106; source setup MOVE-66"
    );
    expect(details).toContain(
      "missing CONVEX_DEPLOY_KEY; tracked by MOVE-106; source setup MOVE-143"
    );
    expect(webhookResults).toContainEqual({
      status: "warn",
      label: "Clerk webhook signing env",
      detail:
        "missing one of CLERK_WEBHOOK_SIGNING_SECRET, CLERK_WEBHOOK_SECRET; not required in Vercel because Clerk webhooks are handled by Convex HTTP actions; validate with npm run doctor:webhooks; tracked by MOVE-68",
    });
    expect(productionLaunchGateResults(new Set(), "preview")).toEqual([]);
  });

  it("warns when optional Cloudflare image delivery is inactive", () => {
    expect(optionalGroupResults(new Set())).toEqual([
      {
        status: "warn",
        label: "Cloudflare image delivery env names",
        detail:
          "optional Cloudflare Images delivery is inactive; signed Backblaze derivative URLs remain the fallback; tracked by MOVE-138",
      },
    ]);
  });

  it("does not route optional Cloudflare preview readiness through required preview env blockers", () => {
    const [result] = optionalGroupResults(new Set());

    expect(result).toEqual(
      {
        status: "warn",
        label: "Cloudflare image delivery env names",
        detail:
          "optional Cloudflare Images delivery is inactive; signed Backblaze derivative URLs remain the fallback; tracked by MOVE-138",
      }
    );
    expect(result?.detail).not.toContain("MOVE-106");
  });

  it("passes when a Cloudflare delivery URL or account hash is configured", () => {
    expect(
      optionalGroupResults(new Set(["CLOUDFLARE_IMAGE_DELIVERY_URL"]))
    ).toEqual([
      {
        status: "pass",
        label: "Cloudflare image delivery env names",
        detail: "configured through CLOUDFLARE_IMAGE_DELIVERY_URL",
      },
    ]);

    expect(
      optionalGroupResults(
        new Set([
          "CLOUDFLARE_IMAGES_ACCOUNT_HASH",
          "CLOUDFLARE_IMAGE_DELIVERY_DOMAIN",
        ])
      )
    ).toEqual([
      {
        status: "pass",
        label: "Cloudflare image delivery env names",
        detail:
          "configured through CLOUDFLARE_IMAGES_ACCOUNT_HASH with CLOUDFLARE_IMAGE_DELIVERY_DOMAIN",
      },
    ]);
  });
});

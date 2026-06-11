import { describe, expect, it } from "vitest";

import {
  isCurrentDbQaApproved,
  isKnownProductionConvexUrl,
  isMissingConvexUrl,
  isProductionConvexDeployment,
  layoutStudioQaReadinessResults,
  renderLayoutStudioQaReadiness,
} from "../../scripts/layout-studio-qa-readiness.mjs";

const readyEnv = {
  NODE_ENV: "test",
  CONVEX_DEPLOYMENT: "dev:layout-studio-qa",
  NEXT_PUBLIC_CONVEX_URL: "https://layout-studio-qa.convex.cloud",
  E2E_CLERK_USER_EMAIL: "qa@example.test",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_secret",
  CLERK_SECRET_KEY: "sk_test_secret",
  CLERK_JWT_ISSUER_DOMAIN: "https://clerk.example.test",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
  B2_APPLICATION_KEY_ID: "key-id",
  B2_APPLICATION_KEY: "private-key",
  B2_BUCKET_NAME: "qa-bucket",
  B2_ENDPOINT: "https://s3.example.test",
  B2_REGION: "us-test-1",
} as const;

describe("Layout Studio QA readiness", () => {
  it("blocks production Convex deployments before mutation QA", () => {
    expect(isProductionConvexDeployment("prod:fine-crocodile-51")).toBe(true);
    expect(isProductionConvexDeployment("dev:layout-studio-qa")).toBe(false);
    expect(
      isKnownProductionConvexUrl("https://fine-crocodile-51.convex.cloud"),
    ).toBe(true);
    expect(
      isKnownProductionConvexUrl("https://layout-studio-qa.convex.cloud"),
    ).toBe(false);

    expect(
      layoutStudioQaReadinessResults({
        ...readyEnv,
        CONVEX_DEPLOYMENT: "prod:fine-crocodile-51",
      }),
    ).toContainEqual({
      status: "blocked",
      label: "Layout Studio mutation QA target",
      detail:
        "Convex target appears production-backed; set LAYOUT_STUDIO_ALLOW_CURRENT_DB_QA=true and CONVEX_E2E_CLEANUP_ENABLED=true only while the current DB is an approved working sandbox; tracked by MOVE-190",
    });

    expect(
      layoutStudioQaReadinessResults({
        ...readyEnv,
        NEXT_PUBLIC_CONVEX_URL: "https://fine-crocodile-51.convex.cloud",
      }),
    ).toContainEqual({
      status: "blocked",
      label: "Layout Studio mutation QA target",
      detail:
        "Convex target appears production-backed; set LAYOUT_STUDIO_ALLOW_CURRENT_DB_QA=true and CONVEX_E2E_CLEANUP_ENABLED=true only while the current DB is an approved working sandbox; tracked by MOVE-190",
    });

    expect(
      layoutStudioQaReadinessResults({
        ...readyEnv,
        CONVEX_DEPLOYMENT: "staging:layout-studio-qa",
      }),
    ).toContainEqual({
      status: "blocked",
      label: "Layout Studio mutation QA target",
      detail:
        "CONVEX_DEPLOYMENT must start with dev: or CONVEX_E2E_CLEANUP_ENABLED must be true for mutation QA; tracked by MOVE-190",
    });
  });

  it("passes when non-production Convex and required QA env names are present", () => {
    expect(isMissingConvexUrl("")).toBe(true);
    expect(isMissingConvexUrl("https://layout-studio-qa.convex.cloud")).toBe(
      false,
    );

    expect(layoutStudioQaReadinessResults(readyEnv)).toEqual([
      {
        status: "pass",
        label: "Layout Studio mutation QA target",
        detail:
          "Convex target passes the Layout Studio mutation-QA safety gate",
      },
      {
        status: "pass",
        label: "Authenticated browser QA user",
        detail: "E2E_CLERK_USER_EMAIL present without printing values",
      },
      {
        status: "pass",
        label: "Clerk auth for local authenticated QA",
        detail:
          "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, CLERK_JWT_ISSUER_DOMAIN, NEXT_PUBLIC_CLERK_SIGN_IN_URL, NEXT_PUBLIC_CLERK_SIGN_UP_URL present without printing values",
      },
      {
        status: "pass",
        label: "Blueprint upload storage",
        detail:
          "B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT, B2_REGION present without printing values",
      },
    ]);
  });

  it("allows explicit cleanup opt-in for non-prod non-dev Convex targets", () => {
    expect(
      layoutStudioQaReadinessResults({
        ...readyEnv,
        CONVEX_DEPLOYMENT: "preview:layout-studio-qa",
        CONVEX_E2E_CLEANUP_ENABLED: "true",
      })[0],
    ).toEqual({
      status: "pass",
      label: "Layout Studio mutation QA target",
      detail: "Convex target passes the Layout Studio mutation-QA safety gate",
    });
  });

  it("allows current DB QA only with explicit approval and cleanup enabled", () => {
    expect(isCurrentDbQaApproved(readyEnv)).toBe(false);
    expect(
      isCurrentDbQaApproved({
        ...readyEnv,
        LAYOUT_STUDIO_ALLOW_CURRENT_DB_QA: "true",
        CONVEX_E2E_CLEANUP_ENABLED: "true",
      }),
    ).toBe(true);

    expect(
      layoutStudioQaReadinessResults({
        ...readyEnv,
        CONVEX_DEPLOYMENT: "prod:fine-crocodile-51",
        NEXT_PUBLIC_CONVEX_URL: "https://fine-crocodile-51.convex.cloud",
        LAYOUT_STUDIO_ALLOW_CURRENT_DB_QA: "true",
        CONVEX_E2E_CLEANUP_ENABLED: "true",
      })[0],
    ).toEqual({
      status: "blocked",
      label: "Layout Studio mutation QA target",
      detail:
        "Current DB QA also requires NEXT_PUBLIC_LAYOUT_STUDIO_CURRENT_DB_QA=true so the local production build exposes Layout Studio",
    });

    expect(
      layoutStudioQaReadinessResults({
        ...readyEnv,
        CONVEX_DEPLOYMENT: "prod:fine-crocodile-51",
        NEXT_PUBLIC_CONVEX_URL: "https://fine-crocodile-51.convex.cloud",
        LAYOUT_STUDIO_ALLOW_CURRENT_DB_QA: "true",
        CONVEX_E2E_CLEANUP_ENABLED: "true",
        NEXT_PUBLIC_LAYOUT_STUDIO_CURRENT_DB_QA: "true",
      })[0],
    ).toEqual({
      status: "pass",
      label: "Layout Studio mutation QA target",
      detail:
        "Current DB QA explicitly approved with cleanup enabled; E2E data must stay prefixed and cleaned up",
    });
  });

  it("does not print secret values in readiness output", () => {
    const rendered = renderLayoutStudioQaReadiness(
      layoutStudioQaReadinessResults(readyEnv),
    );

    expect(rendered).toContain("Layout Studio QA readiness");
    expect(rendered).not.toContain("sk_test_secret");
    expect(rendered).not.toContain("private-key");
    expect(rendered).not.toContain("qa@example.test");
  });
});

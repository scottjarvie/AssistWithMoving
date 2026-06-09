import { describe, expect, it } from "vitest";

import {
  deploymentReferenceFromEnvValue,
  localStorageAlignmentResults,
  parseEnvAssignments,
} from "../../scripts/convex-env-readiness.mjs";

describe("Convex env readiness", () => {
  it("normalizes Convex deployment references from .env.local", () => {
    expect(deploymentReferenceFromEnvValue("dev:gregarious-goldfinch-763")).toBe(
      "gregarious-goldfinch-763"
    );
    expect(deploymentReferenceFromEnvValue("prod:steady-hawk-123")).toBe(
      "steady-hawk-123"
    );
    expect(deploymentReferenceFromEnvValue("staging")).toBe("staging");
  });

  it("parses Convex env assignment output in memory", () => {
    const assignments = parseEnvAssignments(`
B2_BUCKET_NAME=movingmanifest
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_APPLICATION_KEY=super-secret-value
`);

    expect(assignments.get("B2_BUCKET_NAME")).toBe("movingmanifest");
    expect(assignments.get("B2_ENDPOINT")).toBe(
      "https://s3.us-west-004.backblazeb2.com"
    );
    expect(assignments.get("B2_APPLICATION_KEY")).toBe("super-secret-value");
  });

  it("reports public B2 drift without printing local or Convex values", () => {
    const assignments = parseEnvAssignments(`
B2_BUCKET_NAME=movingmanifest-pics
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com/
B2_REGION=us-west-004
B2_APPLICATION_KEY=convex-secret
`);

    const results = localStorageAlignmentResults(assignments, {
      B2_BUCKET_NAME: "movingmanifest",
      B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
      B2_REGION: "us-west-004",
      B2_APPLICATION_KEY: "local-secret",
    } as unknown as NodeJS.ProcessEnv);

    expect(results).toContainEqual({
      status: "blocked",
      label: "Backblaze B2 public value alignment",
      detail: "B2_BUCKET_NAME differs from local .env.local; tracked by MOVE-66",
    });
    const rendered = JSON.stringify(results);
    expect(rendered).not.toContain("movingmanifest-pics");
    expect(rendered).not.toContain("movingmanifest");
    expect(rendered).not.toContain("convex-secret");
    expect(rendered).not.toContain("local-secret");
  });

  it("passes when comparable public B2 values match", () => {
    const assignments = parseEnvAssignments(`
B2_BUCKET_NAME=movingmanifest
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com/
B2_REGION=us-west-004
`);

    expect(
      localStorageAlignmentResults(assignments, {
        B2_BUCKET_NAME: "movingmanifest",
        B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
        B2_REGION: "us-west-004",
      } as unknown as NodeJS.ProcessEnv)
    ).toContainEqual({
      status: "pass",
      label: "Backblaze B2 public value alignment",
      detail:
        "B2_BUCKET_NAME, B2_ENDPOINT, B2_REGION match local .env.local without printing values",
    });
  });
});

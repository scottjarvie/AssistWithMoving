import { describe, expect, it } from "vitest";

import {
  corsAdministrationGuidance,
  corsOriginAllows,
  missingCorsRequirements,
  recommendedBackblazeNativeCorsRules,
} from "../../scripts/storage-readiness.mjs";

describe("storage readiness CORS helpers", () => {
  it("matches exact, wildcard, and Backblaze broad HTTPS origins", () => {
    expect(corsOriginAllows("https://movingmanifest.com", "https")).toBe(true);
    expect(corsOriginAllows("https://movingmanifest.com", "https://*")).toBe(
      true
    );
    expect(
      corsOriginAllows("https://movingmanifest-git-main.vercel.app", "https://*.vercel.app")
    ).toBe(true);
    expect(corsOriginAllows("http://localhost:3827", "https")).toBe(false);
    expect(corsOriginAllows("http://localhost:3827", "http://localhost:3827")).toBe(
      true
    );
  });

  it("does not report missing required origins when broad HTTPS covers production and previews", () => {
    const missing = missingCorsRequirements([
      {
        AllowedOrigins: ["http://localhost:3827", "https"],
        AllowedMethods: ["PUT", "GET", "HEAD"],
      },
    ]);

    expect(missing).toEqual({ origins: [], methods: [] });
  });

  it("prints Backblaze native S3 operation names for CLI/custom-rule handoff", () => {
    expect(recommendedBackblazeNativeCorsRules[0].allowedOperations).toEqual([
      "s3_put",
      "s3_get",
      "s3_head",
    ]);
  });

  it("keeps bucket-scoped runtime keys separate from CORS administration", () => {
    expect(
      corsAdministrationGuidance({
        bucketName: "movingmanifest",
        capabilities: ["listFiles", "readFiles", "writeFiles", "deleteFiles"],
      }).detail
    ).toContain("runtime key is bucket-scoped");
    expect(
      corsAdministrationGuidance({
        capabilities: ["writeBuckets"],
      }).detail
    ).toContain("do not deploy it as app runtime credentials");
  });
});

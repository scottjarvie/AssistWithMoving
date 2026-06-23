import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { isExpectedRuntimeOrigin } from "../../scripts/launch-readiness.mjs";

describe("launch readiness script", () => {
  it("treats the production Clerk domain as expected runtime traffic", () => {
    expect(
      isExpectedRuntimeOrigin(
        "https://clerk.movingmanifest.com",
        "https://movingmanifest.com"
      )
    ).toBe(true);
    expect(
      isExpectedRuntimeOrigin(
        "https://fine-crocodile-51.convex.cloud",
        "https://movingmanifest.com"
      )
    ).toBe(true);
    expect(
      isExpectedRuntimeOrigin(
        "https://glorious-swine-50.clerk.accounts.dev",
        "https://movingmanifest.com"
      )
    ).toBe(false);
  });

  it("reports network failures without crashing before the summary", () => {
    const result = spawnSync(process.execPath, ["scripts/launch-readiness.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        LAUNCH_URL: "http://127.0.0.1:9",
      },
    });

    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(combinedOutput).toContain("FAIL home page");
    expect(combinedOutput).toContain("Launch readiness summary:");
    expect(combinedOutput).not.toContain("node:internal");
    expect(combinedOutput).not.toContain("TypeError: fetch failed");
  });
});

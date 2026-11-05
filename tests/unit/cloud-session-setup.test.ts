import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// Keep the actual configured-command and offline dependency-repair contracts
// in the existing unit CI job as well as npm run check.
it("honors the configured cloud-session hook contracts", () => {
  const result = spawnSync(process.execPath, [
    "--test", ".claude/hooks/cloud-session-setup.contract.mjs",
  ], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  expect(result.error, result.stdout + result.stderr).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
}, 35_000);

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const testSupportSource = readFileSync(
  resolve(__dirname, "../../convex/testSupport.ts"),
  "utf8",
);

describe("E2E Queue cleanup coverage", () => {
  it("removes every Queue record created inside a marked E2E move", () => {
    for (const table of [
      "queueActivities",
      "queueItems",
      "ingestionQueueEntries",
    ]) {
      expect(testSupportSource).toContain(`.query("${table}")`);
    }
  });
});

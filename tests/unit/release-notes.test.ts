import { describe, expect, it } from "vitest";

import {
  appVersion,
  formatReleaseTimestamp,
  latestRelease,
  releaseEntries,
} from "@/lib/release-notes";

describe("release notes", () => {
  it("keeps the visible app version aligned to the latest release entry", () => {
    expect(appVersion).toBe("0.2.0");
    expect(latestRelease.version).toBe("0.2.0");
    expect(releaseEntries[0].version).toBe("0.2.0");
  });

  it("uses canonical releasedAt timestamps for every entry", () => {
    expect(releaseEntries.length).toBeGreaterThan(0);

    for (const entry of releaseEntries) {
      expect(entry.releasedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(Number.isNaN(Date.parse(entry.releasedAt))).toBe(false);
      expect("date" in entry).toBe(false);
    }
  });

  it("renders release date, time, and timezone for visible updates entries", () => {
    expect(formatReleaseTimestamp("2026-06-19T21:02:00.000Z")).toBe(
      "June 19, 2026, 5:02 PM EDT",
    );
    expect(formatReleaseTimestamp("2026-06-19T13:05:05.000Z")).toBe(
      "June 19, 2026, 9:05 AM EDT",
    );

    for (const entry of releaseEntries) {
      expect(formatReleaseTimestamp(entry.releasedAt)).toMatch(
        /^[A-Z][a-z]+ \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M [A-Z]{3}$/,
      );
    }
  });
});

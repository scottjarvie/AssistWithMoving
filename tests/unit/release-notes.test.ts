import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  appVersion,
  formatReleaseTimestamp,
  getReleaseItems,
  impactTiers,
  latestRelease,
  publicReleaseEntries,
  releaseCategories,
  releaseEntries,
} from "@/lib/release-notes";

type LedgerSource = {
  id: string;
  disposition: "include" | "group" | "exclude" | "unshipped";
  releaseItemId?: string;
  reason?: string;
};

function readLedger() {
  return JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "docs/releases/v0.5.1-completeness-ledger.json",
      ),
      "utf8",
    ),
  ) as {
    release: { version: string; from: string; to: string; cutoff: string };
    sources: LedgerSource[];
  };
}

describe("release notes", () => {
  it("keeps the visible app version aligned to the proposed latest release", () => {
    expect(appVersion).toBe("0.5.1");
    expect(latestRelease.version).toBe("0.5.1");
    expect(releaseEntries[0].version).toBe("0.5.1");
  });

  it("uses the exact impact-sorted Created, Fixed, and Upgraded story", () => {
    expect(
      getReleaseItems(latestRelease, "created").map((item) => item.id),
    ).toEqual([]);
    expect(getReleaseItems(latestRelease, "fixed").map((item) => item.id)).toEqual(
      ["queue-linked-mcp-results"],
    );
    expect(
      getReleaseItems(latestRelease, "upgraded").map((item) => item.id),
    ).toEqual([]);
  });

  it("enforces the normalized release item contract", () => {
    for (const entry of releaseEntries) {
      expect(entry.releasedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(Number.isNaN(Date.parse(entry.releasedAt))).toBe(false);
      expect(entry.timezone).toBeTruthy();

      const ids = new Set<string>();
      const categoryRanks = new Set<string>();

      for (const item of entry.items) {
        expect(releaseCategories).toContain(item.category);
        expect(impactTiers).toContain(item.impactTier);
        expect(item.short.trim()).not.toBe("");
        expect(item.long.what.trim()).not.toBe("");
        expect(item.long.why.trim()).not.toBe("");
        expect(item.sourceRefs.length).toBeGreaterThan(0);
        expect(ids.has(item.id)).toBe(false);
        ids.add(item.id);

        const rankKey = `${item.category}-${item.impactTier}-${item.impactRank}`;
        expect(categoryRanks.has(rankKey)).toBe(false);
        categoryRanks.add(rankKey);
      }
    }
  });

  it("matches every included ledger source to one public release item", () => {
    const ledger = readLedger();
    const releaseItemById = new Map(
      latestRelease.items.map((item) => [item.id, item]),
    );
    const ledgerIds = new Set(ledger.sources.map((source) => source.id));

    expect(ledger.release).toMatchObject({
      version: "0.5.1",
      from: "42c51f2f60c17d7490d71d8c1ce333359e342286",
      to: "147cff46eaf971b3629d5b9e625e668c3a2d2b0b",
      cutoff: "2026-08-14T04:10:43.000Z",
    });
    expect(ledger.sources).toHaveLength(1);
    expect(ledgerIds.size).toBe(1);
    expect(ledger.sources.some((source) => source.disposition === "unshipped")).toBe(
      false,
    );

    for (const source of ledger.sources) {
      if (source.disposition === "include" || source.disposition === "group") {
        const item = releaseItemById.get(source.releaseItemId ?? "");
        expect(item, `${source.id} has an unknown release item`).toBeDefined();
        expect(item?.sourceRefs).toContain(source.id);
      } else {
        expect(source.reason?.trim()).not.toBe("");
      }
    }

    for (const item of latestRelease.items) {
      expect(item.sourceRefs.length).toBeGreaterThan(0);
      for (const sourceRef of item.sourceRefs) {
        const ledgerSource = ledger.sources.find(
          (source) => source.id === sourceRef,
        );
        expect(
          ledgerSource,
          `${item.id} references a source missing from the ledger`,
        ).toBeDefined();
        expect(ledgerSource?.releaseItemId).toBe(item.id);
      }
    }
  });

  it("documents the duplicate historical v0.2.0 note as a backfill", () => {
    const versionTwoEntries = releaseEntries.filter(
      (entry) => entry.version === "0.2.0",
    );

    expect(versionTwoEntries).toHaveLength(2);
    expect(versionTwoEntries[0].title).toBe(
      "Item detail Other Photos gallery",
    );
    expect(versionTwoEntries[0].backfillNote).toContain(
      "did not create or silently renumber a second v0.2.0 release",
    );
    expect(versionTwoEntries[1].title).toBe(
      "MCP OAuth discovery preservation",
    );
    expect(versionTwoEntries[1].backfillNote).toBeUndefined();
  });

  it("keeps private source references out of public release data", () => {
    expect(publicReleaseEntries).toHaveLength(releaseEntries.length);
    expect(publicReleaseEntries[0].items[0]).not.toHaveProperty("sourceRefs");
    expect(publicReleaseEntries[0].items[0]).not.toHaveProperty("audiences");
  });

  it("renders evidence-backed date, time, and timezone", () => {
    expect(
      formatReleaseTimestamp(
        "2026-08-13T21:56:23.554Z",
        "America/Phoenix",
      ),
    ).toBe("August 13, 2026, 2:56 PM MST");
    expect(
      formatReleaseTimestamp(
        "2026-08-13T02:29:04.000Z",
        "America/Phoenix",
      ),
    ).toBe("August 12, 2026, 7:29 PM MST");
    expect(
      formatReleaseTimestamp(
        "2026-08-12T23:46:53.000Z",
        "America/Phoenix",
      ),
    ).toBe("August 12, 2026, 4:46 PM MST");
    expect(
      formatReleaseTimestamp(
        "2026-07-27T17:08:59.000Z",
        "America/Phoenix",
      ),
    ).toBe("July 27, 2026, 10:08 AM MST");
    expect(
      formatReleaseTimestamp(
        "2026-06-20T15:54:20.000Z",
        "America/Phoenix",
      ),
    ).toBe("June 20, 2026, 8:54 AM MST");

    for (const entry of releaseEntries) {
      expect(
        formatReleaseTimestamp(entry.releasedAt, entry.timezone),
      ).toMatch(
        /^[A-Z][a-z]+ \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M [A-Z]{3,4}$/,
      );
    }
  });
});

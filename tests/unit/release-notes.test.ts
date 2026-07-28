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
        "docs/releases/v0.3.0-completeness-ledger.json",
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
    expect(appVersion).toBe("0.3.0");
    expect(latestRelease.version).toBe("0.3.0");
    expect(releaseEntries[0].version).toBe("0.3.0");
  });

  it("uses the exact impact-sorted Created, Fixed, and Upgraded story", () => {
    expect(
      getReleaseItems(latestRelease, "created").map((item) => item.id),
    ).toEqual([
      "connected-agent-workflows",
      "move-workspace",
      "shared-moving-team",
      "spaces-transport-planning",
      "capture-evidence-workflow",
      "inventory-controls",
      "mobile-install",
      "public-guidance",
    ]);
    expect(getReleaseItems(latestRelease, "fixed").map((item) => item.id)).toEqual(
      [
        "privacy-access-boundaries",
        "media-reliability",
        "agent-error-recovery",
        "inventory-data-integrity",
        "collaboration-permissions",
      ],
    );
    expect(
      getReleaseItems(latestRelease, "upgraded").map((item) => item.id),
    ).toEqual([
      "responsive-adaptive-interface",
      "large-move-discovery",
      "trustworthy-workflow-feedback",
      "release-safety",
    ]);
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
      version: "0.3.0",
      from: "992b1e3f75f3933bf0be244a4e434b5f38509f8c",
      to: "15cf0063218a6208326abf6b10142d8d1a500ef6",
      cutoff: "2026-07-27T17:08:59.000Z",
    });
    expect(ledger.sources).toHaveLength(142);
    expect(ledgerIds.size).toBe(142);
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

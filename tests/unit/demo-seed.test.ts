import { describe, expect, it } from "vitest";

import {
  demoHouseholdName,
  demoSeedScenarioSummary,
  demoSeedScenarios,
  type DemoSeedItem,
} from "../../convex/lib/demoSeed";
import {
  publicPacketDisclosure,
  publicPacketKindForProfileType,
} from "../../convex/lib/publicPackets";
import { publicSubManifestKindForProfileType } from "../../convex/lib/subManifest";

describe("demo seed scenarios", () => {
  it("covers the launch QA scenario set", () => {
    const summary = demoSeedScenarioSummary();

    expect(demoHouseholdName).toBe("Assist With Moving Demo Household");
    expect(summary.scenarioCount).toBe(5);
    expect(summary.moveTypes).toEqual([
      "pcs",
      "longDistance",
      "storage",
      "decluttering",
      "claimsInventory",
    ]);
    expect(summary.documentationProfileTypes).toEqual(
      expect.arrayContaining([
        "pcsMove",
        "movingCompany",
        "loadCrew",
        "storageInventory",
        "donationPickup",
        "sellOrGiveaway",
        "insuranceClaim",
        "personalFullRecord",
      ])
    );
    expect(summary.itemCount).toBeGreaterThanOrEqual(10);
    expect(summary.boxCount).toBeGreaterThanOrEqual(7);
  });

  it("includes evidence metadata and box assignments for every scenario", () => {
    for (const scenario of demoSeedScenarios) {
      expect(scenario.items.some((item) => item.photoTypes?.length)).toBe(true);
      const transportPresets = new Set<string>(scenario.transportPresets);
      for (const box of scenario.boxes) {
        expect(box.presetKey ? transportPresets.has(box.presetKey) : true).toBe(
          true
        );
      }
      for (const item of scenario.items.filter((entry) => entry.boxCode)) {
        expect(
          scenario.boxes.some((box) => box.code === item.boxCode)
        ).toBe(true);
      }
    }
  });

  it("keeps every shareable demo documentation profile publicly renderable", () => {
    const ownerOnlyProfiles = new Set(["personalFullRecord"]);

    for (const scenario of demoSeedScenarios) {
      for (const profileType of scenario.documentationProfileTypes) {
        if (ownerOnlyProfiles.has(profileType)) {
          continue;
        }

        expect(
          publicPacketKindForProfileType(profileType) ??
            publicSubManifestKindForProfileType(profileType),
          `${scenario.key} ${profileType} should render through /share/{token}`
        ).not.toBeNull();
      }
    }
  });

  it("keeps launch demo scenarios aligned to their recipient packet data needs", () => {
    const byKey = new Map(
      demoSeedScenarios.map((scenario) => [scenario.key, scenario])
    );
    const pcs = byKey.get("pcs-mixed");
    const household = byKey.get("household");
    const storage = byKey.get("storage");
    const donation = byKey.get("donation");
    const claim = byKey.get("claim");

    expect(pcs?.pcs?.ordersNumber).toBeTruthy();
    expect(
      asDemoItems(pcs?.items).some((item) =>
        item.planningDefaultKeys?.includes("documents")
      )
    )
      .toBe(true);
    expect(asDemoItems(household?.items).some((item) => item.disposition === "mover"))
      .toBe(true);
    expect(asDemoItems(storage?.items).every((item) => item.disposition === "storage"))
      .toBe(true);
    expect(asDemoItems(donation?.items).some((item) => item.disposition === "donate"))
      .toBe(true);
    expect(asDemoItems(donation?.items).some((item) => item.disposition === "free"))
      .toBe(true);
    const claimItems = asDemoItems(claim?.items);
    expect(
      claimItems.every(
        (item) => item.status === "damaged" || item.status === "missing"
      )
    ).toBe(true);
    expect(
      claimItems.every(
        (item) =>
          item.photoTypes?.some((photoType) =>
            ["damage", "receipt", "serialNumber"].includes(photoType)
          ) &&
          (typeof item.valueCents === "number" ||
            typeof item.replacementValueCents === "number")
      )
    ).toBe(true);
    expect(publicPacketDisclosure("insuranceClaim")).toMatchObject({
      valuesHidden: false,
      serialsHidden: false,
    });
    expect(publicPacketDisclosure("movingCompany")).toMatchObject({
      valuesHidden: true,
      serialsHidden: true,
    });
  });
});

function asDemoItems(items: readonly DemoSeedItem[] | undefined) {
  return [...(items ?? [])];
}

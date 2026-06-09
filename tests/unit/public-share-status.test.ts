import { describe, expect, it } from "vitest";

import {
  assertPublicShareCanStatusUpdate,
  publicShareBoxVisibleToProfile,
  publicShareItemVisibleToProfile,
} from "../../convex/lib/publicShareStatus";

describe("public share status update rules", () => {
  it("requires explicit statusUpdate action", () => {
    expect(() =>
      assertPublicShareCanStatusUpdate({
        allowedActions: ["view"],
        profileType: "loadCrew",
        targetType: "box",
        nextStatus: "loaded",
      })
    ).toThrow("Share link does not allow status updates.");
  });

  it("allows only status-update packet types", () => {
    expect(() =>
      assertPublicShareCanStatusUpdate({
        allowedActions: ["view", "statusUpdate"],
        profileType: "insuranceClaim",
        targetType: "item",
        nextStatus: "loaded",
      })
    ).toThrow("This packet type does not allow public status updates.");
  });

  it("blocks destructive public statuses", () => {
    expect(() =>
      assertPublicShareCanStatusUpdate({
        allowedActions: ["view", "statusUpdate"],
        profileType: "loadCrew",
        targetType: "item",
        nextStatus: "archived",
      })
    ).toThrow("Unsupported public item status update.");
    expect(() =>
      assertPublicShareCanStatusUpdate({
        allowedActions: ["view", "statusUpdate"],
        profileType: "loadCrew",
        targetType: "box",
        nextStatus: "archived",
      })
    ).toThrow("Unsupported public box status update.");
  });

  it("allows move-day status updates for eligible profile types", () => {
    expect(() =>
      assertPublicShareCanStatusUpdate({
        allowedActions: ["view", "statusUpdate"],
        profileType: "loadCrew",
        targetType: "box",
        nextStatus: "loaded",
      })
    ).not.toThrow();
    expect(() =>
      assertPublicShareCanStatusUpdate({
        allowedActions: ["view", "statusUpdate"],
        profileType: "movingCompany",
        targetType: "item",
        nextStatus: "packed",
      })
    ).not.toThrow();
  });

  it("keeps item updates scoped to profile-visible records", () => {
    const profile = {
      type: "movingCompany",
      filters: { dispositions: ["mover"] },
    } as never;

    expect(
      publicShareItemVisibleToProfile({
        profile,
        item: {
          status: "active",
          disposition: "mover",
          planningDefaultKeys: [],
        } as never,
      })
    ).toBe(true);
    expect(
      publicShareItemVisibleToProfile({
        profile,
        item: {
          status: "active",
          disposition: "personalTransport",
          planningDefaultKeys: [],
        } as never,
      })
    ).toBe(false);
  });

  it("scopes box updates for sub-manifest style links to visible contents", () => {
    const box = { archivedAt: undefined } as never;

    expect(
      publicShareBoxVisibleToProfile({
        box,
        profile: { type: "storageInventory" } as never,
        visibleItemCount: 1,
      })
    ).toBe(true);
    expect(
      publicShareBoxVisibleToProfile({
        box,
        profile: { type: "storageInventory" } as never,
        visibleItemCount: 0,
      })
    ).toBe(false);
    expect(
      publicShareBoxVisibleToProfile({
        box,
        profile: { type: "loadCrew" } as never,
        visibleItemCount: 0,
      })
    ).toBe(true);
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_GRACE_MS,
  ACCOUNT_EXPORT_EXPIRATION_MS,
  accountDeletionScheduledAt,
  accountExportExpiresAt,
  accountExportFilename,
  anonymizedUserPatch,
  assertDeletionConfirmation,
  queueRecordBelongsToAccountExport,
  redactItemForExport,
  retentionPolicy,
  summarizeExportPackage,
} from "../../convex/lib/accountPrivacy";

describe("account privacy helpers", () => {
  it("keeps Queue exports personal even for members of the same household", () => {
    const householdId = "household1" as never;
    const accountUserId = "user1" as never;

    expect(
      queueRecordBelongsToAccountExport(
        { ownerUserId: accountUserId, householdId },
        accountUserId,
        householdId,
      ),
    ).toBe(true);
    expect(
      queueRecordBelongsToAccountExport(
        { ownerUserId: "user2" as never, householdId },
        accountUserId,
        householdId,
      ),
    ).toBe(false);
    expect(
      queueRecordBelongsToAccountExport(
        { ownerUserId: accountUserId, householdId: "household2" as never },
        accountUserId,
        householdId,
      ),
    ).toBe(false);

    const exportSource = readFileSync("convex/accountPrivacy.ts", "utf8");
    expect(exportSource).toContain('.withIndex("by_owner_updated"');
    expect(exportSource).toContain('.withIndex("by_owner_created"');
    expect(exportSource).toContain("queueRecordBelongsToAccountExport(item");
    expect(exportSource).toContain("queueRecordBelongsToAccountExport(activity");
  });

  it("uses deterministic export and deletion windows", () => {
    const now = Date.UTC(2026, 5, 8, 12);

    expect(accountExportExpiresAt(now)).toBe(now + ACCOUNT_EXPORT_EXPIRATION_MS);
    expect(accountDeletionScheduledAt(now)).toBe(
      now + ACCOUNT_DELETION_GRACE_MS
    );
    expect(accountExportFilename(now)).toBe(
      "movingmanifest-account-export-2026-06-08.json"
    );
  });

  it("builds an anonymized user patch without deleting audit identities", () => {
    expect(anonymizedUserPatch(1000)).toEqual({
      email: undefined,
      name: "Deleted user",
      imageUrl: undefined,
      status: "disabled",
      defaultHouseholdId: undefined,
      updatedAt: 1000,
      lastSeenAt: 1000,
    });
  });

  it("requires an exact destructive confirmation phrase", () => {
    expect(() => assertDeletionConfirmation("delete my account")).toThrow(
      ACCOUNT_DELETION_CONFIRMATION
    );
    expect(() =>
      assertDeletionConfirmation(ACCOUNT_DELETION_CONFIRMATION)
    ).not.toThrow();
  });

  it("redacts sensitive item fields for low-privilege exports", () => {
    const exported = redactItemForExport(
      {
        _id: "item1",
        _creationTime: 1,
        householdId: "household1",
        moveId: "move1",
        name: "Laptop",
        normalizedName: "laptop",
        disposition: "take",
        status: "active",
        quantity: 1,
        condition: "good",
        valueCents: 120000,
        replacementValueCents: 150000,
        serialNumber: "SERIAL",
        modelNumber: "MODEL",
        weightConfidence: "manual",
        volumeConfidence: "manual",
        fragility: "high",
        stackable: false,
        hazardousFlag: false,
        highValue: true,
        requiresPersonalTransport: true,
        planningDefaultKeys: [],
        needsReview: false,
        reviewFlags: [],
        privateNotes: "safe code nearby",
        aiTags: [],
        createdVia: "manual",
        createdByUserId: "user1",
        updatedByUserId: "user1",
        createdAt: 1,
        updatedAt: 2,
      } as never,
      "viewer"
    );

    expect(exported.valueCents).toBeUndefined();
    expect(exported.replacementValueCents).toBeUndefined();
    expect(exported.serialNumber).toBeUndefined();
    expect(exported.privateNotes).toBeUndefined();
    expect(exported.name).toBe("Laptop");
  });

  it("summarizes account export package sections", () => {
    expect(
      summarizeExportPackage({
        households: [1],
        moves: [1, 2],
        items: [1, 2, 3],
        boxes: [],
        photos: [1],
        exportJobs: [],
        apiKeys: [1],
        shareLinks: [1, 2],
        queueItems: [1],
        queueActivities: [1, 2, 3],
      })
    ).toEqual({
      households: 1,
      moves: 2,
      items: 3,
      boxes: 0,
      photos: 1,
      exportJobs: 0,
      apiKeys: 1,
      shareLinks: 2,
      queueItems: 1,
      queueActivities: 3,
    });
  });

  it("documents the product retention posture", () => {
    expect(retentionPolicy.accountExports).toContain("14 days");
    expect(retentionPolicy.deletion).toContain("7 days");
    expect(retentionPolicy.auditLogs).toContain("retained");
    expect(retentionPolicy.queueHistory).toContain("remain with the move");
  });
});

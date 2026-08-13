import { describe, expect, it } from "vitest";

import {
  appRoleForEmail,
  isConfiguredAdminEmail,
  parseAdminEmails,
} from "../../convex/lib/admin";
import {
  countBy,
  matchesAdminSearch,
  safeAuditSummary,
  sumBy,
} from "../../convex/lib/adminSummaries";

describe("admin helpers", () => {
  it("parses configured admin emails case-insensitively", () => {
    expect(parseAdminEmails(" scott@example.com, CTO@Example.com ,,")).toEqual(
      new Set(["scott@example.com", "cto@example.com"])
    );
    expect(isConfiguredAdminEmail("cto@example.com", "CTO@Example.com")).toBe(
      true
    );
  });

  it("assigns admin roles from configured emails without demoting admins", () => {
    expect(appRoleForEmail("scott@example.com", undefined)).toBe("member");
    expect(
      appRoleForEmail("scott@example.com", "admin")
    ).toBe("admin");
  });

  it("counts, sums, and searches safe metadata", () => {
    const rows = [
      { status: "active", bytes: 10 },
      { status: "active", bytes: 15 },
      { status: "archived", bytes: undefined },
    ];

    expect(countBy(rows, (row) => row.status)).toEqual({
      active: 2,
      archived: 1,
    });
    expect(sumBy(rows, (row) => row.bytes)).toBe(25);
    expect(matchesAdminSearch("moving", ["Assist With Moving", "other"])).toBe(
      true
    );
    expect(matchesAdminSearch("none", ["Assist With Moving", "other"])).toBe(false);
  });

  it("redacts audit metadata for admin summaries", () => {
    const summary = safeAuditSummary({
      _id: "audit1",
      _creationTime: 1,
      actorType: "user",
      actorUserId: "user1",
      category: "admin",
      action: "admin.user_viewed",
      metadata: {
        visible: "ok",
        privateNotes: "not ok",
      },
      createdAt: 2,
    } as never);

    expect(summary.metadata).toEqual({
      visible: "ok",
      privateNotes: "[redacted]",
    });
  });
});

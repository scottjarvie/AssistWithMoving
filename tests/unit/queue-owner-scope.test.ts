import { describe, expect, it } from "vitest";

import { defaultQueueOwnerScope } from "@/lib/queue-owner-scope";

describe("Queue owner first-run scope", () => {
  it("defaults a single-owner move to My Queue", () => {
    expect(
      defaultQueueOwnerScope({
        currentUserId: "user_owner",
        canManage: true,
        delegatedOwnerCount: 0,
      }),
    ).toBe("user_owner");
  });

  it("keeps the aggregate manager view when other Queue owners exist", () => {
    expect(
      defaultQueueOwnerScope({
        currentUserId: "user_owner",
        canManage: true,
        delegatedOwnerCount: 2,
      }),
    ).toBe("all");
  });

  it("waits until both identity and scope data are available", () => {
    expect(
      defaultQueueOwnerScope({
        currentUserId: "user_owner",
        canManage: undefined,
        delegatedOwnerCount: undefined,
      }),
    ).toBe("loading");
  });
});

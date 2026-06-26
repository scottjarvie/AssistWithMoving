import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import {
  canActOnQueueEntry,
  canRunQueueForOwner,
  canViewQueueEntry,
  queueEntryOwnerUserId,
  queueOwnerDisplayName,
} from "../../convex/lib/queueAccess";

const scott = "user_scott" as Id<"users">;
const erin = "user_erin" as Id<"users">;
const mover = "user_mover" as Id<"users">;

describe("queueOwnerDisplayName", () => {
  it("prefers a real name", () => {
    expect(
      queueOwnerDisplayName({ name: "Scott Jarvie", email: "scott@x.com" }),
    ).toBe("Scott Jarvie");
  });
  it("falls back to a capitalized email local part (not 'Someone')", () => {
    expect(queueOwnerDisplayName({ name: "", email: "scott@thejarvie.com" })).toBe(
      "Scott",
    );
    expect(queueOwnerDisplayName({ name: null, email: "erin@x.com" })).toBe(
      "Erin",
    );
  });
  it("uses 'Someone' only when there's nothing to show", () => {
    expect(queueOwnerDisplayName({})).toBe("Someone");
  });
});

describe("per-user queue ownership + delegation (requirement 5)", () => {
  it("coalesces ownerUserId to the creator for legacy rows", () => {
    expect(
      queueEntryOwnerUserId({ createdByUserId: scott }),
    ).toBe(scott);
    expect(
      queueEntryOwnerUserId({ ownerUserId: erin, createdByUserId: scott }),
    ).toBe(erin);
  });

  it("lets you run your own queue", () => {
    expect(
      canRunQueueForOwner({
        actorUserId: scott,
        ownerUserId: scott,
        delegatedOwnerIds: [],
      }),
    ).toBe(true);
  });

  it("blocks running someone else's queue without delegation (private by default)", () => {
    expect(
      canRunQueueForOwner({
        actorUserId: erin,
        ownerUserId: scott,
        delegatedOwnerIds: [],
      }),
    ).toBe(false);
  });

  it("allows running another's queue once delegated (share a subscription)", () => {
    // Scott granted Erin the right to run his queue.
    expect(
      canRunQueueForOwner({
        actorUserId: erin,
        ownerUserId: scott,
        delegatedOwnerIds: [scott],
      }),
    ).toBe(true);
  });

  it("does not let a delegated runner reach a THIRD party's queue", () => {
    expect(
      canRunQueueForOwner({
        actorUserId: erin,
        ownerUserId: mover,
        delegatedOwnerIds: [scott],
      }),
    ).toBe(false);
  });
});

describe("acting on an existing entry (closes the clobber hole B6)", () => {
  it("blocks a non-owner, non-holder, non-delegated editor", () => {
    expect(
      canActOnQueueEntry({
        actorUserId: mover,
        entryOwnerUserId: scott,
        claimedByUserId: erin,
        isManager: false,
        delegatedOwnerIds: [],
      }),
    ).toBe(false);
  });

  it("allows the claim holder", () => {
    expect(
      canActOnQueueEntry({
        actorUserId: erin,
        entryOwnerUserId: scott,
        claimedByUserId: erin,
        isManager: false,
        delegatedOwnerIds: [scott],
      }),
    ).toBe(true);
  });

  it("allows the entry owner", () => {
    expect(
      canActOnQueueEntry({
        actorUserId: scott,
        entryOwnerUserId: scott,
        claimedByUserId: erin,
        isManager: false,
        delegatedOwnerIds: [],
      }),
    ).toBe(true);
  });

  it("allows a move manager to fix any entry", () => {
    expect(
      canActOnQueueEntry({
        actorUserId: scott,
        entryOwnerUserId: mover,
        claimedByUserId: erin,
        isManager: true,
        delegatedOwnerIds: [],
      }),
    ).toBe(true);
  });
});

describe("queue visibility", () => {
  it("managers see every queue; others see only own + delegated", () => {
    expect(
      canViewQueueEntry({
        actorUserId: scott,
        ownerUserId: mover,
        isManager: true,
        delegatedOwnerIds: [],
      }),
    ).toBe(true);
    expect(
      canViewQueueEntry({
        actorUserId: erin,
        ownerUserId: mover,
        isManager: false,
        delegatedOwnerIds: [scott],
      }),
    ).toBe(false);
  });
});

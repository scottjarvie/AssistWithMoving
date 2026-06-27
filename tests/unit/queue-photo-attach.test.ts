import { describe, expect, it } from "vitest";

import type { MutationCtx } from "../../convex/_generated/server";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { autoAttachEntryPhotos } from "../../convex/lib/queuePhotoAttach";

// Minimal in-memory ctx — the helper only uses ctx.db.get / ctx.db.patch.
function makeCtx(docs: Record<string, Record<string, unknown>>) {
  const store = new Map(Object.entries(docs).map(([k, v]) => [k, { _id: k, ...v }]));
  const ctx = {
    db: {
      get: async (id: string) => store.get(id) ?? null,
      patch: async (id: string, patch: Record<string, unknown>) => {
        Object.assign(store.get(id) as object, patch);
      },
    },
  } as unknown as MutationCtx;
  return { ctx, store };
}

const HH = "hh" as Id<"households">;
const MOVE = "move" as Id<"moves">;

function entry(extra: Record<string, unknown>): Doc<"ingestionQueueEntries"> {
  return {
    householdId: HH,
    moveId: MOVE,
    mediaPhotoIds: [],
    ...extra,
  } as unknown as Doc<"ingestionQueueEntries">;
}

const photo = (extra: Record<string, unknown> = {}) => ({
  householdId: HH,
  moveId: MOVE,
  ...extra,
});

describe("autoAttachEntryPhotos", () => {
  it("attaches all unattached photos to a single result item", async () => {
    const { ctx, store } = makeCtx({
      item_1: { moveId: MOVE },
      p1: photo(),
      p2: photo(),
    });
    const n = await autoAttachEntryPhotos(
      ctx,
      entry({ mediaPhotoIds: ["p1", "p2"] }),
      ["item_1" as Id<"items">],
      1000,
    );
    expect(n).toBe(2);
    expect((store.get("p1") as { itemId?: string }).itemId).toBe("item_1");
    expect((store.get("p2") as { itemId?: string }).itemId).toBe("item_1");
  });

  it("does not clobber a photo already filed onto inventory", async () => {
    const { ctx, store } = makeCtx({
      item_1: { moveId: MOVE },
      p1: photo({ itemId: "other_item" }),
      p2: photo({ boxId: "some_box" }),
      p3: photo(),
    });
    const n = await autoAttachEntryPhotos(
      ctx,
      entry({ mediaPhotoIds: ["p1", "p2", "p3"] }),
      ["item_1" as Id<"items">],
      1000,
    );
    expect(n).toBe(1);
    expect((store.get("p1") as { itemId?: string }).itemId).toBe("other_item");
    expect((store.get("p3") as { itemId?: string }).itemId).toBe("item_1");
  });

  it("skips foreign-move and archived photos", async () => {
    const { ctx, store } = makeCtx({
      item_1: { moveId: MOVE },
      p_foreign: photo({ moveId: "other_move" }),
      p_archived: photo({ archivedAt: 5 }),
      p_ok: photo(),
    });
    const n = await autoAttachEntryPhotos(
      ctx,
      entry({ mediaPhotoIds: ["p_foreign", "p_archived", "p_ok"] }),
      ["item_1" as Id<"items">],
      1000,
    );
    expect(n).toBe(1);
    expect((store.get("p_ok") as { itemId?: string }).itemId).toBe("item_1");
  });

  it("falls back to the entry's target space when there is no single item", async () => {
    const { ctx, store } = makeCtx({
      space_1: { moveId: MOVE, status: "active" },
      p1: photo(),
    });
    const n = await autoAttachEntryPhotos(
      ctx,
      entry({ mediaPhotoIds: ["p1"], targetSpaceId: "space_1" }),
      undefined,
      1000,
    );
    expect(n).toBe(1);
    expect((store.get("p1") as { spaceId?: string }).spaceId).toBe("space_1");
  });

  it("does nothing with multiple result items (ambiguous target)", async () => {
    const { ctx } = makeCtx({
      item_1: { moveId: MOVE },
      item_2: { moveId: MOVE },
      p1: photo(),
    });
    const n = await autoAttachEntryPhotos(
      ctx,
      entry({ mediaPhotoIds: ["p1"] }),
      ["item_1" as Id<"items">, "item_2" as Id<"items">],
      1000,
    );
    expect(n).toBe(0);
  });

  it("does nothing when the result item is from another move", async () => {
    const { ctx } = makeCtx({
      item_x: { moveId: "other_move" },
      p1: photo(),
    });
    const n = await autoAttachEntryPhotos(
      ctx,
      entry({ mediaPhotoIds: ["p1"] }),
      ["item_x" as Id<"items">],
      1000,
    );
    expect(n).toBe(0);
  });

  it("no-ops on an entry with no photos", async () => {
    const { ctx } = makeCtx({ item_1: { moveId: MOVE } });
    const n = await autoAttachEntryPhotos(
      ctx,
      entry({ mediaPhotoIds: [] }),
      ["item_1" as Id<"items">],
      1000,
    );
    expect(n).toBe(0);
  });
});

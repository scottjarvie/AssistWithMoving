import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import {
  archiveActiveSaleListingsForItem,
  cascadeDeleteBox,
  cascadeDeleteItem,
} from "../../convex/lib/hardDelete";

type Row = Record<string, unknown> & { _id: string };

function createCtx(tables: Record<string, Row[]>) {
  const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const deletes: string[] = [];
  return {
    ctx: {
      db: {
        query: (table: string) => ({
          withIndex: (_index: string, build: (q: unknown) => unknown) => {
            const clauses: Array<{ field: string; value: unknown }> = [];
            const q = {
              eq: (field: string, value: unknown) => {
                clauses.push({ field, value });
                return q;
              },
            };
            build(q);
            return {
              collect: async () =>
                (tables[table] ?? []).filter((row) =>
                  clauses.every((clause) => row[clause.field] === clause.value),
                ),
            };
          },
        }),
        patch: async (id: string, patch: Record<string, unknown>) => {
          patches.push({ id, patch });
        },
        delete: async (id: string) => {
          deletes.push(id);
        },
      },
    },
    patches,
    deletes,
  };
}

describe("hard delete cascades", () => {
  it("deletes item-owned rows and scrubs only live queue/planning references", async () => {
    const itemId = "item_1" as Id<"items">;
    const moveId = "move_1" as Id<"moves">;
    const { ctx, patches, deletes } = createCtx({
      itemPhotos: [
        { _id: "photo_1", itemId },
        { _id: "photo_2", itemId },
      ],
      boxItems: [{ _id: "membership_1", itemId }],
      saleListings: [{ _id: "listing_1", itemId }],
      planPlacements: [{ _id: "placement_1", itemId }],
      ingestionQueueEntries: [
        {
          _id: "entry_live",
          moveId,
          status: "queued",
          targetItemId: itemId,
          mediaPhotoIds: ["photo_1", "photo_keep"],
          expectedMediaCount: 3,
          mediaUploadState: "uploading",
          updatedAt: 1,
        },
        {
          _id: "entry_terminal",
          moveId,
          status: "processed",
          targetItemId: itemId,
          mediaPhotoIds: ["photo_2"],
          updatedAt: 1,
        },
      ],
      aiPlanningSuggestions: [
        { _id: "suggestion_1", moveId, itemId, updatedAt: 1 },
      ],
    });

    const result = await cascadeDeleteItem(ctx as never, {
      moveId,
      itemId,
      now: 100,
    });

    expect(deletes).toEqual(["photo_1", "photo_2", "membership_1", "listing_1", "placement_1"]);
    expect(patches).toContainEqual({
      id: "entry_live",
      patch: {
        targetItemId: undefined,
        mediaPhotoIds: ["photo_keep"],
        expectedMediaCount: 2,
        updatedAt: 100,
      },
    });
    expect(patches).toContainEqual({
      id: "suggestion_1",
      patch: { itemId: undefined, updatedAt: 100 },
    });
    expect(patches.some((patch) => patch.id === "entry_terminal")).toBe(false);
    expect(result).toMatchObject({
      deletedPhotoCount: 2,
      deletedMembershipCount: 1,
      deletedListingCount: 1,
      deletedPlacementCount: 1,
      updatedQueueEntryCount: 1,
      updatedPlanningSuggestionCount: 1,
    });
  });

  it("cascades box photos, placements, memberships, and live references", async () => {
    const boxId = "box_1" as Id<"boxes">;
    const moveId = "move_1" as Id<"moves">;
    const { ctx, patches, deletes } = createCtx({
      itemPhotos: [{ _id: "photo_box", boxId }],
      boxItems: [{ _id: "membership_box", boxId }],
      planPlacements: [{ _id: "placement_box", boxId }],
      ingestionQueueEntries: [
        {
          _id: "entry_box",
          moveId,
          status: "needsInput",
          targetBoxId: boxId,
          mediaPhotoIds: ["photo_box"],
          expectedMediaCount: 2,
          updatedAt: 1,
        },
      ],
      aiPlanningSuggestions: [{ _id: "suggestion_box", moveId, boxId }],
    });

    const result = await cascadeDeleteBox(ctx as never, {
      moveId,
      boxId,
      now: 200,
    });

    expect(deletes).toEqual(["photo_box", "membership_box", "placement_box"]);
    expect(patches).toContainEqual({
      id: "entry_box",
      patch: {
        targetBoxId: undefined,
        mediaPhotoIds: [],
        expectedMediaCount: 1,
        updatedAt: 200,
      },
    });
    expect(patches).toContainEqual({
      id: "suggestion_box",
      patch: { boxId: undefined, updatedAt: 200 },
    });
    expect(result).toMatchObject({
      deletedPhotoCount: 1,
      unpackedItemCount: 1,
      deletedPlacementCount: 1,
      updatedQueueEntryCount: 1,
      updatedPlanningSuggestionCount: 1,
    });
  });

  it("archives only active sale listings for retired items", async () => {
    const itemId = "item_1" as Id<"items">;
    const { ctx, patches } = createCtx({
      saleListings: [
        { _id: "listing_active", itemId },
        { _id: "listing_archived", itemId, archivedAt: 10 },
      ],
    });

    const archived = await archiveActiveSaleListingsForItem(
      ctx as never,
      itemId,
      300,
    );

    expect(archived).toBe(1);
    expect(patches).toEqual([
      {
        id: "listing_active",
        patch: { archivedAt: 300, updatedAt: 300 },
      },
    ]);
  });

  it("only completes an uploading queue entry when the pruned expectation is reached", async () => {
    const itemId = "item_1" as Id<"items">;
    const moveId = "move_1" as Id<"moves">;
    const { ctx, patches } = createCtx({
      itemPhotos: [{ _id: "photo_pruned", itemId }],
      ingestionQueueEntries: [
        {
          _id: "entry_still_uploading",
          moveId,
          status: "queued",
          mediaPhotoIds: ["photo_pruned", "photo_keep"],
          expectedMediaCount: 3,
          mediaUploadState: "uploading",
          updatedAt: 1,
        },
        {
          _id: "entry_now_complete",
          moveId,
          status: "queued",
          mediaPhotoIds: ["photo_pruned", "photo_keep"],
          expectedMediaCount: 2,
          mediaUploadState: "uploading",
          updatedAt: 1,
        },
      ],
    });

    await cascadeDeleteItem(ctx as never, {
      moveId,
      itemId,
      now: 400,
    });

    expect(patches).toContainEqual({
      id: "entry_still_uploading",
      patch: {
        mediaPhotoIds: ["photo_keep"],
        expectedMediaCount: 2,
        updatedAt: 400,
      },
    });
    expect(patches).toContainEqual({
      id: "entry_now_complete",
      patch: {
        mediaPhotoIds: ["photo_keep"],
        expectedMediaCount: 1,
        mediaUploadState: "complete",
        updatedAt: 400,
      },
    });
  });
});

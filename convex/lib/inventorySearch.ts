import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { normalizedSearchName } from "./moveFields";

export type InventorySearchFilters = {
  moveId: Id<"moves">;
  query?: string;
  room?: string;
  category?: string;
  disposition?: Doc<"items">["disposition"];
  needsReview?: boolean;
  limit?: number;
};

export function normalizeInventorySearchQuery(query?: string) {
  if (!query) return null;
  const normalized = normalizedSearchName(query);
  return normalized || null;
}

export function inventorySearchLimit(
  requested: number | undefined,
  maximum: number,
) {
  if (requested === undefined || !Number.isFinite(requested)) return maximum;
  return Math.max(1, Math.min(Math.floor(requested), maximum));
}

export async function searchInventoryRecords(
  ctx: Pick<QueryCtx, "db">,
  args: InventorySearchFilters,
) {
  const limit = inventorySearchLimit(args.limit, 200);
  const normalizedQuery = normalizeInventorySearchQuery(args.query);

  if (normalizedQuery) {
    return await ctx.db
      .query("items")
      .withSearchIndex("search_normalized_name", (q) => {
        let search = q
          .search("normalizedName", normalizedQuery)
          .eq("moveId", args.moveId)
          .eq("deletedAt", undefined);
        if (args.room) search = search.eq("room", args.room);
        if (args.category) search = search.eq("category", args.category);
        if (args.disposition) {
          search = search.eq("disposition", args.disposition);
        }
        if (args.needsReview !== undefined) {
          search = search.eq("needsReview", args.needsReview);
        }
        return search;
      })
      .take(limit);
  }

  const recent = await ctx.db
    .query("items")
    .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
    .order("desc")
    .take(1000);
  return recent
    .filter((item) => {
      if (item.deletedAt !== undefined) return false;
      if (args.room && item.room !== args.room) return false;
      if (args.category && item.category !== args.category) return false;
      if (args.disposition && item.disposition !== args.disposition) {
        return false;
      }
      if (
        args.needsReview !== undefined &&
        item.needsReview !== args.needsReview
      ) {
        return false;
      }
      return true;
    })
    .slice(0, limit);
}

export function toMcpInventorySearchResult(item: Doc<"items">) {
  return {
    itemId: item._id,
    name: item.name,
    room: item.room ?? null,
    category: item.category ?? null,
    quantity: item.quantity,
    disposition: item.disposition,
    status: item.status,
    needsReview: item.needsReview,
  };
}

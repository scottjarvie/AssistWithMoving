import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { normalizeBoxCode } from "./moveFields";
import type { QueryCtx } from "../_generated/server";

// Small moves retain exact substring matching. Large moves query source-table
// indexes so older matches can participate, without reading the full inventory.
export function validateInventoryQuery(needle: string) {
  if (needle.length > 240 || (needle.match(/[\p{L}\p{N}]+/gu)?.length ?? 0) > 16) {
    throw new ConvexError("Use at most 240 characters and 16 search terms; narrow the inventory query.");
  }
}

export const SMALL_INVENTORY = 120;
export const SEARCH_HITS_PER_FIELD = 50;

export async function searchItems(ctx: QueryCtx, moveId: Id<"moves">, needle: string) {
  const recent = await ctx.db.query("items")
    .withIndex("by_move_updated", q => q.eq("moveId", moveId))
    .order("desc").take(SMALL_INVENTORY + 1);
  if (!needle || recent.length <= SMALL_INVENTORY) {
    return { rows: recent.slice(0, SMALL_INVENTORY).filter(row => row.deletedAt === undefined &&
      (!needle || [row.name, row.room, row.category, row.description].filter(Boolean).join(" ").toLowerCase().includes(needle))),
      truncated: recent.length > SMALL_INVENTORY };
  }
  const groups = await Promise.all([
    ctx.db.query("items").withSearchIndex("search_name", q =>
      q.search("name", needle).eq("moveId", moveId).eq("deletedAt", undefined)).take(SEARCH_HITS_PER_FIELD + 1),
    ctx.db.query("items").withSearchIndex("search_room", q =>
      q.search("room", needle).eq("moveId", moveId).eq("deletedAt", undefined)).take(SEARCH_HITS_PER_FIELD + 1),
    ctx.db.query("items").withSearchIndex("search_category", q =>
      q.search("category", needle).eq("moveId", moveId).eq("deletedAt", undefined)).take(SEARCH_HITS_PER_FIELD + 1),
    ctx.db.query("items").withSearchIndex("search_description", q =>
      q.search("description", needle).eq("moveId", moveId).eq("deletedAt", undefined)).take(SEARCH_HITS_PER_FIELD + 1),
  ]);
  const unique = new Map<string, Doc<"items">>();
  for (const row of recent) if (row.deletedAt === undefined && [row.name, row.room, row.category, row.description].filter(Boolean).join(" ").toLowerCase().includes(needle)) unique.set(row._id, row);
  for (const rows of groups) for (const row of rows.slice(0, SEARCH_HITS_PER_FIELD)) unique.set(row._id, row);
  return { rows: [...unique.values()].sort((a, b) => b.updatedAt - a.updatedAt || a._id.localeCompare(b._id)).slice(0, SMALL_INVENTORY), truncated: unique.size > SMALL_INVENTORY || groups.some(rows => rows.length > SEARCH_HITS_PER_FIELD) };
}

export async function searchBoxes(ctx: QueryCtx, moveId: Id<"moves">, needle: string) {
  const recent = await ctx.db.query("boxes")
    .withIndex("by_move_updated", q => q.eq("moveId", moveId))
    .order("desc").take(SMALL_INVENTORY + 1);
  if (!needle || recent.length <= SMALL_INVENTORY) {
    return { rows: recent.slice(0, SMALL_INVENTORY).filter(row => row.archivedAt === undefined &&
      (!needle || [row.code, row.label, row.nickname, row.room, row.description].filter(Boolean).join(" ").toLowerCase().includes(needle))),
      truncated: recent.length > SMALL_INVENTORY };
  }
  const groups = await Promise.all([
    ctx.db.query("boxes").withIndex("by_move_code", q =>
      q.eq("moveId", moveId).eq("code", normalizeBoxCode(needle))).take(SEARCH_HITS_PER_FIELD + 1),
    ctx.db.query("boxes").withSearchIndex("search_label", q =>
      q.search("label", needle).eq("moveId", moveId).eq("archivedAt", undefined)).take(SEARCH_HITS_PER_FIELD + 1),
    ctx.db.query("boxes").withSearchIndex("search_nickname", q =>
      q.search("nickname", needle).eq("moveId", moveId).eq("archivedAt", undefined)).take(SEARCH_HITS_PER_FIELD + 1),
    ctx.db.query("boxes").withSearchIndex("search_room", q =>
      q.search("room", needle).eq("moveId", moveId).eq("archivedAt", undefined)).take(SEARCH_HITS_PER_FIELD + 1),
    ctx.db.query("boxes").withSearchIndex("search_description", q =>
      q.search("description", needle).eq("moveId", moveId).eq("archivedAt", undefined)).take(SEARCH_HITS_PER_FIELD + 1),
  ]);
  const unique = new Map<string, Doc<"boxes">>();
  for (const row of recent) if (row.archivedAt === undefined && [row.code, row.label, row.nickname, row.room, row.description].filter(Boolean).join(" ").toLowerCase().includes(needle)) unique.set(row._id, row);
  for (const rows of groups) for (const row of rows.slice(0, SEARCH_HITS_PER_FIELD)) if (!("archivedAt" in row) || row.archivedAt === undefined) unique.set(row._id, row);
  return { rows: [...unique.values()].sort((a, b) => b.updatedAt - a.updatedAt || a._id.localeCompare(b._id)).slice(0, SMALL_INVENTORY), truncated: unique.size > SMALL_INVENTORY || groups.some(rows => rows.length > SEARCH_HITS_PER_FIELD) };
}

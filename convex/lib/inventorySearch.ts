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

// API key callers have status and disposition filters and can search the destination.
export async function searchApiItems(
  ctx: Pick<QueryCtx, "db">,
  moveId: Id<"moves">,
  needle: string,
  filters: { status?: Doc<"items">["status"]; disposition?: Doc<"items">["disposition"] },
) {
  const ceiling = 100;
  const recent = await ctx.db.query("items")
    .withIndex("by_move_updated", q => q.eq("moveId", moveId))
    .order("desc").take(SMALL_INVENTORY + 1);
  const matches = recent.filter(item =>
    item.deletedAt === undefined &&
    (!filters.status || item.status === filters.status) &&
    (!filters.disposition || item.disposition === filters.disposition) &&
    [item.name, item.room, item.destinationRoom, item.category, item.description]
      .some(value => value?.toLowerCase().includes(needle)),
  );
  if (recent.length <= SMALL_INVENTORY) return { matches, truncated: false };

  const groups = await Promise.all([
    ctx.db.query("items").withSearchIndex("api_search_name", q => {
      let search = q.search("name", needle).eq("moveId", moveId).eq("deletedAt", undefined);
      if (filters.status) search = search.eq("status", filters.status);
      if (filters.disposition) search = search.eq("disposition", filters.disposition);
      return search;
    }).take(ceiling + 1),
    ctx.db.query("items").withSearchIndex("api_search_room", q => {
      let search = q.search("room", needle).eq("moveId", moveId).eq("deletedAt", undefined);
      if (filters.status) search = search.eq("status", filters.status);
      if (filters.disposition) search = search.eq("disposition", filters.disposition);
      return search;
    }).take(ceiling + 1),
    ctx.db.query("items").withSearchIndex("api_search_destinationRoom", q => {
      let search = q.search("destinationRoom", needle).eq("moveId", moveId).eq("deletedAt", undefined);
      if (filters.status) search = search.eq("status", filters.status);
      if (filters.disposition) search = search.eq("disposition", filters.disposition);
      return search;
    }).take(ceiling + 1),
    ctx.db.query("items").withSearchIndex("api_search_category", q => {
      let search = q.search("category", needle).eq("moveId", moveId).eq("deletedAt", undefined);
      if (filters.status) search = search.eq("status", filters.status);
      if (filters.disposition) search = search.eq("disposition", filters.disposition);
      return search;
    }).take(ceiling + 1),
    ctx.db.query("items").withSearchIndex("api_search_description", q => {
      let search = q.search("description", needle).eq("moveId", moveId).eq("deletedAt", undefined);
      if (filters.status) search = search.eq("status", filters.status);
      if (filters.disposition) search = search.eq("disposition", filters.disposition);
      return search;
    }).take(ceiling + 1),
  ]);
  const unique = new Map(matches.map(item => [item._id, item]));
  for (const group of groups) {
    for (const item of group.slice(0, ceiling)) unique.set(item._id, item);
  }
  return {
    matches: [...unique.values()].sort((a, b) => b.updatedAt - a.updatedAt || a._id.localeCompare(b._id)),
    truncated: groups.some(group => group.length > ceiling),
  };
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

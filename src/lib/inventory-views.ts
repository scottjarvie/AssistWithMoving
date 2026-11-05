import type { SortingState, VisibilityState } from "@tanstack/react-table";
import type { CollectionPresentation } from "@/components/use-collection-presentation";
import type { FacetSelection } from "@/lib/collection-facets";
import { inventorySavedFilters, type InventoryFilterKey } from "@/lib/inventory-filters";
import { INVENTORY_SORT_OPTIONS, type SortFieldId } from "@/lib/inventory-sort";

export type InventoryViewSnapshot = {
  search: string;
  savedFilter: InventoryFilterKey;
  dispositionGroup: "all" | "moving" | "sell" | "trash" | "donate";
  facets: FacetSelection;
  sorting: SortingState;
  sortField: SortFieldId;
  columns: VisibilityState;
  presentation: CollectionPresentation;
};
const facetIds = ["room", "category", "owner", "status", "disposition", "condition", "review", "value", "photo", "evidence", "box", "load"];
const columnIds = ["name", "details", "status", "disposition", "indicators", "room", "category", "ownerContact", "condition", "confidence", "review"];
function object(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }

/** Refuse malformed browser snapshots; restoring a view never changes record data. */
export function parseInventoryView(value: unknown): InventoryViewSnapshot | null {
  if (!object(value) || typeof value.search !== "string" || !inventorySavedFilters.some(filter => filter.key === value.savedFilter) || !["all", "moving", "sell", "trash", "donate"].includes(String(value.dispositionGroup)) || !INVENTORY_SORT_OPTIONS.some(option => option.id === value.sortField)) return null;
  if (!object(value.facets) || !object(value.columns) || !object(value.presentation) || !Array.isArray(value.sorting)) return null;
  const facets: FacetSelection = {};
  for (const [id, values] of Object.entries(value.facets)) {
    if (!facetIds.includes(id) || !Array.isArray(values)) return null;
    if (!values.every(key => { if (typeof key !== "string") return false; try { const parsed: unknown = JSON.parse(key); return parsed === null || typeof parsed === "string"; } catch { return false; } })) return null;
    facets[id] = [...new Set(values as string[])].sort();
  }
  if (!Object.entries(value.columns).every(([id, visible]) => columnIds.includes(id) && typeof visible === "boolean")) return null;
  if (!value.sorting.every(sort => object(sort) && columnIds.includes(String(sort.id)) && typeof sort.desc === "boolean")) return null;
  const presentation = value.presentation;
  if (!["table", "list", "grid"].includes(String(presentation.view)) || !["compact", "comfortable"].includes(String(presentation.density)) || typeof presentation.groupBy !== "string" || (presentation.groupBy && !columnIds.includes(presentation.groupBy)) || typeof presentation.groupDesc !== "boolean") return null;
  return {
    search: value.search,
    savedFilter: value.savedFilter as InventoryFilterKey,
    dispositionGroup: value.dispositionGroup as InventoryViewSnapshot["dispositionGroup"],
    facets,
    sorting: value.sorting.map(sort => ({ id: sort.id, desc: sort.desc })),
    sortField: value.sortField as SortFieldId,
    columns: { ...value.columns } as VisibilityState,
    presentation: { view: presentation.view as CollectionPresentation["view"], density: presentation.density as CollectionPresentation["density"], groupBy: presentation.groupBy, groupDesc: presentation.groupDesc },
  };
}

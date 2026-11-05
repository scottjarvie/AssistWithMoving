import type { SortingState, VisibilityState } from "@tanstack/react-table";
import type { QueueDeskItem, QueueState } from "@/components/queue-experience";
import type { CollectionPresentation } from "@/components/use-collection-presentation";
import type { FacetSelection } from "@/lib/collection-facets";

export type QueueViewKey = QueueState | "doneWeek" | "all";
export const queueViews: { key: QueueViewKey; label: string; description: string }[] = [
  { key: "needsYou", label: "Needs You", description: "Handoffs and captures that need a person." },
  { key: "waitingForAi", label: "Waiting for your AI", description: "Ready to be claimed; saving alone starts no work." },
  { key: "working", label: "Working", description: "Your chosen AI has claimed the work." },
  { key: "doneWeek", label: "Done this week", description: "Canonical handoffs with a recorded completion date this calendar week." },
  { key: "all", label: "Everything", description: "Every loaded accessible state, including older outcomes and captures." },
  { key: "done", label: "All Done", description: "All terminal outcomes, including canceled, expired and undated capture records." },
];
export function queueQueryState(view: QueueViewKey): QueueState | undefined {
  return view === "all" ? undefined : view === "doneWeek" ? "done" : view;
}
export function queueViewMatches(item: Pick<QueueDeskItem, "state" | "completedAt">, view: QueueViewKey, now = Date.now()) {
  if (view === "all") return true;
  if (view !== "doneWeek") return item.state === view;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (start.getDay()+6)%7);
  return item.state === "done" && typeof item.completedAt === "number" && Number.isFinite(item.completedAt) && item.completedAt >= start.getTime() && item.completedAt <= now;
}
export type QueueViewSnapshot = {
  view: QueueViewKey;
  search: string;
  facets: FacetSelection;
  sorting: SortingState;
  columns: VisibilityState;
  presentation: CollectionPresentation;
};
export const queueDefaultColumns: VisibilityState = { owner: false, claim: false, result: false, failure: false };
const columnIds = ["directive", "state", "source", "owner", "step", "updatedAt", "claim", "result", "failure"];
const facetIds = ["state", "source", "owner", "failure"];
function object(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
export function parseQueueView(value: unknown): QueueViewSnapshot | null {
  if (!object(value) || !queueViews.some(view => view.key === value.view) || typeof value.search !== "string" || !object(value.facets) || !object(value.columns) || !object(value.presentation) || !Array.isArray(value.sorting)) return null;
  const facets: FacetSelection = {};
  for (const [id, choices] of Object.entries(value.facets)) {
    if (!facetIds.includes(id) || !Array.isArray(choices) || !choices.every(choice => {
      if (typeof choice !== "string") return false;
      try { const parsed: unknown = JSON.parse(choice); return parsed === null || typeof parsed === "string"; } catch { return false; }
    })) return null;
    facets[id] = [...new Set(choices as string[])].sort();
  }
  if (!Object.entries(value.columns).every(([id, visible]) => columnIds.includes(id) && typeof visible === "boolean")) return null;
  if (!value.sorting.every(sort => object(sort) && columnIds.includes(String(sort.id)) && typeof sort.desc === "boolean")) return null;
  const presentation = value.presentation;
  if (!["table", "list", "grid"].includes(String(presentation.view)) || !["compact", "comfortable"].includes(String(presentation.density)) || typeof presentation.groupBy !== "string" || (presentation.groupBy && !columnIds.includes(presentation.groupBy)) || typeof presentation.groupDesc !== "boolean") return null;
  return {
    view: value.view as QueueViewKey, search: value.search, facets,
    sorting: value.sorting.map(sort => ({ id: sort.id, desc: sort.desc })),
    columns: value.columns as VisibilityState,
    presentation: { view: presentation.view as CollectionPresentation["view"], density: presentation.density as CollectionPresentation["density"], groupBy: presentation.groupBy, groupDesc: presentation.groupDesc },
  };
}

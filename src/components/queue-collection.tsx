"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { ColumnDef, SortingState, VisibilityState } from "@tanstack/react-table";
import type { QueueDeskItem } from "@/components/queue-experience";
import { QueueAnswerField } from "@/components/queue-answer-field";
import { CollectionViewTabs } from "@/components/collection-view-tabs";
import { CollectionFilterSheet, CollectionFilterChips } from "@/components/collection-filter-sheet";
import { useCollectionPresentation } from "@/components/use-collection-presentation";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { MovingSymbol } from "@/components/moving-symbol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { countFacets, matchesFacets, type CollectionFacet, type FacetSelection } from "@/lib/collection-facets";
import { parseQueueView, queueDefaultColumns, queueViewMatches, queueViews, queueWaitingReasonLabel, type QueueViewKey, type QueueViewSnapshot } from "@/lib/queue-collection";
import { queueStateLabels } from "../../convex/lib/queue";

function step(item: QueueDeskItem) {
  if (item.state === "needsYou") return item.requiredAction ?? "Review this handoff and provide the missing detail.";
  if (item.state === "working") return item.nextStep ?? "The claimed work is in progress.";
  if (item.state === "waitingForAi") return queueWaitingReasonLabel(item.waitingReason);
  return item.resultSummary ?? (item.terminalReason === "canceled" ? "This handoff was canceled." : item.terminalReason === "expired" ? "This handoff expired before completion." : "The handoff is complete.");
}
function when(value: number) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value); }
const columns: ColumnDef<QueueDeskItem, unknown>[] = [
  { accessorKey: "directive", meta: { label: "Handoff", mobile: "primary", description: "The full direction remains in its thread." }, header: ({column}) => <DataTableColumnHeader column={column} label="Handoff" />, cell: ({row}) => <p className="min-w-40 max-w-sm whitespace-normal text-sm font-medium">{row.original.directive}</p> },
  { accessorKey: "state", meta: { label: "State", mobile: "primary", groupable: true, groupOrder: ["needsYou", "waitingForAi", "working", "done"], groupLabel: value => queueStateLabels[value as keyof typeof queueStateLabels] ?? String(value) }, header: ({column}) => <DataTableColumnHeader column={column} label="State" />, cell: ({row}) => <Badge variant="outline" className={row.original.state === "needsYou" ? "border-warning/40 text-warning" : row.original.state === "working" ? "border-accent/40 text-accent" : undefined}><MovingSymbol name={row.original.state === "needsYou" ? "question" : row.original.state === "working" ? "ai" : row.original.state === "done" ? "check" : "calendar"} className="size-3" />{queueStateLabels[row.original.state]}</Badge> },
  { accessorKey: "source", meta: { label: "Kind", mobile: "primary", groupable: true, groupLabel: value => value === "capture" ? "Capture" : "Handoff" }, header: ({column}) => <DataTableColumnHeader column={column} label="Kind" />, cell: ({row}) => <span className="inline-flex items-center gap-1 text-xs"><MovingSymbol name={row.original.source === "capture" ? "note" : "queue"} className="size-3" />{row.original.source === "capture" ? "Capture" : "Handoff"}</span> },
  { id: "owner", accessorFn: item => item.ownerLabel ?? item.ownerUserId, meta: { label: "Owner", mobile: "expansion" }, header: ({column}) => <DataTableColumnHeader column={column} label="Owner" />, cell: ({row}) => row.original.ownerLabel ?? "Selected person's Queue" },
  { id: "step", accessorFn: step, meta: { label: "Question / next step", mobile: "primary", description: "Answer canonical Needs you handoffs here; capture responses stay in the capture workspace." }, header: ({column}) => <DataTableColumnHeader column={column} label="Question / next step" />, cell: ({row}) => <div className="min-w-64 max-w-md space-y-2 whitespace-normal"><p className="text-sm">{step(row.original) || "Open the thread for its context."}</p><QueueAnswerField item={row.original} /></div> },
  { accessorKey: "updatedAt", meta: { label: "Updated", mobile: "expansion" }, header: ({column}) => <DataTableColumnHeader column={column} label="Updated" />, cell: ({row}) => <time dateTime={new Date(row.original.updatedAt).toISOString()} className="whitespace-nowrap font-mono text-xs">{when(row.original.updatedAt)}</time> },
  { id: "claim", accessorFn: item => item.claimLabel ?? "", meta: { label: "Claim", mobile: "expansion", description: "Reported claim identity and lease expiry." }, header: ({column}) => <DataTableColumnHeader column={column} label="Claim" />, cell: ({row}) => <span className="text-xs">{row.original.claimLabel ? "Claimed by " + row.original.claimLabel : "No current claim"}{row.original.claimExpiresAt ? <span className="block text-muted-foreground">Lease until {when(row.original.claimExpiresAt)}</span> : null}</span> },
  { id: "result", accessorFn: item => item.resultSummary ?? "", meta: { label: "Result", mobile: "expansion", description: "Linked result labels and the recorded result remain in the thread." }, header: ({column}) => <DataTableColumnHeader column={column} label="Result" />, cell: ({row}) => <div className="max-w-sm whitespace-normal text-xs">{row.original.resultSummary ?? "No recorded result"}{row.original.resultRefs.map((ref,index) => <p key={index}>{ref.label ?? ref.type ?? "Move record"}</p>)}</div> },
  { id: "failure", accessorFn: item => item.failure?.message ?? "", meta: { label: "Failure / retry", mobile: "expansion" }, header: ({column}) => <DataTableColumnHeader column={column} label="Failure / retry" />, cell: ({row}) => row.original.failure ? <p className="max-w-xs whitespace-normal text-xs text-destructive">{row.original.failure.message}{row.original.failure.retryable ? " Bounded retry may be attempted." : ""}</p> : "No reported failure" },
];

export function QueueCollection({ items, view, onViewChange, preferenceScope, loading, hasMore, onOpen, renderCard }: {
  items: QueueDeskItem[]; view: QueueViewKey; onViewChange: (view: QueueViewKey) => void;
  preferenceScope: string; loading: boolean; hasMore: boolean; onOpen: (item: QueueDeskItem) => void; renderCard: (item: QueueDeskItem) => ReactNode;
}) {
  const key = "queue." + preferenceScope;
  const [presentation, setPresentation, ready] = useCollectionPresentation(key, "table", "state");
  const [search, setSearch] = useState("");
  const [facets, setFacets] = useState<FacetSelection>({});
  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);
  const [visibility, setVisibility] = useState<VisibilityState>(queueDefaultColumns);
  const [selection, setSelection] = useState({ id: "built-in:" + view, view });
  const [weekAsOf, setWeekAsOf] = useState(() => Date.now());
  const selectedId = selection.view === view ? selection.id : "built-in:" + view;
  const currentView = queueViews.find(candidate => candidate.key === view)!;
  const viewItems = useMemo(() => items.filter(item => queueViewMatches(item, view, weekAsOf)), [items, view, weekAsOf]);
  const searched = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return viewItems.filter(item => [item.directive, item.summary, item.requiredAction, item.nextStep, item.resultSummary, item.ownerLabel, item.claimLabel, item.failure?.message, ...item.resultRefs.map(ref => ref.label)].some(value => value?.toLocaleLowerCase().includes(query)) || !query);
  }, [viewItems, search]);
  const definitions = useMemo<CollectionFacet<QueueDeskItem>[]>(() => {
    const owners = new Map(items.map(item => [item.ownerUserId, item.ownerLabel ?? "Selected person's Queue"]));
    return [
      { id: "state", label: "State", values: item => [item.state], labelValue: value => queueStateLabels[value as keyof typeof queueStateLabels] ?? value },
      { id: "source", label: "Kind", values: item => [item.source], labelValue: value => value === "capture" ? "Capture" : "Handoff" },
      { id: "owner", label: "Owner", values: item => [item.ownerUserId], labelValue: value => owners.get(value) ?? "Owner not available" },
      { id: "failure", label: "Reported failure", values: item => [item.failure ? "Has reported failure" : "No reported failure"] },
    ];
  }, [items]);
  const counted = useMemo(() => countFacets(searched, definitions, facets), [searched, definitions, facets]);
  const filtered = useMemo(() => searched.filter(item => matchesFacets(item, definitions, facets)), [searched, definitions, facets]);
  // TanStack treats absent visibility entries as true. Dropping redundant
  // explicit true entries prevents a false modified dot after hide/show.
  const columnsSnapshot = Object.fromEntries(Object.entries(visibility).filter(([id, visible]) => visible !== true || queueDefaultColumns[id] === false));
  const snapshot: QueueViewSnapshot = { view, search, facets, sorting, columns: columnsSnapshot, presentation };
  function apply(next: QueueViewSnapshot) {
    if (next.view === "doneWeek") setWeekAsOf(Date.now());
    setSelection(current => ({ ...current, view: next.view }));
    onViewChange(next.view);
    setSearch(next.search); setFacets(next.facets); setSorting(next.sorting); setVisibility(next.columns); setPresentation(next.presentation);
  }
  function clear() { setSearch(""); setFacets({}); onViewChange("all"); }
  const builtIns = queueViews.map(candidate => ({ id: "built-in:" + candidate.key, label: candidate.label, description: candidate.description, count: candidate.key === view ? viewItems.length : undefined, snapshot: { view: candidate.key, search: "", facets: {}, sorting, columns: columnsSnapshot, presentation } satisfies QueueViewSnapshot }));
  return <section aria-labelledby="queue-state-heading" aria-busy={loading} className="min-w-0 space-y-3">
    <p role="status" aria-live="polite" className="sr-only">{loading ? "Loading Queue" : ""}</p>
    <CollectionViewTabs storageKey={"assistwithmoving.views." + key + ".v1"} builtIns={builtIns} snapshot={snapshot} onApply={apply} parseSnapshot={parseQueueView} ready={ready} selectedId={selectedId} onSelectedIdChange={id => setSelection({ id, view })} ariaLabel="Queue views" />
    <div className="flex items-center gap-2"><div className="relative min-w-0 flex-1"><MovingSymbol name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search Queue" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search handoffs, questions and results" className="h-11 pl-8 md:h-9" /></div><CollectionFilterSheet facets={counted} selection={facets} onChange={setFacets} loading={loading} /></div>
    {search.trim() || Object.values(facets).some(values => values.length) ? <div role="group" aria-label="Active Queue filters" className="flex flex-wrap gap-1">{search.trim() ? <Button size="sm" variant="secondary" className="h-auto whitespace-normal" onClick={() => setSearch("")}>Search: {search}<MovingSymbol name="close" className="size-3" /></Button> : null}<CollectionFilterChips facets={counted} selection={facets} onChange={setFacets} /><Button size="sm" variant="ghost" onClick={clear}>Clear all</Button></div> : null}
    <div><h2 id="queue-state-heading" className="text-base font-semibold">{currentView.label}</h2><p className="text-xs text-muted-foreground">{viewItems.length} loaded · {currentView.description}</p></div>
    {view === "doneWeek" ? <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><p>This calendar week starts Monday in your browser&apos;s time zone. Evaluated {when(weekAsOf)}. Captures without a recorded completion date stay in All Done and Everything.</p><Button type="button" variant="ghost" size="sm" onClick={() => setWeekAsOf(Date.now())}><MovingSymbol name="reset" />Refresh week</Button></div> : null}
    <DataTable data={filtered} columns={columns} getRowId={item => item.source + ":" + item.id} ariaLabel="Queue records" preferenceKey={key} initialGroupBy="state" columnVisibility={visibility} onColumnVisibilityChange={setVisibility} sorting={sorting} onSortingChange={setSorting} onRowOpen={onOpen} getRowOpenLabel={item => "Open " + item.directive + " details"} renderMobileCard={({row}) => renderCard(row)} unfilteredCount={items.length} onClearFilters={clear} loading={loading} minWidthClassName="min-w-[900px]" emptyState={<div className="border border-dashed border-border p-5 text-sm"><h3 className="font-medium">{view === "needsYou" ? "Nothing needs you" : view === "done" ? "No completed handoffs yet" : "No matching loaded records"}</h3><p className="mt-1 text-muted-foreground">{hasMore ? "Older pages may contain more matches. Load older handoffs or captures below." : "Try another view or clear the filters."}</p></div>} />
  </section>;
}

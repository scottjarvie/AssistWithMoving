"use client";

import type { Table as TanstackTable } from "@tanstack/react-table";
import { MovingSymbol } from "@/components/moving-symbol";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CollectionPresentation, CollectionView } from "@/components/use-collection-presentation";

export function CollectionPresentationControls<TData>({ table, preferences, onChange, showColumns = true, showSort = true }: {
  table: TanstackTable<TData>;
  preferences: CollectionPresentation;
  onChange: (patch: Partial<CollectionPresentation>) => void;
  showColumns?: boolean;
  showSort?: boolean;
}) {
  const columns = table.getAllLeafColumns().filter(column => column.id !== "__select__");
  const groupable = columns.filter(column => column.columnDef.meta?.groupable && column.getCanSort());
  return <div role="group" className="collection-controls flex flex-wrap items-center justify-between gap-2 border-y border-border py-2" aria-label="Collection presentation">
    <div className="inline-flex shrink-0 items-center gap-0.5" role="group" aria-label="Record view">
      {(["table", "list", "grid"] as CollectionView[]).map(view => <Button key={view} type="button" variant={preferences.view === view ? "secondary" : "ghost"} size="sm" className="min-h-11 sm:min-h-8" aria-pressed={preferences.view === view} onClick={() => onChange({ view })}>
        <MovingSymbol name={view} className="size-4" />{view[0].toUpperCase() + view.slice(1)}
      </Button>)}
    </div>
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <label className="flex min-h-11 min-w-0 items-center gap-1.5 text-sm sm:min-h-8">
        <span className="text-muted-foreground">Group</span>
        <select aria-label="Group records by" value={preferences.groupBy} onChange={event => onChange({ groupBy: event.target.value, groupDesc: false })} className="h-11 max-w-36 rounded-sm border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring sm:h-8">
          <option value="">None</option>
          {groupable.map(column => <option key={column.id} value={column.id}>{column.columnDef.meta?.label ?? column.id}</option>)}
        </select>
      </label>
      {showSort ? <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-8" aria-label="Sort records"><MovingSymbol name="sort" className="size-4" />Sort</Button></PopoverTrigger>
        <PopoverContent align="end" className="max-h-80 w-60 overflow-y-auto p-2">
          <p className="px-2 py-1 text-xs text-muted-foreground">Sort by · select again to reverse</p>
          {columns.filter(column => column.getCanSort()).map(column => <Button key={column.id} type="button" variant="ghost" className="min-h-11 w-full justify-between" aria-pressed={Boolean(column.getIsSorted())} aria-label={`${column.columnDef.meta?.label ?? column.id}${column.getIsSorted() ? `: ${column.getIsSorted() === "asc" ? "ascending" : "descending"}` : ": not sorted"}`} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            {column.columnDef.meta?.label ?? column.id}<span className="font-mono text-xs">{column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}</span>
          </Button>)}
        </PopoverContent>
      </Popover> : null}
      <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-8" aria-label={`Density: ${preferences.density}`} onClick={() => onChange({ density: preferences.density === "compact" ? "comfortable" : "compact" })}>
        <MovingSymbol name="density" className="size-4" />Density
      </Button>
      {showColumns ? <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-8" aria-label="Choose columns"><MovingSymbol name="columns" className="size-4" />Columns</Button></PopoverTrigger>
        <PopoverContent align="end" className="max-h-96 w-72 overflow-y-auto">
          <p className="mb-2 text-xs text-muted-foreground">Visible table columns</p>
          {columns.filter(column => column.getCanHide()).map(column => <label key={column.id} className="flex min-h-11 items-start gap-2 py-2 text-sm">
            <input className="mt-1 accent-primary" type="checkbox" checked={column.getIsVisible()} onChange={event => column.toggleVisibility(event.target.checked)} />
            <span><span className="block">{column.columnDef.meta?.label ?? column.id}</span>{column.columnDef.meta?.description ? <span className="block text-xs text-muted-foreground">{column.columnDef.meta.description}</span> : null}</span>
          </label>)}
        </PopoverContent>
      </Popover> : null}
    </div>
  </div>;
}

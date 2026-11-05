"use client";

import type { Table as TanstackTable } from "@tanstack/react-table";
import { MovingSymbol } from "@/components/moving-symbol";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from "@/components/ui/sheet";
import type { CollectionPresentation, CollectionView } from "@/components/use-collection-presentation";

export type CollectionSortPresets = {
  options: readonly { id: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
};

export function CollectionPresentationControls<TData>({ table, preferences, onChange, showColumns = true, showSort = true, sortPresets }: {
  table: TanstackTable<TData>;
  preferences: CollectionPresentation;
  onChange: (patch: Partial<CollectionPresentation>) => void;
  showColumns?: boolean;
  showSort?: boolean;
  sortPresets?: CollectionSortPresets;
}) {
  const columns = table.getAllLeafColumns().filter(column => column.id !== "__select__");
  const groupable = columns.filter(column => column.columnDef.meta?.groupable && column.getCanSort());
  function viewButtons() {
    return (["table", "list", "grid"] as CollectionView[]).map(view => <Button key={view} type="button" variant={preferences.view === view ? "secondary" : "ghost"} size="sm" className="min-h-11 md:min-h-8" aria-pressed={preferences.view === view} onClick={() => onChange({ view })}><MovingSymbol name={view} className="size-4" />{view[0].toUpperCase() + view.slice(1)}</Button>);
  }
  function columnChoices() {
    return columns.filter(column => column.getCanHide()).map(column => <label key={column.id} className="flex min-h-11 items-start gap-2 py-2 text-sm"><input className="mt-1 accent-primary" type="checkbox" checked={column.getIsVisible()} onChange={event => column.toggleVisibility(event.target.checked)} /><span><span className="block">{column.columnDef.meta?.label ?? column.id}</span>{column.columnDef.meta?.description ? <span className="block text-xs text-muted-foreground">{column.columnDef.meta.description}</span> : null}</span></label>);
  }
  return <div role="group" className="collection-controls flex flex-wrap items-center justify-between gap-2 border-y border-border py-2" aria-label="Collection presentation">
    <div className="hidden shrink-0 items-center gap-0.5 md:inline-flex" role="group" aria-label="Record view">
      {viewButtons()}
    </div>
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-1 md:flex-initial md:justify-start">
      <label className="flex min-h-11 min-w-0 items-center gap-1.5 text-sm md:min-h-8">
        <span className="text-muted-foreground">Group</span>
        <select aria-label="Group records by" value={preferences.groupBy} onChange={event => onChange({ groupBy: event.target.value, groupDesc: false })} className="h-11 max-w-24 rounded-sm border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring md:h-8 md:max-w-36">
          <option value="">None</option>
          {groupable.map(column => <option key={column.id} value={column.id}>{column.columnDef.meta?.label ?? column.id}</option>)}
        </select>
      </label>
      {preferences.groupBy ? <Button type="button" variant="ghost" size="sm" className="min-h-11 md:min-h-8" aria-label={`Group order: ${preferences.groupDesc ? "descending" : "ascending"}`} title="Reverse group order" onClick={() => onChange({ groupDesc: !preferences.groupDesc })}><MovingSymbol name="sort" className={`size-4 ${preferences.groupDesc ? "rotate-180" : ""}`} /><span className="sr-only">Reverse groups</span></Button> : null}
      {showSort ? <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="min-h-11 md:min-h-8" aria-label="Sort records"><MovingSymbol name="sort" className="size-4" />Sort</Button></PopoverTrigger>
        <PopoverContent align="end" className="max-h-80 w-60 overflow-y-auto p-2">
          {sortPresets ? <div className="mb-2 border-b border-border pb-2"><p className="px-2 py-1 text-xs text-muted-foreground">{sortPresets.value ? `${preferences.groupBy ? "Within groups" : "Current order"}: ${sortPresets.options.find(option => option.id === sortPresets.value)?.label ?? "Preset"}` : "Custom column order"}</p>
            {sortPresets.options.map(option => <Button key={option.id} type="button" variant="ghost" className="min-h-11 w-full justify-start whitespace-normal text-left" aria-pressed={sortPresets.value === option.id} onClick={() => sortPresets.onChange(option.id)}>{option.label}</Button>)}
          </div> : null}
          <p className="px-2 py-1 text-xs text-muted-foreground">Sort by · select again to reverse</p>
          {columns.filter(column => column.getCanSort()).map(column => <Button key={column.id} type="button" variant="ghost" className="min-h-11 w-full justify-between" aria-pressed={Boolean(column.getIsSorted())} aria-label={`${column.columnDef.meta?.label ?? column.id}${column.getIsSorted() ? `: ${column.getIsSorted() === "asc" ? "ascending" : "descending"}` : ": not sorted"}`} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            {column.columnDef.meta?.label ?? column.id}<span className="font-mono text-xs">{column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}</span>
          </Button>)}
          {table.getState().sorting.some(sort => sort.id !== preferences.groupBy) ? <Button type="button" variant="ghost" size="sm" className="mt-2 w-full border-t border-border" onClick={() => table.setSorting([])}>Clear column sorting</Button> : null}
        </PopoverContent>
      </Popover> : null}
      <Button type="button" size="sm" variant="ghost" className="hidden min-h-8 md:inline-flex" aria-label={`Density: ${preferences.density}`} onClick={() => onChange({ density: preferences.density === "compact" ? "comfortable" : "compact" })}>
        <MovingSymbol name="density" className="size-4" />Density
      </Button>
      {showColumns ? <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="hidden min-h-8 md:inline-flex" aria-label="Choose columns"><MovingSymbol name="columns" className="size-4" />Columns</Button></PopoverTrigger>
        <PopoverContent align="end" className="max-h-96 w-72 overflow-y-auto">
          <p className="mb-2 text-xs text-muted-foreground">Visible table columns</p>
          {columnChoices()}
        </PopoverContent>
      </Popover> : null}
      <Sheet><SheetTrigger asChild><Button type="button" size="sm" variant="ghost" className="min-h-11 md:hidden" aria-label="Collection options"><MovingSymbol name={preferences.view} className="size-4" />Options</Button></SheetTrigger>
        <SheetContent className="collection-controls flex flex-col data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader><SheetTitle>Collection options</SheetTitle><SheetDescription>Change presentation, density and columns. Search, filters, sorting and selection stay in place.</SheetDescription></SheetHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
            <fieldset><legend className="mb-2 text-sm font-medium">Presentation</legend><div role="group" aria-label="Phone record view" className="flex gap-1">{viewButtons()}</div></fieldset>
            <fieldset><legend className="mb-2 text-sm font-medium">Density</legend><div className="flex gap-1">{(["compact", "comfortable"] as const).map(density => <Button key={density} type="button" size="sm" variant={preferences.density === density ? "secondary" : "ghost"} className="min-h-11" aria-pressed={preferences.density === density} onClick={() => onChange({ density })}>{density === "compact" ? "Compact" : "Comfortable"}</Button>)}</div></fieldset>
            {showColumns ? <fieldset><legend className="text-sm font-medium">Columns</legend>{columnChoices()}</fieldset> : null}
          </div>
          <SheetFooter><SheetClose asChild><Button type="button" size="sm" className="min-h-11">Show records</Button></SheetClose></SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  </div>;
}

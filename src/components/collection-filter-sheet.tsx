"use client";

import { Button } from "@/components/ui/button";
import { MovingSymbol } from "@/components/moving-symbol";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CountedFacet, FacetSelection } from "@/lib/collection-facets";

export function CollectionFilterSheet({ facets, selection, onChange, loading = false }: {
  facets: CountedFacet[];
  selection: FacetSelection;
  onChange: (selection: FacetSelection) => void;
  loading?: boolean;
}) {
  const count = Object.values(selection).reduce((sum, values) => sum + values.length, 0);
  function toggle(facet: string, value: string) {
    const current = selection[facet] ?? [];
    onChange({ ...selection, [facet]: current.includes(value) ? current.filter(id => id !== value) : [...current, value] });
  }
  return <div className="contents">
    <Sheet>
      <SheetTrigger asChild><Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" aria-label={count ? `Add filter, ${count} selected` : "Add filter"}><MovingSymbol name="add" className="size-4" />Filter{count ? <span className="font-mono text-xs">{count}</span> : null}</Button></SheetTrigger>
      <SheetContent side="right" className="collection-controls w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border pr-12"><SheetTitle>Filter records</SheetTitle><SheetDescription>Counts match the current search and view, with all other filters applied. Choose alternatives within a facet; different facets combine.</SheetDescription></SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {loading ? <p role="status">Loading available filters.</p> : facets.map(facet => <fieldset key={facet.id} className="min-w-0">
            <legend className="mb-2 text-sm font-semibold">{facet.label}</legend>
            {!facet.options.length ? <p className="text-xs text-muted-foreground">No recorded values in this view.</p> : <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
              {facet.options.map(option => <label key={option.id} className="flex min-h-11 min-w-0 items-center gap-2 border-b border-border/60 py-2 text-sm">
                <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={selection[facet.id]?.includes(option.id) ?? false} onChange={() => toggle(facet.id, option.id)} />
                <span className="min-w-0 flex-1 break-words">{option.label}</span><span className="font-mono text-xs text-muted-foreground">{option.count}</span>
              </label>)}
            </div>}
          </fieldset>)}
        </div>
        <SheetFooter className="flex-row justify-between border-t border-border"><Button type="button" size="sm" variant="ghost" disabled={!count} onClick={() => onChange({})}>Clear facet filters</Button><SheetClose asChild><Button type="button" size="sm">Show records</Button></SheetClose></SheetFooter>
      </SheetContent>
    </Sheet>
  </div>;
}

export function CollectionFilterChips({ facets, selection, onChange }: { facets: CountedFacet[]; selection: FacetSelection; onChange: (selection: FacetSelection) => void }) {
  return <>{facets.flatMap(facet => (selection[facet.id] ?? []).map(id => {
    const option = facet.options.find(value => value.id === id);
    const label = `${facet.label}: ${option?.label ?? "Unavailable value"}`;
    return <Button key={`${facet.id}:${id}`} type="button" variant="secondary" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal text-left" aria-label={`Remove filter ${label}`} onClick={() => onChange({ ...selection, [facet.id]: selection[facet.id].filter(value => value !== id) })}>{label}<MovingSymbol name="close" className="size-3.5 shrink-0" /></Button>;
  }))}</>;
}

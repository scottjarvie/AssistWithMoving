export type FacetSelection = Record<string, string[]>;
export type CollectionFacet<T> = {
  id: string;
  label: string;
  values: (record: T) => readonly (string | undefined | null)[];
  labelValue?: (value: string) => string;
  missingLabel?: string;
};
export type CountedFacet = {
  id: string;
  label: string;
  options: { id: string; label: string; count: number }[];
};

// JSON encoding keeps a missing value distinct from any literal room/name.
function valueKey(value: string | null | undefined) {
  return JSON.stringify(value?.trim() || null);
}
function keys<T>(record: T, facet: CollectionFacet<T>) {
  const values = facet.values(record);
  return new Set((values.length ? values : [null]).map(valueKey));
}
export function matchesFacets<T>(record: T, facets: readonly CollectionFacet<T>[], selection: FacetSelection, except?: string) {
  return facets.every(facet => facet.id === except || !selection[facet.id]?.length || selection[facet.id].some(value => keys(record, facet).has(value)));
}

/** Counts respect all other facets; alternatives in one facet are OR, facets are AND. */
export function countFacets<T>(records: readonly T[], facets: readonly CollectionFacet<T>[], selection: FacetSelection): CountedFacet[] {
  return facets.map(facet => {
    const options = new Map<string, { id: string; label: string; count: number }>();
    for (const record of records) for (const id of keys(record, facet)) {
      if (!options.has(id)) {
        const value: string | null = JSON.parse(id);
        options.set(id, { id, label: value === null ? facet.missingLabel ?? "Not recorded" : facet.labelValue?.(value) ?? value, count: 0 });
      }
    }
    // A selected value stays removable if a live update removes its last row.
    for (const id of selection[facet.id] ?? []) if (!options.has(id)) {
      let value: unknown;
      try { value = JSON.parse(id); } catch { value = null; }
      options.set(id, { id, label: typeof value === "string" ? facet.labelValue?.(value) ?? value : facet.missingLabel ?? "Not recorded", count: 0 });
    }
    for (const record of records) if (matchesFacets(record, facets, selection, facet.id)) {
      for (const id of keys(record, facet)) options.get(id)!.count += 1;
    }
    return { id: facet.id, label: facet.label, options: [...options.values()].sort((a, b) => a.id === "null" ? 1 : b.id === "null" ? -1 : a.label.localeCompare(b.label, undefined, { numeric: true })) };
  });
}

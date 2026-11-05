import { describe, expect, it } from "vitest";
import { countFacets, matchesFacets, type CollectionFacet } from "@/lib/collection-facets";

type Record = { room?: string; category: string; tags: string[] };
const facets: CollectionFacet<Record>[] = [
  { id: "room", label: "Room", values: row => [row.room] },
  { id: "category", label: "Category", values: row => [row.category] },
  { id: "tags", label: "Tags", values: row => row.tags },
];
const records: Record[] = [
  { room: "Den", category: "Furniture", tags: ["fragile", "fragile"] },
  { room: "Den", category: "Tools", tags: ["heavy"] },
  { room: "Kitchen", category: "Tools", tags: [] },
];

describe("collection facet counts", () => {
  it("counts alternatives with other facets applied, OR within and AND between facets", () => {
    const selection = { room: ['"Den"'], category: ['"Tools"'] };
    const counted = countFacets(records, facets, selection);
    expect(counted[0].options).toEqual([{ id: '"Den"', label: "Den", count: 1 }, { id: '"Kitchen"', label: "Kitchen", count: 1 }]);
    expect(counted[1].options).toEqual([{ id: '"Furniture"', label: "Furniture", count: 1 }, { id: '"Tools"', label: "Tools", count: 1 }]);
    expect(records.filter(row => matchesFacets(row, facets, selection))).toEqual([records[1]]);
    expect(records.filter(row => matchesFacets(row, facets, { room: ['"Den"', '"Kitchen"'] }))).toHaveLength(3);
  });

  it("counts a record once per option and keeps missing values distinct from literal text", () => {
    const counted = countFacets([...records, { category: "null", tags: [], room: "null" }, { category: "Other", tags: [] }], facets, {});
    expect(counted[2].options.find(option => option.id === '"fragile"')?.count).toBe(1);
    expect(counted[0].options.find(option => option.id === '"null"')).toEqual({ id: '"null"', label: "null", count: 1 });
    expect(counted[0].options.at(-1)).toEqual({ id: "null", label: "Not recorded", count: 1 });
  });

  it("keeps a selected option with zero matches after its last record leaves the loaded view", () => {
    const selection = { room: ['"Den"'] };
    const counted = countFacets([records[2]], facets, selection);
    expect(counted[0].options.find(option => option.id === '"Den"')).toEqual({ id: '"Den"', label: "Den", count: 0 });
    expect(records.slice(2).filter(row => matchesFacets(row, facets, selection))).toEqual([]);
  });
});

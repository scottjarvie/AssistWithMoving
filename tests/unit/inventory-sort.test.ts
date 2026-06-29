import { describe, expect, it } from "vitest";

import {
  compareBy,
  type SortableEntry,
  toTanstackSorting,
} from "@/lib/inventory-sort";

function e(partial: Partial<SortableEntry> & { name: string }): SortableEntry {
  return { kind: "item", ...partial };
}

function sortNames(list: SortableEntry[], field: Parameters<typeof compareBy>[0]) {
  return [...list].sort(compareBy(field)).map((x) => x.name);
}

describe("compareBy", () => {
  it("'added' is newest-first, with missing createdAt pinned last", () => {
    const list = [
      e({ name: "old", createdAt: 100 }),
      e({ name: "new", createdAt: 300 }),
      e({ name: "no-date" }),
      e({ name: "mid", createdAt: 200 }),
    ];
    expect(sortNames(list, "added")).toEqual(["new", "mid", "old", "no-date"]);
  });

  it("'alpha' is case-insensitive and numeric-aware (B-2 before B-10)", () => {
    const list = [
      e({ name: "B-10" }),
      e({ name: "b-2" }),
      e({ name: "Apple" }),
    ];
    expect(sortNames(list, "alpha")).toEqual(["Apple", "b-2", "B-10"]);
  });

  it("'weight' is heavy→light with missing weight last", () => {
    const list = [
      e({ name: "light", weightLb: 5 }),
      e({ name: "none" }),
      e({ name: "heavy", weightLb: 80 }),
    ];
    expect(sortNames(list, "weight")).toEqual(["heavy", "light", "none"]);
  });

  it("'volume' is large→small with missing volume last", () => {
    const list = [
      e({ name: "small", volumeCuFt: 1 }),
      e({ name: "big", volumeCuFt: 30 }),
      e({ name: "none" }),
    ];
    expect(sortNames(list, "volume")).toEqual(["big", "small", "none"]);
  });

  it("'density' is heaviest-per-ft³ with missing density (no volume) last", () => {
    const list = [
      e({ name: "fluffy", weightLb: 100, volumeCuFt: 10 }), // 10 lb/ft³
      e({ name: "no-volume", weightLb: 50 }), // can't compute → last
      e({ name: "dense", weightLb: 30, volumeCuFt: 1 }), // 30 lb/ft³
    ];
    expect(sortNames(list, "density")).toEqual(["dense", "fluffy", "no-volume"]);
  });

  it("'boxNumber' sorts boxes by code (numeric-aware) and pins loose items LAST", () => {
    const list = [
      e({ kind: "item", name: "loose-a", code: "A-1" }),
      e({ kind: "box", name: "box-10", code: "B-10" }),
      e({ kind: "box", name: "box-2", code: "B-2" }),
      e({ kind: "item", name: "loose-b", code: "A-2" }),
    ];
    // boxes first, B-2 before B-10, then the loose items.
    expect(sortNames(list, "boxNumber")).toEqual([
      "box-2",
      "box-10",
      "loose-a",
      "loose-b",
    ]);
  });

  it("'itemNumber' sorts items by code and pins boxes LAST", () => {
    const list = [
      e({ kind: "box", name: "box", code: "B-1" }),
      e({ kind: "item", name: "item-10", code: "I-10" }),
      e({ kind: "item", name: "item-2", code: "I-2" }),
    ];
    expect(sortNames(list, "itemNumber")).toEqual(["item-2", "item-10", "box"]);
  });
});

describe("toTanstackSorting", () => {
  it("maps presets to accessor column ids (descending where natural)", () => {
    expect(toTanstackSorting("added")).toEqual([{ id: "createdAt", desc: true }]);
    expect(toTanstackSorting("alpha")).toEqual([{ id: "name", desc: false }]);
    expect(toTanstackSorting("weight")).toEqual([{ id: "weight", desc: true }]);
    expect(toTanstackSorting("volume")).toEqual([{ id: "volume", desc: true }]);
    expect(toTanstackSorting("density")).toEqual([{ id: "density", desc: true }]);
    expect(toTanstackSorting("boxNumber")).toEqual([{ id: "code", desc: false }]);
    expect(toTanstackSorting("itemNumber")).toEqual([{ id: "code", desc: false }]);
  });
});

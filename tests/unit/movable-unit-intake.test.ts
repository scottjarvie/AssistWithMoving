import { describe, expect, it } from "vitest";

import { parseRoughMovableUnitText } from "@/lib/movable-unit-intake";

describe("rough movable unit intake", () => {
  it("expands rough room notes into boxes and loose items", () => {
    const rows = parseRoughMovableUnitText(
      "Garage: 3 medium boxes 30 lb 18x16x12, treadmill 220 lb 72x34x58, table saw",
    );

    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "box",
          name: "medium box 1",
          room: "Garage",
          estimatedWeightLb: "30",
          lengthIn: "18",
          widthIn: "16",
          heightIn: "12",
        }),
        expect.objectContaining({
          kind: "box",
          name: "medium box 2",
          room: "Garage",
        }),
        expect.objectContaining({
          kind: "box",
          name: "medium box 3",
          room: "Garage",
        }),
      ]),
    );
    expect(rows[3]).toMatchObject({
      kind: "looseItem",
      name: "treadmill",
      quantity: "1",
      room: "Garage",
      estimatedWeightLb: "220",
      lengthIn: "72",
      widthIn: "34",
      heightIn: "58",
    });
    expect(rows[4]).toMatchObject({
      kind: "looseItem",
      name: "table saw",
      room: "Garage",
      requiresPersonalTransport: false,
    });
  });

  it("respects explicit loose and box prefixes", () => {
    const rows = parseRoughMovableUnitText(`box: shop hardware 40 lb
loose: planer 90 lb 24x20x18`);

    expect(rows).toEqual([
      expect.objectContaining({
        kind: "box",
        name: "shop hardware",
        estimatedWeightLb: "40",
      }),
      expect.objectContaining({
        kind: "looseItem",
        name: "planer",
        estimatedWeightLb: "90",
        lengthIn: "24",
      }),
    ]);
  });

  it("parses explicit cubic-foot volume estimates from natural rough notes", () => {
    const rows = parseRoughMovableUnitText(
      "Garage: box #18 seasonal decor 6 cu ft, planer 12.5 cu ft 90 lb",
    );

    expect(rows).toEqual([
      expect.objectContaining({
        kind: "box",
        code: "18",
        name: "seasonal decor",
        estimatedVolumeCuFt: "6",
      }),
      expect.objectContaining({
        kind: "looseItem",
        name: "planer",
        estimatedWeightLb: "90",
        estimatedVolumeCuFt: "12.5",
      }),
    ]);
  });

  it("parses rough load and zone hints from natural notes", () => {
    const rows = parseRoughMovableUnitText(
      "Garage: box #20 shop tools -> Moving truck / Front, planer 90 lb -> Moving truck zone Front",
    );

    expect(rows).toEqual([
      expect.objectContaining({
        kind: "box",
        code: "20",
        name: "shop tools",
        loadTarget: "Moving truck",
        zoneTarget: "Front",
      }),
      expect.objectContaining({
        kind: "looseItem",
        name: "planer",
        estimatedWeightLb: "90",
        loadTarget: "Moving truck",
        zoneTarget: "Front",
      }),
    ]);
  });

  it("parses simple pipe-delimited rows and skips the header", () => {
    const rows =
      parseRoughMovableUnitText(`kind | name | room | weight | volume | dimensions
box | B-12 hardware | Garage | 35 lb | 2.25 cu ft | 18x12x12
item | Shovel bundle | Shed | 12 lb | 3 cu ft | 60x10x10`);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "box",
      code: "B-12",
      name: "hardware",
      room: "Garage",
      estimatedVolumeCuFt: "2.25",
    });
    expect(rows[1]).toMatchObject({
      kind: "looseItem",
      name: "Shovel bundle",
      room: "Shed",
      estimatedVolumeCuFt: "3",
    });
  });

  it("parses delimited load and zone columns", () => {
    const rows =
      parseRoughMovableUnitText(`kind | code | name | room | load | zone | weight | dimensions
box | B-030 | Hardware | Garage | Moving truck | Front | 42 lb | 18x12x12
item |  | Treadmill | Garage | Moving truck | Front | 220 lb | 72x34x58`);

    expect(rows).toEqual([
      expect.objectContaining({
        kind: "box",
        code: "B-030",
        name: "Hardware",
        loadTarget: "Moving truck",
        zoneTarget: "Front",
      }),
      expect.objectContaining({
        kind: "looseItem",
        name: "Treadmill",
        loadTarget: "Moving truck",
        zoneTarget: "Front",
      }),
    ]);
  });

  it("parses delimited quantity columns for loose items and uncoded box counts", () => {
    const rows =
      parseRoughMovableUnitText(`kind | code | name | qty | room | weight | dimensions
box |  | medium boxes | 3 | Garage | 30 lb | 18x16x12
box | B-100 | fragile art | 2 | Studio | 20 lb | 24x6x30
item |  | folding chairs | 6 | Garage | 8 lb | 36x18x4`);

    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "box",
          code: "",
          name: "medium box 1",
          room: "Garage",
          estimatedWeightLb: "30",
          lengthIn: "18",
        }),
        expect.objectContaining({ name: "medium box 2", code: "" }),
        expect.objectContaining({ name: "medium box 3", code: "" }),
      ]),
    );
    expect(rows[3]).toMatchObject({
      kind: "box",
      code: "B-100",
      name: "fragile art",
      room: "Studio",
      quantity: "1",
      estimatedWeightLb: "20",
    });
    expect(rows[4]).toMatchObject({
      kind: "looseItem",
      code: "",
      name: "folding chairs",
      room: "Garage",
      quantity: "6",
      estimatedWeightLb: "8",
      lengthIn: "36",
      widthIn: "18",
      heightIn: "4",
    });
  });

  it("preserves explicit box codes from rough notes", () => {
    const rows = parseRoughMovableUnitText(
      "Garage: B-012 kitchen dishes 35 lb 18x12x12, #13 Christmas totes, box #14 - tool bin, BOX-001 pantry backups",
    );

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      kind: "box",
      code: "B-012",
      name: "kitchen dishes",
      room: "Garage",
      estimatedWeightLb: "35",
      lengthIn: "18",
      widthIn: "12",
      heightIn: "12",
    });
    expect(rows[1]).toMatchObject({
      kind: "box",
      code: "13",
      name: "Christmas totes",
      room: "Garage",
    });
    expect(rows[2]).toMatchObject({
      kind: "box",
      code: "14",
      name: "tool bin",
      room: "Garage",
    });
    expect(rows[3]).toMatchObject({
      kind: "box",
      code: "BOX-001",
      name: "pantry backups",
      room: "Garage",
    });
  });

  it("expands numbered box ranges into individual coded box rows", () => {
    const rows = parseRoughMovableUnitText(
      "Garage: boxes 1-3 medium boxes 30 lb 18x16x12, B-010-B-011 dish cartons 4 cu ft",
    );

    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "box",
          code: "1",
          name: "medium boxes",
          room: "Garage",
          estimatedWeightLb: "30",
          lengthIn: "18",
        }),
        expect.objectContaining({
          kind: "box",
          code: "2",
          name: "medium boxes",
        }),
        expect.objectContaining({
          kind: "box",
          code: "3",
          name: "medium boxes",
        }),
      ]),
    );
    expect(rows.slice(3)).toEqual([
      expect.objectContaining({
        kind: "box",
        code: "B-010",
        name: "dish cartons",
        estimatedVolumeCuFt: "4",
      }),
      expect.objectContaining({
        kind: "box",
        code: "B-011",
        name: "dish cartons",
        estimatedVolumeCuFt: "4",
      }),
    ]);
  });

  it("expands natural numbered box range wording", () => {
    const rows = parseRoughMovableUnitText(
      "Garage: boxes numbered 1 through 3 are medium boxes 30 lb 18x16x12, cartons labeled B-010 through B-011 dish cartons 4 cu ft",
    );

    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "box",
          code: "1",
          name: "medium boxes",
          room: "Garage",
          estimatedWeightLb: "30",
          lengthIn: "18",
        }),
        expect.objectContaining({
          code: "2",
          name: "medium boxes",
        }),
        expect.objectContaining({
          code: "3",
          name: "medium boxes",
        }),
      ]),
    );
    expect(rows.slice(3)).toEqual([
      expect.objectContaining({
        kind: "box",
        code: "B-010",
        name: "dish cartons",
        estimatedVolumeCuFt: "4",
      }),
      expect.objectContaining({
        kind: "box",
        code: "B-011",
        name: "dish cartons",
        estimatedVolumeCuFt: "4",
      }),
    ]);
  });

  it("does not treat box range labels before a colon as room names", () => {
    const rows = parseRoughMovableUnitText("B001-B003: garage overflow boxes");

    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "box",
          code: "B001",
          name: "garage overflow boxes",
          room: "",
        }),
        expect.objectContaining({ code: "B002" }),
        expect.objectContaining({ code: "B003" }),
      ]),
    );
  });

  it("does not treat quantity-based box lists as box codes", () => {
    const rows = parseRoughMovableUnitText(
      "Garage: 3 medium boxes 30 lb 18x16x12",
    );

    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "medium box 1", code: "" }),
        expect.objectContaining({ name: "medium box 2", code: "" }),
        expect.objectContaining({ name: "medium box 3", code: "" }),
      ]),
    );
  });

  it("expands common rough quantity phrases for box lists", () => {
    const rows = parseRoughMovableUnitText(
      "Garage: a dozen medium boxes 30 lb 18x16x12, a couple of wardrobe boxes, about 4 totes",
    );

    expect(rows).toHaveLength(18);
    expect(rows.slice(0, 12)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "box",
          name: "medium box 1",
          room: "Garage",
          estimatedWeightLb: "30",
          lengthIn: "18",
          widthIn: "16",
          heightIn: "12",
        }),
        expect.objectContaining({
          kind: "box",
          name: "medium box 12",
          code: "",
        }),
      ]),
    );
    expect(rows.slice(12, 14)).toEqual([
      expect.objectContaining({
        kind: "box",
        name: "wardrobe box 1",
        code: "",
      }),
      expect.objectContaining({
        kind: "box",
        name: "wardrobe box 2",
        code: "",
      }),
    ]);
    expect(rows.slice(14)).toEqual([
      expect.objectContaining({ name: "tote 1", code: "" }),
      expect.objectContaining({ name: "tote 2", code: "" }),
      expect.objectContaining({ name: "tote 3", code: "" }),
      expect.objectContaining({ name: "tote 4", code: "" }),
    ]);
  });

  it("expands dictated number words for rough box counts", () => {
    const rows = parseRoughMovableUnitText(
      "Garage: twenty five medium boxes 30 lb 18x16x12, twenty-five book cartons, half dozen storage bins",
    );

    expect(rows).toHaveLength(56);
    expect(rows.slice(0, 25)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "box",
          name: "medium box 1",
          room: "Garage",
          estimatedWeightLb: "30",
          lengthIn: "18",
        }),
        expect.objectContaining({
          name: "medium box 25",
          code: "",
        }),
      ]),
    );
    expect(rows.slice(25, 50)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "book carton 1", code: "" }),
        expect.objectContaining({ name: "book carton 25", code: "" }),
      ]),
    );
    expect(rows.slice(50)).toEqual([
      expect.objectContaining({ name: "storage bin 1", code: "" }),
      expect.objectContaining({ name: "storage bin 2", code: "" }),
      expect.objectContaining({ name: "storage bin 3", code: "" }),
      expect.objectContaining({ name: "storage bin 4", code: "" }),
      expect.objectContaining({ name: "storage bin 5", code: "" }),
      expect.objectContaining({ name: "storage bin 6", code: "" }),
    ]);
  });

  it("caps written box quantities at the movable-unit batch limit", () => {
    const rows = parseRoughMovableUnitText("Garage: one hundred boxes");

    expect(rows).toHaveLength(100);
    expect(rows[0]).toMatchObject({ name: "box 1", code: "" });
    expect(rows[99]).toMatchObject({ name: "box 100", code: "" });
  });

  it("splits casual conjunctions when they introduce another movable unit", () => {
    const rows = parseRoughMovableUnitText(
      "Garage: twenty five medium boxes and a treadmill 220 lb 72x34x58 and box #3 fragile dishes",
    );

    expect(rows).toHaveLength(27);
    expect(rows.slice(0, 25)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "box", name: "medium box 1" }),
        expect.objectContaining({ kind: "box", name: "medium box 25" }),
      ]),
    );
    expect(rows[25]).toMatchObject({
      kind: "looseItem",
      name: "treadmill",
      room: "Garage",
      estimatedWeightLb: "220",
      lengthIn: "72",
      widthIn: "34",
      heightIn: "58",
    });
    expect(rows[26]).toMatchObject({
      kind: "box",
      code: "3",
      name: "fragile dishes",
      room: "Garage",
    });
  });

  it("keeps conjunctions inside one box label when no new unit starts", () => {
    const rows = parseRoughMovableUnitText("Garage: box #10 nuts and bolts");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "box",
      code: "10",
      name: "nuts and bolts",
    });
  });

  it("accepts longer numbered box codes from rough mobile labels", () => {
    const rows = parseRoughMovableUnitText(
      "Garage: box MOB-57485432 mobile garage hardware 18 lb 16x12x10",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "box",
      code: "MOB-57485432",
      name: "mobile garage hardware",
      room: "Garage",
      estimatedWeightLb: "18",
      lengthIn: "16",
      widthIn: "12",
      heightIn: "10",
    });
  });

  it("parses delimited code columns for box rows", () => {
    const rows =
      parseRoughMovableUnitText(`code | kind | name | room | weight | dimensions
B-044 | box | Office books | Office | 42 lb | 18x12x12
 | item | Floor lamp | Living room | 12 lb | 60x10x10`);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "box",
      code: "B-044",
      name: "Office books",
      room: "Office",
      estimatedWeightLb: "42",
    });
    expect(rows[1]).toMatchObject({
      kind: "looseItem",
      code: "",
      name: "Floor lamp",
    });
  });

  it("detects owner-carried loose movable units from natural rough notes", () => {
    const rows = parseRoughMovableUnitText(
      "Garage: camera backpack goes with me 12 lb 14x8x10, box #15 - paint supplies",
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "looseItem",
      name: "camera backpack",
      room: "Garage",
      estimatedWeightLb: "12",
      lengthIn: "14",
      widthIn: "8",
      heightIn: "10",
      requiresPersonalTransport: true,
    });
    expect(rows[1]).toMatchObject({
      kind: "box",
      code: "15",
      name: "paint supplies",
      requiresPersonalTransport: false,
    });
  });
});

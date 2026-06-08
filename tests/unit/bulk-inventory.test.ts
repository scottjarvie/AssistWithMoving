import { describe, expect, it } from "vitest";

import { parseBulkInventoryText } from "@/lib/bulk-inventory";

describe("bulk inventory parser", () => {
  it("parses room-colon notes into draft item rows", () => {
    const rows = parseBulkInventoryText(
      "Garage: two bikes, red toolbox, camping tent, 4 bins of Christmas decor"
    );

    expect(rows).toMatchObject([
      { name: "bikes", room: "Garage", quantity: "2" },
      { name: "red toolbox", room: "Garage", quantity: "1" },
      { name: "camping tent", room: "Garage", quantity: "1" },
      { name: "bins of Christmas decor", room: "Garage", quantity: "4" },
    ]);
  });

  it("parses tabular rows with headers", () => {
    const rows = parseBulkInventoryText(
      "Room\tItem\tCategory\tQty\tDisposition\nKitchen\tMixer\tAppliance\t1\ttake"
    );

    expect(rows).toMatchObject([
      {
        name: "Mixer",
        room: "Kitchen",
        category: "Appliance",
        quantity: "1",
        disposition: "take",
      },
    ]);
  });

  it("ignores blank and unnamed rows", () => {
    expect(parseBulkInventoryText("\n\n")).toEqual([]);
    expect(parseBulkInventoryText("Room\tItem\nGarage\t")).toEqual([]);
  });
});

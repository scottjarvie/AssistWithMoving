import { describe, expect, it } from "vitest";

import {
  assignmentCsvRows,
  boxCsvRows,
  csvFromRows,
  exportFilename,
  exportMimeType,
  inventoryCsvRows,
} from "../../convex/lib/exportRows";

describe("export row builders", () => {
  it("escapes CSV cells and preserves row order", () => {
    const csv = csvFromRows([
      ["name", "notes"],
      ["Chair", "solid"],
      ["Desk", "has, comma and \"quote\""],
    ]);

    expect(csv).toBe(
      'name,notes\nChair,solid\nDesk,"has, comma and ""quote"""'
    );
  });

  it("redacts inventory values, serials, and private notes by visibility", () => {
    const rows = inventoryCsvRows(
      [
        {
          name: "Camera",
          disposition: "take",
          status: "active",
          condition: "good",
          quantity: 1,
          valueCents: 100000,
          replacementValueCents: 125000,
          serialNumber: "SN-1",
          modelNumber: "M-1",
          privateNotes: "keep quiet",
        },
      ],
      { values: false, serials: false, privateNotes: false }
    );

    expect(rows[1]).not.toContain(100000);
    expect(rows[1]).not.toContain("SN-1");
    expect(rows[1]).not.toContain("keep quiet");
    expect(csvFromRows(rows)).toContain("Camera");
    expect(csvFromRows(rows)).not.toContain("SN-1");
  });

  it("includes box and assignment export columns", () => {
    expect(
      boxCsvRows([
        {
          code: "B-1",
          status: "sealed",
          assignedResource: "Storage unit",
          assignedZone: "Aisle 2",
        },
      ])[1]
    ).toEqual([
      "B-1",
      undefined,
      undefined,
      undefined,
      "sealed",
      "Storage unit",
      "Aisle 2",
      undefined,
      undefined,
      undefined,
    ]);

    expect(
      assignmentCsvRows([
        {
          boxCode: "B-1",
          boxStatus: "sealed",
          assignedResource: "Truck",
          itemCount: 4,
          estimatedWeightLb: 42,
        },
      ])[1]
    ).toEqual(["B-1", undefined, "sealed", "Truck", undefined, 4, 42]);
  });

  it("builds stable artifact filenames and mime types", () => {
    expect(
      exportFilename({
        type: "documentationProfile",
        format: "csv",
        slug: "PCS / HHG Packet",
      })
    ).toBe("movingmanifest-pcs-hhg-packet.csv");
    expect(exportMimeType("csv")).toBe("text/csv;charset=utf-8");
    expect(exportMimeType("print")).toBe("text/html;charset=utf-8");
  });
});

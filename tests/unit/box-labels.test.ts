import { describe, expect, it } from "vitest";

import {
  buildBoxLabelSheetPath,
  buildBoxLookupPath,
  buildBoxLookupUrl,
} from "@/lib/box-labels";
import {
  boxLabelPrintPresetFor,
  isBoxLabelPrintLayout,
} from "@/lib/box-label-printing";

describe("box label URL helpers", () => {
  it("builds secure app lookup paths", () => {
    expect(
      buildBoxLookupPath({
        householdId: "household",
        moveId: "move",
        boxId: "box with spaces",
      })
    ).toBe("/app/boxes/box%20with%20spaces?householdId=household&moveId=move");
  });

  it("builds absolute QR URLs from the current origin", () => {
    expect(
      buildBoxLookupUrl("https://movingmanifest.com", {
        householdId: "h",
        moveId: "m",
        boxId: "b",
      })
    ).toBe("https://movingmanifest.com/app/boxes/b?householdId=h&moveId=m");
  });

  it("builds printable label sheet paths for a selected move", () => {
    expect(buildBoxLabelSheetPath({ householdId: "h", moveId: "m" })).toBe(
      "/app/box-labels?householdId=h&moveId=m"
    );
  });

  it("includes optional label print layout in sheet paths", () => {
    expect(
      buildBoxLabelSheetPath({
        householdId: "h",
        moveId: "m",
        layout: "thermal4x6",
      })
    ).toBe("/app/box-labels?householdId=h&moveId=m&layout=thermal4x6");
  });

  it("defaults unknown print layouts to letter sheets", () => {
    expect(boxLabelPrintPresetFor(undefined).key).toBe("letterSheet");
    expect(boxLabelPrintPresetFor("unknown").key).toBe("letterSheet");
  });

  it("recognizes thermal label print layouts", () => {
    expect(isBoxLabelPrintLayout("thermal4x6")).toBe(true);
    expect(isBoxLabelPrintLayout("thermal3x2")).toBe(true);
    expect(boxLabelPrintPresetFor("thermal4x6")).toEqual(
      expect.objectContaining({
        pageSize: "4in 6in",
        printColumns: 1,
        thermal: true,
      })
    );
    expect(boxLabelPrintPresetFor("thermal3x2")).toEqual(
      expect.objectContaining({
        pageSize: "3in 2in",
        showUrl: false,
      })
    );
  });
});

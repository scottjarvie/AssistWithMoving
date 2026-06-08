import { describe, expect, it } from "vitest";

import {
  buildBoxLabelSheetPath,
  buildBoxLookupPath,
  buildBoxLookupUrl,
} from "@/lib/box-labels";

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
});

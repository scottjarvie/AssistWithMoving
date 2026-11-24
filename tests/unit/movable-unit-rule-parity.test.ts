import { expect, it } from "vitest";
import { isLooseMovableUnitRestItem } from "../../convex/lib/restApi";
import { isLooseMovableUnitItem } from "../../src/lib/movable-units";

type Item = Parameters<typeof isLooseMovableUnitItem>[0];
const item = { _id: "synthetic-item", name: "Notebook" } as Item;

const cases: [string, Partial<Item>, boolean, boolean][] = [
  ["small ordinary item", {}, false, false],
  ["archived item with a tag", { status: "archived", aiTags: ["loose-item"] }, false, false],
  ["deleted item with a tag", { deletedAt: 1, aiTags: ["loose-item"] }, false, false],
  ["normalized tag", { aiTags: [" LOOSE-ITEM "] }, true, true],
  ["resource assignment", { assignedResourceId: "truck" as Item["assignedResourceId"] }, true, true],
  ["zone assignment", { assignedZoneId: "zone" as Item["assignedZoneId"] }, true, true],
  ["assignment lock", { assignmentLocked: true }, true, true],
  ["personal transport flag", { requiresPersonalTransport: true }, true, true],
  ["personal transport disposition", { disposition: "personalTransport" }, true, true],
  ["furniture category", { category: "Furniture" }, true, true],
  ["large item name", { name: "Upright Piano" }, true, true],
  ["weight multiplied by quantity", { quantity: 2, estimatedWeightLb: 12.5 }, true, true],
  ["actual weight overrides estimate", { actualWeightLb: 2, estimatedWeightLb: 25 }, false, false],
  ["packed volume", { estimatedPackedVolumeCuFt: 4 }, true, true],
  ["volume calculated from dimensions", { dimensionsIn: { lengthIn: 24, widthIn: 24, heightIn: 24 } }, true, true],
  ["one dimension reaches the cutoff", { dimensionsIn: { lengthIn: 36, widthIn: 1, heightIn: 1 } }, true, true],
  ["weight below either cutoff", { estimatedWeightLb: 24.9 }, false, false],
  // REST rounds to tenths before comparison; the screen compares unrounded totals.
  ["near the weight cutoff", { estimatedWeightLb: 24.96 }, false, true],
  ["near the volume cutoff", { estimatedVolumeCuFt: 3.96 }, false, true],
  ["near the calculated volume cutoff", { dimensionsIn: { lengthIn: 19, widthIn: 19, heightIn: 19 } }, false, true],
  ["non-finite actual weight with a finite estimate", { actualWeightLb: NaN, estimatedWeightLb: 25 }, false, true],
];

it.each(cases)("classifies %s on each surface", (_label, fields, screen, rest) => {
  const input = { ...item, ...fields };
  expect(isLooseMovableUnitItem(input)).toBe(screen);
  expect(isLooseMovableUnitRestItem(input)).toBe(rest);
});

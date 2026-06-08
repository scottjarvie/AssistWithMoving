import { describe, expect, it } from "vitest";

import { suggestFromPhotoIntake } from "../../convex/lib/photoIntake";

describe("photo intake suggestions", () => {
  it("suggests an item from a captioned item photo", () => {
    const suggestions = suggestFromPhotoIntake({
      photoId: "photo1",
      caption: "fragile glass vase",
      room: "Living room",
      photoType: "item",
      privacyLevel: "normal",
      width: 1200,
      height: 800,
    });

    expect(suggestions[0]).toMatchObject({
      type: "item",
      confidence: "medium",
      itemDraft: {
        name: "fragile glass vase",
        room: "Living room",
        category: "Kitchen",
        fragility: "high",
      },
    });
    expect(suggestions[0].itemDraft?.planningDefaultKeys).toContain("fragile");
  });

  it("suggests a box from a box label photo", () => {
    const suggestions = suggestFromPhotoIntake({
      photoId: "photo2",
      caption: "Box K-1",
      room: "Kitchen",
      photoType: "boxLabel",
      privacyLevel: "normal",
      width: 900,
      height: 900,
    });

    expect(suggestions[0]).toMatchObject({
      type: "box",
      boxDraft: {
        code: "K-1",
        label: "K-1",
        room: "Kitchen",
      },
    });
  });

  it("flags duplicate photo candidates by hash-provided ids", () => {
    const suggestions = suggestFromPhotoIntake({
      photoId: "photo3",
      photoType: "room",
      privacyLevel: "normal",
      width: 900,
      height: 900,
      duplicatePhotoIds: ["photo1", "photo2"],
    });

    expect(suggestions[0]).toMatchObject({
      type: "duplicateCandidate",
      confidence: "high",
      duplicatePhotoIds: ["photo1", "photo2"],
    });
  });
});

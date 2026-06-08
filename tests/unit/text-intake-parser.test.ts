import { describe, expect, it } from "vitest";

import { parseTextIntakeSuggestions } from "../../convex/lib/textIntakeParser";

describe("text intake parser", () => {
  it("turns room notes into item suggestions with source trace", () => {
    const suggestions = parseTextIntakeSuggestions(
      "Kitchen: two boxes of dishes, fragile glass vase"
    );

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({
      type: "item",
      sourceLine: "Kitchen: two boxes of dishes, fragile glass vase",
      itemDraft: {
        name: "boxes of dishes",
        room: "Kitchen",
        quantity: 2,
        category: "Kitchen",
      },
    });
    expect(suggestions[1].itemDraft?.planningDefaultKeys).toContain("fragile");
  });

  it("creates box and contents suggestions from labeled box lines", () => {
    const suggestions = parseTextIntakeSuggestions(
      "Box K-1: plates, mugs, utensils (Kitchen)"
    );

    expect(suggestions[0]).toMatchObject({
      type: "box",
      boxDraft: {
        code: "K-1",
        label: "K-1",
        room: "Kitchen",
      },
    });
    expect(suggestions.slice(1).map((suggestion) => suggestion.itemDraft?.name))
      .toEqual(["plates", "mugs", "utensils (Kitchen)"]);
    expect(suggestions[1].itemDraft?.suggestedBoxLabel).toBe("K-1");
  });

  it("detects disposition prefixes", () => {
    const suggestions = parseTextIntakeSuggestions(
      "Donate: old lamp, small bookshelf\nPersonal: passport folder"
    );

    expect(suggestions.map((suggestion) => suggestion.itemDraft?.disposition))
      .toEqual(["donate", "donate", "personalTransport"]);
    expect(suggestions[2].itemDraft?.planningDefaultKeys).toContain("documents");
  });
});

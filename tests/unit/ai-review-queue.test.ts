import { describe, expect, it } from "vitest";

import {
  sortAiReviewEntries,
  summarizeAiReviewQueue,
  type AiReviewEntry,
} from "@/lib/ai-review-queue";

const entries: AiReviewEntry[] = [
  {
    id: "text1",
    kind: "text",
    type: "item",
    confidence: "medium",
    title: "Lamp",
    detail: "Living room: lamp",
    reasoning: "Text source",
    href: "#ai-text-intake",
  },
  {
    id: "photo1",
    kind: "photo",
    type: "duplicateCandidate",
    confidence: "high",
    title: "duplicate",
    detail: "hash",
    reasoning: "Same hash",
    href: "#ai-photo-intake",
    duplicateCount: 2,
  },
  {
    id: "planning1",
    kind: "planning",
    type: "assignment",
    confidence: "low",
    title: "Assignment",
    detail: "warnings",
    reasoning: "Validation warnings",
    href: "#ai-planning-suggestions",
  },
];

describe("AI review queue helpers", () => {
  it("summarizes pending review entries", () => {
    expect(summarizeAiReviewQueue(entries)).toEqual({
      total: 3,
      lowConfidence: 1,
      duplicateCandidates: 1,
      byKind: {
        text: 1,
        photo: 1,
        planning: 1,
      },
    });
  });

  it("sorts duplicates and low confidence entries first", () => {
    expect(sortAiReviewEntries(entries).map((entry) => entry.id)).toEqual([
      "photo1",
      "planning1",
      "text1",
    ]);
  });
});

import type {
  itemDispositions,
  itemFragilities,
  planningDefaultKeys,
} from "./moveFields";

type ItemDisposition = (typeof itemDispositions)[number];
type ItemFragility = (typeof itemFragilities)[number];
type PlanningDefaultKey = (typeof planningDefaultKeys)[number];
type PhotoDerivativeVariant = "thumb" | "card" | "detail" | "full";

export type PhotoIntakeInput = {
  photoId: string;
  caption?: string;
  room?: string;
  photoType: string;
  privacyLevel: string;
  width?: number;
  height?: number;
  duplicatePhotoIds?: string[];
};

export type PhotoIntakeSuggestion = {
  type: "item" | "box" | "boxContents" | "duplicateCandidate" | "evidenceGap";
  sourceDerivativeVariant: PhotoDerivativeVariant;
  sourceSummary: string;
  confidence: "low" | "medium" | "high";
  reasoning: string;
  itemDraft?: {
    name: string;
    room?: string;
    category?: string;
    disposition: ItemDisposition;
    quantity: number;
    description?: string;
    suggestedBoxLabel?: string;
    fragility?: ItemFragility;
    highValue?: boolean;
    planningDefaultKeys?: PlanningDefaultKey[];
  };
  boxDraft?: {
    code?: string;
    label: string;
    room?: string;
    description?: string;
  };
  duplicatePhotoIds?: string[];
};

const categoryRules: [RegExp, string][] = [
  [/\b(box|carton|bin|tote|crate)\b/i, "Box"],
  [/\b(sofa|couch|chair|table|desk|dresser|bed|mattress)\b/i, "Furniture"],
  [/\b(tv|television|monitor|computer|laptop|speaker|camera)\b/i, "Electronics"],
  [/\b(plate|dish|mug|glass|pan|pot|kitchen)\b/i, "Kitchen"],
  [/\b(book|file|document|binder|paper|passport|orders)\b/i, "Documents"],
  [/\b(tool|drill|saw|wrench|toolbox)\b/i, "Tools"],
  [/\b(bike|bicycle|tent|camp|ski|sports)\b/i, "Outdoor"],
];

const fragilePattern = /\b(fragile|glass|mirror|vase|art|frame|ceramic)\b/i;
const highValuePattern = /\b(high[- ]?value|jewelry|camera|laptop|computer|art|collectible|heirloom)\b/i;
const documentPattern = /\b(passport|orders|birth certificate|title|deed|document|record)\b/i;

export function suggestFromPhotoIntake(input: PhotoIntakeInput) {
  const summary = summarizePhoto(input);
  const suggestions: PhotoIntakeSuggestion[] = [];
  const label = firstMeaningfulCaptionPart(input.caption);

  if (input.duplicatePhotoIds?.length) {
    suggestions.push({
      type: "duplicateCandidate",
      sourceDerivativeVariant: "card",
      sourceSummary: summary,
      confidence: "high",
      reasoning: "Another photo in this move has the same original hash.",
      duplicatePhotoIds: input.duplicatePhotoIds,
    });
  }

  if (input.photoType === "boxLabel" || /\bbox\s+[a-z0-9-]+/i.test(label)) {
    const boxLabel = normalizeBoxLabel(label || `${input.room ?? "Photo"} box`);
    suggestions.push({
      type: "box",
      sourceDerivativeVariant: "card",
      sourceSummary: summary,
      confidence: label ? "medium" : "low",
      reasoning: "Photo type or caption looks like a box label.",
      boxDraft: {
        code: normalizeBoxCode(boxLabel),
        label: boxLabel,
        room: input.room,
        description: `Suggested from photo ${input.photoId}.`,
      },
    });
  }

  if (input.photoType === "boxContents") {
    const boxLabel = input.room ? `${input.room} contents` : "Photo contents";
    suggestions.push({
      type: "boxContents",
      sourceDerivativeVariant: "card",
      sourceSummary: summary,
      confidence: "medium",
      reasoning: "Photo was marked as box contents.",
      itemDraft: itemDraftFromName(label || boxLabel, input, boxLabel),
    });
  } else if (input.photoType === "item" || label) {
    suggestions.push({
      type: "item",
      sourceDerivativeVariant: "card",
      sourceSummary: summary,
      confidence: label ? "medium" : "low",
      reasoning: label
        ? "Caption gives an item candidate."
        : "Photo metadata suggests a possible item, but needs review.",
      itemDraft: itemDraftFromName(label || `${input.room ?? "Unassigned"} photo item`, input),
    });
  } else {
    suggestions.push({
      type: "evidenceGap",
      sourceDerivativeVariant: "card",
      sourceSummary: summary,
      confidence: "low",
      reasoning: "Photo is unassigned and needs user review before it can support inventory.",
    });
  }

  return suggestions;
}

function itemDraftFromName(
  name: string,
  input: PhotoIntakeInput,
  suggestedBoxLabel?: string
) {
  const cleanName = clean(name);
  const defaultKeys: PlanningDefaultKey[] = [];
  if (fragilePattern.test(cleanName)) defaultKeys.push("fragile");
  if (highValuePattern.test(cleanName)) defaultKeys.push("highValue");
  if (documentPattern.test(cleanName)) defaultKeys.push("documents");

  return {
    name: cleanName,
    room: input.room,
    category: categoryRules.find(([pattern]) => pattern.test(cleanName))?.[1],
    disposition: "undecided" as const,
    quantity: 1,
    description: `Suggested from ${input.photoType} photo.`,
    suggestedBoxLabel,
    fragility: fragilePattern.test(cleanName) ? ("high" as const) : undefined,
    highValue: highValuePattern.test(cleanName) ? true : undefined,
    planningDefaultKeys: defaultKeys.length ? defaultKeys : undefined,
  };
}

function summarizePhoto(input: PhotoIntakeInput) {
  return [
    input.caption ? `caption: ${clean(input.caption)}` : undefined,
    input.room ? `room: ${clean(input.room)}` : undefined,
    `type: ${input.photoType}`,
    input.width && input.height ? `${input.width}x${input.height}` : undefined,
  ]
    .filter(Boolean)
    .join("; ");
}

function firstMeaningfulCaptionPart(caption: string | undefined) {
  return clean(caption ?? "").split(/[,;]/)[0]?.trim() ?? "";
}

function normalizeBoxLabel(value: string) {
  return clean(value).replace(/^box\s+/i, "");
}

function normalizeBoxCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 24);
}

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 160);
}

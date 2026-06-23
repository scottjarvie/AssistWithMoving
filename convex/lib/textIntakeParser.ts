import type {
  itemDispositions,
  itemFragilities,
  planningDefaultKeys,
} from "./moveFields";
import type { Id } from "../_generated/dataModel";

type ItemDisposition = (typeof itemDispositions)[number];
type ItemFragility = (typeof itemFragilities)[number];
type PlanningDefaultKey = (typeof planningDefaultKeys)[number];

export type TextIntakeItemDraft = {
  name: string;
  room?: string;
  currentSpaceId?: Id<"moveSpaces">;
  destinationRoom?: string;
  destinationSpaceId?: Id<"moveSpaces">;
  category?: string;
  disposition: ItemDisposition;
  quantity: number;
  description?: string;
  suggestedBoxLabel?: string;
  fragility?: ItemFragility;
  highValue?: boolean;
  planningDefaultKeys?: PlanningDefaultKey[];
};

export type TextIntakeBoxDraft = {
  code?: string;
  label: string;
  room?: string;
  destinationRoom?: string;
  description?: string;
};

export type TextIntakeSuggestion = {
  type: "item" | "box";
  sourceLine: string;
  sourceIndex: number;
  confidence: "low" | "medium" | "high";
  reasoning: string;
  itemDraft?: TextIntakeItemDraft;
  boxDraft?: TextIntakeBoxDraft;
};

const numberWords = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["a", 1],
  ["an", 1],
]);

const dispositionPrefixes = new Map<string, ItemDisposition>([
  ["donate", "donate"],
  ["donation", "donate"],
  ["sell", "sell"],
  ["free", "free"],
  ["giveaway", "free"],
  ["dump", "dump"],
  ["trash", "dump"],
  ["storage", "storage"],
  ["store", "storage"],
  ["take", "take"],
  ["keep", "take"],
  ["mover", "mover"],
  ["movers", "mover"],
  ["personal", "personalTransport"],
  ["car", "personalTransport"],
]);

const categoryRules: [RegExp, string][] = [
  [/\b(sofa|couch|chair|table|desk|dresser|bed|mattress|nightstand)\b/i, "Furniture"],
  [/\b(tv|television|monitor|computer|laptop|speaker|camera|console)\b/i, "Electronics"],
  [/\b(plate|plates|dish|dishes|mug|mugs|glass|pan|pot|utensil|silverware|kitchen)\b/i, "Kitchen"],
  [/\b(book|paper|file|document|binder|record)\b/i, "Documents"],
  [/\b(tool|drill|saw|wrench|toolbox)\b/i, "Tools"],
  [/\b(clothes|coat|shoe|linen|towel|bedding)\b/i, "Soft goods"],
  [/\b(bike|bicycle|tent|camp|ski|sports)\b/i, "Outdoor"],
  [/\b(toy|game|puzzle)\b/i, "Kids"],
  [/\b(art|photo|frame|mirror|vase|decor)\b/i, "Decor"],
];

const fragilePattern = /\b(fragile|glass|mirror|vase|art|frame|ceramic)\b/i;
const highValuePattern = /\b(high[- ]?value|jewelry|camera|laptop|computer|art|collectible|heirloom)\b/i;
const documentPattern = /\b(passport|birth certificate|orders|title|deed|document|record)\b/i;

export function parseTextIntakeSuggestions(text: string) {
  const sourceText = text.trim().slice(0, 12000);
  if (!sourceText) {
    return [];
  }

  const suggestions: TextIntakeSuggestion[] = [];
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, lineIndex) => {
    const boxMatch = line.match(/^(?:box|bin|tote|crate)\s+([^:]+)\s*:\s*(.+)$/i);
    if (boxMatch) {
      const label = clean(boxMatch[1]);
      const contents = boxMatch[2];
      const room = inferRoomFromText(contents);
      suggestions.push({
        type: "box",
        sourceLine: line,
        sourceIndex: suggestions.length,
        confidence: "high",
        reasoning: "Line starts with a box/bin/tote label.",
        boxDraft: {
          code: normalizePossibleBoxCode(label),
          label,
          room,
          description: `Suggested from text intake line ${lineIndex + 1}.`,
        },
      });

      for (const entry of splitEntries(contents)) {
        suggestions.push(
          itemSuggestionFromEntry({
            entry,
            line,
            sourceIndex: suggestions.length,
            room,
            suggestedBoxLabel: label,
            disposition: "undecided",
            reasoning: `Listed as contents for ${label}.`,
          })
        );
      }
      return;
    }

    const parsedPrefix = parseContextPrefix(line);
    const entries = splitEntries(parsedPrefix.rest);
    for (const entry of entries) {
      suggestions.push(
        itemSuggestionFromEntry({
          entry,
          line,
          sourceIndex: suggestions.length,
          room: parsedPrefix.room,
          disposition: parsedPrefix.disposition,
          reasoning: parsedPrefix.reasoning,
        })
      );
    }
  });

  return suggestions.filter(
    (suggestion) => suggestion.type === "box" || suggestion.itemDraft?.name
  );
}

function parseContextPrefix(line: string) {
  const separator = firstContextSeparator(line);
  if (!separator) {
    return {
      rest: line,
      disposition: "undecided" as const,
      reasoning: "Parsed from a plain text item list.",
    };
  }

  const prefix = clean(line.slice(0, separator.index));
  const rest = line.slice(separator.index + separator.length);
  const disposition = dispositionPrefixes.get(prefix.toLowerCase());
  if (disposition) {
    return {
      rest,
      disposition,
      reasoning: `Detected disposition from "${prefix}".`,
    };
  }

  return {
    rest,
    room: prefix,
    disposition: "undecided" as const,
    reasoning: `Detected room/context from "${prefix}".`,
  };
}

function firstContextSeparator(line: string) {
  const colon = line.indexOf(":");
  const dash = line.indexOf(" - ");
  const candidates = [
    colon >= 0 ? { index: colon, length: 1 } : null,
    dash >= 0 ? { index: dash, length: 3 } : null,
  ].filter(Boolean) as { index: number; length: number }[];
  return candidates.sort((a, b) => a.index - b.index)[0];
}

function splitEntries(value: string) {
  return value
    .split(/[,;]+/)
    .map(clean)
    .filter(Boolean);
}

function itemSuggestionFromEntry({
  entry,
  line,
  sourceIndex,
  room,
  disposition,
  suggestedBoxLabel,
  reasoning,
}: {
  entry: string;
  line: string;
  sourceIndex: number;
  room?: string;
  disposition: ItemDisposition;
  suggestedBoxLabel?: string;
  reasoning: string;
}) {
  const parsedQuantity = parseQuantityPrefix(entry);
  const descriptionParts = [
    suggestedBoxLabel ? `Suggested box: ${suggestedBoxLabel}.` : undefined,
    parsedQuantity.note,
  ].filter(Boolean);
  const flags = inferPlanningFlags(parsedQuantity.name);

  return {
    type: "item" as const,
    sourceLine: line,
    sourceIndex,
    confidence: confidenceForEntry(parsedQuantity.name, room, suggestedBoxLabel),
    reasoning,
    itemDraft: {
      name: parsedQuantity.name,
      room,
      category: inferCategory(parsedQuantity.name),
      disposition,
      quantity: parsedQuantity.quantity,
      description: descriptionParts.join(" ") || undefined,
      suggestedBoxLabel,
      fragility: flags.fragility,
      highValue: flags.highValue,
      planningDefaultKeys: flags.planningDefaultKeys,
    },
  };
}

function parseQuantityPrefix(value: string) {
  const cleaned = clean(value);
  const match = cleaned.match(
    /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(.+)$/i
  );
  if (!match) {
    return { quantity: 1, name: cleaned };
  }

  const rawQuantity = match[1].toLowerCase();
  const quantity = numberWords.get(rawQuantity) ?? Number(rawQuantity);
  return {
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    name: clean(match[2]),
    note: `Quantity inferred from "${match[1]}".`,
  };
}

function inferCategory(name: string) {
  return categoryRules.find(([pattern]) => pattern.test(name))?.[1];
}

function inferRoomFromText(value: string) {
  const match = value.match(/\(([^)]+)\)/);
  return match ? clean(match[1]) : undefined;
}

function inferPlanningFlags(name: string): {
  fragility?: ItemFragility;
  highValue?: boolean;
  planningDefaultKeys?: PlanningDefaultKey[];
} {
  const defaultKeys: PlanningDefaultKey[] = [];
  if (fragilePattern.test(name)) defaultKeys.push("fragile");
  if (highValuePattern.test(name)) defaultKeys.push("highValue");
  if (documentPattern.test(name)) defaultKeys.push("documents");

  return {
    fragility: fragilePattern.test(name) ? "high" : undefined,
    highValue: highValuePattern.test(name) ? true : undefined,
    planningDefaultKeys: defaultKeys.length ? defaultKeys : undefined,
  };
}

function confidenceForEntry(
  name: string,
  room?: string,
  suggestedBoxLabel?: string
): "low" | "medium" | "high" {
  if (suggestedBoxLabel && name.length > 2) return "high";
  if (room && name.length > 2) return "medium";
  return "low";
}

function normalizePossibleBoxCode(label: string) {
  const code = label
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 24);
  return code || undefined;
}

function clean(value: string) {
  return value
    .trim()
    .replace(/^[-*•]\s*/, "")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

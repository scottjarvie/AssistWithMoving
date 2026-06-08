import {
  estimateItem,
  roundEstimate,
  type EstimateConfidence,
} from "./estimateEngine";
import { validateAssignment, type LoadableBox } from "./assignmentValidation";

export type PlanningItemInput = {
  itemId: string;
  name: string;
  category?: string;
  quantity?: number;
  estimatedWeightLb?: number;
  actualWeightLb?: number;
  estimatedVolumeCuFt?: number;
  estimatedPackedVolumeCuFt?: number;
  weightConfidence?: EstimateConfidence;
  volumeConfidence?: EstimateConfidence;
};

export type PlanningBoxInput = LoadableBox & {
  boxId: string;
  code: string;
  assignedResourceId?: string;
  assignmentLocked?: boolean;
};

export type PlanningResourceInput = {
  resourceId: string;
  type: string;
  name: string;
  capacity: {
    maxWeightLb?: number;
    maxVolumeCuFt?: number;
    maxItemCount?: number;
    dimensions?: {
      lengthIn?: number;
      widthIn?: number;
      heightIn?: number;
    };
    weightIsUnlimited?: boolean;
    volumeIsUnlimited?: boolean;
  };
};

export type PlanningZoneInput = {
  zoneId: string;
  resourceId: string;
  name: string;
  capacity: PlanningResourceInput["capacity"];
};

export type EstimateSuggestionDraft = {
  category?: string;
  estimatedWeightLb?: number;
  estimatedWeightLowLb?: number;
  estimatedWeightHighLb?: number;
  estimatedVolumeCuFt?: number;
  estimatedPackedVolumeCuFt?: number;
  weightConfidence: EstimateConfidence;
  volumeConfidence: EstimateConfidence;
};

export type AssignmentSuggestionDraft = {
  assignedResourceId: string;
  assignedZoneId?: string;
  assignmentWarnings: string[];
  assignmentHardBlocks: string[];
  weightPercent?: number;
  volumePercent?: number;
  overrideReason?: string;
};

const categoryRules: [RegExp, string][] = [
  [/\b(sofa|couch|chair|table|desk|dresser|bed|mattress|shelf)\b/i, "Furniture"],
  [/\b(tv|television|monitor|computer|laptop|speaker|camera)\b/i, "Electronics"],
  [/\b(book|books|document|paper|binder|file)\b/i, "Books"],
  [/\b(dish|dishes|plate|mug|glass|pan|pot|kitchen)\b/i, "Kitchen"],
  [/\b(clothes|clothing|linen|towel|bedding)\b/i, "Clothing"],
  [/\b(tool|tools|drill|saw|wrench|toolbox)\b/i, "Tools"],
  [/\b(art|lamp|rug|decor|mirror|frame)\b/i, "Decor"],
  [/\b(box|bin|tote)\b/i, "Box"],
];

export function suggestEstimateForItem(item: PlanningItemInput) {
  if (
    item.actualWeightLb ||
    item.estimatedWeightLb ||
    item.estimatedVolumeCuFt ||
    item.estimatedPackedVolumeCuFt
  ) {
    return null;
  }

  const inferredCategory = item.category ?? inferCategory(item.name);
  const estimate = estimateItem({
    ...item,
    category: item.category ?? inferredCategory,
  });
  if (!estimate.weight && !estimate.volume && !inferredCategory) {
    return null;
  }

  const quantity = positiveNumber(item.quantity) ?? 1;
  const estimatedWeightLb = estimate.weight
    ? roundEstimate(estimate.weight.value / quantity)
    : undefined;
  const estimatedVolumeCuFt = estimate.volume
    ? roundEstimate(estimate.volume.value / quantity)
    : undefined;

  const draft: EstimateSuggestionDraft = {
    category: item.category ? undefined : inferredCategory,
    estimatedWeightLb,
    estimatedWeightLowLb: estimatedWeightLb
      ? roundEstimate(estimatedWeightLb * 0.75)
      : undefined,
    estimatedWeightHighLb: estimatedWeightLb
      ? roundEstimate(estimatedWeightLb * 1.35)
      : undefined,
    estimatedVolumeCuFt,
    estimatedPackedVolumeCuFt: estimatedVolumeCuFt,
    weightConfidence: estimate.weight?.confidence ?? "none",
    volumeConfidence: estimate.volume?.confidence ?? "none",
  };

  const assumptions = [
    estimate.weight ? `Weight source: ${estimate.weight.source}.` : undefined,
    estimate.volume ? `Volume source: ${estimate.volume.source}.` : undefined,
    inferredCategory && !item.category
      ? `Category inferred as ${inferredCategory}.`
      : undefined,
  ].filter(Boolean) as string[];

  return {
    itemId: item.itemId,
    confidence:
      estimate.weight?.confidence === "medium" ||
      estimate.volume?.confidence === "medium"
        ? ("medium" as const)
        : ("low" as const),
    reasoning:
      "Item is missing manual estimates, so baseline category/name estimates were proposed for review.",
    assumptions,
    estimateDraft: draft,
  };
}

export function suggestAssignmentForBox({
  box,
  resources,
  zones,
}: {
  box: PlanningBoxInput;
  resources: PlanningResourceInput[];
  zones: PlanningZoneInput[];
}) {
  if (box.assignmentLocked || box.assignedResourceId || !resources.length) {
    return null;
  }

  const candidates = resources.flatMap((resource) => {
    const resourceZones = zones.filter((zone) => zone.resourceId === resource.resourceId);
    const targets = resourceZones.length ? resourceZones : [null];
    return targets.map((zone) => {
      const capacity = mergeCapacity(resource.capacity, zone?.capacity);
      const validation = validateAssignment({
        box,
        target: {
          resourceType: resource.type,
          capacity,
        },
      });
      return {
        resource,
        zone,
        validation,
        score:
          validation.hardBlocks.length * 1000 +
          validation.softWarnings.length * 100 +
          (validation.weightPercent ?? 0) +
          (validation.volumePercent ?? 0),
      };
    });
  });

  const best = candidates.sort((a, b) => a.score - b.score)[0];
  if (!best || best.validation.hardBlocks.length) {
    return null;
  }

  return {
    boxId: box.boxId,
    confidence: best.validation.softWarnings.length ? ("low" as const) : ("medium" as const),
    reasoning: `Suggested ${box.code} for ${best.resource.name}${
      best.zone ? ` / ${best.zone.name}` : ""
    } using load planner validation.`,
    assumptions: [
      "Locked and already-assigned boxes are skipped.",
      "Hard-blocked assignments are not suggested.",
      best.validation.softWarnings.length
        ? `Warnings: ${best.validation.softWarnings.join(", ")}.`
        : "No validation warnings for the suggested target.",
    ],
    assignmentDraft: {
      assignedResourceId: best.resource.resourceId,
      assignedZoneId: best.zone?.zoneId,
      assignmentWarnings: best.validation.softWarnings,
      assignmentHardBlocks: best.validation.hardBlocks,
      weightPercent: best.validation.weightPercent,
      volumePercent: best.validation.volumePercent,
      overrideReason: best.validation.softWarnings.length
        ? "AI suggestion accepted after reviewing validation warnings."
        : undefined,
    },
  };
}

function inferCategory(name: string) {
  return categoryRules.find(([pattern]) => pattern.test(name))?.[1];
}

function positiveNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function mergeCapacity(
  resourceCapacity: PlanningResourceInput["capacity"],
  zoneCapacity?: PlanningZoneInput["capacity"]
) {
  if (!zoneCapacity) {
    return resourceCapacity;
  }

  return {
    maxWeightLb: minOptional(resourceCapacity.maxWeightLb, zoneCapacity.maxWeightLb),
    maxVolumeCuFt: minOptional(
      resourceCapacity.maxVolumeCuFt,
      zoneCapacity.maxVolumeCuFt
    ),
    maxItemCount: minOptional(
      resourceCapacity.maxItemCount,
      zoneCapacity.maxItemCount
    ),
    dimensions: {
      lengthIn: minOptional(
        resourceCapacity.dimensions?.lengthIn,
        zoneCapacity.dimensions?.lengthIn
      ),
      widthIn: minOptional(
        resourceCapacity.dimensions?.widthIn,
        zoneCapacity.dimensions?.widthIn
      ),
      heightIn: minOptional(
        resourceCapacity.dimensions?.heightIn,
        zoneCapacity.dimensions?.heightIn
      ),
    },
    weightIsUnlimited:
      resourceCapacity.weightIsUnlimited === true &&
      zoneCapacity.weightIsUnlimited === true,
    volumeIsUnlimited:
      resourceCapacity.volumeIsUnlimited === true &&
      zoneCapacity.volumeIsUnlimited === true,
  };
}

function minOptional(first?: number, second?: number) {
  if (typeof first !== "number") return second;
  if (typeof second !== "number") return first;
  return Math.min(first, second);
}

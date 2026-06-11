import { footprintCorners, type Point } from "@/lib/plan-geometry";

export type MeasurementConfidence =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "manual"
  | "actual";

export type PlacementDimensions = {
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
};

export type PlacementFootprint = {
  lengthIn: number;
  widthIn: number;
  measured: boolean;
};

export type PlacementContainmentNode = {
  _id: string;
  parentPlacementId?: string;
};

export function placementFootprintFromDimensions(
  dimensions: PlacementDimensions | undefined,
  fallbackIn = 24,
): PlacementFootprint {
  const values = [
    dimensions?.lengthIn,
    dimensions?.widthIn,
    dimensions?.heightIn,
  ].filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  if (values.length < 2) {
    return {
      lengthIn: fallbackIn,
      widthIn: fallbackIn,
      measured: false,
    };
  }

  const sorted = [...values].sort((a, b) => b - a);
  return {
    lengthIn: sorted[0]!,
    widthIn: sorted[1]!,
    measured: true,
  };
}

export function placementBorderStyle(
  footprint: PlacementFootprint,
  confidence: MeasurementConfidence | undefined,
) {
  if (!footprint.measured || confidence === "none") {
    return { dashArray: "2 4", marker: "?" };
  }
  if (confidence === "actual" || confidence === "manual") {
    return { dashArray: undefined, marker: undefined };
  }
  return { dashArray: "8 5", marker: undefined };
}

export function placementCorners({
  x,
  y,
  rotationDeg,
  footprint,
}: {
  x: number;
  y: number;
  rotationDeg: number;
  footprint: PlacementFootprint;
}): Point[] {
  return footprintCorners(
    x,
    y,
    footprint.lengthIn,
    footprint.widthIn,
    rotationDeg,
  );
}

export function groupPlacementChildren<T extends PlacementContainmentNode>(
  placements: T[],
) {
  const groups = new Map<string, T[]>();
  for (const placement of placements) {
    if (!placement.parentPlacementId) {
      continue;
    }
    const current = groups.get(placement.parentPlacementId) ?? [];
    current.push(placement);
    groups.set(placement.parentPlacementId, current);
  }
  return groups;
}

export function totalContainedCount<T extends PlacementContainmentNode>(
  placementId: string,
  childrenByParent: Map<string, T[]>,
  visited = new Set<string>(),
): number {
  if (visited.has(placementId)) {
    return 0;
  }
  visited.add(placementId);
  const directChildren = childrenByParent.get(placementId) ?? [];
  return directChildren.reduce(
    (sum, child) =>
      sum + 1 + totalContainedCount(child._id, childrenByParent, visited),
    0,
  );
}

export function isPlacementDescendant<T extends PlacementContainmentNode>(
  candidateId: string,
  placementId: string,
  placements: T[],
) {
  const byId = new Map<string, T>(
    placements.map((placement) => [placement._id, placement]),
  );
  let current = byId.get(candidateId);
  let depth = 0;
  while (current?.parentPlacementId && depth < 10) {
    if (current.parentPlacementId === placementId) {
      return true;
    }
    current = byId.get(current.parentPlacementId);
    depth += 1;
  }
  return false;
}

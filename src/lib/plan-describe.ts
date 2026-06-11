import {
  footprintCorners,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  type Point,
} from "./plan-geometry";
import type { PlanOp } from "./plan-ops";

export type PlanDimensions = {
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
};

export type PlanSourceSummary = {
  kind: "item" | "box" | "plannedItem" | "template";
  sourceId: string;
  label: string;
  dimensionsIn?: PlanDimensions;
  confidence?: string;
};

export type PlanDocumentInput = {
  plan: {
    planId: string;
    moveId: string;
    name: string;
    kind: string;
    northAngleDeg: number;
    defaultWallThicknessIn: number;
    defaultCeilingHeightIn: number;
    gridSnapIn: number;
    shortIdCounters: {
      nextWall: number;
      nextRoom: number;
      nextOpening: number;
      nextFeature: number;
      nextZone: number;
      nextAnnotation: number;
      nextPlacement: number;
    };
    nextSeq: number;
    status: string;
    createdAt: number;
    updatedAt: number;
  };
  levels: PlanLevelSummary[];
  entities: PlanEntitySummary[];
  placements: PlanPlacementSummary[];
  pendingProposalCount?: number;
};

export type PlanLevelSummary = {
  levelId: string;
  name: string;
  levelType: "indoor" | "outdoor";
  sortOrder: number;
  ceilingHeightIn?: number;
};

export type PlanEntitySummary = {
  entityId: string;
  levelId: string;
  shortId: string;
  entityType: "wall" | "room" | "opening" | "feature" | "zone" | "annotation";
  name?: string;
  color?: string;
  locked: boolean;
  autoName?: string;
  wall?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    thicknessIn: number;
    heightIn: number;
  };
  room?: {
    points: Point[];
    fillColor?: string;
    areaSqFt?: number;
  };
  opening?: {
    wallShortId: string;
    offsetAlongWallIn: number;
    widthIn: number;
    kind: "door" | "window" | "passage";
    swing: "left" | "right" | "none";
    sillHeightIn?: number;
    headHeightIn?: number;
  };
	  feature?: {
	    x: number;
	    y: number;
	    rotationDeg: number;
	    featureKind: string;
	    widthIn: number;
	    depthIn: number;
	    heightIn?: number;
	    label?: string;
	  };
  zone?: {
    points: Point[];
    zoneKind: string;
    areaSqFt?: number;
  };
  annotation?: {
    x: number;
    y: number;
    text: string;
    fontSizeIn?: number;
  };
};

export type PlanPlacementSummary = {
  placementId: string;
  levelId: string;
  shortId: string;
  source?: PlanSourceSummary;
  x: number;
  y: number;
  rotationDeg: number;
  footprintOverrideIn?: {
    lengthIn: number;
    widthIn: number;
  };
  parentPlacementId?: string;
  containmentMode?: "inside" | "onTop";
  zOrder: number;
  color?: string;
  locked: boolean;
};

export function normalizePlanDocument(input: PlanDocumentInput): PlanDocumentInput {
  const rooms = input.entities.filter(
    (entity) => entity.entityType === "room" && entity.room,
  );

  return {
    ...input,
    levels: [...input.levels].sort((a, b) => a.sortOrder - b.sortOrder),
    entities: input.entities.map((entity) => ({
      ...entity,
      autoName: entity.autoName ?? autoEntityName(entity, rooms),
      room: entity.room
        ? {
            ...entity.room,
            areaSqFt: roundSquareFeet(polygonArea(entity.room.points)),
          }
        : undefined,
      zone: entity.zone
        ? {
            ...entity.zone,
            areaSqFt: roundSquareFeet(polygonArea(entity.zone.points)),
          }
        : undefined,
    })),
    placements: [...input.placements].sort((a, b) => a.zOrder - b.zOrder),
  };
}

export function describePlanDocument(input: PlanDocumentInput) {
  const document = normalizePlanDocument(input);
  const lines: string[] = [
    `${document.plan.name} (${document.plan.kind})`,
    `Plan ${document.plan.planId}; ${document.levels.length} levels; ${document.entities.length} entities; ${document.placements.length} placements.`,
    `Pending proposals: ${document.pendingProposalCount ?? 0}.`,
  ];

  for (const level of document.levels) {
    const entities = document.entities.filter(
      (entity) => entity.levelId === level.levelId,
    );
    const rooms = entities.filter((entity) => entity.entityType === "room");
    const walls = entities.filter((entity) => entity.entityType === "wall");
    const openings = entities.filter((entity) => entity.entityType === "opening");
    const placements = document.placements.filter(
      (placement) =>
        placement.levelId === level.levelId && !placement.parentPlacementId,
    );

    lines.push("");
    lines.push(
      `Level: ${level.name} (${level.levelType}) - ${rooms.length} rooms, ${walls.length} walls, ${openings.length} openings, ${placements.length} visible placements.`,
    );

    for (const room of rooms) {
      const roomLabel = displayEntityName(room);
      const roomPlacements = placements.filter((placement) =>
        room.room ? pointInPolygon({ x: placement.x, y: placement.y }, room.room.points) : false,
      );
      lines.push(
        `- ${room.shortId}: ${roomLabel}; ${room.room?.areaSqFt ?? 0} sq ft; ${roomPlacements.length} placements.`,
      );
      for (const placement of roomPlacements) {
        lines.push(
          `  - ${placement.shortId}: ${placement.source?.label ?? "Unknown source"} at ${roundNumber(placement.x)}, ${roundNumber(placement.y)}; rotation ${roundNumber(placement.rotationDeg)} deg.`,
        );
      }
    }

    if (walls.length) {
      lines.push(
        `Walls: ${walls
          .map((wall) => `${wall.shortId} ${displayEntityName(wall)}`)
          .join("; ")}.`,
      );
    }

    const unassigned = placements.filter(
      (placement) =>
        !rooms.some((room) =>
          room.room
            ? pointInPolygon({ x: placement.x, y: placement.y }, room.room.points)
            : false,
        ),
    );
    if (unassigned.length) {
      lines.push(
        `Unassigned placements: ${unassigned
          .map((placement) => `${placement.shortId} ${placement.source?.label ?? ""}`.trim())
          .join("; ")}.`,
      );
    }
  }

  return lines.join("\n");
}

export function renderPlanSnapshotSvg(input: PlanDocumentInput, levelId?: string) {
  const document = normalizePlanDocument(input);
  const level = levelId
    ? document.levels.find((entry) => entry.levelId === levelId)
    : document.levels[0];
  if (!level) {
    throw new Error("Plan has no levels to render.");
  }

  const entities = document.entities.filter(
    (entity) => entity.levelId === level.levelId,
  );
  const placements = document.placements.filter(
    (placement) =>
      placement.levelId === level.levelId && !placement.parentPlacementId,
  );
  const bounds = planBounds(entities, placements);
  const padding = 24;
  const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`;

  const body = [
    `<title>${escapeXml(document.plan.name)} - ${escapeXml(level.name)}</title>`,
    ...entities.filter((entity) => entity.entityType === "room").map(renderRoom),
    ...entities.filter((entity) => entity.entityType === "zone").map(renderZone),
    ...entities.filter((entity) => entity.entityType === "wall").map(renderWall),
    ...entities.filter((entity) => entity.entityType === "opening").map((opening) =>
      renderOpening(opening, entities),
    ),
    ...entities.filter((entity) => entity.entityType === "feature").map(renderFeature),
    ...entities.filter((entity) => entity.entityType === "annotation").map(renderAnnotation),
    ...placements.map(renderPlacement),
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img">${body}</svg>`;
}

export function planDocumentToCreateOps(
  input: PlanDocumentInput,
  maps: {
    levelIds: Record<string, string>;
    placementIds?: Record<string, string>;
  },
): PlanOp[] {
  const document = normalizePlanDocument(input);
  const ops: PlanOp[] = [
    {
      type: "updatePlanSettings",
      patch: {
        name: document.plan.name,
        northAngleDeg: document.plan.northAngleDeg,
        defaultWallThicknessIn: document.plan.defaultWallThicknessIn,
        defaultCeilingHeightIn: document.plan.defaultCeilingHeightIn,
        gridSnapIn: document.plan.gridSnapIn,
      },
    },
  ];

  for (const entity of document.entities) {
    const levelId = maps.levelIds[entity.levelId];
    if (!levelId) {
      throw new Error(`Missing level ID mapping for ${entity.levelId}.`);
    }
    ops.push({
      type: "createEntity",
      entity: {
        levelId,
        entityType: entity.entityType,
        name: entity.name,
        color: entity.color,
        locked: entity.locked,
        wall: entity.wall,
        room: entity.room
          ? {
              points: entity.room.points,
              fillColor: entity.room.fillColor,
            }
          : undefined,
        opening: entity.opening,
	        feature: entity.feature
	          ? {
	              ...entity.feature,
	              featureKind: planFeatureKind(entity.feature.featureKind),
	            }
          : undefined,
        zone: entity.zone
          ? {
              points: entity.zone.points,
              zoneKind: planZoneKind(entity.zone.zoneKind),
            }
          : undefined,
        annotation: entity.annotation,
      },
    });
  }

  for (const placement of document.placements) {
    const levelId = maps.levelIds[placement.levelId];
    if (!levelId) {
      throw new Error(`Missing level ID mapping for ${placement.levelId}.`);
    }
    const source = placementSourceOpFields(placement.source);
    if (!source) {
      throw new Error(`Placement ${placement.shortId} is missing a source.`);
    }
    ops.push({
      type: "createPlacement",
      placement: {
        ...source,
        levelId,
        x: placement.x,
        y: placement.y,
        rotationDeg: placement.rotationDeg,
        footprintOverrideIn: placement.footprintOverrideIn,
        parentPlacementId: placement.parentPlacementId
          ? maps.placementIds?.[placement.parentPlacementId]
          : undefined,
        containmentMode: placement.containmentMode,
        zOrder: placement.zOrder,
        color: placement.color,
        locked: placement.locked,
      },
    });
  }

  return ops;
}

function autoEntityName(
  entity: PlanEntitySummary,
  rooms: PlanEntitySummary[],
) {
  if (entity.name?.trim()) return entity.name.trim();
  if (entity.entityType === "room") return `Room ${numericSuffix(entity.shortId)}`;
  if (entity.entityType === "wall" && entity.wall) {
    return wallCompassName(entity, rooms);
  }
  if (entity.entityType === "opening") {
    return `${capitalize(entity.opening?.kind ?? "opening")} ${entity.shortId}`;
  }
  if (entity.entityType === "feature") {
    return `${capitalize(entity.feature?.featureKind ?? "feature")} ${entity.shortId}`;
  }
  if (entity.entityType === "zone") return `${capitalize(entity.zone?.zoneKind ?? "zone")} ${entity.shortId}`;
  if (entity.entityType === "annotation") return entity.annotation?.text ?? entity.shortId;
  return entity.shortId;
}

function wallCompassName(entity: PlanEntitySummary, rooms: PlanEntitySummary[]) {
  if (!entity.wall) return entity.shortId;
  const midpoint = {
    x: (entity.wall.x1 + entity.wall.x2) / 2,
    y: (entity.wall.y1 + entity.wall.y2) / 2,
  };
  const room = rooms.find((candidate) => candidate.room);
  const center = room?.room ? polygonCentroid(room.room.points) : { x: 0, y: 0 };
  const horizontal =
    Math.abs(entity.wall.x2 - entity.wall.x1) >=
    Math.abs(entity.wall.y2 - entity.wall.y1);
  const direction = horizontal
    ? midpoint.y <= center.y
      ? "north"
      : "south"
    : midpoint.x >= center.x
      ? "east"
      : "west";
  const roomLabel = room ? roomDisplayName(room) : "plan";
  return `${roomLabel} ${direction} wall`;
}

function displayEntityName(entity: PlanEntitySummary) {
  return entity.name?.trim() || entity.autoName || entity.shortId;
}

function roomDisplayName(entity: PlanEntitySummary) {
  return entity.name?.trim() || entity.autoName || `Room ${numericSuffix(entity.shortId)}`;
}

function renderRoom(entity: PlanEntitySummary) {
  if (!entity.room) return "";
  const center = polygonCentroid(entity.room.points);
  return `<polygon points="${pointsAttr(entity.room.points)}" fill="${escapeXml(entity.room.fillColor ?? "#eef6ff")}" stroke="#5b87a8" stroke-width="1"><title>${escapeXml(entity.shortId)} ${escapeXml(displayEntityName(entity))}</title></polygon><text x="${center.x}" y="${center.y}" text-anchor="middle" font-size="10" fill="#263238">${escapeXml(entity.shortId)}</text>`;
}

function renderZone(entity: PlanEntitySummary) {
  if (!entity.zone) return "";
  const style = snapshotZoneStyle(entity.zone.zoneKind, entity.color);
  return `<polygon points="${pointsAttr(entity.zone.points)}" fill="${escapeXml(style.fill)}" stroke="${escapeXml(style.stroke)}" stroke-width="1" stroke-dasharray="${escapeXml(style.strokeDasharray)}"><title>${escapeXml(entity.shortId)} ${escapeXml(displayEntityName(entity))}</title></polygon>`;
}

function renderWall(entity: PlanEntitySummary) {
  if (!entity.wall) return "";
  return `<line x1="${entity.wall.x1}" y1="${entity.wall.y1}" x2="${entity.wall.x2}" y2="${entity.wall.y2}" stroke="#27323a" stroke-width="${Math.max(2, entity.wall.thicknessIn)}" stroke-linecap="square"><title>${escapeXml(entity.shortId)} ${escapeXml(displayEntityName(entity))}</title></line>`;
}

function renderOpening(
  entity: PlanEntitySummary,
  entities: PlanEntitySummary[],
) {
  if (!entity.opening) return "";
  const wall = entities.find(
    (candidate) => candidate.shortId === entity.opening?.wallShortId,
  )?.wall;
  if (!wall) return "";
  const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) || 1;
  const startRatio = entity.opening.offsetAlongWallIn / length;
  const endRatio = (entity.opening.offsetAlongWallIn + entity.opening.widthIn) / length;
  const start = {
    x: wall.x1 + (wall.x2 - wall.x1) * startRatio,
    y: wall.y1 + (wall.y2 - wall.y1) * startRatio,
  };
  const end = {
    x: wall.x1 + (wall.x2 - wall.x1) * endRatio,
    y: wall.y1 + (wall.y2 - wall.y1) * endRatio,
  };
  return `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#ffffff" stroke-width="${Math.max(6, entity.opening.widthIn / 8)}" stroke-linecap="butt"><title>${escapeXml(entity.shortId)} ${escapeXml(displayEntityName(entity))}</title></line><line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#1f7a8c" stroke-width="1.5"><title>${escapeXml(entity.shortId)} ${escapeXml(displayEntityName(entity))}</title></line>`;
}

function renderFeature(entity: PlanEntitySummary) {
  if (!entity.feature) return "";
  if (entity.feature.featureKind === "fence") {
    return renderFenceFeature(entity);
  }
  const x = entity.feature.x - entity.feature.widthIn / 2;
  const y = entity.feature.y - entity.feature.depthIn / 2;
  const style = snapshotFeatureStyle(entity.feature.featureKind, entity.color);
  return `<rect x="${x}" y="${y}" width="${entity.feature.widthIn}" height="${entity.feature.depthIn}" transform="rotate(${entity.feature.rotationDeg} ${entity.feature.x} ${entity.feature.y})" fill="${escapeXml(style.fill)}" stroke="${escapeXml(style.stroke)}" stroke-width="1"><title>${escapeXml(entity.shortId)} ${escapeXml(displayEntityName(entity))}</title></rect>`;
}

function renderFenceFeature(entity: PlanEntitySummary) {
  if (!entity.feature) return "";
  const feature = entity.feature;
  const posts = fencePostPositions(feature.widthIn)
    .map(
      (x) =>
        `<line x1="${x}" y1="-8" x2="${x}" y2="8" stroke="#111827" stroke-width="2" />`,
    )
    .join("");
  return `<g transform="translate(${feature.x} ${feature.y}) rotate(${feature.rotationDeg})"><title>${escapeXml(entity.shortId)} ${escapeXml(displayEntityName(entity))}</title><line x1="${-feature.widthIn / 2}" y1="0" x2="${feature.widthIn / 2}" y2="0" stroke="#111827" stroke-width="2" stroke-dasharray="8 5" />${posts}</g>`;
}

function renderAnnotation(entity: PlanEntitySummary) {
  if (!entity.annotation) return "";
  return `<text x="${entity.annotation.x}" y="${entity.annotation.y}" font-size="${entity.annotation.fontSizeIn ?? 8}" fill="#46515a"><title>${escapeXml(entity.shortId)} ${escapeXml(displayEntityName(entity))}</title>${escapeXml(entity.annotation.text)}</text>`;
}

function renderPlacement(placement: PlanPlacementSummary) {
  const footprint = placementFootprint(placement);
  const x = placement.x - footprint.lengthIn / 2;
  const y = placement.y - footprint.widthIn / 2;
  const label = `${placement.shortId} ${placement.source?.label ?? "Placement"}`;
  return `<rect x="${x}" y="${y}" width="${footprint.lengthIn}" height="${footprint.widthIn}" rx="2" transform="rotate(${placement.rotationDeg} ${placement.x} ${placement.y})" fill="${escapeXml(placement.color ?? "#dbeafe")}" stroke="#1d4ed8" stroke-width="1.5"><title>${escapeXml(label)}</title></rect><text x="${placement.x}" y="${placement.y}" text-anchor="middle" dominant-baseline="middle" font-size="8" fill="#172554">${escapeXml(placement.shortId)}</text>`;
}

function placementFootprint(placement: PlanPlacementSummary) {
  if (placement.footprintOverrideIn) return placement.footprintOverrideIn;
  const dimensions = placement.source?.dimensionsIn;
  const values = [
    dimensions?.lengthIn,
    dimensions?.widthIn,
    dimensions?.heightIn,
  ].filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  if (values.length < 2) {
    return { lengthIn: 24, widthIn: 24 };
  }
  const sorted = [...values].sort((a, b) => b - a);
  return { lengthIn: sorted[0]!, widthIn: sorted[1]! };
}

function snapshotZoneStyle(kind: string, overrideColor: string | undefined) {
  if (overrideColor) {
    return {
      fill: overrideColor,
      stroke: "#64748b",
      strokeDasharray: "6 4",
    };
  }

  switch (kind) {
    case "driveway":
      return { fill: "#e5e7eb", stroke: "#4b5563", strokeDasharray: "2 5" };
    case "garden":
      return { fill: "#dcfce7", stroke: "#15803d", strokeDasharray: "5 4" };
    case "patio":
      return { fill: "#f8fafc", stroke: "#64748b", strokeDasharray: "1 3" };
    case "shed":
      return { fill: "#fef3c7", stroke: "#92400e", strokeDasharray: "6 3" };
    case "fence":
      return { fill: "none", stroke: "#111827", strokeDasharray: "2 7" };
    default:
      return { fill: "#f2f7ec", stroke: "#7a9b58", strokeDasharray: "6 4" };
  }
}

function snapshotFeatureStyle(kind: string, overrideColor: string | undefined) {
  if (overrideColor) {
    return { fill: "#ffffff", stroke: overrideColor };
  }

  switch (kind) {
    case "shed":
      return { fill: "#fef3c7", stroke: "#92400e" };
    case "trampoline":
      return { fill: "#dbeafe", stroke: "#1d4ed8" };
    case "swingSet":
    case "raisedBed":
      return { fill: "#dcfce7", stroke: "#15803d" };
    case "picnicTable":
    case "woodpile":
      return { fill: "#fde68a", stroke: "#92400e" };
    case "vehicle":
    case "rv":
    case "trailer":
      return { fill: "#e0f2fe", stroke: "#0369a1" };
    case "grill":
    case "generator":
    case "acUnit":
      return { fill: "#e5e7eb", stroke: "#374151" };
    default:
      return { fill: "#f6f0df", stroke: "#8b7e66" };
  }
}

function fencePostPositions(widthIn: number) {
  const spacing = 24;
  const count = Math.max(2, Math.floor(widthIn / spacing) + 1);
  const start = -widthIn / 2;
  const step = widthIn / (count - 1);
  return Array.from({ length: count }, (_, index) => start + index * step);
}

function placementSourceOpFields(source: PlanSourceSummary | undefined) {
  if (!source) return null;
  switch (source.kind) {
    case "item":
      return { itemId: source.sourceId };
    case "box":
      return { boxId: source.sourceId };
    case "plannedItem":
      return { plannedItemId: source.sourceId };
    case "template":
      return { templateKey: source.sourceId };
  }
}

function planFeatureKind(kind: string) {
  const allowed = [
    "stairs",
    "sink",
    "toilet",
    "tub",
    "shower",
	    "waterHeater",
	    "fireplace",
	    "counter",
	    "shed",
	    "trampoline",
	    "swingSet",
	    "picnicTable",
	    "grill",
	    "raisedBed",
	    "acUnit",
	    "generator",
	    "woodpile",
	    "vehicle",
	    "rv",
	    "trailer",
	    "fence",
	    "custom",
	  ] as const;
  return allowed.includes(kind as (typeof allowed)[number])
    ? (kind as (typeof allowed)[number])
    : "custom";
}

function planZoneKind(kind: string) {
  const allowed = [
    "driveway",
    "shed",
    "garden",
    "fence",
    "patio",
    "custom",
  ] as const;
  return allowed.includes(kind as (typeof allowed)[number])
    ? (kind as (typeof allowed)[number])
    : "custom";
}

function planBounds(
  entities: PlanEntitySummary[],
  placements: PlanPlacementSummary[],
) {
  const points: Point[] = [];
  for (const entity of entities) {
    if (entity.room) points.push(...entity.room.points);
    if (entity.zone) points.push(...entity.zone.points);
    if (entity.wall) {
      points.push({ x: entity.wall.x1, y: entity.wall.y1 });
      points.push({ x: entity.wall.x2, y: entity.wall.y2 });
    }
    if (entity.feature) {
      points.push({ x: entity.feature.x, y: entity.feature.y });
    }
    if (entity.annotation) {
      points.push({ x: entity.annotation.x, y: entity.annotation.y });
    }
  }
  for (const placement of placements) {
    const footprint = placementFootprint(placement);
    points.push(
      ...footprintCorners(
        placement.x,
        placement.y,
        footprint.lengthIn,
        footprint.widthIn,
        placement.rotationDeg,
      ),
    );
  }
  if (!points.length) {
    points.push({ x: 0, y: 0 }, { x: 240, y: 160 });
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function pointsAttr(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function roundSquareFeet(squareInches: number) {
  return Math.round((squareInches / 144) * 10) / 10;
}

function roundNumber(value: number) {
  return Math.round(value * 10) / 10;
}

function numericSuffix(shortId: string) {
  return shortId.replace(/^\D+/, "") || shortId;
}

function capitalize(value: string) {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export type Point = {
  x: number;
  y: number;
};

export type WallSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thicknessIn?: number;
};

export type Opening = {
  offsetAlongWallIn: number;
  widthIn: number;
  swing?: "left" | "right" | "none";
};

const epsilon = 1e-9;

export function snapToGrid(point: Point, gridIn: number): Point {
  if (!Number.isFinite(gridIn) || gridIn <= 0) {
    return point;
  }

  return {
    x: Math.round(point.x / gridIn) * gridIn,
    y: Math.round(point.y / gridIn) * gridIn,
  };
}

export function polygonArea(points: readonly Point[]) {
  if (points.length < 3) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }

  return Math.abs(sum) / 2;
}

export function squareInchesToSquareFeet(areaSqIn: number) {
  return areaSqIn / 144;
}

export function polygonCentroid(points: readonly Point[]): Point {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  let signedAreaTwice = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    signedAreaTwice += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }

  if (Math.abs(signedAreaTwice) < epsilon) {
    const total = points.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 },
    );
    return { x: total.x / points.length, y: total.y / points.length };
  }

  return {
    x: centroidX / (3 * signedAreaTwice),
    y: centroidY / (3 * signedAreaTwice),
  };
}

export function pointInPolygon(point: Point, polygon: readonly Point[]) {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];

    if (pointOnSegment(point, previous, current)) {
      return true;
    }

    const crossesY =
      current.y > point.y !== previous.y > point.y;
    if (!crossesY) {
      continue;
    }

    const xIntersection =
      ((previous.x - current.x) * (point.y - current.y)) /
        (previous.y - current.y) +
      current.x;

    if (point.x < xIntersection) {
      inside = !inside;
    }
  }

  return inside;
}

export function segmentIntersection(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): Point | null {
  const denominator =
    (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);

  if (Math.abs(denominator) < epsilon) {
    return pointOnSegment(a1, b1, b2)
      ? a1
      : pointOnSegment(a2, b1, b2)
        ? a2
        : pointOnSegment(b1, a1, a2)
          ? b1
          : pointOnSegment(b2, a1, a2)
            ? b2
            : null;
  }

  const detA = a1.x * a2.y - a1.y * a2.x;
  const detB = b1.x * b2.y - b1.y * b2.x;
  const point = {
    x: (detA * (b1.x - b2.x) - (a1.x - a2.x) * detB) / denominator,
    y: (detA * (b1.y - b2.y) - (a1.y - a2.y) * detB) / denominator,
  };

  return pointOnSegment(point, a1, a2) && pointOnSegment(point, b1, b2)
    ? point
    : null;
}

export function distancePointToSegment(point: Point, start: Point, end: Point) {
  const lengthSquared = distanceSquared(start, end);
  if (lengthSquared < epsilon) {
    return Math.sqrt(distanceSquared(point, start));
  }

  const t = clamp(
    ((point.x - start.x) * (end.x - start.x) +
      (point.y - start.y) * (end.y - start.y)) /
      lengthSquared,
    0,
    1,
  );
  const projection = {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  };

  return Math.sqrt(distanceSquared(point, projection));
}

export function wallOutwardNormal(
  wall: WallSegment,
  roomPolygon: readonly Point[],
): Point {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const length = Math.hypot(dx, dy);
  if (length < epsilon) {
    return { x: 0, y: -1 };
  }

  const left = { x: -dy / length, y: dx / length };
  const midpoint = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
  const probe = {
    x: midpoint.x + left.x * 6,
    y: midpoint.y + left.y * 6,
  };

  return pointInPolygon(probe, roomPolygon)
    ? { x: -left.x, y: -left.y }
    : left;
}

export function compassDirection(angleDeg: number, northAngleDeg: number) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  const normalized = normalizeDegrees(angleDeg - northAngleDeg);
  const index = Math.round(normalized / 45) % directions.length;
  return directions[index];
}

export function footprintCorners(
  x: number,
  y: number,
  lengthIn: number,
  widthIn: number,
  rotationDeg: number,
): Point[] {
  const halfLength = lengthIn / 2;
  const halfWidth = widthIn / 2;
  const localCorners = [
    { x: -halfLength, y: -halfWidth },
    { x: halfLength, y: -halfWidth },
    { x: halfLength, y: halfWidth },
    { x: -halfLength, y: halfWidth },
  ];
  const radians = degreesToRadians(rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return localCorners.map((corner) => ({
    x: x + corner.x * cos - corner.y * sin,
    y: y + corner.x * sin + corner.y * cos,
  }));
}

export function footprintIntersectsWall(
  corners: readonly Point[],
  wall: WallSegment,
) {
  if (corners.length < 2) {
    return false;
  }

  const wallStart = { x: wall.x1, y: wall.y1 };
  const wallEnd = { x: wall.x2, y: wall.y2 };

  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    if (segmentIntersection(current, next, wallStart, wallEnd)) {
      return true;
    }
  }

  return pointInPolygon(wallStart, corners) || pointInPolygon(wallEnd, corners);
}

export function polygonSelfIntersects(points: readonly Point[]) {
  if (points.length < 4) {
    return false;
  }

  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (
        first === second ||
        firstNext === second ||
        secondNext === first
      ) {
        continue;
      }
      if (
        segmentIntersection(
          points[first],
          points[firstNext],
          points[second],
          points[secondNext],
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

export function doorSwingArc(
  opening: Opening,
  wall: WallSegment,
): Point[] {
  if (opening.swing === "none" || opening.widthIn <= 0) {
    return [];
  }

  const hinge = pointAlongWall(wall, opening.offsetAlongWallIn);
  const wallAngle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
  const startAngle =
    wallAngle + (opening.swing === "right" ? Math.PI / 2 : -Math.PI / 2);
  const endAngle =
    startAngle + (opening.swing === "right" ? -Math.PI / 2 : Math.PI / 2);
  const steps = 8;

  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const angle = startAngle + (endAngle - startAngle) * t;
    return {
      x: hinge.x + Math.cos(angle) * opening.widthIn,
      y: hinge.y + Math.sin(angle) * opening.widthIn,
    };
  });
}

export function pointAlongWall(wall: WallSegment, offsetIn: number): Point {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const length = Math.hypot(dx, dy);
  if (length < epsilon) {
    return { x: wall.x1, y: wall.y1 };
  }

  const clampedOffset = clamp(offsetIn, 0, length);
  const ratio = clampedOffset / length;
  return {
    x: wall.x1 + dx * ratio,
    y: wall.y1 + dy * ratio,
  };
}

export type OpeningDragMode = "center" | "start" | "end";

export function wallOffsetAtPoint(wall: WallSegment, point: Point) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const length = Math.hypot(dx, dy);
  if (length < epsilon) {
    return 0;
  }
  const raw = ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / length;
  return clamp(raw, 0, length);
}

export function clampOpeningToWall<TOpening extends Opening>({
  opening,
  wall,
  point,
  mode,
  minWidthIn = 1,
}: {
  opening: TOpening;
  wall: WallSegment;
  point: Point;
  mode: OpeningDragMode;
  minWidthIn?: number;
}): TOpening | null {
  const wallLength = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  const minimumWidth = Math.max(minWidthIn, epsilon);
  if (wallLength < minimumWidth) {
    return null;
  }

  const projected = wallOffsetAtPoint(wall, point);
  const currentWidth = clamp(opening.widthIn, minimumWidth, wallLength);
  let offsetAlongWallIn = clamp(
    opening.offsetAlongWallIn,
    0,
    wallLength - currentWidth,
  );
  let widthIn = currentWidth;

  if (mode === "center") {
    offsetAlongWallIn = clamp(projected - widthIn / 2, 0, wallLength - widthIn);
  } else if (mode === "start") {
    const currentEnd = clamp(
      offsetAlongWallIn + widthIn,
      minimumWidth,
      wallLength,
    );
    const start = clamp(projected, 0, currentEnd - minimumWidth);
    offsetAlongWallIn = start;
    widthIn = currentEnd - start;
  } else {
    const start = clamp(offsetAlongWallIn, 0, wallLength - minimumWidth);
    const end = clamp(projected, start + minimumWidth, wallLength);
    offsetAlongWallIn = start;
    widthIn = end - start;
  }

  return {
    ...opening,
    offsetAlongWallIn,
    widthIn,
  };
}

function pointOnSegment(point: Point, start: Point, end: Point) {
  const cross =
    (point.y - start.y) * (end.x - start.x) -
    (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > epsilon) {
    return false;
  }

  return (
    point.x >= Math.min(start.x, end.x) - epsilon &&
    point.x <= Math.max(start.x, end.x) + epsilon &&
    point.y >= Math.min(start.y, end.y) - epsilon &&
    point.y <= Math.max(start.y, end.y) + epsilon
  );
}

function distanceSquared(a: Point, b: Point) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function normalizeDegrees(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

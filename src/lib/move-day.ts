export const MOVE_DAY_CACHE_VERSION = 1;
export const MOVE_DAY_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type MoveDayCachedBox = {
  id: string;
  code: string;
  label?: string;
  room?: string;
  destinationRoom?: string;
  status: string;
  itemCount: number;
  resourceName?: string;
  zoneName?: string;
  assignmentWarnings: string[];
  assignmentHardBlocks: string[];
  assignmentLocked: boolean;
  moveDayNote?: string;
};

export type MoveDayCachePayload = {
  version: typeof MOVE_DAY_CACHE_VERSION;
  moveId: string;
  cachedAt: number;
  boxes: MoveDayCachedBox[];
};

export type MoveDayConnectivityStatus = {
  online: boolean;
  usingCache: boolean;
  cacheAgeLabel?: string;
};

export function moveDayCacheKey(moveId: string) {
  return `movingmanifest:move-day:${moveId}:v${MOVE_DAY_CACHE_VERSION}`;
}

export function createMoveDayCachePayload({
  moveId,
  boxes,
  now = Date.now(),
}: {
  moveId: string;
  boxes: MoveDayCachedBox[];
  now?: number;
}): MoveDayCachePayload {
  return {
    version: MOVE_DAY_CACHE_VERSION,
    moveId,
    cachedAt: now,
    boxes,
  };
}

export function parseMoveDayCache(
  value: string | null,
  expectedMoveId: string,
  now = Date.now()
): MoveDayCachePayload | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<MoveDayCachePayload>;
    if (
      parsed.version !== MOVE_DAY_CACHE_VERSION ||
      parsed.moveId !== expectedMoveId ||
      typeof parsed.cachedAt !== "number" ||
      !Array.isArray(parsed.boxes) ||
      now - parsed.cachedAt > MOVE_DAY_CACHE_MAX_AGE_MS
    ) {
      return null;
    }

    return {
      version: MOVE_DAY_CACHE_VERSION,
      moveId: parsed.moveId,
      cachedAt: parsed.cachedAt,
      boxes: parsed.boxes.map(normalizeCachedBox),
    };
  } catch {
    return null;
  }
}

export function moveDayCacheAgeLabel(cachedAt: number, now = Date.now()) {
  const ageMinutes = Math.max(0, Math.floor((now - cachedAt) / 60000));
  if (ageMinutes < 1) return "just now";
  if (ageMinutes < 60) return `${ageMinutes}m ago`;

  const ageHours = Math.round(ageMinutes / 60);
  return `${ageHours}h ago`;
}

export function moveDayConnectivityMessage(status: MoveDayConnectivityStatus) {
  if (!status.online && status.usingCache) {
    return `Offline. Showing last-known checklist${
      status.cacheAgeLabel ? ` from ${status.cacheAgeLabel}` : ""
    }. Reconnect before changing statuses.`;
  }

  if (!status.online) {
    return "Offline. Reconnect before changing box statuses.";
  }

  if (status.usingCache) {
    return `Reconnecting. Showing last-known checklist${
      status.cacheAgeLabel ? ` from ${status.cacheAgeLabel}` : ""
    }.`;
  }

  return "Online. Status changes sync to the move record.";
}

export function moveDayMutationFailureMessage({
  boxCode,
  online,
}: {
  boxCode: string;
  online: boolean;
}) {
  return online
    ? `Could not update ${boxCode}. Check the connection and retry.`
    : `Offline. ${boxCode} was not changed; reconnect and retry.`;
}

function normalizeCachedBox(box: Partial<MoveDayCachedBox>): MoveDayCachedBox {
  return {
    id: String(box.id ?? ""),
    code: String(box.code ?? "Unknown"),
    label: optionalString(box.label),
    room: optionalString(box.room),
    destinationRoom: optionalString(box.destinationRoom),
    status: String(box.status ?? "unknown"),
    itemCount: typeof box.itemCount === "number" ? box.itemCount : 0,
    resourceName: optionalString(box.resourceName),
    zoneName: optionalString(box.zoneName),
    assignmentWarnings: Array.isArray(box.assignmentWarnings)
      ? box.assignmentWarnings.filter(isString)
      : [],
    assignmentHardBlocks: Array.isArray(box.assignmentHardBlocks)
      ? box.assignmentHardBlocks.filter(isString)
      : [],
    assignmentLocked: box.assignmentLocked === true,
    moveDayNote: optionalString(box.moveDayNote),
  };
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

import type { ApiKeyScope } from "./apiKeys";
import {
  boxContainerTypes,
  boxStatuses,
  normalizeBoxCode,
  normalizeOptionalText,
} from "./moveFields";
import {
  estimateItem,
  roundEstimate,
  type EstimateConfidence,
} from "./estimateEngine";

export type RestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RestRequestInput = {
  method: RestMethod;
  path: string;
  query: Record<string, string>;
  authorization?: string;
  idempotencyKey?: string;
  body?: unknown;
  oauthIdentity?: RestOAuthIdentity;
};

export function normalizeRestBoxCode(value: unknown) {
  return normalizeBoxCode(String(value ?? ""));
}

export type RestOAuthIdentity = {
  tokenIdentifier: string;
  subject: string;
  issuer: string;
  oauthClientId?: string;
  oauthTokenId?: string;
  name?: string;
  pictureUrl?: string;
  email?: string;
};

export type RestResponse = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

export function oauthNeedsHouseholdContextPayload({
  userId,
  email,
  name,
  setupUrl = "https://movingmanifest.com/app/dashboard#household-setup",
  generatedAt = Date.now(),
}: {
  userId: unknown;
  email?: string | null;
  name?: string | null;
  setupUrl?: string;
  generatedAt?: number;
}) {
  const user = {
    userId,
    email: email ?? null,
    name: name ?? null,
  };
  return {
    data: {
      household: null,
      apiKey: null,
      connection: {
        type: "oauth",
        status: "needs_household",
        connectionId: null,
        scopes: [],
        moveRestricted: false,
        moveId: null,
        createdByUserId: userId,
        user,
        householdMember: null,
      },
      restrictedMove: null,
      onboarding: {
        status: "needs_household",
        setupUrl,
        message:
          "OAuth sign-in succeeded, but this account is not an active member of a MovingManifest household yet.",
        nextSteps: [
          "Open MovingManifest and create a household for this account.",
          "Or ask an existing household owner to invite this email with API access enabled.",
          "After the household exists, reconnect or retry the MCP tool call.",
        ],
      },
      generatedAt,
    },
  };
}

export type RestMeContextPayloadInput = {
  household: Record<string, unknown> | null;
  apiKeyId: unknown;
  scopes: readonly ApiKeyScope[];
  connectionType?: "apiKey" | "oauth";
  moveId?: unknown;
  createdByUserId?: unknown;
  user?: {
    userId: unknown;
    email?: string | null;
    name?: string | null;
  } | null;
  householdMember?: {
    membershipId: unknown;
    role: unknown;
    status: unknown;
    apiAccessStatus: unknown;
    apiAccessAllowed: boolean;
  } | null;
  restrictedMove?: unknown;
  generatedAt?: number;
};

export function restMeContextPayload({
  household,
  apiKeyId,
  scopes,
  connectionType = "apiKey",
  moveId,
  createdByUserId,
  user = null,
  householdMember = null,
  restrictedMove = null,
  generatedAt = Date.now(),
}: RestMeContextPayloadInput) {
  const connectionIdentity = {
    user: user
      ? {
          userId: user.userId,
          email: user.email ?? null,
          name: user.name ?? null,
        }
      : null,
    householdMember: householdMember
      ? {
          membershipId: householdMember.membershipId,
          role: householdMember.role,
          status: householdMember.status,
          apiAccessStatus: householdMember.apiAccessStatus,
          apiAccessAllowed: householdMember.apiAccessAllowed,
        }
      : null,
  };

  return {
    data: {
      household,
      apiKey: {
        apiKeyId,
        scopes,
        moveRestricted: Boolean(moveId),
        moveId,
        createdByUserId,
        ...connectionIdentity,
      },
      connection: {
        type: connectionType,
        connectionId: apiKeyId,
        scopes,
        moveRestricted: Boolean(moveId),
        moveId,
        createdByUserId,
        ...connectionIdentity,
      },
      restrictedMove,
      generatedAt,
    },
  };
}

export type RestErrorField = {
  path: string;
  message: string;
  validValues?: readonly string[];
};

export class RestApiError extends Error {
  status: number;
  code: string;
  fields?: RestErrorField[];

  constructor({
    status,
    code,
    message,
    fields,
  }: {
    status: number;
    code: string;
    message: string;
    fields?: RestErrorField[];
  }) {
    super(message);
    this.name = "RestApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function invalidField(
  path: string,
  message: string,
  validValues?: readonly string[],
) {
  return new RestApiError({
    status: 400,
    code: "validation_error",
    message,
    fields: [{ path, message, validValues }],
  });
}

export type RestRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export const restApiRateLimit = {
  limit: 300,
  windowMs: 5 * 60 * 1000,
} as const;

export function bearerToken(authorization: string | undefined) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function parseRestPath(path: string) {
  return path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
}

export function bodyRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

function removeUndefined<TValue extends Record<string, unknown>>(
  value: TValue,
) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as {
    [TKey in keyof TValue as undefined extends TValue[TKey] ? TKey : TKey]:
      | Exclude<TValue[TKey], undefined>
      | undefined;
  };
}

export function optionalRestNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function optionalRestString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function parseRestDimensionsIn(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw invalidField("dimensionsIn", "dimensionsIn must be an object.");
  }
  const input = value as Record<string, unknown>;
  const dimensions = removeUndefined({
    lengthIn: optionalRestNumber(input.lengthIn),
    widthIn: optionalRestNumber(input.widthIn),
    heightIn: optionalRestNumber(input.heightIn),
  });
  return Object.keys(dimensions).length ? dimensions : undefined;
}

export function normalizeAgentLabel(value: unknown, fallback?: unknown) {
  const raw = typeof value === "string" ? value : fallback;
  if (typeof raw !== "string") return undefined;
  const label = raw.trim();
  return label ? label.slice(0, 64) : undefined;
}

export function parseAiConfidenceScore(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw invalidField(
      "aiConfidenceScore",
      "aiConfidenceScore must be a number from 0 to 1.",
    );
  }
  return value;
}

export function restAgentAttributionFields(
  body: unknown,
  auth?: { apiKeyName?: string },
  options: { defaultLabel?: boolean } = {},
) {
  const input = bodyRecord(body);
  return {
    agentLabel: normalizeAgentLabel(
      input.agentLabel,
      options.defaultLabel ? auth?.apiKeyName : undefined,
    ),
    aiConfidenceScore: parseAiConfidenceScore(input.aiConfidenceScore),
  };
}

export function restPrivateItemNoteAppendPatch<TUserId = unknown>({
  body,
  auth,
  item,
  now = Date.now(),
}: {
  body: unknown;
  auth: { apiKeyName?: string; createdByUserId?: TUserId };
  item: { privateNotes?: string };
  now?: number;
}) {
  const input = bodyRecord(body);
  const note = (
    optionalRestString(input.note) ??
    optionalRestString(input.privateNote) ??
    optionalRestString(input.text)
  )?.trim();
  if (!note) {
    throw invalidField("note", "note is required.");
  }
  if (note.length > 4000) {
    throw invalidField("note", "note is limited to 4,000 characters.");
  }

  const label = (
    optionalRestString(input.label) ??
    optionalRestString(input.agentLabel) ??
    auth.apiKeyName
  )
    ?.trim()
    .slice(0, 64);
  const timestamp = new Date(now).toISOString();
  const appendedLine = label
    ? `[${timestamp}] ${label}: ${note}`
    : `[${timestamp}] ${note}`;
  const existingNotes = optionalRestString(item.privateNotes);
  const privateNotes = existingNotes?.trim()
    ? `${existingNotes}\n${appendedLine}`
    : appendedLine;

  if (privateNotes.length > 20000) {
    throw invalidField(
      "note",
      "Appending this note would exceed the 20,000 character item private note limit.",
    );
  }

  return {
    patch: {
      privateNotes,
      updatedByUserId: auth.createdByUserId,
      updatedAt: now,
    },
    noteLength: note.length,
  };
}

export type RestItemResearchSource = {
  title?: string;
  url?: string;
  summary?: string;
  status?: string;
  checkedAt?: number;
};

function restItemResearchSourceKey(source: RestItemResearchSource) {
  if (typeof source.url === "string" && source.url.trim()) {
    return `url:${source.url.trim().toLowerCase()}`;
  }
  if (typeof source.title === "string" && source.title.trim()) {
    return `title:${source.title.trim().toLowerCase()}`;
  }
  if (typeof source.summary === "string" && source.summary.trim()) {
    return `summary:${source.summary.trim().toLowerCase()}`;
  }
  return undefined;
}

function normalizedResearchSource(source: unknown) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  return removeUndefined(
    source as Record<string, unknown>,
  ) as RestItemResearchSource;
}

export function mergeRestItemResearchSources(
  existingSources: readonly RestItemResearchSource[] | undefined,
  incomingSources: readonly RestItemResearchSource[] | undefined,
  limit = 25,
) {
  const merged: RestItemResearchSource[] = [];
  const indexByKey = new Map<string, number>();

  const pushSource = (source: unknown) => {
    const normalized = normalizedResearchSource(source);
    if (!normalized) return;
    const key = restItemResearchSourceKey(normalized);
    if (key && indexByKey.has(key)) {
      const index = indexByKey.get(key)!;
      merged[index] = removeUndefined({
        ...merged[index],
        ...normalized,
      }) as RestItemResearchSource;
      return;
    }
    if (key) {
      indexByKey.set(key, merged.length);
    }
    merged.push(normalized);
  };

  for (const source of Array.isArray(existingSources) ? existingSources : []) {
    pushSource(source);
  }
  for (const source of Array.isArray(incomingSources) ? incomingSources : []) {
    pushSource(source);
  }

  return merged.slice(0, Math.max(0, limit));
}

export function restBoxCreateFields({
  auth,
  moveId,
  body,
  now,
}: {
  auth: {
    householdId: unknown;
    createdByUserId?: unknown;
    apiKeyName?: string;
  };
  moveId: unknown;
  body: unknown;
  now: number;
}) {
  const input = bodyRecord(body);
  const code =
    input.code !== undefined && input.code !== null && input.code !== ""
      ? normalizeRestBoxCode(input.code)
      : `API-${now}`;
  if (!code) {
    throw invalidField("code", "Box code must include letters or numbers.");
  }
  return {
    householdId: auth.householdId,
    moveId,
    code,
    label: normalizeOptionalText(optionalRestString(input.label)),
    containerType:
      input.containerType !== undefined
        ? enumRestField("containerType", input.containerType, boxContainerTypes)
        : undefined,
    room: normalizeOptionalText(optionalRestString(input.room)),
    destinationRoom: normalizeOptionalText(
      optionalRestString(input.destinationRoom),
    ),
    destinationSpaceId: normalizeOptionalText(
      optionalRestString(input.destinationSpaceId),
    ),
    description: normalizeOptionalText(optionalRestString(input.description)),
    status:
      input.status !== undefined
        ? enumRestField("status", input.status, boxStatuses)
        : "open",
    ...restAgentAttributionFields(input, auth, { defaultLabel: true }),
    dimensionsIn: parseRestDimensionsIn(input.dimensionsIn),
    estimatedWeightLb: optionalRestNumber(input.estimatedWeightLb),
    actualWeightLb: optionalRestNumber(input.actualWeightLb),
    estimatedVolumeCuFt: optionalRestNumber(input.estimatedVolumeCuFt),
    ...restAssignmentFields(input, now),
    assignmentLocked: false,
    assignmentWarnings: [],
    assignmentHardBlocks: [],
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  };
}

export function restBoxPatch(body: unknown, now = Date.now()) {
  const input = bodyRecord(body);
  const patch: Record<string, unknown> = { updatedAt: now };
  if (input.code !== undefined) {
    const code = normalizeRestBoxCode(input.code);
    if (!code) {
      throw invalidField("code", "Box code must include letters or numbers.");
    }
    patch.code = code;
  }
  if (input.label !== undefined) {
    patch.label = normalizeOptionalText(optionalRestString(input.label));
  }
  if (input.containerType !== undefined) {
    patch.containerType = enumRestField(
      "containerType",
      input.containerType,
      boxContainerTypes,
    );
  }
  if (input.room !== undefined) {
    patch.room = normalizeOptionalText(optionalRestString(input.room));
  }
  if (input.destinationRoom !== undefined) {
    patch.destinationRoom = normalizeOptionalText(
      optionalRestString(input.destinationRoom),
    );
  }
  if (input.destinationSpaceId !== undefined) {
    patch.destinationSpaceId = normalizeOptionalText(
      optionalRestString(input.destinationSpaceId),
    );
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(
      optionalRestString(input.description),
    );
  }
  if (input.status !== undefined) {
    patch.status = enumRestField("status", input.status, boxStatuses);
  }
  if (input.agentLabel !== undefined || input.aiConfidenceScore !== undefined) {
    Object.assign(patch, restAgentAttributionFields(input));
  }
  if (input.dimensionsIn !== undefined) {
    patch.dimensionsIn = parseRestDimensionsIn(input.dimensionsIn);
  }
  if (input.estimatedWeightLb !== undefined) {
    patch.estimatedWeightLb = optionalRestNumber(input.estimatedWeightLb);
  }
  if (input.actualWeightLb !== undefined) {
    patch.actualWeightLb = optionalRestNumber(input.actualWeightLb);
  }
  if (input.estimatedVolumeCuFt !== undefined) {
    patch.estimatedVolumeCuFt = optionalRestNumber(input.estimatedVolumeCuFt);
  }
  Object.assign(patch, restAssignmentFields(input, now));
  return patch;
}

export function restAssignmentFields(
  input: Record<string, unknown>,
  now = Date.now(),
) {
  const patch: Record<string, unknown> = {};
  let changed = false;
  if (input.assignedResourceId !== undefined) {
    patch.assignedResourceId = optionalRestString(input.assignedResourceId);
    changed = true;
  }
  if (input.assignedZoneId !== undefined) {
    patch.assignedZoneId = optionalRestString(input.assignedZoneId);
    changed = true;
  }
  if (input.assignmentOverrideReason !== undefined) {
    patch.assignmentOverrideReason = normalizeOptionalText(
      optionalRestString(input.assignmentOverrideReason),
    );
    changed = true;
  }
  if (!changed) {
    return {};
  }
  patch.assignmentWarnings = [];
  patch.assignmentHardBlocks = [];
  patch.assignmentValidatedAt = now;
  return patch;
}

export function safeRestBox(box: Record<string, unknown>) {
  return {
    boxId: box._id,
    code: box.code,
    label: box.label,
    containerType: box.containerType,
    room: box.room,
    destinationRoom: box.destinationRoom,
    destinationSpaceId: box.destinationSpaceId,
    destinationSpaceName: box.destinationSpaceId
      ? box.destinationRoom
      : undefined,
    status: box.status,
    agentLabel: box.agentLabel,
    aiConfidenceScore: box.aiConfidenceScore,
    dimensionsIn: box.dimensionsIn,
    estimatedWeightLb: box.estimatedWeightLb,
    actualWeightLb: box.actualWeightLb,
    estimatedVolumeCuFt: box.estimatedVolumeCuFt,
    assignedResourceId: box.assignedResourceId,
    assignedZoneId: box.assignedZoneId,
    assignmentLocked: box.assignmentLocked,
    assignmentWarnings: box.assignmentWarnings,
    assignmentHardBlocks: box.assignmentHardBlocks,
    createdAt: box.createdAt,
    updatedAt: box.updatedAt,
  };
}

type RestMovableUnitDimensions = {
  lengthIn?: unknown;
  widthIn?: unknown;
  heightIn?: unknown;
};

type RestMovableUnitItem = Record<string, unknown> & {
  _id: unknown;
  name?: unknown;
  category?: unknown;
  subcategory?: unknown;
  status?: unknown;
  deletedAt?: unknown;
  quantity?: unknown;
  dimensionsIn?: RestMovableUnitDimensions;
  estimatedWeightLb?: unknown;
  estimatedWeightLowLb?: unknown;
  estimatedWeightHighLb?: unknown;
  actualWeightLb?: unknown;
  estimatedVolumeCuFt?: unknown;
  estimatedPackedVolumeCuFt?: unknown;
  weightConfidence?: unknown;
  volumeConfidence?: unknown;
  assignedResourceId?: unknown;
  assignedZoneId?: unknown;
  assignmentLocked?: unknown;
  requiresPersonalTransport?: unknown;
  disposition?: unknown;
  aiTags?: unknown;
};

type RestMovableUnitBox = Record<string, unknown> & {
  _id: unknown;
  code?: unknown;
  label?: unknown;
  archivedAt?: unknown;
  dimensionsIn?: RestMovableUnitDimensions;
  estimatedWeightLb?: unknown;
  actualWeightLb?: unknown;
  estimatedVolumeCuFt?: unknown;
  assignedResourceId?: unknown;
  assignedZoneId?: unknown;
};

type RestMovableUnitBoxItem = Record<string, unknown> & {
  boxId: unknown;
  itemId: unknown;
  quantity?: unknown;
};

type RestMovableUnitMissingField = "weight" | "dimensions" | "volume";

const explicitLooseMovableUnitTags = new Set([
  "movable-unit",
  "loose-item",
  "loose-movable-unit",
  "move-as-is",
]);

const largeMovableCategoryTerms = [
  "large movable unit",
  "furniture",
  "appliance",
  "exercise",
  "fitness",
  "workshop equipment",
  "yard equipment",
  "outdoor equipment",
  "sports equipment",
];

const largeMovableNameTerms = [
  "appliance",
  "armoire",
  "bike",
  "bicycle",
  "bookcase",
  "bookshelf",
  "cabinet",
  "chair",
  "chest",
  "couch",
  "desk",
  "dresser",
  "dryer",
  "elliptical",
  "freezer",
  "fridge",
  "futon",
  "ladder",
  "mattress",
  "mower",
  "piano",
  "planer",
  "refrigerator",
  "saw",
  "shelf",
  "shovel",
  "sofa",
  "table",
  "tool chest",
  "toolbox",
  "treadmill",
  "washer",
  "workbench",
];

type RestMovableUnitExample = {
  kind: "box" | "looseItem";
  boxId?: unknown;
  itemId?: unknown;
  code?: unknown;
  name?: unknown;
};

type RestMovableUnitMeasurementPatchHint = {
  tool: "batch_upsert_movable_units";
  target: Pick<RestMovableUnitExample, "kind" | "boxId" | "itemId" | "code">;
  fieldsToUpdate: RestMovableUnitMissingField[];
};

type RestMovableUnitAssignmentPatchHint = {
  tool: "apply_assignments";
  target: Pick<RestMovableUnitExample, "kind" | "boxId" | "itemId">;
};

type RestMovableUnitGapExample = RestMovableUnitExample & {
  missingFields: RestMovableUnitMissingField[];
  measurementPatchHint: RestMovableUnitMeasurementPatchHint;
};

type RestMovableUnitAssignmentExample = RestMovableUnitExample & {
  assignmentPatchHint: RestMovableUnitAssignmentPatchHint;
};

type RestMovableUnitMeasurementRouteGroup = {
  roomLabel: string;
  unitCount: number;
  missingWeight: number;
  missingDimensions: number;
  missingVolume: number;
  unassigned: number;
  priority: number;
  exampleNames: string[];
  gapExamples: RestMovableUnitGapExample[];
  assignmentExamples: RestMovableUnitAssignmentExample[];
};

export type RestMovableUnitSummary = {
  total: number;
  boxes: number;
  looseItems: number;
  knownWeightLb: number;
  knownVolumeCuFt: number;
  missingWeight: number;
  missingDimensions: number;
  missingVolume: number;
  assigned: number;
  unassigned: number;
  measurementRoute: RestMovableUnitMeasurementRouteGroup[];
  gapExamples: RestMovableUnitGapExample[];
  assignmentExamples: RestMovableUnitAssignmentExample[];
};

export function restMovableUnitSummary({
  boxes,
  items,
  boxItems,
  maxMeasurementRouteGroups = 6,
  maxMeasurementRouteExamplesPerGroup = 3,
  maxGapExamples = 8,
  maxAssignmentExamples = 8,
}: {
  boxes: readonly RestMovableUnitBox[];
  items: readonly RestMovableUnitItem[];
  boxItems: readonly RestMovableUnitBoxItem[];
  maxMeasurementRouteGroups?: number;
  maxMeasurementRouteExamplesPerGroup?: number;
  maxGapExamples?: number;
  maxAssignmentExamples?: number;
}): RestMovableUnitSummary {
  const activeBoxes = boxes.filter((box) => !box.archivedAt);
  const activeItems = items.filter(
    (item) => !item.deletedAt && item.status !== "archived",
  );
  const activeBoxIds = new Set(activeBoxes.map((box) => String(box._id)));
  const activeItemsById = new Map(
    activeItems.map((item) => [String(item._id), item]),
  );
  const boxedItemIds = new Set<string>();
  const boxMemberships = new Map<string, RestMovableUnitBoxItem[]>();

  for (const membership of boxItems) {
    const boxId = String(membership.boxId);
    const itemId = String(membership.itemId);
    if (!activeBoxIds.has(boxId) || !activeItemsById.has(itemId)) continue;
    boxedItemIds.add(itemId);
    const memberships = boxMemberships.get(boxId) ?? [];
    memberships.push(membership);
    boxMemberships.set(boxId, memberships);
  }

  const looseItems = activeItems.filter(
    (item) =>
      !boxedItemIds.has(String(item._id)) && isLooseMovableUnitRestItem(item),
  );
  const summary: RestMovableUnitSummary = {
    total: activeBoxes.length + looseItems.length,
    boxes: activeBoxes.length,
    looseItems: looseItems.length,
    knownWeightLb: 0,
    knownVolumeCuFt: 0,
    missingWeight: 0,
    missingDimensions: 0,
    missingVolume: 0,
    assigned: 0,
    unassigned: 0,
    measurementRoute: [],
    gapExamples: [],
    assignmentExamples: [],
  };
  const measurementRouteGroups =
    new Map<string, RestMovableUnitMeasurementRouteGroup>();

  const recordGap = (
    example: RestMovableUnitExample,
    missingFields: RestMovableUnitMissingField[],
  ) => {
    if (
      missingFields.length &&
      summary.gapExamples.length < Math.max(0, maxGapExamples)
    ) {
      summary.gapExamples.push({
        ...example,
        missingFields,
        measurementPatchHint: movableUnitMeasurementPatchHint(
          example,
          missingFields,
        ),
      });
    }
  };
  const recordAssignmentExample = (example: RestMovableUnitExample) => {
    if (
      summary.assignmentExamples.length < Math.max(0, maxAssignmentExamples)
    ) {
      summary.assignmentExamples.push({
        ...example,
        assignmentPatchHint: movableUnitAssignmentPatchHint(example),
      });
    }
  };
  const recordMeasurementRoute = ({
    example,
    missingFields,
    assignmentNeeded,
    roomLabel,
  }: {
    example: RestMovableUnitExample;
    missingFields: RestMovableUnitMissingField[];
    assignmentNeeded: boolean;
    roomLabel: string;
  }) => {
    if (!missingFields.length && !assignmentNeeded) return;

    const group =
      measurementRouteGroups.get(roomLabel) ??
      {
        roomLabel,
        unitCount: 0,
        missingWeight: 0,
        missingDimensions: 0,
        missingVolume: 0,
        unassigned: 0,
        priority: 0,
        exampleNames: [],
        gapExamples: [],
        assignmentExamples: [],
      };

    group.unitCount += 1;
    if (missingFields.includes("weight")) group.missingWeight += 1;
    if (missingFields.includes("dimensions")) group.missingDimensions += 1;
    if (missingFields.includes("volume")) group.missingVolume += 1;
    if (assignmentNeeded) group.unassigned += 1;
    if (
      example.name &&
      group.exampleNames.length < maxMeasurementRouteExamplesPerGroup
    ) {
      group.exampleNames.push(String(example.name));
    }
    if (
      missingFields.length &&
      group.gapExamples.length < maxMeasurementRouteExamplesPerGroup
    ) {
      group.gapExamples.push({
        ...example,
        missingFields,
        measurementPatchHint: movableUnitMeasurementPatchHint(
          example,
          missingFields,
        ),
      });
    }
    if (
      assignmentNeeded &&
      group.assignmentExamples.length < maxMeasurementRouteExamplesPerGroup
    ) {
      group.assignmentExamples.push({
        ...example,
        assignmentPatchHint: movableUnitAssignmentPatchHint(example),
      });
    }
    group.priority =
      group.unassigned * 50 +
      group.missingWeight * 40 +
      group.missingDimensions * 30 +
      group.missingVolume * 20 +
      group.unitCount;

    measurementRouteGroups.set(roomLabel, group);
  };

  for (const box of activeBoxes) {
    const memberships = boxMemberships.get(String(box._id)) ?? [];
    const contentsWeight = sumMembershipWeight(memberships, activeItemsById);
    const weight =
      finiteNumber(box.actualWeightLb) ??
      finiteNumber(box.estimatedWeightLb) ??
      contentsWeight;
    const volume =
      finiteNumber(box.estimatedVolumeCuFt) ??
      volumeFromDimensions(box.dimensionsIn);
    const missingFields = missingMovableUnitFields({
      weight,
      dimensionsIn: box.dimensionsIn,
      volume,
    });

    addKnownValues(summary, { weight, volume });
    const assigned = addAssignment(summary, box);
    addMissingCounts(summary, missingFields);
    const example = {
      kind: "box" as const,
      boxId: box._id,
      code: box.code,
      name: box.label,
    };
    if (!assigned) {
      recordAssignmentExample(example);
    }
    recordGap(example, missingFields);
    recordMeasurementRoute({
      example,
      missingFields,
      assignmentNeeded: !assigned,
      roomLabel: movableUnitRoomLabel(box),
    });
  }

  for (const item of looseItems) {
    const quantity = quantityMultiplier(item.quantity);
    const weight = multiplyOptional(
      finiteNumber(item.actualWeightLb) ?? finiteNumber(item.estimatedWeightLb),
      quantity,
    );
    const perUnitVolume =
      finiteNumber(item.estimatedVolumeCuFt) ??
      finiteNumber(item.estimatedPackedVolumeCuFt) ??
      volumeFromDimensions(item.dimensionsIn);
    const volume = multiplyOptional(perUnitVolume, quantity);
    const missingFields = missingMovableUnitFields({
      weight,
      dimensionsIn: item.dimensionsIn,
      volume,
    });

    addKnownValues(summary, { weight, volume });
    const assigned = addAssignment(summary, item);
    addMissingCounts(summary, missingFields);
    const example = {
      kind: "looseItem" as const,
      itemId: item._id,
      name: item.name,
    };
    if (!assigned) {
      recordAssignmentExample(example);
    }
    recordGap(example, missingFields);
    recordMeasurementRoute({
      example,
      missingFields,
      assignmentNeeded: !assigned,
      roomLabel: movableUnitRoomLabel(item),
    });
  }

  summary.knownWeightLb = roundEstimate(summary.knownWeightLb);
  summary.knownVolumeCuFt = roundEstimate(summary.knownVolumeCuFt);
  summary.measurementRoute = Array.from(measurementRouteGroups.values())
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.roomLabel.localeCompare(b.roomLabel);
    })
    .slice(0, Math.max(0, maxMeasurementRouteGroups));

  return summary;
}

function movableUnitRoomLabel(
  unit: RestMovableUnitBox | RestMovableUnitItem,
) {
  return (
    normalizeOptionalText(optionalRestString(unit.room)) ??
    normalizeOptionalText(optionalRestString(unit.destinationRoom)) ??
    "Unassigned room"
  );
}

function movableUnitMeasurementPatchHint(
  example: RestMovableUnitExample,
  missingFields: RestMovableUnitMissingField[],
): RestMovableUnitMeasurementPatchHint {
  return {
    tool: "batch_upsert_movable_units",
    target: {
      kind: example.kind,
      ...removeUndefined({
        boxId: example.boxId,
        itemId: example.itemId,
        code: example.code,
      }),
    },
    fieldsToUpdate: missingFields,
  };
}

function movableUnitAssignmentPatchHint(
  example: RestMovableUnitExample,
): RestMovableUnitAssignmentPatchHint {
  return {
    tool: "apply_assignments",
    target: {
      kind: example.kind,
      ...removeUndefined({
        boxId: example.boxId,
        itemId: example.itemId,
      }),
    },
  };
}

export function isLooseMovableUnitRestItem(item: RestMovableUnitItem) {
  if (item.deletedAt || item.status === "archived") {
    return false;
  }
  if (
    restStringArray(item.aiTags).some((tag) =>
      explicitLooseMovableUnitTags.has(tag.trim().toLowerCase()),
    )
  ) {
    return true;
  }
  if (item.assignedResourceId || item.assignedZoneId || item.assignmentLocked) {
    return true;
  }
  if (
    item.requiresPersonalTransport === true ||
    item.disposition === "personalTransport"
  ) {
    return true;
  }

  const categoryText = restSearchableText([item.category, item.subcategory]);
  if (largeMovableCategoryTerms.some((term) => categoryText.includes(term))) {
    return true;
  }

  const nameText = restSearchableText([
    item.name,
    item.category,
    item.subcategory,
  ]);
  if (largeMovableNameTerms.some((term) => nameText.includes(term))) {
    return true;
  }

  const quantity = quantityMultiplier(item.quantity);
  const weight = multiplyOptional(
    finiteNumber(item.actualWeightLb) ?? finiteNumber(item.estimatedWeightLb),
    quantity,
  );
  if (weight !== undefined && weight >= 25) {
    return true;
  }

  const volume = multiplyOptional(
    finiteNumber(item.estimatedVolumeCuFt) ??
      finiteNumber(item.estimatedPackedVolumeCuFt) ??
      volumeFromDimensions(item.dimensionsIn),
    quantity,
  );
  if (volume !== undefined && volume >= 4) {
    return true;
  }

  return [
    finiteNumber(item.dimensionsIn?.lengthIn),
    finiteNumber(item.dimensionsIn?.widthIn),
    finiteNumber(item.dimensionsIn?.heightIn),
  ].some((dimension) => dimension !== undefined && dimension >= 36);
}

function restStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function restSearchableText(values: readonly unknown[]) {
  return values
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function sumMembershipWeight(
  memberships: readonly RestMovableUnitBoxItem[],
  activeItemsById: ReadonlyMap<string, RestMovableUnitItem>,
) {
  let total = 0;
  let hasValue = false;
  for (const membership of memberships) {
    const item = activeItemsById.get(String(membership.itemId));
    if (!item) continue;
    const estimate = estimateItem({
      name: typeof item.name === "string" ? item.name : "Item",
      category: typeof item.category === "string" ? item.category : undefined,
      quantity: quantityMultiplier(membership.quantity),
      dimensionsIn: normalizedDimensions(item.dimensionsIn),
      estimatedWeightLb: finiteNumber(item.estimatedWeightLb),
      estimatedWeightLowLb: finiteNumber(item.estimatedWeightLowLb),
      estimatedWeightHighLb: finiteNumber(item.estimatedWeightHighLb),
      actualWeightLb: finiteNumber(item.actualWeightLb),
      estimatedVolumeCuFt: finiteNumber(item.estimatedVolumeCuFt),
      estimatedPackedVolumeCuFt: finiteNumber(item.estimatedPackedVolumeCuFt),
      weightConfidence: estimateConfidence(item.weightConfidence),
      volumeConfidence: estimateConfidence(item.volumeConfidence),
    });
    if (estimate.weight?.value !== undefined) {
      total += estimate.weight.value;
      hasValue = true;
    }
  }
  return hasValue ? roundEstimate(total) : undefined;
}

function addKnownValues(
  summary: RestMovableUnitSummary,
  values: { weight?: number; volume?: number },
) {
  if (values.weight !== undefined) summary.knownWeightLb += values.weight;
  if (values.volume !== undefined) summary.knownVolumeCuFt += values.volume;
}

function addAssignment(
  summary: RestMovableUnitSummary,
  unit: {
    assignedResourceId?: unknown;
    assignedZoneId?: unknown;
    requiresPersonalTransport?: unknown;
    disposition?: unknown;
  },
) {
  if (
    unit.assignedResourceId ||
    unit.assignedZoneId ||
    unit.requiresPersonalTransport === true ||
    unit.disposition === "personalTransport"
  ) {
    summary.assigned += 1;
    return true;
  } else {
    summary.unassigned += 1;
    return false;
  }
}

function addMissingCounts(
  summary: RestMovableUnitSummary,
  missingFields: readonly RestMovableUnitMissingField[],
) {
  if (missingFields.includes("weight")) summary.missingWeight += 1;
  if (missingFields.includes("dimensions")) summary.missingDimensions += 1;
  if (missingFields.includes("volume")) summary.missingVolume += 1;
}

function missingMovableUnitFields({
  weight,
  dimensionsIn,
  volume,
}: {
  weight?: number;
  dimensionsIn?: RestMovableUnitDimensions;
  volume?: number;
}) {
  const missingFields: RestMovableUnitMissingField[] = [];
  if (weight === undefined) missingFields.push("weight");
  if (!hasCompleteDimensions(dimensionsIn)) missingFields.push("dimensions");
  if (volume === undefined) missingFields.push("volume");
  return missingFields;
}

function hasCompleteDimensions(
  dimensions: RestMovableUnitDimensions | undefined,
) {
  return (
    finiteNumber(dimensions?.lengthIn) !== undefined &&
    finiteNumber(dimensions?.widthIn) !== undefined &&
    finiteNumber(dimensions?.heightIn) !== undefined
  );
}

function volumeFromDimensions(
  dimensions: RestMovableUnitDimensions | undefined,
) {
  const normalized = normalizedDimensions(dimensions);
  if (
    normalized.lengthIn === undefined ||
    normalized.widthIn === undefined ||
    normalized.heightIn === undefined
  ) {
    return undefined;
  }
  return roundEstimate(
    (normalized.lengthIn * normalized.widthIn * normalized.heightIn) / 1728,
  );
}

function normalizedDimensions(
  dimensions: RestMovableUnitDimensions | undefined,
) {
  return {
    lengthIn: finiteNumber(dimensions?.lengthIn),
    widthIn: finiteNumber(dimensions?.widthIn),
    heightIn: finiteNumber(dimensions?.heightIn),
  };
}

function quantityMultiplier(value: unknown) {
  const quantity = finiteNumber(value);
  return quantity !== undefined && quantity > 0 ? quantity : 1;
}

function multiplyOptional(value: number | undefined, multiplier: number) {
  return value === undefined ? undefined : roundEstimate(value * multiplier);
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

const estimateConfidenceValues = new Set<EstimateConfidence>([
  "none",
  "low",
  "medium",
  "high",
  "manual",
  "actual",
]);

function estimateConfidence(value: unknown) {
  return typeof value === "string" &&
    estimateConfidenceValues.has(value as EstimateConfidence)
    ? (value as EstimateConfidence)
    : undefined;
}

function enumRestField<T extends string>(
  path: string,
  value: unknown,
  validValues: readonly T[],
): T {
  if (typeof value === "string" && validValues.includes(value as T)) {
    return value as T;
  }
  throw invalidField(path, `Unsupported ${path}.`, validValues);
}

export function moveIdFromRestRequest({
  segments,
  body,
  query,
}: {
  segments: string[];
  body?: unknown;
  query: Record<string, string>;
}) {
  if (segments[0] === "moves" && segments[1] === "setup") {
    return moveIdFromRestBodyOrQuery({ body, query });
  }
  if (segments[0] === "moves" && segments[1]) {
    return segments[1];
  }
  if (segments[0] === "moves") {
    return undefined;
  }

  return moveIdFromRestBodyOrQuery({ body, query });
}

export function moveIdFromRestBodyOrQuery({
  body,
  query,
}: {
  body?: unknown;
  query: Record<string, string>;
}) {
  const bodyMoveId = bodyRecord(body).moveId;
  if (typeof bodyMoveId === "string" && bodyMoveId) {
    return bodyMoveId;
  }
  return query.moveId || undefined;
}

export function restError({
  status,
  code,
  message,
  fields,
}: {
  status: number;
  code: string;
  message: string;
  fields?: RestErrorField[];
}): RestResponse {
  return {
    status,
    body: {
      error: {
        code,
        message,
        ...(fields ? { fields } : {}),
      },
    },
  };
}

export type RestResponseErrorSummary = {
  status: number;
  code?: string;
  message: string;
  fields?: unknown;
};

export function restResponseErrorSummary(
  response: RestResponse | null | undefined,
  fallbackMessage = "Nested REST request failed.",
): RestResponseErrorSummary | null {
  if (!response || response.status < 400) {
    return null;
  }
  const body = bodyRecord(response.body);
  const error = bodyRecord(body.error);
  const message =
    optionalRestString(error.message) ??
    `${fallbackMessage} HTTP ${response.status}.`;
  return {
    status: response.status,
    code: optionalRestString(error.code),
    message,
    fields: Array.isArray(error.fields) ? error.fields : undefined,
  };
}

export function restMovableUnitLooseItemFailureRows({
  units,
  error,
}: {
  units: Array<{ unit: Record<string, unknown>; unitIndex: number }>;
  error: RestResponseErrorSummary | null | undefined;
}) {
  if (!error) {
    return null;
  }
  return units.map(({ unit, unitIndex }, itemIndex) =>
    removeUndefined({
      unitIndex,
      itemIndex,
      ok: false,
      action: optionalRestString(unit.itemId) ? "update" : "upsert",
      itemId: optionalRestString(unit.itemId),
      name: optionalRestString(unit.name),
      externalSource: optionalRestString(unit.externalSource),
      externalId: optionalRestString(unit.externalId),
      error: error.message,
      errorCode: error.code,
      errorStatus: error.status,
    }),
  );
}

export function restErrorFromUnknown(error: unknown): RestResponse {
  if (error instanceof RestApiError) {
    return restError({
      status: error.status,
      code: error.code,
      message: error.message,
      fields: error.fields,
    });
  }
  return restError({
    status: 500,
    code: "internal_error",
    message: "Internal server error.",
  });
}

export function restOk(body: unknown, status = 200): RestResponse {
  return { status, body };
}

export function restRateLimitWindowStart(
  now: number,
  windowMs = restApiRateLimit.windowMs,
) {
  return Math.floor(now / windowMs) * windowMs;
}

export function restRateLimitResult({
  count,
  now,
  limit = restApiRateLimit.limit,
  windowStart,
  windowMs = restApiRateLimit.windowMs,
}: {
  count: number;
  now: number;
  limit?: number;
  windowStart: number;
  windowMs?: number;
}): RestRateLimitResult {
  const resetAt = windowStart + windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSeconds,
  };
}

export function restRateLimitHeaders(result: RestRateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed
      ? {}
      : { "Retry-After": String(result.retryAfterSeconds) }),
  };
}

export function withRestRateLimitHeaders(
  response: RestResponse,
  result: RestRateLimitResult,
): RestResponse {
  return {
    ...response,
    headers: {
      ...response.headers,
      ...restRateLimitHeaders(result),
    },
  };
}

export function restRateLimited(result: RestRateLimitResult): RestResponse {
  return withRestRateLimitHeaders(
    restError({
      status: 429,
      code: "rate_limited",
      message: `API rate limit exceeded. Retry after ${result.retryAfterSeconds} seconds.`,
    }),
    result,
  );
}

export function paginationFromQuery(query: Record<string, string>) {
  const limit = clampNumber(Number(query.limit || "50"), 1, 100);
  const offsetInput = query.offset ?? query.cursor;
  const cursor = offsetInput ? Number(offsetInput) : 0;
  return {
    limit,
    cursor: Number.isFinite(cursor) && cursor > 0 ? Math.floor(cursor) : 0,
  };
}

export function paginate<T>(rows: T[], query: Record<string, string>) {
  const { limit, cursor } = paginationFromQuery(query);
  const page = rows.slice(cursor, cursor + limit);
  const nextCursor =
    cursor + limit < rows.length ? String(cursor + limit) : null;
  return {
    data: page,
    page: {
      limit,
      offset: cursor,
      nextCursor,
      nextOffset: nextCursor,
      total: rows.length,
    },
  };
}

export function requiredScopesForRestRoute({
  method,
  segments,
}: {
  method: RestMethod;
  segments: string[];
}): ApiKeyScope[] {
  if (segments[0] === "me" && method === "GET") {
    return ["moves/read"];
  }
  if (segments[0] === "uploads" && method === "POST") {
    return ["photos/write"];
  }
  if (
    (segments[0] === "photos" || segments[0] === "images") &&
    method === "GET"
  ) {
    return ["inventory/read"];
  }
  if (
    (segments[0] === "photos" || segments[0] === "images") &&
    method !== "GET"
  ) {
    return ["photos/write"];
  }
  if (segments[0] === "plans") {
    return method === "GET" ? ["plans/read"] : ["plans/write"];
  }
  if (segments[0] === "households" && segments[2] === "members") {
    return ["members/manage"];
  }
  if (segments[0] === "items") {
    return method === "GET" ? ["inventory/read"] : ["inventory/write"];
  }
  if (segments[0] === "boxes") {
    return method === "GET" ? ["inventory/read"] : ["inventory/write"];
  }
  if (segments[0] === "exports" && method === "GET") {
    return ["exports/read"];
  }
  if (segments[0] !== "moves") return [];
  if (segments[1] === "setup" && method === "POST") {
    return ["moves/read", "moves/write", "inventory/write"];
  }
  if (segments.length === 1 && method === "POST") {
    return ["moves/write"];
  }
  if (
    method === "POST" &&
    segments[2] === "assignments" &&
    segments[3] === "suggest"
  ) {
    return ["moves/read", "inventory/read"];
  }
  if (method === "GET") {
    if (segments[2] === "summary") {
      return ["moves/read", "inventory/read", "exports/read"];
    }
    if (segments[2] === "questions") {
      return ["moves/read", "inventory/read"];
    }
    if (segments[2] === "move-day") {
      return ["moves/read", "inventory/read"];
    }
    if (segments[2] === "capacity-report") {
      return ["moves/read", "inventory/read"];
    }
    if (segments[2] === "agent-context") {
      return ["moves/read", "inventory/read", "plans/read"];
    }
    if (segments.includes("ingestion-queue")) {
      return ["inventory/read"];
    }
    if (segments.includes("exports")) {
      return ["exports/read"];
    }
    if (segments.includes("share-links")) {
      return ["exports/read"];
    }
    if (segments.includes("documentation-profiles")) {
      return ["exports/read"];
    }
    if (segments.includes("people")) {
      return ["moves/read"];
    }
    if (segments.includes("spaces")) {
      return ["moves/read"];
    }
    if (segments.includes("sale-listings")) {
      return ["inventory/read"];
    }
    if (
      segments.includes("items") ||
      segments.includes("planned-items") ||
      segments.includes("movable-units") ||
      segments.includes("boxes")
    ) {
      return ["inventory/read"];
    }
    if (segments.includes("assignments")) {
      return ["inventory/read"];
    }
    if (segments.includes("box-items")) {
      return ["inventory/read"];
    }
    if (segments.includes("planning-suggestions")) {
      return ["inventory/read"];
    }
    if (
      segments.includes("ai-jobs") ||
      segments.includes("ai-text-suggestions") ||
      segments.includes("ai-photo-suggestions")
    ) {
      return ["inventory/read"];
    }
    if (segments.includes("photos")) {
      return ["inventory/read"];
    }
    return ["moves/read"];
  }
  if (
    method === "POST" ||
    method === "PUT" ||
    method === "PATCH" ||
    method === "DELETE"
  ) {
    if (segments.includes("exports")) {
      return ["exports/create"];
    }
    if (segments.includes("share-links")) {
      return ["exports/create"];
    }
    if (segments.includes("documentation-profiles")) {
      return ["exports/create"];
    }
    if (segments.includes("people")) {
      return ["moves/write"];
    }
    if (segments.includes("spaces")) {
      return ["moves/write"];
    }
    if (segments.includes("sale-listings")) {
      return ["inventory/write"];
    }
    if (
      segments.includes("items") ||
      segments.includes("planned-items") ||
      segments.includes("movable-units") ||
      segments.includes("boxes")
    ) {
      return ["inventory/write"];
    }
    if (segments.includes("assignments")) {
      return ["inventory/write"];
    }
    if (segments.includes("box-items")) {
      return ["inventory/write"];
    }
    if (segments.includes("planning-suggestions")) {
      return ["inventory/write"];
    }
    if (
      segments.includes("ai-text-suggestions") ||
      segments.includes("ai-photo-suggestions")
    ) {
      return ["inventory/write"];
    }
    if (segments.includes("ingestion-queue")) {
      return ["inventory/write"];
    }
    return ["moves/write"];
  }
  return [];
}

export function requestHashInput({
  method,
  path,
  body,
}: Pick<RestRequestInput, "method" | "path" | "body">) {
  return JSON.stringify({
    method,
    path,
    body: stableJson(body ?? null),
  });
}

function stableJson(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableJson(entry)]),
  );
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.floor(value), min), max);
}

const actorKinds = ["person", "connected-ai", "api-credential", "system"] as const;
const transports = ["web", "mcp", "rest", "gateway", "internal", "unknown"] as const;
const sources = ["manual", "file", "url", "screenshot", "device", "system", "unknown"] as const;

export type VerifiedActor = { kind: (typeof actorKinds)[number]; ref: string };
export type Actor = VerifiedActor | { kind: "unknown" };
export type Transport = (typeof transports)[number];
export type Source = (typeof sources)[number];
export type EvidenceRef =
  | { kind: "record"; ref: string }
  | { kind: "version"; ref: string; version: number };

export type RecordKey = { scopeRef: string; kind: string; ref: string };
export type EventMetadata = {
  record: RecordKey;
  committedAt: number;
  operation: string;
  fields: readonly string[];
  operationRef?: string;
};

// Build this only from the native write guard or independently verified stored facts.
export type ServerAttribution = {
  actor?: Actor | undefined;
  transport?: Transport | undefined;
  source?: Source | undefined;
  evidence?: EvidenceRef | undefined;
};

export type HistoryEvent = EventMetadata & {
  actor: Actor;
  transport: Transport;
  source: Source;
  evidence?: EvidenceRef;
};

export type EventContract = {
  recordKind: string;
  operations: ReadonlySet<string>;
  fields: ReadonlySet<string>;
};

export const MAX_EVENT_FIELDS = 16;
export const MAX_REF_LENGTH = 128;

function object(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
}

function opaqueRef(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_REF_LENGTH &&
    /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(value);
}

/** Format a connection already verified by the adapter against the exact historical grant. */
export async function verifiedConnectionByline(
  site: string,
  scopeRef: string,
  grantRef: string,
): Promise<string | undefined> {
  if (!mappedKey(site) || !opaqueRef(scopeRef) || !opaqueRef(grantRef)) return undefined;
  const input = new TextEncoder().encode(JSON.stringify(["record-history:connection:v1", site, scopeRef, grantRef]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  const code = Array.from(digest.subarray(0, 6), byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `Connected AI · Connection ${code}`;
}

function mappedKey(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 &&
    /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value);
}

function oneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return choices.some((choice) => choice === value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function shapeActor(value: unknown): Actor {
  const actor = object(value);
  if (actor && oneOf(actor.kind, actorKinds) && opaqueRef(actor.ref)) {
    return { kind: actor.kind, ref: actor.ref };
  }
  return { kind: "unknown" };
}

function shapeEvidence(value: unknown): EvidenceRef | undefined {
  const evidence = object(value);
  if (!evidence || !opaqueRef(evidence.ref)) return undefined;
  if (evidence.kind === "version" && positiveInteger(evidence.version)) {
    return { kind: "version", ref: evidence.ref, version: evidence.version };
  }
  if (evidence.kind === "record" && evidence.version === undefined) {
    return { kind: "record", ref: evidence.ref };
  }
}

/** Shape a single material change using server-selected metadata and a static slice contract. */
export function shapeHistoryEvent(
  contract: EventContract,
  metadata: unknown,
  server?: ServerAttribution,
): HistoryEvent | null {
  const input = object(metadata);
  const record = object(input?.record);
  if (!input || !record || !opaqueRef(record.scopeRef) || !opaqueRef(record.ref) ||
      !mappedKey(record.kind) || record.kind !== contract.recordKind) return null;

  const { committedAt, operation, fields, operationRef } = input;
  if (!positiveInteger(committedAt) || committedAt > 8_640_000_000_000_000 ||
      !mappedKey(operation) || !contract.operations.has(operation) ||
      !Array.isArray(fields) || fields.length === 0 || fields.length > MAX_EVENT_FIELDS ||
      (operationRef !== undefined && !opaqueRef(operationRef))) return null;

  const changedFields = new Set<string>();
  for (const field of fields) {
    if (!mappedKey(field) || !contract.fields.has(field)) return null;
    changedFields.add(field);
  }

  const evidence = shapeEvidence(server?.evidence);
  return {
    record: { scopeRef: record.scopeRef, kind: record.kind, ref: record.ref },
    committedAt,
    operation,
    fields: [...changedFields],
    ...(operationRef === undefined ? {} : { operationRef }),
    actor: shapeActor(server?.actor),
    transport: oneOf(server?.transport, transports) ? server.transport : "unknown",
    source: oneOf(server?.source, sources) ? server.source : "unknown",
    ...(evidence === undefined ? {} : { evidence }),
  };
}

const actorLabels: Record<Actor["kind"], string> = {
  person: "Person",
  "connected-ai": "Connected AI",
  "api-credential": "API credential",
  system: "System",
  unknown: "Editor not recorded",
};

const evidenceStates = ["available", "deleted", "unavailable", "unknown"] as const;
export type EvidenceState = (typeof evidenceStates)[number];

type Resolution<T> = T | undefined | Promise<T | undefined>;

export type HistoryReadContext = {
  visibleFields: ReadonlySet<string>;
  // Return plain display text already cleared for this viewer and record.
  resolveActorLabel?: (record: RecordKey, actor: VerifiedActor) => Resolution<string>;
  // Resolve this exact ref/version under current access. Disclose deletion only if permitted.
  resolveEvidence?: (record: RecordKey, evidence: EvidenceRef) => Resolution<EvidenceState>;
};

export type HistoryRow = {
  committedAt: number;
  operation: string;
  fields: string[];
  actor: { kind: Actor["kind"]; label: string };
  transport: Transport;
  source: Source;
  evidence: EvidenceState;
};

function plainLabel(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 80 || /[<>\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)) {
    return undefined;
  }
  return value.trim() || undefined;
}

/** Call only for shaped events after native record and event access checks. */
export async function projectHistoryRow(
  event: HistoryEvent,
  context: HistoryReadContext,
): Promise<HistoryRow | null> {
  const fields = event.fields.filter((field) => context.visibleFields.has(field));
  if (fields.length === 0) return null;

  // The common event cannot establish which changed field the provenance applies to.
  const showProvenance = fields.length === event.fields.length;
  const actor = showProvenance ? event.actor : { kind: "unknown" } as const;
  const label = actor.kind === "unknown" ? undefined :
    plainLabel(await context.resolveActorLabel?.(event.record, actor));
  const evidence = showProvenance && event.evidence ?
    await context.resolveEvidence?.(event.record, event.evidence) : undefined;

  return {
    committedAt: event.committedAt,
    operation: event.operation,
    fields,
    actor: { kind: actor.kind, label: showProvenance ? label ?? actorLabels[actor.kind] : "Editor unavailable" },
    transport: showProvenance ? event.transport : "unknown",
    source: showProvenance ? event.source : "unknown",
    evidence: oneOf(evidence, evidenceStates) ? evidence : "unknown",
  };
}

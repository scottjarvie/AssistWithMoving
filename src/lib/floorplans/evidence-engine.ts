import type {
  FloorplanCanonicalSubject,
  FloorplanConfidence,
  FloorplanDraftState,
  FloorplanEvidenceGraph,
  FloorplanGapPriority,
  FloorplanMeasurement,
  FloorplanObservation,
  FloorplanSolveDiagnostic,
  FloorplanSubjectKind,
} from "@/lib/floorplans/types";

const confidenceRank: Record<FloorplanConfidence, number> = {
  conflict: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const geometryObservationTypes = new Set([
  "roomName",
  "wallSegment",
  "opening",
  "door",
  "doorway",
  "doorlessPassage",
  "window",
  "fixture",
  "closet",
  "hall",
  "exteriorStructure",
  "patio",
  "carport",
  "shed",
  "lotFeature",
]);

const floatingObservationTypes = new Set([
  "opening",
  "door",
  "doorway",
  "doorlessPassage",
  "window",
  "fixture",
]);

export function buildFloorplanSubjects({
  observations,
  relationships,
  measurements,
}: Pick<FloorplanEvidenceGraph, "observations" | "relationships" | "measurements">) {
  const activeObservations = observations.filter(isActiveGraphRecord);
  const activeRelationships = relationships.filter(isActiveGraphRecord);
  const activeMeasurements = measurements.filter(isActiveMeasurement);
  const clusters = subjectClusters({
    observations: activeObservations,
    relationships: activeRelationships,
    measurements: activeMeasurements,
  });
  const subjects = new Map<string, FloorplanCanonicalSubject>();

  for (const seed of clusters.seeds) {
    const subject = ensureSubject(subjects, {
      subjectKey: seed.subjectKey,
      subjectLabel: seed.subjectLabel,
      kind: seed.kind,
      confidence: seed.confidence,
    });
    subject.memberSubjectKeys = seed.memberSubjectKeys;
  }

  for (const observation of activeObservations) {
    if (!observation.subjectKey) continue;
    const canonicalKey =
      clusters.canonicalKeyBySubjectKey.get(observation.subjectKey) ??
      observation.subjectKey;
    const subject = ensureSubject(subjects, {
      subjectKey: canonicalKey,
      subjectLabel:
        clusters.seedByCanonicalKey.get(canonicalKey)?.subjectLabel ??
        observation.subjectLabel ??
        observation.title,
      kind: observation.subjectKind ?? subjectKindFromObservation(observation),
      confidence: observation.confidence,
    });
    subject.observationIds.push(observation.id);
    subject.sourceLabels.push(observation.sourceLabel);
    subject.hasGeometrySeed =
      subject.hasGeometrySeed || geometryObservationTypes.has(observation.observationType);
    mergeConfidence(subject, observation.confidence);
    if (observation.notes) {
      subject.notes = [...(subject.notes ?? []), observation.notes];
    }
  }

  for (const measurement of activeMeasurements) {
    const canonicalKey =
      clusters.canonicalKeyBySubjectKey.get(measurement.subjectKey) ??
      measurement.subjectKey;
    const subject = ensureSubject(subjects, {
      subjectKey: canonicalKey,
      subjectLabel:
        clusters.seedByCanonicalKey.get(canonicalKey)?.subjectLabel ??
        measurement.subjectLabel,
      kind: subjectKindFromMeasurement(measurement),
      confidence: measurement.confidence,
    });
    subject.measurementIds.push(measurement.id);
    subject.sourceLabels.push(
      ...measurement.provenance.map((source) => source.sourceLabel),
    );
    subject.areaRole = subject.areaRole ?? measurement.areaRole;
    subject.knownMeasurementCount += measurement.kind === "known" ? 1 : 0;
    subject.assumptionMeasurementCount +=
      measurement.kind === "assumption" || measurement.kind === "range" ? 1 : 0;
    subject.hasGeometrySeed =
      subject.hasGeometrySeed ||
      ["width", "depth", "span", "openingWidth", "wallThickness"].includes(
        measurement.measurementType,
      );
    mergeConfidence(subject, measurement.confidence);
  }

  for (const relationship of activeRelationships) {
    const fromKey =
      clusters.canonicalKeyBySubjectKey.get(relationship.fromSubjectKey) ??
      relationship.fromSubjectKey;
    const toKey =
      clusters.canonicalKeyBySubjectKey.get(relationship.toSubjectKey) ??
      relationship.toSubjectKey;
    const from = ensureSubject(subjects, {
      subjectKey: fromKey,
      subjectLabel:
        clusters.seedByCanonicalKey.get(fromKey)?.subjectLabel ??
        relationship.fromSubjectLabel,
      kind: "unknown",
      confidence: relationship.confidence,
    });
    const to =
      fromKey === toKey
        ? from
        : ensureSubject(subjects, {
            subjectKey: toKey,
            subjectLabel:
              clusters.seedByCanonicalKey.get(toKey)?.subjectLabel ??
              relationship.toSubjectLabel,
            kind: "unknown",
            confidence: relationship.confidence,
          });
    from.relationshipIds.push(relationship.id);
    if (to !== from) {
      to.relationshipIds.push(relationship.id);
    }
    from.sourceLabels.push(...relationship.provenance.map((source) => source.sourceLabel));
    if (to !== from) {
      to.sourceLabels.push(...relationship.provenance.map((source) => source.sourceLabel));
    }
    if (relationship.relationshipType === "countsTowardArea") {
      from.countsTowardArea = true;
    }
    if (relationship.relationshipType === "excludedFromArea") {
      from.countsTowardArea = false;
    }
    mergeConfidence(from, relationship.confidence);
    mergeConfidence(to, relationship.confidence);
  }

  return [...subjects.values()]
    .map((subject) => ({
      ...subject,
      observationIds: unique(subject.observationIds),
      relationshipIds: unique(subject.relationshipIds),
      measurementIds: unique(subject.measurementIds),
      sourceLabels: unique(subject.sourceLabels),
      memberSubjectKeys: unique(subject.memberSubjectKeys ?? [subject.subjectKey]).sort(),
      notes: unique(subject.notes ?? []),
    }))
    .sort((left, right) => left.subjectLabel.localeCompare(right.subjectLabel));
}

export function validateFloorplanEvidenceGraph(
  graph: Pick<FloorplanEvidenceGraph, "observations" | "relationships" | "measurements">,
) {
  const diagnostics: FloorplanSolveDiagnostic[] = [];
  const subjects = buildFloorplanSubjects(graph);
  const subjectKeys = new Set(
    subjects.flatMap((subject) => subject.memberSubjectKeys ?? [subject.subjectKey]),
  );
  const relationshipSubjectKeys = new Set(
    graph.relationships
      .filter(isActiveGraphRecord)
      .flatMap((relationship) => [
        relationship.fromSubjectKey,
        relationship.toSubjectKey,
      ]),
  );

  if (!graph.observations.some(isActiveGraphRecord)) {
    diagnostics.push({
      id: "no-observations",
      severity: "warning",
      title: "No extracted observations yet",
      detail:
        "The workbench needs AI/user observations before it can honestly build a floorplan.",
    });
  }

  for (const relationship of graph.relationships.filter(isActiveGraphRecord)) {
    if (!subjectKeys.has(relationship.fromSubjectKey)) {
      diagnostics.push({
        id: `relationship-${relationship.id}-missing-from`,
        severity: "warning",
        title: "Relationship references an unknown subject",
        detail: `${relationship.fromSubjectLabel} is used in a relationship but has no observation or measurement record.`,
      });
    }
    if (!subjectKeys.has(relationship.toSubjectKey)) {
      diagnostics.push({
        id: `relationship-${relationship.id}-missing-to`,
        severity: "warning",
        title: "Relationship references an unknown subject",
        detail: `${relationship.toSubjectLabel} is used in a relationship but has no observation or measurement record.`,
      });
    }
  }

  for (const observation of graph.observations.filter(isActiveGraphRecord)) {
    if (!observation.provenance.length) {
      diagnostics.push({
        id: `observation-${observation.id}-no-provenance`,
        severity: "conflict",
        title: "Observation has no provenance",
        detail: `${observation.title} needs a source image, note, user edit, agent extraction, or calculation reference.`,
      });
    }
    if (
      observation.subjectKey &&
      floatingObservationTypes.has(observation.observationType) &&
      !relationshipSubjectKeys.has(observation.subjectKey)
    ) {
      diagnostics.push({
        id: `floating-${observation.id}`,
        severity: "warning",
        title: "Object is not attached to the graph",
        detail: `${observation.title} must be related to a wall, room, hall, or fixture group before CAD geometry should be generated.`,
      });
    }
  }

  const activeSpaceSubjects = subjects.filter((subject) =>
    ["room", "hall", "closet", "bathroom", "kitchen", "structure", "zone"].includes(
      subject.kind,
    ),
  );
  const disconnected = activeSpaceSubjects.filter(
    (subject) =>
      subject.relationshipIds.length === 0 &&
      !["lot", "zone"].includes(subject.kind),
  );
  if (disconnected.length) {
    diagnostics.push({
      id: "disconnected-subjects",
      severity: "warning",
      title: "Some spaces have no access/topology relationship",
      detail: `${disconnected
        .slice(0, 5)
        .map((subject) => subject.subjectLabel)
        .join(", ")} need connectedTo/adjacentTo/partOf evidence.`,
    });
  }

  const hasHardConflict = graph.relationships.some(
    (relationship) =>
      relationship.status === "active" &&
      relationship.relationshipType === "conflictsWith",
  );
  if (hasHardConflict) {
    diagnostics.push({
      id: "relationship-conflicts-present",
      severity: "conflict",
      title: "Conflict relationships are still active",
      detail:
        "The solver should not draw a final draft while active conflicts remain in the topology graph.",
    });
  }

  for (const subject of subjects) {
    const categories = subjectKindCategoriesForSubject(subject, graph);
    if (categories.size > 1) {
      diagnostics.push({
        id: `same-as-kind-conflict-${subject.subjectKey}`,
        severity: "conflict",
        title: "sameAs cluster mixes incompatible subject types",
        detail: `${subject.subjectLabel} has sameAs evidence merging ${[
          ...categories,
        ].join(
          ", ",
        )} records. Split the subject or supersede the weaker extraction before generating CAD geometry.`,
        subjectKeys: subject.memberSubjectKeys ?? [subject.subjectKey],
        observationIds: subject.observationIds,
        measurementIds: subject.measurementIds,
        relationshipIds: subject.relationshipIds,
        impactScore: 96,
      });
    }
  }

  return diagnostics;
}

export function createDraftStateFromEvidence(
  graph: Pick<FloorplanEvidenceGraph, "observations" | "relationships" | "measurements">,
): FloorplanDraftState {
  const diagnostics = validateFloorplanEvidenceGraph(graph);
  const subjects = buildFloorplanSubjects(graph);
  const measuredRoomCount = subjects.filter(
    (subject) =>
      ["room", "hall", "closet", "bathroom", "kitchen"].includes(subject.kind) &&
      subject.knownMeasurementCount >= 2,
  ).length;
  const hasConflict = diagnostics.some((entry) => entry.severity === "conflict");
  const hasEnoughTopology =
    graph.relationships.filter(
      (relationship) =>
        relationship.status === "active" &&
        ["connectedTo", "adjacentTo", "partOf", "contains"].includes(
          relationship.relationshipType,
        ),
    ).length >= 4;
  const ready = !hasConflict && measuredRoomCount >= 3 && hasEnoughTopology;

  if (ready) {
    return {
      status: "ready",
      title: "Ready to generate draft",
      summary:
        "The evidence graph has enough measured room anchors and topology to attempt a non-overlapping draft.",
      sourceObservationIds: graph.observations
        .filter(isActiveGraphRecord)
        .map((observation) => observation.id),
      sourceRelationshipIds: graph.relationships
        .filter(isActiveGraphRecord)
        .map((relationship) => relationship.id),
      diagnostics,
    };
  }

  return {
    status: diagnostics.length ? "blocked" : "notGenerated",
    title: "No generated draft",
    summary:
      "The app is holding evidence and questions instead of drawing a fake floorplan. Add/confirm observations, relationships, and measurements, then regenerate.",
    sourceObservationIds: graph.observations
      .filter(isActiveGraphRecord)
      .map((observation) => observation.id),
    sourceRelationshipIds: graph.relationships
      .filter(isActiveGraphRecord)
      .map((relationship) => relationship.id),
    diagnostics,
  };
}

export function gapPrioritiesFromEvidence(
  graph: Pick<FloorplanEvidenceGraph, "observations" | "relationships" | "measurements">,
): FloorplanGapPriority[] {
  const subjects = buildFloorplanSubjects(graph);
  const gaps: FloorplanGapPriority[] = [];
  const roomSubjects = subjects.filter((subject) =>
    ["room", "hall", "closet", "bathroom", "kitchen"].includes(subject.kind),
  );

  for (const subject of roomSubjects) {
    if (subject.knownMeasurementCount < 2) {
      gaps.push({
        id: `measure-${subject.subjectKey}`,
        question: `Confirm width and depth for ${subject.subjectLabel}.`,
        category: subject.relationshipIds.length > 1
          ? "resolve-conflicts"
          : "scale-largest-unknown",
        impactScore: subject.relationshipIds.length > 1 ? 86 : 78,
        whyItHelps:
          "A room needs two principal dimensions before the solver can scale it without stretching neighboring spaces.",
        answerFormat: "Width and depth in feet, or a photo with both measurements visible.",
      });
    }
  }

  const floating = graph.observations.filter(
    (observation) =>
      observation.status === "active" &&
      observation.subjectKey &&
      floatingObservationTypes.has(observation.observationType) &&
      !graph.relationships.some(
        (relationship) =>
          relationship.status === "active" &&
          (relationship.fromSubjectKey === observation.subjectKey ||
            relationship.toSubjectKey === observation.subjectKey),
      ),
  );
  if (floating.length) {
    gaps.push({
      id: "attach-openings-fixtures",
      question:
        "Attach loose windows, doors, doorways, and fixtures to the wall or room they belong to.",
      category: "mover-path",
      impactScore: 72,
      whyItHelps:
        "The CAD draft cannot place openings or appliances in empty space; each needs a wall/room relationship.",
      answerFormat:
        "For each loose object: source image number, object name, and wall/room it belongs to.",
    });
  }

  return gaps.sort((left, right) => right.impactScore - left.impactScore);
}

function ensureSubject(
  subjects: Map<string, FloorplanCanonicalSubject>,
  seed: {
    subjectKey: string;
    subjectLabel: string;
    kind: FloorplanSubjectKind;
    confidence: FloorplanConfidence;
  },
) {
  const existing = subjects.get(seed.subjectKey);
  if (existing) {
    if (existing.kind === "unknown" && seed.kind !== "unknown") {
      existing.kind = seed.kind;
    }
    mergeConfidence(existing, seed.confidence);
    return existing;
  }
  const created: FloorplanCanonicalSubject = {
    subjectKey: seed.subjectKey,
    subjectLabel: seed.subjectLabel,
    kind: seed.kind,
    confidence: seed.confidence,
    status: "active",
    memberSubjectKeys: [seed.subjectKey],
    observationIds: [],
    relationshipIds: [],
    measurementIds: [],
    sourceLabels: [],
    knownMeasurementCount: 0,
    assumptionMeasurementCount: 0,
    hasGeometrySeed: false,
  };
  subjects.set(seed.subjectKey, created);
  return created;
}

type SubjectSeed = {
  subjectKey: string;
  subjectLabel: string;
  kind: FloorplanSubjectKind;
  confidence: FloorplanConfidence;
  memberSubjectKeys: string[];
};

type SubjectSeedCandidate = {
  subjectKey: string;
  subjectLabel: string;
  kind: FloorplanSubjectKind;
  confidence: FloorplanConfidence;
  observationCount: number;
  relationshipCount: number;
  measurementCount: number;
  knownMeasurementCount: number;
  userEvidenceCount: number;
};

function subjectClusters({
  observations,
  relationships,
  measurements,
}: {
  observations: FloorplanObservation[];
  relationships: FloorplanEvidenceGraph["relationships"];
  measurements: FloorplanMeasurement[];
}) {
  const union = createUnionFind();
  const candidates = new Map<string, SubjectSeedCandidate>();

  for (const observation of observations) {
    if (!observation.subjectKey) continue;
    registerCandidate(candidates, union, {
      subjectKey: observation.subjectKey,
      subjectLabel: observation.subjectLabel ?? observation.title,
      kind: observation.subjectKind ?? subjectKindFromObservation(observation),
      confidence: observation.confidence,
      observationCount: 1,
      userEvidenceCount: userEvidenceCount(observation.provenance),
    });
  }

  for (const measurement of measurements) {
    registerCandidate(candidates, union, {
      subjectKey: measurement.subjectKey,
      subjectLabel: measurement.subjectLabel,
      kind: subjectKindFromMeasurement(measurement),
      confidence: measurement.confidence,
      measurementCount: 1,
      knownMeasurementCount: measurement.kind === "known" ? 1 : 0,
      userEvidenceCount: userEvidenceCount(measurement.provenance),
    });
  }

  for (const relationship of relationships) {
    registerCandidate(candidates, union, {
      subjectKey: relationship.fromSubjectKey,
      subjectLabel: relationship.fromSubjectLabel,
      kind: "unknown",
      confidence: relationship.confidence,
      relationshipCount: 1,
      userEvidenceCount: userEvidenceCount(relationship.provenance),
    });
    registerCandidate(candidates, union, {
      subjectKey: relationship.toSubjectKey,
      subjectLabel: relationship.toSubjectLabel,
      kind: "unknown",
      confidence: relationship.confidence,
      relationshipCount: 1,
      userEvidenceCount: userEvidenceCount(relationship.provenance),
    });
    if (relationship.relationshipType === "sameAs") {
      union.union(relationship.fromSubjectKey, relationship.toSubjectKey);
    }
  }

  const keysByRoot = new Map<string, string[]>();
  for (const key of candidates.keys()) {
    const root = union.find(key);
    keysByRoot.set(root, [...(keysByRoot.get(root) ?? []), key]);
  }

  const canonicalKeyBySubjectKey = new Map<string, string>();
  const seedByCanonicalKey = new Map<string, SubjectSeed>();
  const seeds: SubjectSeed[] = [];

  for (const memberSubjectKeys of keysByRoot.values()) {
    const sortedMembers = [...memberSubjectKeys].sort();
    const canonical = sortedMembers
      .map((key) => candidates.get(key))
      .filter((candidate): candidate is SubjectSeedCandidate => Boolean(candidate))
      .sort(candidateSort)[0];
    if (!canonical) continue;
    const strongest = strongestCandidate(
      sortedMembers
        .map((key) => candidates.get(key))
        .filter((candidate): candidate is SubjectSeedCandidate => Boolean(candidate)),
    );
    const seed: SubjectSeed = {
      subjectKey: canonical.subjectKey,
      subjectLabel: strongest.subjectLabel,
      kind: strongest.kind,
      confidence: strongest.confidence,
      memberSubjectKeys: sortedMembers,
    };
    seeds.push(seed);
    seedByCanonicalKey.set(seed.subjectKey, seed);
    for (const member of sortedMembers) {
      canonicalKeyBySubjectKey.set(member, seed.subjectKey);
    }
  }

  return { canonicalKeyBySubjectKey, seedByCanonicalKey, seeds };
}

function createUnionFind() {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    if (!parent.has(key)) {
      parent.set(key, key);
      return key;
    }
    const root = parent.get(key);
    if (!root || root === key) return key;
    const collapsed = find(root);
    parent.set(key, collapsed);
    return collapsed;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent.set(rightRoot, leftRoot);
    }
  };
  return { find, union };
}

function registerCandidate(
  candidates: Map<string, SubjectSeedCandidate>,
  union: ReturnType<typeof createUnionFind>,
  seed: {
    subjectKey: string;
    subjectLabel: string;
    kind: FloorplanSubjectKind;
    confidence: FloorplanConfidence;
    observationCount?: number;
    relationshipCount?: number;
    measurementCount?: number;
    knownMeasurementCount?: number;
    userEvidenceCount?: number;
  },
) {
  union.find(seed.subjectKey);
  const existing = candidates.get(seed.subjectKey);
  if (!existing) {
    candidates.set(seed.subjectKey, {
      subjectKey: seed.subjectKey,
      subjectLabel: seed.subjectLabel,
      kind: seed.kind,
      confidence: seed.confidence,
      observationCount: seed.observationCount ?? 0,
      relationshipCount: seed.relationshipCount ?? 0,
      measurementCount: seed.measurementCount ?? 0,
      knownMeasurementCount: seed.knownMeasurementCount ?? 0,
      userEvidenceCount: seed.userEvidenceCount ?? 0,
    });
    return;
  }
  existing.observationCount += seed.observationCount ?? 0;
  existing.relationshipCount += seed.relationshipCount ?? 0;
  existing.measurementCount += seed.measurementCount ?? 0;
  existing.knownMeasurementCount += seed.knownMeasurementCount ?? 0;
  existing.userEvidenceCount += seed.userEvidenceCount ?? 0;
  if (existing.kind === "unknown" && seed.kind !== "unknown") {
    existing.kind = seed.kind;
  }
  if (confidenceRank[seed.confidence] > confidenceRank[existing.confidence]) {
    existing.confidence = seed.confidence;
    existing.subjectLabel = seed.subjectLabel;
  }
}

function candidateSort(left: SubjectSeedCandidate, right: SubjectSeedCandidate) {
  return candidateScore(right) - candidateScore(left) ||
    left.subjectKey.localeCompare(right.subjectKey);
}

function candidateScore(candidate: SubjectSeedCandidate) {
  return (
    confidenceRank[candidate.confidence] * 100 +
    candidate.userEvidenceCount * 32 +
    candidate.knownMeasurementCount * 24 +
    candidate.measurementCount * 12 +
    candidate.observationCount * 8 +
    candidate.relationshipCount * 4 +
    (candidate.kind === "unknown" ? 0 : 6)
  );
}

function strongestCandidate(candidates: SubjectSeedCandidate[]) {
  return [...candidates].sort((left, right) => {
    const confidence = confidenceRank[right.confidence] - confidenceRank[left.confidence];
    if (confidence) return confidence;
    return candidateScore(right) - candidateScore(left) ||
      left.subjectLabel.localeCompare(right.subjectLabel);
  })[0];
}

function userEvidenceCount(provenance: Array<{ sourceType: string }>) {
  return provenance.filter((source) => source.sourceType === "userEdit").length;
}

function subjectKindCategoriesForSubject(
  subject: FloorplanCanonicalSubject,
  graph: Pick<FloorplanEvidenceGraph, "observations" | "relationships" | "measurements">,
) {
  const members = new Set(subject.memberSubjectKeys ?? [subject.subjectKey]);
  const categories = new Set<string>();
  for (const observation of graph.observations.filter(isActiveGraphRecord)) {
    if (!observation.subjectKey || !members.has(observation.subjectKey)) continue;
    const category = kindCategory(observation.subjectKind ?? subjectKindFromObservation(observation));
    if (category !== "unknown") categories.add(category);
  }
  for (const measurement of graph.measurements.filter(isActiveMeasurement)) {
    if (!members.has(measurement.subjectKey)) continue;
    const category = kindCategory(subjectKindFromMeasurement(measurement));
    if (category !== "unknown") categories.add(category);
  }
  return categories;
}

function kindCategory(kind: FloorplanSubjectKind) {
  if (["room", "hall", "closet", "bathroom", "kitchen"].includes(kind)) {
    return "space";
  }
  if (["fixture"].includes(kind)) return "fixture";
  if (["opening"].includes(kind)) return "opening";
  if (["wall"].includes(kind)) return "wall";
  if (["structure", "zone", "lot"].includes(kind)) return "property";
  return "unknown";
}

function mergeConfidence(
  subject: Pick<FloorplanCanonicalSubject, "confidence">,
  confidence: FloorplanConfidence,
) {
  if (confidenceRank[confidence] > confidenceRank[subject.confidence]) {
    subject.confidence = confidence;
  }
}

function subjectKindFromObservation(
  observation: FloorplanObservation,
): FloorplanSubjectKind {
  if (observation.subjectKind) return observation.subjectKind;
  if (observation.observationType === "hall") return "hall";
  if (observation.observationType === "closet") return "closet";
  if (observation.observationType === "fixture") return "fixture";
  if (
    ["opening", "door", "doorway", "doorlessPassage", "window"].includes(
      observation.observationType,
    )
  ) {
    return "opening";
  }
  if (["wallSegment"].includes(observation.observationType)) return "wall";
  if (["exteriorStructure", "carport", "shed"].includes(observation.observationType)) {
    return "structure";
  }
  if (["patio", "lotFeature"].includes(observation.observationType)) return "zone";
  if (observation.observationType === "roomName") return "room";
  return "unknown";
}

function subjectKindFromMeasurement(
  measurement: FloorplanMeasurement,
): FloorplanSubjectKind {
  if (measurement.subjectType === "room") return "room";
  if (measurement.subjectType === "path") return "hall";
  if (measurement.subjectType === "fixture") return "fixture";
  if (measurement.subjectType === "opening") return "opening";
  if (measurement.subjectType === "structure") return "structure";
  if (measurement.subjectType === "zone") return "zone";
  if (measurement.subjectType === "lot") return "lot";
  return "unknown";
}

function isActiveGraphRecord<
  TRecord extends { status: "active" | "needsReview" | "superseded" | "rejected" },
>(record: TRecord) {
  return record.status === "active" || record.status === "needsReview";
}

function isActiveMeasurement(measurement: FloorplanMeasurement) {
  return measurement.status === "active";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

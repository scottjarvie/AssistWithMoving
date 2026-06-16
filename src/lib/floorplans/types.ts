export type FloorplanConfidence = "high" | "medium" | "low" | "conflict";

export type FloorplanEvidenceSourceType =
  | "image"
  | "textNote"
  | "userEdit"
  | "agentExtraction"
  | "calculation";

export type FloorplanMeasurementKind =
  | "known"
  | "assumption"
  | "derived"
  | "range";

export type FloorplanMeasurementStatus = "active" | "superseded";

export type FloorplanObservationType =
  | "label"
  | "ocrText"
  | "measurementText"
  | "roomName"
  | "wallSegment"
  | "opening"
  | "door"
  | "doorway"
  | "doorlessPassage"
  | "window"
  | "fixture"
  | "closet"
  | "hall"
  | "exteriorStructure"
  | "patio"
  | "carport"
  | "shed"
  | "lotFeature"
  | "orientationClue"
  | "areaTarget"
  | "unknownMark"
  | "sourceNote";

export type FloorplanObservationStatus =
  | "active"
  | "needsReview"
  | "superseded"
  | "rejected";

export type FloorplanRelationshipType =
  | "adjacentTo"
  | "connectedTo"
  | "contains"
  | "partOf"
  | "leftOf"
  | "rightOf"
  | "above"
  | "below"
  | "sameAs"
  | "conflictsWith"
  | "openingIn"
  | "countsTowardArea"
  | "excludedFromArea"
  | "accessesThrough"
  | "doorlessPassageBetween"
  | "wallSharedWith";

export type FloorplanSubjectKind =
  | "room"
  | "hall"
  | "closet"
  | "bathroom"
  | "kitchen"
  | "fixture"
  | "opening"
  | "wall"
  | "structure"
  | "zone"
  | "lot"
  | "unknown";

export type FloorplanMeasurementType =
  | "width"
  | "depth"
  | "clearWidth"
  | "clearDepth"
  | "height"
  | "area"
  | "grossArea"
  | "conditionedArea"
  | "excludedArea"
  | "lotArea"
  | "footprintArea"
  | "perimeter"
  | "exteriorWidth"
  | "exteriorDepth"
  | "areaVariance"
  | "span"
  | "wallThickness"
  | "openingWidth"
  | "fixtureOffset"
  | "clearance"
  | "unknown";

export type FloorplanMeasurementSubjectType =
  | "plan"
  | "level"
  | "room"
  | "structure"
  | "areaGroup"
  | "lot"
  | "zone"
  | "shell"
  | "opening"
  | "fixture"
  | "path";

export type FloorplanMeasurementUnit =
  | "in"
  | "ft"
  | "sqft"
  | "acre"
  | "percent"
  | "count";

export type FloorplanAreaRole =
  | "conditioned"
  | "unconditioned"
  | "excluded"
  | "outdoor"
  | "unknown";

export type FloorplanConstraintStrength =
  | "hard"
  | "strong"
  | "soft"
  | "displayOnly";

export type FloorplanCalculationKind =
  | "area"
  | "variance"
  | "coverage"
  | "confidence"
  | "missingArea";

export type FloorplanPropertyZoneKind =
  | "houseShell"
  | "garage"
  | "carport"
  | "patio"
  | "deck"
  | "porch"
  | "shed"
  | "yard"
  | "driveway"
  | "garden"
  | "fence"
  | "lot"
  | "custom";

export type FloorplanImageRegion = {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
};

export type FloorplanProvenance = {
  id: string;
  sourceType: FloorplanEvidenceSourceType;
  sourceId?: string;
  sourcePhotoId?: string;
  sourceLabel: string;
  imageNumber?: number;
  imageRegion?: FloorplanImageRegion;
  recordedAtLabel?: string;
  recordedByLabel?: string;
  notes?: string;
};

export type FloorplanObservation = {
  id: string;
  observationType: FloorplanObservationType;
  status: FloorplanObservationStatus;
  title: string;
  subjectKey?: string;
  subjectLabel?: string;
  subjectKind?: FloorplanSubjectKind;
  rawText?: string;
  normalized?: Record<string, string | number | boolean | null>;
  confidence: FloorplanConfidence;
  sourceResourceId?: string;
  sourcePhotoId?: string;
  sourceLabel: string;
  imageNumber?: number;
  imageRegion?: FloorplanImageRegion;
  relatedMeasurementIds?: string[];
  relatedObservationIds?: string[];
  supersededById?: string;
  notes?: string;
  provenance: FloorplanProvenance[];
};

export type FloorplanRelationship = {
  id: string;
  relationshipType: FloorplanRelationshipType;
  status: FloorplanObservationStatus;
  fromSubjectKey: string;
  fromSubjectLabel: string;
  toSubjectKey: string;
  toSubjectLabel: string;
  confidence: FloorplanConfidence;
  sourceObservationIds?: string[];
  sourceMeasurementIds?: string[];
  evidenceIds?: string[];
  supersededById?: string;
  notes?: string;
  provenance: FloorplanProvenance[];
};

export type FloorplanCanonicalSubject = {
  subjectKey: string;
  subjectLabel: string;
  kind: FloorplanSubjectKind;
  confidence: FloorplanConfidence;
  status: FloorplanObservationStatus;
  memberSubjectKeys?: string[];
  observationIds: string[];
  relationshipIds: string[];
  measurementIds: string[];
  sourceLabels: string[];
  knownMeasurementCount: number;
  assumptionMeasurementCount: number;
  hasGeometrySeed: boolean;
  countsTowardArea?: boolean;
  areaRole?: FloorplanAreaRole;
  notes?: string[];
};

export type FloorplanDraftState = {
  status: "notGenerated" | "stale" | "blocked" | "ready" | "generated" | "archived";
  title: string;
  summary: string;
  solveRunId?: string;
  generatedAtLabel?: string;
  sourceObservationIds: string[];
  sourceRelationshipIds: string[];
  diagnostics: FloorplanSolveDiagnostic[];
};

export type FloorplanEvidenceGraph = {
  resources: FloorplanResource[];
  observations: FloorplanObservation[];
  relationships: FloorplanRelationship[];
  measurements: FloorplanMeasurement[];
};

export type FloorplanMeasurement = {
  id: string;
  subjectType: FloorplanMeasurementSubjectType;
  subjectKey: string;
  subjectLabel: string;
  measurementType: FloorplanMeasurementType;
  kind: FloorplanMeasurementKind;
  status: FloorplanMeasurementStatus;
  valueIn?: number;
  minIn?: number;
  maxIn?: number;
  unit?: FloorplanMeasurementUnit;
  value?: number;
  minValue?: number;
  maxValue?: number;
  displayValue: string;
  confidence: FloorplanConfidence;
  areaRole?: FloorplanAreaRole;
  constraintStrength?: FloorplanConstraintStrength;
  provenance: FloorplanProvenance[];
  derivedFromMeasurementIds?: string[];
};

export type FloorplanSpaceKind =
  | "room"
  | "hall"
  | "closet"
  | "bath"
  | "utility"
  | "kitchen"
  | "circulation"
  | "garage"
  | "carport"
  | "patio"
  | "deck"
  | "porch"
  | "shed"
  | "yard"
  | "outdoor";

export type FloorplanConnection = {
  targetRoomId: string;
  label: string;
  kind:
    | "door"
    | "doorway"
    | "doorlessPassage"
    | "opening"
    | "hall"
    | "throughRoom"
    | "window"
    | "unknown";
  confidence: FloorplanConfidence;
  note?: string;
};

export type FloorplanSolvedRoom = {
  id: string;
  label: string;
  kind: FloorplanSpaceKind;
  areaRole: FloorplanAreaRole;
  confidence: FloorplanConfidence;
  xIn: number;
  yIn: number;
  widthIn: number;
  depthIn: number;
  clearWidthIn?: number;
  clearDepthIn?: number;
  wallThicknessIn?: number;
  measurementLabel?: string;
  areaSqFt: number;
  countsTowardConditionedArea: boolean;
  accessNote?: string;
  unresolvedSubspaces?: string[];
  connectsTo?: FloorplanConnection[];
  containedIn?: string;
  partialOutside?: boolean;
  sourceMeasurementIds: string[];
};

export type FloorplanSolvedZone = {
  id: string;
  label: string;
  kind: FloorplanPropertyZoneKind;
  areaRole: FloorplanAreaRole;
  confidence: FloorplanConfidence;
  xIn: number;
  yIn: number;
  widthIn: number;
  depthIn: number;
  areaSqFt: number;
  countsTowardConditionedArea: boolean;
  sourceMeasurementIds: string[];
  partialOutside?: boolean;
  note?: string;
};

export type FloorplanWallOrientation = "horizontal" | "vertical";

export type FloorplanSolvedWall = {
  id: string;
  label: string;
  orientation: FloorplanWallOrientation;
  x1In: number;
  y1In: number;
  x2In: number;
  y2In: number;
  thicknessIn: number;
  confidence: FloorplanConfidence;
  roomIds: string[];
  sideByRoomId?: Record<string, "north" | "south" | "east" | "west">;
  exterior: boolean;
  inferred: boolean;
  sourceObservationIds?: string[];
  sourceRelationshipIds?: string[];
  sourceMeasurementIds?: string[];
};

export type FloorplanSolvedOpening = {
  id: string;
  label: string;
  kind: "door" | "doorway" | "doorlessPassage" | "opening" | "window";
  confidence: FloorplanConfidence;
  xIn: number;
  yIn: number;
  widthIn: number;
  orientation: FloorplanWallOrientation;
  wallId?: string;
  hostRoomId?: string;
  connectsRoomIds?: string[];
  swing?: {
    hinge: "left" | "right";
    orientation: "up" | "down" | "left" | "right";
  };
  unresolved?: boolean;
  note?: string;
  sourceObservationIds?: string[];
  sourceRelationshipIds?: string[];
  sourceMeasurementIds?: string[];
};

export type FloorplanSolvedFixture = {
  id: string;
  label: string;
  kind:
    | "sink"
    | "toilet"
    | "tub"
    | "shower"
    | "washer"
    | "dryer"
    | "stove"
    | "fireplace"
    | "waterHeater"
    | "cabinet"
    | "counter"
    | "pool"
    | "unknown";
  confidence: FloorplanConfidence;
  xIn: number;
  yIn: number;
  widthIn: number;
  depthIn: number;
  hostRoomId?: string;
  unresolved?: boolean;
  note?: string;
  sourceObservationIds?: string[];
  sourceRelationshipIds?: string[];
  sourceMeasurementIds?: string[];
};

export type FloorplanUnresolvedGeometry = {
  id: string;
  label: string;
  kind:
    | "space"
    | "opening"
    | "fixture"
    | "wall"
    | "zone"
    | "missingArea"
    | "unknownMark";
  subjectKey?: string;
  xIn?: number;
  yIn?: number;
  widthIn?: number;
  depthIn?: number;
  areaSqFt?: number;
  reason: string;
  confidence: FloorplanConfidence;
  sourceObservationIds?: string[];
  sourceRelationshipIds?: string[];
  sourceMeasurementIds?: string[];
};

export type FloorplanDataQualityScore = {
  overall: number;
  dimensions: number;
  topology: number;
  area: number;
  openings: number;
  property: number;
  summary: string;
  drivers: Array<{
    id: string;
    label: string;
    score: number;
    note: string;
  }>;
};

export type FloorplanAreaTarget = {
  id: string;
  label: string;
  subjectKey: string;
  measurementType:
    | "grossArea"
    | "conditionedArea"
    | "excludedArea"
    | "lotArea"
    | "footprintArea"
    | "area";
  areaRole: FloorplanAreaRole;
  strength: FloorplanConstraintStrength;
  valueSqFt?: number;
  minSqFt?: number;
  maxSqFt?: number;
  confidence: FloorplanConfidence;
  sourceMeasurementIds: string[];
};

export type FloorplanAreaSummary = {
  conditionedSqFt: number;
  unconditionedSqFt: number;
  excludedSqFt: number;
  outdoorSqFt: number;
  unknownSqFt: number;
  footprintSqFt: number;
  grossSolvedSqFt: number;
  lotSqFt?: number;
  lotCoveragePercent?: number;
  officialTargetSqFt?: number;
  targetStrength?: FloorplanConstraintStrength;
  varianceSqFt?: number;
  variancePercent?: number;
  status: "withinTarget" | "underTarget" | "overTarget" | "noTarget";
};

export type FloorplanCalculation = {
  id: string;
  label: string;
  kind: FloorplanCalculationKind;
  formulaName: string;
  unit: FloorplanMeasurementUnit;
  value: number;
  displayValue: string;
  confidence: FloorplanConfidence;
  inputMeasurementIds: string[];
  outputMeasurementType: FloorplanMeasurementType;
  subjectKey: string;
  subjectLabel: string;
  diagnostics?: FloorplanSolveDiagnostic[];
};

export type FloorplanSolveDiagnostic = {
  id: string;
  severity: "info" | "warning" | "conflict";
  title: string;
  detail: string;
  roomIds?: string[];
  measurementIds?: string[];
  observationIds?: string[];
  relationshipIds?: string[];
  subjectKeys?: string[];
  impactScore?: number;
};

export type FloorplanSolveResult = {
  solverVersion: string;
  status: "valid" | "incomplete" | "conflict";
  rooms: FloorplanSolvedRoom[];
  zones: FloorplanSolvedZone[];
  walls?: FloorplanSolvedWall[];
  openings?: FloorplanSolvedOpening[];
  fixtures?: FloorplanSolvedFixture[];
  unresolvedGeometry?: FloorplanUnresolvedGeometry[];
  dataQuality?: FloorplanDataQualityScore;
  areaTargets: FloorplanAreaTarget[];
  areaSummary: FloorplanAreaSummary;
  calculations: FloorplanCalculation[];
  gaps: FloorplanGapPriority[];
  diagnostics: FloorplanSolveDiagnostic[];
  bounds: {
    minXIn: number;
    minYIn: number;
    maxXIn: number;
    maxYIn: number;
    widthIn: number;
    depthIn: number;
  };
  generatedAtLabel?: string;
};

export type FloorplanResource = {
  id: string;
  title: string;
  kind: "image" | "text" | "queue";
  status: "sample" | "pending" | "processed" | "queued";
  fileName?: string;
  imageSrc?: string;
  capturedAtLabel?: string;
  dimensionsLabel?: string;
  description: string;
  proves: string[];
};

export type FloorplanSelectionKind =
  | "space"
  | "wall"
  | "fixture"
  | "opening"
  | "unknown"
  | "dimension"
  | "resource"
  | "observation"
  | "relationship"
  | "subject";

export type FloorplanSelection = {
  kind: FloorplanSelectionKind;
  id: string;
};

export type FloorplanSelectableSubject = {
  subjectKey: string;
  subjectLabel: string;
  subjectType: FloorplanMeasurementSubjectType;
};

export type FloorplanInteractiveObjectKind =
  | "fixture"
  | "opening"
  | "dimension";

export type FloorplanInteractiveObject = FloorplanSelectableSubject & {
  id: string;
  kind: FloorplanInteractiveObjectKind;
  label: string;
  typeLabel: string;
  confidence: FloorplanConfidence;
  description: string;
  defaultMeasurementLabel?: string;
  sourceIds: string[];
  editableMeasurementTypes: FloorplanMeasurementType[];
};

export type FloorplanObjectAdjustment = {
  dxIn: number;
  dyIn: number;
};

export type FloorplanEvidence = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  confidence: FloorplanConfidence;
  summary: string;
  facts: string[];
};

export type FloorplanKnownFact = {
  id: string;
  label: string;
  confidence: FloorplanConfidence;
  sourceIds: string[];
  statement: string;
};

export type FloorplanAssumption = {
  id: string;
  premise: string;
  inference: string;
  confidence: FloorplanConfidence;
  risk: string;
  sourceIds: string[];
};

export type FloorplanConflict = {
  id: string;
  title: string;
  status: "resolved" | "open" | "review";
  impact: string;
  rule: string;
  evidenceIds: string[];
};

export type FloorplanGapCategory =
  | "scale-largest-unknown"
  | "resolve-conflicts"
  | "mover-path"
  | "nice-to-have";

export type FloorplanGapPriority = {
  id: string;
  question: string;
  category: FloorplanGapCategory;
  impactScore: number;
  whyItHelps: string;
  answerFormat: string;
};

export type FloorplanSymbolKeyItem = {
  id: string;
  label: string;
  description: string;
  kind:
    | "confidence"
    | "wall"
    | "opening"
    | "window"
    | "dimension"
    | "fixture";
  confidence?: FloorplanConfidence;
};

export type FloorplanRoomLedgerRow = {
  id: string;
  room: string;
  measurement: string;
  confidence: FloorplanConfidence;
};

export type FloorplanUserMeasurementEdit = {
  subjectKey: string;
  subjectLabel: string;
  widthFt?: number;
  depthFt?: number;
  notes?: string;
};

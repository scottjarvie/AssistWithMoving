import type {
  FloorplanAreaRole,
  FloorplanConnection,
  FloorplanConfidence,
  FloorplanMeasurement,
  FloorplanObservation,
  FloorplanPropertyZoneKind,
  FloorplanRelationship,
  FloorplanSpaceKind,
  FloorplanSolveDiagnostic,
} from "@/lib/floorplans/types";

export type FloorplanRoomConstraint = {
  id: string;
  label: string;
  kind?: FloorplanSpaceKind;
  areaRole?: FloorplanAreaRole;
  confidence?: FloorplanConfidence;
  xIn?: number;
  yIn?: number;
  widthIn?: number;
  depthIn?: number;
  clearWidthIn?: number;
  clearDepthIn?: number;
  wallThicknessIn?: number;
  accessNote?: string;
  unresolvedSubspaces?: string[];
  connectsTo?: FloorplanConnection[];
  widthRangeIn?: [number, number];
  depthRangeIn?: [number, number];
  containedIn?: string;
  partialOutside?: boolean;
  sourceMeasurementIds?: string[];
  sourceObservationIds?: string[];
  sourceRelationshipIds?: string[];
  relativeTo?: {
    roomId: string;
    relation: "rightOf" | "leftOf" | "above" | "below";
    align?: "start" | "center" | "end";
    gapIn?: number;
  };
};

export type FloorplanPropertyZoneConstraint = {
  id: string;
  label: string;
  kind: FloorplanPropertyZoneKind;
  areaRole?: FloorplanAreaRole;
  confidence?: FloorplanConfidence;
  xIn?: number;
  yIn?: number;
  widthIn?: number;
  depthIn?: number;
  widthRangeIn?: [number, number];
  depthRangeIn?: [number, number];
  sourceMeasurementIds?: string[];
  sourceObservationIds?: string[];
  sourceRelationshipIds?: string[];
  partialOutside?: boolean;
  note?: string;
};

export type FloorplanPuzzleInput = {
  rooms?: FloorplanRoomConstraint[];
  zones?: FloorplanPropertyZoneConstraint[];
  measurements?: FloorplanMeasurement[];
  observations?: FloorplanObservation[];
  relationships?: FloorplanRelationship[];
};

export type CompiledFloorplanGraph = {
  rooms: FloorplanRoomConstraint[];
  zones: FloorplanPropertyZoneConstraint[];
  diagnostics: FloorplanSolveDiagnostic[];
  observations: FloorplanObservation[];
  relationships: FloorplanRelationship[];
  measurements: FloorplanMeasurement[];
};

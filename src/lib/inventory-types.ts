import type { Doc, Id } from "../../convex/_generated/dataModel";

export type InventoryItemSignals = {
  photoCount: number;
  evidencePhotoCount: number;
  boxCount: number;
  assignedBoxCount: number;
  assignmentCount: number;
  boxCodes: string[];
  assignedResourceNames: string[];
  assignedZoneNames: string[];
};

export type InventoryItemOwnerContact = Pick<
  Doc<"movePeople">,
  "_id" | "name" | "role"
>;

export type InventoryItem = Doc<"items"> & {
  signals?: InventoryItemSignals;
  ownerContact?: InventoryItemOwnerContact;
};

export type InventoryItemPatch = {
  name?: string;
  description?: string;
  room?: string;
  destinationRoom?: string;
  currentSpaceId?: Id<"moveSpaces">;
  destinationSpaceId?: Id<"moveSpaces">;
  clearCurrentSpace?: boolean;
  assignedResourceId?: Id<"transportResources">;
  assignedZoneId?: Id<"transportZones">;
  clearAssignedResource?: boolean;
  clearAssignedZone?: boolean;
  category?: string;
  subcategory?: string;
  ownerPersonId?: Id<"movePeople">;
  clearOwnerPersonId?: boolean;
  disposition?: InventoryItem["disposition"];
  status?: InventoryItem["status"];
  quantity?: number;
  condition?: InventoryItem["condition"];
  valueCents?: number;
  replacementValueCents?: number;
  serialNumber?: string;
  modelNumber?: string;
  dimensionsIn?: {
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
  };
  measurementProvenance?: InventoryItem["measurementProvenance"];
  dimensionsConfidence?: InventoryItem["dimensionsConfidence"];
  estimatedWeightLb?: number;
  estimatedWeightLowLb?: number;
  estimatedWeightHighLb?: number;
  actualWeightLb?: number;
  estimatedVolumeCuFt?: number;
  estimatedPackedVolumeCuFt?: number;
  weightConfidence?: InventoryItem["weightConfidence"];
  volumeConfidence?: InventoryItem["volumeConfidence"];
  fragility?: InventoryItem["fragility"];
  stackable?: boolean;
  hazardousFlag?: boolean;
  highValue?: boolean;
  requiresPersonalTransport?: boolean;
  planningDefaultKeys?: InventoryItem["planningDefaultKeys"];
  needsReview?: boolean;
  reviewFlags?: string[];
  privateNotes?: string;
  aiSummary?: string;
  aiTags?: string[];
  createdVia?: InventoryItem["createdVia"];
};

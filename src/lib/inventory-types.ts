import type { Doc } from "../../convex/_generated/dataModel";

export type InventoryItem = Doc<"items">;

export type InventoryItemPatch = {
  name?: string;
  description?: string;
  room?: string;
  destinationRoom?: string;
  category?: string;
  subcategory?: string;
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

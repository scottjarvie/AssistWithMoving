export type ExportFormat = "pdf" | "csv" | "print";
export type ExportJobType =
  | "inventory"
  | "boxes"
  | "assignments"
  | "documentationProfile"
  | "floorPlan";

export type ExportableItem = {
  name: string;
  description?: string;
  room?: string;
  destinationRoom?: string;
  category?: string;
  disposition: string;
  status: string;
  condition: string;
  quantity: number;
  valueCents?: number;
  replacementValueCents?: number;
  serialNumber?: string;
  modelNumber?: string;
  privateNotes?: string;
};

export type ExportableBox = {
  code: string;
  label?: string;
  room?: string;
  destinationRoom?: string;
  status: string;
  estimatedWeightLb?: number;
  actualWeightLb?: number;
  estimatedVolumeCuFt?: number;
  assignedResource?: string;
  assignedZone?: string;
};

export type ExportableAssignment = {
  boxCode: string;
  boxLabel?: string;
  boxStatus: string;
  assignedResource?: string;
  assignedZone?: string;
  itemCount: number;
  estimatedWeightLb?: number;
};

export type ExportVisibility = {
  values: boolean;
  serials: boolean;
  privateNotes: boolean;
};

export function csvFromRows(rows: Array<Array<string | number | undefined>>) {
  return rows
    .map((row) => row.map((cell) => csvCell(String(cell ?? ""))).join(","))
    .join("\n");
}

export function csvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function inventoryCsvRows(
  items: ExportableItem[],
  visibility: ExportVisibility
) {
  const header = [
    "item",
    "description",
    "room",
    "destination_room",
    "category",
    "quantity",
    "disposition",
    "status",
    "condition",
    "value_cents",
    "replacement_value_cents",
    "serial_number",
    "model_number",
    "private_notes",
  ];
  const rows = items.map((item) => [
    item.name,
    item.description,
    item.room,
    item.destinationRoom,
    item.category,
    item.quantity,
    item.disposition,
    item.status,
    item.condition,
    visibility.values ? item.valueCents : undefined,
    visibility.values ? item.replacementValueCents : undefined,
    visibility.serials ? item.serialNumber : undefined,
    visibility.serials ? item.modelNumber : undefined,
    visibility.privateNotes ? item.privateNotes : undefined,
  ]);
  return [header, ...rows];
}

export function boxCsvRows(boxes: ExportableBox[]) {
  const header = [
    "box_code",
    "label",
    "room",
    "destination_room",
    "status",
    "assigned_resource",
    "assigned_zone",
    "estimated_weight_lb",
    "actual_weight_lb",
    "estimated_volume_cuft",
  ];
  const rows = boxes.map((box) => [
    box.code,
    box.label,
    box.room,
    box.destinationRoom,
    box.status,
    box.assignedResource,
    box.assignedZone,
    box.estimatedWeightLb,
    box.actualWeightLb,
    box.estimatedVolumeCuFt,
  ]);
  return [header, ...rows];
}

export function assignmentCsvRows(assignments: ExportableAssignment[]) {
  const header = [
    "box_code",
    "box_label",
    "box_status",
    "assigned_resource",
    "assigned_zone",
    "item_count",
    "estimated_weight_lb",
  ];
  const rows = assignments.map((assignment) => [
    assignment.boxCode,
    assignment.boxLabel,
    assignment.boxStatus,
    assignment.assignedResource,
    assignment.assignedZone,
    assignment.itemCount,
    assignment.estimatedWeightLb,
  ]);
  return [header, ...rows];
}

export function exportFilename({
  type,
  format,
  slug,
}: {
  type: ExportJobType;
  format: ExportFormat;
  slug?: string;
}) {
  const safeSlug = (slug ?? type).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `assistwithmoving-${safeSlug}.${format === "csv" ? "csv" : "html"}`;
}

export function exportMimeType(format: ExportFormat) {
  switch (format) {
    case "csv":
      return "text/csv;charset=utf-8";
    case "pdf":
      return "application/pdf";
    case "print":
      return "text/html;charset=utf-8";
  }
}

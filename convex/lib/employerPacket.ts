export type EmployerPacketMode = "submission" | "owner";

export type EmployerPacketItemInput = {
  disposition: string;
  status: string;
  quantity: number;
  estimatedWeightLb?: number;
  actualWeightLb?: number;
  estimatedVolumeCuFt?: number;
  valueCents?: number;
  highValue: boolean;
  requiresPersonalTransport: boolean;
  planningDefaultKeys: string[];
};

export function employerRelocationCategory(item: EmployerPacketItemInput) {
  if (item.disposition === "storage") return "storage";
  if (
    item.disposition === "personalTransport" ||
    item.requiresPersonalTransport ||
    item.planningDefaultKeys.includes("doNotLetMoversTouch")
  ) {
    return "personalTransport";
  }
  if (item.disposition === "donate" || item.disposition === "sell" || item.disposition === "free") {
    return "excludedDisposition";
  }
  return "relocationShipment";
}

export function employerItemWeight(item: EmployerPacketItemInput) {
  return item.actualWeightLb ?? item.estimatedWeightLb ?? 0;
}

export function shouldShowEmployerPrivateFields(mode: EmployerPacketMode) {
  return mode === "owner";
}

export function employerPacketDisclaimer() {
  return "This packet is a move documentation aid for employer relocation review. It is not tax, legal, or reimbursement advice; verify requirements with the employer or relocation-benefit administrator.";
}

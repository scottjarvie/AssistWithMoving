export type MoverPacketMode = "movingCompany" | "loadCrew" | "owner";

export function buildMoverPacketPath({
  householdId,
  moveId,
  mode = "movingCompany",
}: {
  householdId: string;
  moveId: string;
  mode?: MoverPacketMode;
}) {
  const params = new URLSearchParams({ householdId, moveId, mode });
  return `/app/mover-packet?${params.toString()}`;
}

export function moverPacketFilename(mode: MoverPacketMode) {
  return `assistwithmoving-mover-${mode}.csv`;
}

export function moverModeLabel(mode: MoverPacketMode) {
  switch (mode) {
    case "movingCompany":
      return "Moving company";
    case "loadCrew":
      return "Load crew";
    case "owner":
      return "Owner private";
  }
}

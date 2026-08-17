export type PcsPacketMode = "submission" | "owner";

export function buildPcsPacketPath({
  householdId,
  moveId,
  mode = "submission",
}: {
  householdId: string;
  moveId: string;
  mode?: PcsPacketMode;
}) {
  const params = new URLSearchParams({ householdId, moveId, mode });
  return `/app/pcs-packet?${params.toString()}`;
}

export function formatPcsValue(value: string | number | undefined) {
  if (value === undefined || value === "") return "Not set";
  return String(value);
}

export function formatPcsCurrency(cents: number | undefined) {
  if (typeof cents !== "number") return "Not included";
  return `$${(cents / 100).toFixed(2)}`;
}

export function pcsPacketFilename(mode: PcsPacketMode) {
  return `assistwithmoving-pcs-${mode}.csv`;
}

export type EmployerPacketMode = "submission" | "owner";

export function buildEmployerPacketPath({
  householdId,
  moveId,
  mode = "submission",
}: {
  householdId: string;
  moveId: string;
  mode?: EmployerPacketMode;
}) {
  const params = new URLSearchParams({ householdId, moveId, mode });
  return `/app/employer-packet?${params.toString()}`;
}

export function employerPacketFilename(mode: EmployerPacketMode) {
  return `assistwithmoving-employer-${mode}.csv`;
}

export function formatEmployerCurrency(cents: number | undefined) {
  if (typeof cents !== "number") return "Hidden";
  return `$${(cents / 100).toFixed(2)}`;
}

type LoadPlanPacketPathInput = {
  householdId: string;
  moveId: string;
  mode?: "crew" | "owner";
};

export function buildLoadPlanPacketPath({
  householdId,
  moveId,
  mode = "crew",
}: LoadPlanPacketPathInput) {
  const params = new URLSearchParams({ householdId, moveId, mode });
  return `/app/load-plan-packet?${params.toString()}`;
}

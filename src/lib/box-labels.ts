type BoxLabelPathInput = {
  householdId: string;
  moveId: string;
  boxId: string;
};

type BoxLabelSheetPathInput = {
  householdId: string;
  moveId: string;
};

export function buildBoxLookupPath({
  householdId,
  moveId,
  boxId,
}: BoxLabelPathInput) {
  const params = new URLSearchParams({ householdId, moveId });
  return `/app/boxes/${encodeURIComponent(boxId)}?${params.toString()}`;
}

export function buildBoxLookupUrl(origin: string, input: BoxLabelPathInput) {
  return new URL(buildBoxLookupPath(input), origin).toString();
}

export function buildBoxLabelSheetPath({
  householdId,
  moveId,
}: BoxLabelSheetPathInput) {
  const params = new URLSearchParams({ householdId, moveId });
  return `/app/box-labels?${params.toString()}`;
}

type BoxLabelPathInput = {
  householdId: string;
  moveId: string;
  boxId: string;
};

type BoxLabelSheetPathInput = {
  householdId: string;
  moveId: string;
  layout?: string;
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
  layout,
}: BoxLabelSheetPathInput) {
  const params = new URLSearchParams({ householdId, moveId });
  if (layout) {
    params.set("layout", layout);
  }
  return `/app/box-labels?${params.toString()}`;
}

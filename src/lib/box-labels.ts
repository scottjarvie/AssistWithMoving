type BoxLabelPathInput = {
  householdId: string;
  moveId: string;
  boxId: string;
  returnTo?: "load-plan";
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
  returnTo,
}: BoxLabelPathInput) {
  const params = new URLSearchParams({ householdId, moveId });
  if (returnTo) {
    params.set("returnTo", returnTo);
  }
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

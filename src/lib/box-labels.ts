// Where the user came from, so the box detail page can offer a "back to …"
// link that returns to the right place (not always the load plan).
export type BoxLookupReturnTo =
  | "load-plan"
  | "movable-units"
  | "spaces-transport";

type BoxLabelPathInput = {
  householdId: string;
  moveId: string;
  boxId: string;
  returnTo?: BoxLookupReturnTo;
  /** Open a specific editor on load (e.g. the weight & size editor). */
  edit?: "size";
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
  edit,
}: BoxLabelPathInput) {
  const params = new URLSearchParams({ householdId, moveId });
  if (returnTo) {
    params.set("returnTo", returnTo);
  }
  if (edit) {
    params.set("edit", edit);
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

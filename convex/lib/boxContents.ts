export function buildBoxContentsIndex<
  Membership extends { boxId: string; itemId: string },
  Item extends { _id: string; deletedAt?: number },
>(
  boxItems: readonly Membership[],
  items: readonly Item[],
): Map<Membership["boxId"], Array<{ membership: Membership; item: Item }>> {
  const itemsById = new Map(items.map((item) => [item._id, item]));
  const contentsByBox = new Map<
    Membership["boxId"],
    Array<{ membership: Membership; item: Item }>
  >();

  for (const membership of boxItems) {
    const item = itemsById.get(membership.itemId);
    if (!item || item.deletedAt) continue;

    const contents = contentsByBox.get(membership.boxId);
    const entry = { membership, item };
    if (contents) {
      contents.push(entry);
    } else {
      contentsByBox.set(membership.boxId, [entry]);
    }
  }

  return contentsByBox;
}

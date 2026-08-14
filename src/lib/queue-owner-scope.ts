export function defaultQueueOwnerScope(input: {
  currentUserId: string | undefined;
  canManage: boolean | undefined;
  delegatedOwnerCount: number | undefined;
}) {
  if (
    !input.currentUserId ||
    input.canManage === undefined ||
    input.delegatedOwnerCount === undefined
  ) {
    return "loading";
  }
  return input.canManage && input.delegatedOwnerCount > 0
    ? "all"
    : input.currentUserId;
}

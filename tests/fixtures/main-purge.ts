// Public main purge data loop, kept as a fixture to compare transaction behavior.
const MOVE_INDEXED_PURGE_TABLES: Array<{ table: string; index: string }> = [
  { table: "moveRoleGrants", index: "by_move_user" },
  { table: "moveParticipants", index: "by_move_user" },
  { table: "documentationProfiles", index: "by_move_status" },
  { table: "exportJobs", index: "by_move_created" },
  { table: "apiKeys", index: "by_move_status" },
  { table: "shareLinks", index: "by_move_status" },
  { table: "shareLinkComments", index: "by_move_created" },
  { table: "auditLogs", index: "by_move_time" },
  { table: "movePeople", index: "by_move_sort" },
  { table: "transportResources", index: "by_move_sort" },
  { table: "transportZones", index: "by_move_sort" },
  { table: "transportTrips", index: "by_move_sort" },
  { table: "tripSpaces", index: "by_move_sort" },
  { table: "moveSpaces", index: "by_move_sort" },
  { table: "movePlanningDefaults", index: "by_move_sort" },
  { table: "movePlanningRecords", index: "by_move_updated" },
  { table: "mcpOperations", index: "by_move" },
  { table: "aiGrantActivities", index: "by_move_created" },
  { table: "floorPlans", index: "by_move_status" },
  { table: "planLevels", index: "by_move" },
  { table: "planProposals", index: "by_move_status" },
  { table: "boxes", index: "by_move_status" },
  { table: "boxItems", index: "by_move" },
  { table: "itemPhotos", index: "by_move_created" },
  { table: "photoUploadSessions", index: "by_move_status" },
  { table: "ingestionQueueEntries", index: "by_move_status_order" },
  { table: "queueActivities", index: "by_move_created" },
  { table: "queueItems", index: "by_move_updated" },
  { table: "aiJobs", index: "by_move_status" },
  { table: "aiTextSuggestions", index: "by_move_status" },
  { table: "aiPhotoSuggestions", index: "by_move_status" },
  { table: "aiPlanningSuggestions", index: "by_move_status" },
  { table: "inventoryDuplicateDecisions", index: "by_move_status" },
  { table: "items", index: "by_move_status" },
  { table: "saleListings", index: "by_move_status" },
  { table: "plannedItems", index: "by_move_status" },
];

// Tables with a moveId but no moveId-first index: scan by household, filter.
const HOUSEHOLD_FILTER_PURGE_TABLES: Array<{ table: string; index: string }> = [
  { table: "planEntities", index: "by_household" },
  { table: "planPlacements", index: "by_household" },
  { table: "planOps", index: "by_household" },
  { table: "apiIdempotencyKeys", index: "by_household" },
  { table: "apiRateLimitWindows", index: "by_household" },
];

export const MOVE_PURGE_TABLE_NAMES: string[] = [
  ...MOVE_INDEXED_PURGE_TABLES.map((entry) => entry.table),
  ...HOUSEHOLD_FILTER_PURGE_TABLES.map((entry) => entry.table),
];

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function baselinePurgeMoveData(
  ctx: any,
  {
    householdId,
    moveId,
    dryRun,
  }: { householdId: any; moveId: any; dryRun: boolean },
) {
  const counts: Record<string, number> = {};
  let total = 0;

  async function deleteDocs(table: string, docs: Array<{ _id: any }>) {
    counts[table] = docs.length;
    total += docs.length;
    if (!dryRun) {
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
      }
    }
  }

  for (const { table, index } of MOVE_INDEXED_PURGE_TABLES) {
    const docs = await ctx.db
      .query(table)
      .withIndex(index, (q: any) => q.eq("moveId", moveId))
      .collect();
    await deleteDocs(table, docs);
  }

  for (const { table, index } of HOUSEHOLD_FILTER_PURGE_TABLES) {
    const docs = (
      await ctx.db
        .query(table)
        .withIndex(index, (q: any) => q.eq("householdId", householdId))
        .collect()
    ).filter((doc: any) => doc.moveId === moveId);
    await deleteDocs(table, docs);
  }

  return { counts, total };
}

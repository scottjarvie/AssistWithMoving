import {
  searchApiItems,
  validateInventoryQuery,
} from "../lib/inventorySearch";
import type {
  Doc,
  Id,
} from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
import {
  normalizeBoxCode,
  normalizeItemName,
  normalizeOptionalText,
  normalizeRuleList,
  normalizedSearchName,
} from "../lib/moveFields";
import {
  bodyRecord as bodyObject,
  paginate,
  parseRestPath,
  restError,
  restOk,
  type RestRequestInput,
  type RestResponse,
} from "../lib/rest/core";
import {
  findApiBoxByCode,
  normalizeOptionalBoxCode,
  assertUniqueApiBoxCode,
  assertRestBoxAssignmentRefs,
  applyRestBoxAssignmentValidation,
} from "./boxes";
import {
  addRestDerivedWeightBounds,
  addRestDerivedEstimatedVolume,
  parseMeasurementProvenance,
  inferredApiMeasurementProvenance,
  itemPatch,
  plannedItemPatch,
  boxPatch,
  normalizePlannedItemPriority,
} from "../lib/rest/patch";
import {
  requireApiItem,
  requireApiPlannedItem,
  requireApiBox,
} from "../lib/rest/require";
import {
  safeItem,
  safePlannedItem,
} from "../lib/rest/safe";
import {
  parseDimensionsIn,
  optionalNumber,
  positiveNumber,
  asString,
  optionalString,
  externalItemKeyFromInput,
  parseItemStatus,
  parsePlannedItemStatus,
  parseDisposition,
  parseCondition,
  parseBoxStatus,
  parsePlanningConfidence,
  parseFragility,
  parsePlanningDefaultKeys,
  parseStringArray,
  removeUndefined,
} from "../lib/rest/parse";
import { auditApiWrite } from "../lib/rest/audit";

export const maxBatchUpsertItems = 100;

export async function routeItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  itemIdSegment?: string
) {
  if (args.method === "GET" && !itemIdSegment) {
    const needle = args.query.q?.trim().toLowerCase();
    if (needle) {
      try {
        validateInventoryQuery(needle);
      } catch {
        return restError({ status: 400, code: "invalid_search", message: "Use at most 240 characters and 16 search terms." });
      }
      const status = parseItemStatus(args.query.status);
      const disposition = parseDisposition(args.query.disposition);
      if ((args.query.status && !status) || (args.query.disposition && !disposition)) {
        return restOk({ ...paginate([], args.query), truncated: false });
      }
      const { matches, truncated } = await searchApiItems(ctx, moveId, needle, { status, disposition });
      return restOk({ ...paginate(matches.map(item => safeItem(item, auth.visibility)), args.query), truncated });
    }
    const items = await ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        items
          .filter((item) => !item.deletedAt)
          .filter((item) =>
            args.query.status ? item.status === args.query.status : true
          )
          .filter((item) =>
            args.query.disposition
              ? item.disposition === args.query.disposition
              : true
          )
          .map((item) => safeItem(item, auth.visibility)),
        args.query
      )
    );
  }

  if (args.method === "GET" && itemIdSegment) {
    const item = await requireApiItem(ctx, auth.householdId, moveId, itemIdSegment);
    return restOk({ data: safeItem(item, auth.visibility) });
  }

  if (args.method === "POST" && itemIdSegment === "batch-upsert") {
    return await routeBatchUpsertItems(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && !itemIdSegment) {
    const body = bodyObject(args.body);
    await assertExternalItemKeyAvailable(ctx, auth.householdId, moveId, body);
    const { itemId, name } = await createApiItem(ctx, auth, moveId, body);
    await auditApiWrite(ctx, auth, moveId, "item.api_created", "items", itemId, {
      name,
      externalSource: externalItemKeyFromInput(body)?.externalSource,
    });
    return restOk({ data: { itemId } }, 201);
  }

  if (args.method === "PATCH" && itemIdSegment) {
    const item = await requireApiItem(ctx, auth.householdId, moveId, itemIdSegment);
    await assertExternalItemKeyAvailable(
      ctx,
      auth.householdId,
      moveId,
      args.body,
      item._id
    );
    const patch = itemPatch(args.body, auth, item);
    await ctx.db.patch(item._id, patch);
    await auditApiWrite(ctx, auth, moveId, "item.api_updated", "items", item._id, {
      changedKeys: Object.keys(patch),
    });
    return restOk({ data: { itemId: item._id, ...patch } });
  }

  return restError({ status: 404, code: "not_found", message: "Item route not found." });
}

export async function routePlannedItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  plannedItemIdSegment?: string,
  action?: string
) {
  if (args.method === "GET" && !plannedItemIdSegment) {
    const includeArchived = args.query.includeArchived === "true";
    const plannedItems = await ctx.db
      .query("plannedItems")
      .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        plannedItems
          .filter((plannedItem) => plannedItem.householdId === auth.householdId)
          .filter((plannedItem) => includeArchived || !plannedItem.archivedAt)
          .map((plannedItem) => safePlannedItem(plannedItem)),
        args.query,
      ),
    );
  }

  if (args.method === "GET" && plannedItemIdSegment) {
    const plannedItem = await requireApiPlannedItem(
      ctx,
      auth.householdId,
      moveId,
      plannedItemIdSegment,
      args.query.includeArchived === "true",
    );
    return restOk({ data: safePlannedItem(plannedItem) });
  }

  if (args.method === "POST" && !plannedItemIdSegment) {
    const body = bodyObject(args.body);
    const name = normalizeItemName(String(body.name ?? ""));
    if (!name) {
      throw new Error("name is required.");
    }
    const now = Date.now();
    const plannedItemId = await ctx.db.insert("plannedItems", {
      householdId: auth.householdId,
      moveId,
      name,
      normalizedName: normalizedSearchName(name),
      category: normalizeOptionalText(asString(body.category)),
      subcategory: normalizeOptionalText(asString(body.subcategory)),
      description: normalizeOptionalText(asString(body.description)),
      dimensionsIn: parseDimensionsIn(body.dimensionsIn),
      dimensionsConfidence: parsePlanningConfidence(
        body.dimensionsConfidence,
        "dimensionsConfidence",
      ),
      estimatedPriceCents: optionalNumber(body.estimatedPriceCents),
      url: normalizeOptionalText(asString(body.url)),
      priority: normalizePlannedItemPriority(optionalNumber(body.priority)),
      notes: normalizeOptionalText(asString(body.notes)),
      status: parsePlannedItemStatus(body.status) ?? "idea",
      createdVia: "api",
      createdByUserId: auth.createdByUserId,
      updatedByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "planned_item.api_created",
      "plannedItems",
      plannedItemId,
      { name },
    );
    return restOk({ data: { plannedItemId } }, 201);
  }

  if (args.method === "PATCH" && plannedItemIdSegment) {
    const plannedItem = await requireApiPlannedItem(
      ctx,
      auth.householdId,
      moveId,
      plannedItemIdSegment,
      false,
    );
    const patch = plannedItemPatch(args.body, auth.createdByUserId);
    await ctx.db.patch(plannedItem._id, patch);
    const updated = await ctx.db.get(plannedItem._id);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "planned_item.api_updated",
      "plannedItems",
      plannedItem._id,
      { changedKeys: Object.keys(patch) },
    );
    return restOk({
      data: updated ? safePlannedItem(updated) : { plannedItemId: plannedItem._id },
    });
  }

  if (args.method === "POST" && plannedItemIdSegment && action === "convert") {
    const plannedItem = await requireApiPlannedItem(
      ctx,
      auth.householdId,
      moveId,
      plannedItemIdSegment,
      false,
    );
    const result = await convertApiPlannedItem(ctx, auth, plannedItem);
    return restOk({ data: result }, 201);
  }

  if (args.method === "DELETE" && plannedItemIdSegment) {
    const plannedItem = await requireApiPlannedItem(
      ctx,
      auth.householdId,
      moveId,
      plannedItemIdSegment,
      false,
    );
    const now = Date.now();
    await ctx.db.patch(plannedItem._id, {
      archivedAt: now,
      updatedAt: now,
      updatedByUserId: auth.createdByUserId,
    });
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "planned_item.api_archived",
      "plannedItems",
      plannedItem._id,
      {},
    );
    return restOk({ data: { plannedItemId: plannedItem._id, archivedAt: now } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Planned item route not found.",
  });
}

export async function routeBatchUpsertItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const body = bodyObject(args.body);
  const rows = Array.isArray(body.items) ? body.items : [];
  const dryRun = Boolean(body.dryRun);
  if (!rows.length) {
    return restError({
      status: 400,
      code: "invalid_batch",
      message: "items must include at least one row.",
    });
  }
  if (rows.length > maxBatchUpsertItems) {
    return restError({
      status: 400,
      code: "batch_too_large",
      message: `Batch item imports are limited to ${maxBatchUpsertItems} rows.`,
    });
  }

  const results = [];
  for (const [index, row] of rows.entries()) {
    const input = bodyObject(row);
    let itemId = optionalString(input.itemId);
    try {
      const externalKey = externalItemKeyFromInput(input);
      const externalMatch =
        !itemId && externalKey
          ? await findApiItemByExternalKey(ctx, auth.householdId, moveId, externalKey)
          : null;
      itemId = itemId ?? externalMatch?._id;
      if (itemId) {
        const item = await requireApiItem(ctx, auth.householdId, moveId, itemId);
        const patch = itemPatch(input, auth, item);
        if (
          externalKey &&
          (item.externalSource !== externalKey.externalSource ||
            item.externalId !== externalKey.externalId)
        ) {
          await assertExternalItemKeyAvailable(
            ctx,
            auth.householdId,
            moveId,
            input,
            item._id
          );
        }
        if (!dryRun) {
          await ctx.db.patch(item._id, patch);
          await auditApiWrite(
            ctx,
            auth,
            moveId,
            "item.api_batch_updated",
            "items",
            item._id,
            { rowIndex: index, changedKeys: Object.keys(patch) }
          );
        }
        results.push({
          index,
          ok: true,
          action: "update",
          itemId: item._id,
          externalSource: item.externalSource ?? externalKey?.externalSource,
          externalId: item.externalId ?? externalKey?.externalId,
          changedKeys: Object.keys(patch),
          matchedBy: externalMatch ? "externalKey" : "itemId",
          dryRun,
        });
        continue;
      }

      const name = normalizeItemName(String(input.name ?? ""));
      if (!name) {
        throw new Error("name is required when creating an item.");
      }
      if (dryRun) {
        results.push({
          index,
          ok: true,
          action: "create",
          name,
          dryRun,
        });
        continue;
      }
      const created = await createApiItem(ctx, auth, moveId, input);
      await auditApiWrite(
        ctx,
        auth,
        moveId,
        "item.api_batch_created",
        "items",
        created.itemId,
        { rowIndex: index, name: created.name }
      );
      results.push({
        index,
        ok: true,
        action: "create",
        itemId: created.itemId,
        name: created.name,
        externalSource: created.externalSource,
        externalId: created.externalId,
        dryRun,
      });
    } catch (error) {
      results.push({
        index,
        ok: false,
        action: itemId ? "update" : "create",
        itemId: itemId || undefined,
        error: error instanceof Error ? error.message : "Row failed.",
        dryRun,
      });
    }
  }

  const failed = results.filter((result) => !result.ok).length;

  return restOk(
    {
      data: {
        dryRun,
        total: rows.length,
        succeeded: results.filter((result) => result.ok).length,
        failed,
        results,
      },
    },
    failed > 0 ? 207 : 200
  );
}

type RestMovableUnitBoxRow = {
  unit: Record<string, unknown>;
  unitIndex: number;
  unitCountIndex?: number;
  unitCount?: number;
};

export async function routeMovableUnits(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  action?: string
) {
  if (
    args.method !== "POST" ||
    action !== "batch-upsert" ||
    parseRestPath(args.path).length !== 4
  ) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Movable units route not found.",
    });
  }

  const body = bodyObject(args.body);
  const units = Array.isArray(body.units) ? body.units : [];
  const dryRun = Boolean(body.dryRun);
  const idempotencyKey =
    optionalString(body.idempotencyKey) ?? optionalString(args.idempotencyKey);
  if (!units.length) {
    return restError({
      status: 400,
      code: "invalid_batch",
      message: "units must include at least one row.",
    });
  }
  if (units.length > maxBatchUpsertItems) {
    return restError({
      status: 400,
      code: "batch_too_large",
      message: `Movable unit batches are limited to ${maxBatchUpsertItems} input rows.`,
    });
  }

  const boxRows: RestMovableUnitBoxRow[] = [];
  const looseItemUnits: Array<{
    unit: Record<string, unknown>;
    unitIndex: number;
  }> = [];
  const missingStableLooseRows: number[] = [];
  const autoCodedBoxRows = new Set<number>();

  for (const [unitIndex, row] of units.entries()) {
    const unit = bodyObject(row);
    if (unit.kind === "box") {
      let expanded: RestMovableUnitBoxRow[];
      try {
        expanded = expandRestMovableUnitBoxRows(unit, unitIndex);
      } catch (error) {
        return restError({
          status: 400,
          code: "validation_error",
          message: error instanceof Error ? error.message : "Invalid box row.",
        });
      }
      boxRows.push(...expanded);
      if (
        expanded.some(
          ({ unit: boxUnit }) =>
            !optionalString(boxUnit.boxId) && !normalizeOptionalBoxCode(boxUnit.code)
        )
      ) {
        autoCodedBoxRows.add(unitIndex);
      }
      continue;
    }

    if (unit.kind === "looseItem") {
      looseItemUnits.push({ unit, unitIndex });
      if (!optionalString(unit.itemId) && !hasRestStableExternalItemKey(unit)) {
        missingStableLooseRows.push(unitIndex);
      }
      continue;
    }

    return restError({
      status: 400,
      code: "validation_error",
      message: `units.${unitIndex}.kind must be "box" or "looseItem".`,
    });
  }

  if (boxRows.length + looseItemUnits.length > maxBatchUpsertItems) {
    return restError({
      status: 400,
      code: "batch_too_large",
      message: `Movable unit batches are limited to ${maxBatchUpsertItems} expanded rows.`,
    });
  }
  if (missingStableLooseRows.length) {
    return restError({
      status: 400,
      code: "stable_key_required",
      message: `looseItem rows require itemId for existing units or externalSource plus externalId for new units. Missing stable key on row index${missingStableLooseRows.length === 1 ? "" : "es"} ${missingStableLooseRows.join(", ")}.`,
    });
  }

  const autoCodedBoxWarning =
    autoCodedBoxRows.size && !idempotencyKey
      ? `Box rows without boxId or code will receive server-generated box codes. Pass a stable idempotencyKey before live writes for row index${autoCodedBoxRows.size === 1 ? "" : "es"} ${[...autoCodedBoxRows].join(", ")} so retries do not create duplicate auto-coded boxes.`
      : undefined;

  if (!dryRun && autoCodedBoxWarning) {
    return restError({
      status: 400,
      code: "idempotency_required",
      message: `${autoCodedBoxWarning} Use explicit box codes or existing boxId rows if you do not want to rely on a batch idempotency key.`,
    });
  }

  const itemRows = looseItemUnits.map(({ unit }) => movableUnitLooseItemBody(unit));

  if (dryRun) {
    return restOk({
      data: {
        dryRun: true,
        summary: {
          totalUnits: boxRows.length + looseItemUnits.length,
          boxes: boxRows.length,
          looseItems: looseItemUnits.length,
        },
        requests: [
          ...boxRows.map(({ unit, unitIndex, unitCountIndex, unitCount }) => {
            const boxBody = movableUnitBoxBody(unit);
            const boxId = optionalString(unit.boxId);
            return removeUndefined({
              method: boxId ? "PATCH" : "POST",
              path: boxId
                ? `/moves/${moveId}/boxes/${boxId}`
                : `/moves/${moveId}/boxes`,
              body: boxBody,
              unitIndex,
              unitCountIndex,
              unitCount,
            });
          }),
          ...(itemRows.length
            ? [
                {
                  method: "POST",
                  path: `/moves/${moveId}/items/batch-upsert`,
                  body: { dryRun: true, items: itemRows },
                  unitIndexes: looseItemUnits.map(({ unitIndex }) => unitIndex),
                },
              ]
            : []),
        ],
        warnings: autoCodedBoxWarning ? [autoCodedBoxWarning] : undefined,
        note: `Dry run only. Box rows with boxId update that box; rows with code update an exact existing code on live run or create a box if none exists. New loose item rows become active, reviewable movable units. Pass itemId to patch an existing loose movable unit without defaulting omitted status, quantity, needsReview, reviewFlags, or aiTags.${autoCodedBoxWarning ? " Live writes with auto-coded box rows require a stable idempotencyKey." : ""}`,
      },
    });
  }

  const boxResults = [];
  for (const [index, boxRow] of boxRows.entries()) {
    try {
      boxResults.push(
        removeUndefined({
          ...boxRow,
          ...(await upsertRestMovableUnitBox(ctx, auth, moveId, boxRow.unit, {
            rowIndex: index,
          })),
        })
      );
    } catch (error) {
      boxResults.push(
        removeUndefined({
          unitIndex: boxRow.unitIndex,
          unitCountIndex: boxRow.unitCountIndex,
          unitCount: boxRow.unitCount,
          ok: false,
          action: optionalString(boxRow.unit.boxId) ? "update" : "upsert",
          boxId: optionalString(boxRow.unit.boxId),
          code: normalizeOptionalBoxCode(boxRow.unit.code),
          error: error instanceof Error ? error.message : "Box row failed.",
        })
      );
    }
  }

  const itemResponse = itemRows.length
    ? await routeBatchUpsertItems(
        ctx,
        {
          ...args,
          method: "POST",
          path: `/moves/${moveId}/items/batch-upsert`,
          body: { dryRun: false, items: itemRows },
        },
        auth,
        moveId
      )
    : null;
  const itemError = restResponseErrorMessage(
    itemResponse,
    "Loose movable-unit item batch failed."
  );
  const itemBody = bodyObject(itemResponse?.body);
  const itemData = bodyObject(itemBody.data);
  const itemResultRows = Array.isArray(itemData.results)
    ? itemData.results.map(bodyObject)
    : [];
  const looseItemResults = itemError
    ? looseItemUnits.map(({ unit, unitIndex }, itemIndex) =>
        removeUndefined({
          unitIndex,
          itemIndex,
          ok: false,
          action: optionalString(unit.itemId) ? "update" : "create",
          itemId: optionalString(unit.itemId),
          name: optionalString(unit.name),
          externalSource: optionalString(unit.externalSource),
          externalId: optionalString(unit.externalId),
          error: itemError,
        })
      )
    : looseItemUnits.map(({ unit, unitIndex }, itemIndex) => {
        const result = itemResultRows.find((row) => row.index === itemIndex);
        return removeUndefined({
          unitIndex,
          itemIndex,
          ok: result?.ok,
          action: result?.action,
          itemId: result?.itemId ?? unit.itemId,
          name: result?.name ?? unit.name,
          externalSource: result?.externalSource ?? unit.externalSource,
          externalId: result?.externalId ?? unit.externalId,
          error: result?.error,
        });
      });

  const failed =
    boxResults.filter((row) => row.ok === false).length +
    looseItemResults.filter((row) => row.ok === false).length;

  return restOk(
    {
      data: {
        dryRun: false,
        summary: {
          totalUnits: boxRows.length + looseItemUnits.length,
          boxes: boxRows.length,
          looseItems: looseItemUnits.length,
        },
        boxes: boxResults,
        items: itemData,
        itemBatchError: itemError ?? undefined,
        looseItems: looseItemResults,
        nextStep:
          "Open the Load planner Movable units tab, or call get_move_summary/get_agent_context, to review missing weights, dimensions, volume, and load assignments.",
      },
    },
    failed > 0 ? 207 : 200
  );
}

function expandRestMovableUnitBoxRows(
  unit: Record<string, unknown>,
  unitIndex: number
): RestMovableUnitBoxRow[] {
  const count = parseRestMovableUnitBoxCount(unit.count);
  if (count > 1 && (optionalString(unit.boxId) || normalizeOptionalBoxCode(unit.code))) {
    throw new Error(
      `Box row index ${unitIndex} has count ${count} with an existing boxId/code. Expand coded ranges into explicit box code rows, or omit count when patching an existing box.`
    );
  }
  if (count === 1) {
    const singleUnit = { ...unit };
    delete singleUnit.count;
    return [{ unit: singleUnit, unitIndex }];
  }

  const baseLabel = normalizeCountedRestBoxLabel(unit.label ?? unit.name);
  return Array.from({ length: count }, (_, index) => {
    const expandedUnit: Record<string, unknown> = {
      ...unit,
      label: `${baseLabel} ${index + 1}`,
    };
    delete expandedUnit.count;
    return {
      unit: expandedUnit,
      unitIndex,
      unitCountIndex: index,
      unitCount: count,
    };
  });
}

function parseRestMovableUnitBoxCount(count: unknown) {
  if (count === undefined || count === null || count === "") return 1;
  const parsed = Number(count);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error("Box count must be an integer from 1 to 100.");
  }
  return parsed;
}

function normalizeCountedRestBoxLabel(label: unknown) {
  const cleaned = typeof label === "string" ? label.trim() : "";
  const base = cleaned || "Box";
  return (
    base
      .replace(/\bboxes\b/i, "box")
      .replace(/\s+#?\d+$/i, "")
      .trim() || "Box"
  );
}

function movableUnitBoxBody(unit: Record<string, unknown>) {
  const body = { ...unit };
  delete body.kind;
  delete body.boxId;
  delete body.count;
  if (body.label === undefined && body.name !== undefined) {
    body.label = body.name;
  }
  delete body.name;
  addRestDerivedEstimatedVolume(body);
  return body;
}

function movableUnitLooseItemBody(unit: Record<string, unknown>) {
  const item = { ...unit };
  delete item.kind;
  addRestDerivedEstimatedVolume(item);
  const isExistingItemPatch = Boolean(optionalString(item.itemId));
  const requiresPersonalTransport =
    item.requiresPersonalTransport === true || item.disposition === "personalTransport";
  const shouldSendMovableUnitTags = !isExistingItemPatch || Array.isArray(item.aiTags);
  return {
    ...item,
    ...(isExistingItemPatch ? {} : { status: item.status ?? "active" }),
    ...(isExistingItemPatch ? {} : { quantity: item.quantity ?? 1 }),
    ...(isExistingItemPatch ? {} : { needsReview: item.needsReview ?? true }),
    ...(isExistingItemPatch || item.disposition !== undefined
      ? {}
      : { disposition: requiresPersonalTransport ? "personalTransport" : "mover" }),
    ...(requiresPersonalTransport && item.requiresPersonalTransport === undefined
      ? { requiresPersonalTransport: true }
      : {}),
    ...(item.estimatedWeightLb !== undefined && item.weightConfidence === undefined
      ? { weightConfidence: "low" }
      : {}),
    ...(item.dimensionsIn !== undefined && item.dimensionsConfidence === undefined
      ? { dimensionsConfidence: "low" }
      : {}),
    ...(item.estimatedVolumeCuFt !== undefined && item.volumeConfidence === undefined
      ? { volumeConfidence: "low" }
      : {}),
    ...(shouldSendMovableUnitTags
      ? {
          aiTags: uniqueRestStrings([
            ...(Array.isArray(item.aiTags) ? item.aiTags : []),
            "movable-unit",
            "loose-item",
            ...(requiresPersonalTransport ? ["personal-transport"] : []),
          ]),
        }
      : {}),
    ...(isExistingItemPatch && item.reviewFlags === undefined
      ? {}
      : {
          reviewFlags: uniqueRestStrings([
            ...(Array.isArray(item.reviewFlags) ? item.reviewFlags : []),
            ...(isExistingItemPatch ? [] : ["movableUnitReview"]),
          ]),
        }),
  };
}

async function upsertRestMovableUnitBox(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  unit: Record<string, unknown>,
  { rowIndex }: { rowIndex: number }
) {
  const input = movableUnitBoxBody(unit);
  const requestedBoxId = optionalString(unit.boxId);
  const requestedCode = normalizeOptionalBoxCode(unit.code);
  const existing = requestedBoxId
    ? await requireApiBox(ctx, auth.householdId, moveId, requestedBoxId)
    : requestedCode
      ? await findApiBoxByCode(ctx, auth.householdId, moveId, requestedCode)
      : null;

  if (existing) {
    const patch = boxPatch(input);
    if (patch.code !== undefined) {
      await assertUniqueApiBoxCode(ctx, {
        householdId: auth.householdId,
        moveId,
        code: patch.code,
        currentBoxId: existing._id,
      });
    }
    await applyRestBoxAssignmentValidation(ctx, auth, moveId, existing, patch);
    await ctx.db.patch(existing._id, patch);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "box.api_movable_unit_updated",
      "boxes",
      existing._id,
      { rowIndex, changedKeys: Object.keys(patch) }
    );
    return {
      ok: true,
      action: "update",
      boxId: existing._id,
      code: patch.code ?? existing.code,
      changedKeys: Object.keys(patch),
      matchedBy: requestedBoxId ? "boxId" : "code",
    };
  }

  const now = Date.now();
  const fields = restMovableUnitBoxCreateFields({
    auth,
    moveId,
    body: input,
    now,
    fallbackCode: `API-${now}-${rowIndex + 1}`,
  });
  await assertUniqueApiBoxCode(ctx, {
    householdId: auth.householdId,
    moveId,
    code: fields.code,
  });
  await assertRestBoxAssignmentRefs(ctx, auth.householdId, moveId, {
    assignedResourceId: fields.assignedResourceId,
    assignedZoneId: fields.assignedZoneId,
  });
  const boxId = await ctx.db.insert("boxes", fields);
  await auditApiWrite(
    ctx,
    auth,
    moveId,
    "box.api_movable_unit_created",
    "boxes",
    boxId,
    { rowIndex, code: fields.code }
  );
  return {
    ok: true,
    action: "create",
    boxId,
    code: fields.code,
  };
}

function restMovableUnitBoxCreateFields({
  auth,
  moveId,
  body,
  now,
  fallbackCode,
}: {
  auth: Awaited<ReturnType<typeof authenticateApiKey>>;
  moveId: Id<"moves">;
  body: Record<string, unknown>;
  now: number;
  fallbackCode: string;
}): Omit<Doc<"boxes">, "_id" | "_creationTime"> {
  return removeUndefined({
    householdId: auth.householdId,
    moveId,
    code: normalizeOptionalBoxCode(body.code) ?? normalizeBoxCode(fallbackCode),
    label: normalizeOptionalText(asString(body.label)),
    room: normalizeOptionalText(asString(body.room)),
    destinationRoom: normalizeOptionalText(asString(body.destinationRoom)),
    description: normalizeOptionalText(asString(body.description)),
    status: parseBoxStatus(body.status) ?? "open",
    dimensionsIn: parseDimensionsIn(body.dimensionsIn) as Doc<"boxes">["dimensionsIn"],
    estimatedWeightLb: optionalNumber(body.estimatedWeightLb),
    actualWeightLb: optionalNumber(body.actualWeightLb),
    estimatedVolumeCuFt: optionalNumber(body.estimatedVolumeCuFt),
    assignedResourceId: optionalString(body.assignedResourceId) as
      | Id<"transportResources">
      | undefined,
    assignedZoneId: optionalString(body.assignedZoneId) as
      | Id<"transportZones">
      | undefined,
    assignmentLocked: Boolean(body.assignmentLocked),
    assignmentOverrideReason: normalizeOptionalText(asString(body.assignmentOverrideReason)),
    assignmentWarnings: [],
    assignmentHardBlocks: [],
    assignmentValidatedAt: now,
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  }) as Omit<Doc<"boxes">, "_id" | "_creationTime">;
}

function hasRestStableExternalItemKey(unit: Record<string, unknown>) {
  return Boolean(optionalString(unit.externalSource) && optionalString(unit.externalId));
}

function uniqueRestStrings(values: unknown[]) {
  return [
    ...new Set(
      values.filter(
        (value): value is string => typeof value === "string" && Boolean(value.trim())
      )
    ),
  ];
}

function restResponseErrorMessage(response: RestResponse | null, fallback: string) {
  if (!response || response.status < 400) {
    return null;
  }
  const body = bodyObject(response.body);
  const error = bodyObject(body.error);
  return optionalString(error.message) ?? fallback;
}

async function createApiItem(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  body: Record<string, unknown>
) {
  const now = Date.now();
  // Persist volume from dimensions + weight range from the point estimate when
  // not explicitly sent.
  addRestDerivedEstimatedVolume(body);
  addRestDerivedWeightBounds(body);
  const name = normalizeItemName(String(body.name ?? ""));
  const externalKey = externalItemKeyFromInput(body);
  const itemId = await ctx.db.insert("items", {
    householdId: auth.householdId,
    moveId,
    name,
    normalizedName: normalizedSearchName(name),
    externalSource: externalKey?.externalSource,
    externalId: externalKey?.externalId,
    description: normalizeOptionalText(asString(body.description)),
    room: normalizeOptionalText(asString(body.room)),
    destinationRoom: normalizeOptionalText(asString(body.destinationRoom)),
    category: normalizeOptionalText(asString(body.category)),
    subcategory: normalizeOptionalText(asString(body.subcategory)),
    disposition: parseDisposition(body.disposition) ?? "undecided",
    status: parseItemStatus(body.status) ?? "active",
    quantity: positiveNumber(body.quantity) ?? 1,
    condition: parseCondition(body.condition) ?? "unknown",
    valueCents: optionalNumber(body.valueCents),
    replacementValueCents: optionalNumber(body.replacementValueCents),
    serialNumber: normalizeOptionalText(asString(body.serialNumber)),
    modelNumber: normalizeOptionalText(asString(body.modelNumber)),
    dimensionsIn: parseDimensionsIn(body.dimensionsIn),
    measurementProvenance:
      parseMeasurementProvenance(body.measurementProvenance, auth, now) ??
      inferredApiMeasurementProvenance(body, auth, now),
    estimatedWeightLb: optionalNumber(body.estimatedWeightLb),
    estimatedWeightLowLb: optionalNumber(body.estimatedWeightLowLb),
    estimatedWeightHighLb: optionalNumber(body.estimatedWeightHighLb),
    actualWeightLb: optionalNumber(body.actualWeightLb),
    estimatedVolumeCuFt: optionalNumber(body.estimatedVolumeCuFt),
    estimatedPackedVolumeCuFt: optionalNumber(body.estimatedPackedVolumeCuFt),
    dimensionsConfidence:
      parsePlanningConfidence(body.dimensionsConfidence, "dimensionsConfidence") ??
      "none",
    weightConfidence:
      parsePlanningConfidence(body.weightConfidence, "weightConfidence") ?? "none",
    volumeConfidence:
      parsePlanningConfidence(body.volumeConfidence, "volumeConfidence") ?? "none",
    fragility: parseFragility(body.fragility) ?? "low",
    stackable: body.stackable === undefined ? true : Boolean(body.stackable),
    hazardousFlag: Boolean(body.hazardousFlag),
    highValue: Boolean(body.highValue),
    requiresPersonalTransport: Boolean(body.requiresPersonalTransport),
    planningDefaultKeys: parsePlanningDefaultKeys(body.planningDefaultKeys) ?? [],
    needsReview: Boolean(body.needsReview),
    reviewFlags: normalizeRuleList(parseStringArray(body.reviewFlags) ?? []),
    privateNotes: normalizeOptionalText(asString(body.privateNotes)),
    aiSummary: normalizeOptionalText(asString(body.aiSummary)),
    aiTags: normalizeRuleList(parseStringArray(body.aiTags) ?? []),
    createdVia: "api",
    createdByUserId: auth.createdByUserId,
    updatedByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });

  return { itemId, name, ...externalKey };
}

async function convertApiPlannedItem(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plannedItem: Doc<"plannedItems">
) {
  if (plannedItem.convertedItemId) {
    return {
      itemId: plannedItem.convertedItemId,
      reparentedPlacementCount: 0,
    };
  }

  const now = Date.now();
  const itemId = await ctx.db.insert("items", {
    householdId: plannedItem.householdId,
    moveId: plannedItem.moveId,
    name: plannedItem.name,
    normalizedName: plannedItem.normalizedName,
    description: plannedItem.description,
    category: plannedItem.category,
    subcategory: plannedItem.subcategory,
    disposition: "take",
    status: "active",
    quantity: 1,
    condition: "unknown",
    dimensionsIn: plannedItem.dimensionsIn,
    dimensionsConfidence: plannedItem.dimensionsConfidence ?? "medium",
    weightConfidence: "none",
    volumeConfidence: "none",
    fragility: "low",
    stackable: true,
    hazardousFlag: false,
    highValue: false,
    requiresPersonalTransport: false,
    planningDefaultKeys: [],
    needsReview: false,
    reviewFlags: [],
    privateNotes: plannedItem.notes,
    aiTags: [],
    createdVia: "api",
    reviewedAt: now,
    createdByUserId: auth.createdByUserId,
    updatedByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });

  const placements = (
    await ctx.db
      .query("planPlacements")
      .withIndex("by_planned_item", (q) => q.eq("plannedItemId", plannedItem._id))
      .collect()
  ).filter(
    (placement) =>
      placement.householdId === plannedItem.householdId &&
      placement.moveId === plannedItem.moveId &&
      !placement.archivedAt,
  );

  await Promise.all(
    placements.map((placement) =>
      ctx.db.patch(placement._id, {
        itemId,
        plannedItemId: undefined,
        updatedAt: now,
      }),
    ),
  );

  await ctx.db.patch(plannedItem._id, {
    status: "purchased",
    convertedItemId: itemId,
    updatedByUserId: auth.createdByUserId,
    updatedAt: now,
  });

  await auditApiWrite(
    ctx,
    auth,
    plannedItem.moveId,
    "planned_item.api_converted",
    "plannedItems",
    plannedItem._id,
    {
      itemId,
      reparentedPlacementCount: placements.length,
    },
  );

  return { itemId, reparentedPlacementCount: placements.length };
}

async function findApiItemByExternalKey(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  externalKey: { externalSource: string; externalId: string }
) {
  const item = await ctx.db
    .query("items")
    .withIndex("by_move_external_key", (q) =>
      q
        .eq("moveId", moveId)
        .eq("externalSource", externalKey.externalSource)
        .eq("externalId", externalKey.externalId)
    )
    .collect();
  return (
    item.find((entry) => entry.householdId === householdId && !entry.deletedAt) ??
    null
  );
}

async function assertExternalItemKeyAvailable(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  input: unknown,
  allowedItemId?: Id<"items">
) {
  const externalKey = externalItemKeyFromInput(bodyObject(input));
  if (!externalKey) return;
  const existing = await findApiItemByExternalKey(
    ctx,
    householdId,
    moveId,
    externalKey
  );
  if (existing && existing._id !== allowedItemId) {
    throw new Error("External source key already exists for this move.");
  }
}

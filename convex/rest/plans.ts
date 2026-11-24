import type {
  Doc,
  Id,
} from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordAuditEvent } from "../lib/audit";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
import { itemDimensionsConfidenceForRead } from "../../src/lib/inventory-measurements";
import {
  describePlanDocument,
  normalizePlanDocument,
  renderPlanSnapshotSvg,
  type PlanDocumentInput,
  type PlanEntitySummary,
  type PlanPlacementSummary,
  type PlanSourceSummary,
} from "../../src/lib/plan-describe";
import {
  bodyRecord as bodyObject,
  moveIdFromRestBodyOrQuery,
  paginate,
  restError,
  restOk,
  type RestRequestInput,
} from "../lib/rest/core";
import { internalFunctions } from "../lib/rest/functionReferences";
import {
  requireApiMove,
  requireApiPlan,
} from "../lib/rest/require";
import {
  optionalString,
  requiredBodyString,
} from "../lib/rest/parse";

export async function routePlans(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  planIdSegment?: string,
  nested?: string
) {
  if (args.method === "GET" && !planIdSegment) {
    const moveId = planListMoveId(args, auth);
    if (!moveId) {
      return restError({
        status: 400,
        code: "move_required",
        message: "moveId is required for listing plans.",
      });
    }
    await requireApiMove(ctx, auth.householdId, moveId);
    const plans = await ctx.db
      .query("floorPlans")
      .withIndex("by_move_status", (q) => q.eq("moveId", moveId))
      .collect();
    const activePlans = plans.filter((plan) => !plan.archivedAt);
    const summaries = await Promise.all(
      activePlans.map(async (plan) => ({
        planId: plan._id,
        moveId: plan.moveId,
        name: plan.name,
        kind: plan.kind,
        status: plan.status,
        levels: await planLevelSummaries(ctx, plan._id),
        updatedAt: plan.updatedAt,
      })),
    );
    return restOk(paginate(summaries, args.query));
  }

  if (!planIdSegment) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Plan route not found.",
    });
  }

  const plan = await requireApiPlan(ctx, auth, planIdSegment);
  if (args.method === "GET" && !nested) {
    return restOk({ data: await planDocumentForApi(ctx, plan) });
  }
  if (args.method === "GET" && nested === "summary") {
    const document = await planDocumentForApi(ctx, plan);
    return restOk({ data: { planId: plan._id, summary: describePlanDocument(document) } });
  }
  if (args.method === "GET" && nested === "snapshot.svg") {
    const document = await planDocumentForApi(ctx, plan);
    return {
      status: 200,
      body: renderPlanSnapshotSvg(document, args.query.level),
      headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
    };
  }
  if (nested === "proposals") {
    return await routePlanProposals(ctx, args, auth, plan);
  }
  if (args.method === "POST" && nested === "ops") {
    return await routePlanOps(ctx, args, auth, plan);
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Plan route not found.",
  });
}

async function routePlanOps(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">
) {
  const body = bodyObject(args.body);
  const batchId = requiredBodyString(body.batchId, "batchId is required.");
  const ops = requiredOps(body.ops);
  const agentLabel = optionalString(body.agentLabel);

  try {
    const result = await ctx.runMutation(internalFunctions.planOps.applyApiOps, {
      householdId: auth.householdId,
      moveId: plan.moveId,
      planId: plan._id,
      batchId,
      ops,
      apiKeyId: auth.apiKeyId,
      agentLabel,
      acknowledgeContactDetails: body.acknowledgeContactDetails,
      restorePrivately: body.restorePrivately as boolean | undefined,
    });
    return restOk({ data: result }, 201);
  } catch (error) {
    const structured = structuredPlanOpError(error);
    if (structured) {
      return {
        status: 400,
        body: {
          error: {
            code: structured.code,
            message: structured.reason,
            index: structured.index,
          },
        },
      };
    }
    throw error;
  }
}

async function routePlanProposals(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">
) {
  if (args.method === "GET") {
    const statuses = args.query.includeReviewed === "true"
      ? (["pending", "applied", "partiallyApplied", "rejected"] as const)
      : (["pending"] as const);
    const proposals = (
      await Promise.all(
        statuses.map((status) =>
          ctx.db
            .query("planProposals")
            .withIndex("by_plan_status", (q) =>
              q.eq("planId", plan._id).eq("status", status)
            )
            .collect(),
        ),
      )
    ).flat();
    return restOk(
      paginate(
        proposals
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((proposal) => safePlanProposal(proposal)),
        args.query,
      ),
    );
  }

  if (args.method === "POST") {
    const body = bodyObject(args.body);
    const batchId = requiredBodyString(body.batchId, "batchId is required.");
    const ops = requiredOps(body.ops);
    const reasoning = requiredBodyString(body.reasoning, "reasoning is required.");
    const agentLabel = optionalString(body.agentLabel);
    const now = Date.now();
    const proposalId = await ctx.db.insert("planProposals", {
      householdId: auth.householdId,
      moveId: plan.moveId,
      planId: plan._id,
      batchId,
      ops,
      agentLabel,
      reasoning: reasoning.slice(0, 8000),
      status: "pending",
      appliedOpIndexes: [],
      createdByApiKeyId: auth.apiKeyId,
      createdAt: now,
      updatedAt: now,
    });
    await recordAuditEvent(ctx, {
      householdId: auth.householdId,
      moveId: plan.moveId,
      actorType: "apiKey",
      actorApiKeyId: auth.actor.apiKeyId,
      category: "plan",
      action: "plan.proposal_created",
      objectTable: "planProposals",
      objectId: proposalId,
      metadata: {
        planId: plan._id,
        batchId,
        opCount: ops.length,
        agentLabel,
      },
    });
    const proposal = await ctx.db.get(proposalId);
    return restOk(
      { data: proposal ? safePlanProposal(proposal) : { proposalId } },
      201,
    );
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Plan proposal route not found.",
  });
}

function planListMoveId(
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
) {
  return (
    auth.moveId ??
    moveIdFromRestBodyOrQuery({
      body: args.body,
      query: args.query,
    })
  ) as Id<"moves"> | undefined;
}

async function planLevelSummaries(ctx: MutationCtx, planId: Id<"floorPlans">) {
  const levels = await ctx.db
    .query("planLevels")
    .withIndex("by_plan_sort", (q) => q.eq("planId", planId))
    .collect();
  return levels
    .filter((level) => !level.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((level) => ({
      levelId: level._id,
      name: level.name,
      levelType: level.levelType,
      sortOrder: level.sortOrder,
      ceilingHeightIn: level.ceilingHeightIn,
    }));
}

async function planDocumentForApi(
  ctx: MutationCtx,
  plan: Doc<"floorPlans">
): Promise<PlanDocumentInput> {
  const [levels, entities, placements, items, boxes, plannedItems, pendingProposals] =
    await Promise.all([
      ctx.db
        .query("planLevels")
        .withIndex("by_plan_sort", (q) => q.eq("planId", plan._id))
        .collect(),
      ctx.db
        .query("planEntities")
        .withIndex("by_plan_type", (q) => q.eq("planId", plan._id))
        .collect(),
      ctx.db
        .query("planPlacements")
        .withIndex("by_plan", (q) => q.eq("planId", plan._id))
        .collect(),
      ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", plan.moveId))
        .collect(),
      ctx.db
        .query("boxes")
        .withIndex("by_move_updated", (q) => q.eq("moveId", plan.moveId))
        .collect(),
      ctx.db
        .query("plannedItems")
        .withIndex("by_move_updated", (q) => q.eq("moveId", plan.moveId))
        .collect(),
      ctx.db
        .query("planProposals")
        .withIndex("by_plan_status", (q) =>
          q.eq("planId", plan._id).eq("status", "pending")
        )
        .collect(),
    ]);
  const itemsById = new Map(items.map((item) => [String(item._id), item]));
  const boxesById = new Map(boxes.map((box) => [String(box._id), box]));
  const plannedItemsById = new Map(
    plannedItems.map((plannedItem) => [String(plannedItem._id), plannedItem]),
  );

  return normalizePlanDocument({
    plan: {
      planId: plan._id,
      moveId: plan.moveId,
      name: plan.name,
      kind: plan.kind,
      northAngleDeg: plan.northAngleDeg,
      defaultWallThicknessIn: plan.defaultWallThicknessIn,
      defaultCeilingHeightIn: plan.defaultCeilingHeightIn,
      gridSnapIn: plan.gridSnapIn,
      shortIdCounters: plan.shortIdCounters,
      nextSeq: plan.nextSeq,
      status: plan.status,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    },
    levels: levels
      .filter((level) => !level.archivedAt)
      .map((level) => ({
        levelId: level._id,
        name: level.name,
        levelType: level.levelType,
        sortOrder: level.sortOrder,
        ceilingHeightIn: level.ceilingHeightIn,
      })),
    entities: entities
      .filter((entity) => !entity.archivedAt)
      .map((entity): PlanEntitySummary => ({
        entityId: entity._id,
        levelId: entity.levelId,
        shortId: entity.shortId,
        entityType: entity.entityType,
        name: entity.name,
        color: entity.color,
        locked: entity.locked,
        wall: entity.wall,
        room: entity.room,
        opening: entity.opening,
        feature: entity.feature,
        zone: entity.zone,
        annotation: entity.annotation,
      })),
    placements: placements
      .filter((placement) => !placement.archivedAt)
      .map((placement): PlanPlacementSummary => ({
        placementId: placement._id,
        levelId: placement.levelId,
        shortId: placement.shortId,
        source: placementSourceForApi(
          placement,
          itemsById,
          boxesById,
          plannedItemsById,
        ),
        x: placement.x,
        y: placement.y,
        rotationDeg: placement.rotationDeg,
        footprintOverrideIn: placement.footprintOverrideIn,
        parentPlacementId: placement.parentPlacementId,
        containmentMode: placement.containmentMode,
        zOrder: placement.zOrder,
        color: placement.color,
        locked: placement.locked,
      })),
    pendingProposalCount: pendingProposals.length,
  });
}

function placementSourceForApi(
  placement: Doc<"planPlacements">,
  itemsById: Map<string, Doc<"items">>,
  boxesById: Map<string, Doc<"boxes">>,
  plannedItemsById: Map<string, Doc<"plannedItems">>,
): PlanSourceSummary | undefined {
  if (placement.itemId) {
    const item = itemsById.get(String(placement.itemId));
    return {
      kind: "item",
      sourceId: String(placement.itemId),
      label: item?.name ?? "Item",
      dimensionsIn: item?.dimensionsIn,
      confidence: itemDimensionsConfidenceForRead({
        dimensionsIn: item?.dimensionsIn,
        dimensionsConfidence: item?.dimensionsConfidence,
      }),
    };
  }
  if (placement.boxId) {
    const box = boxesById.get(String(placement.boxId));
    return {
      kind: "box",
      sourceId: String(placement.boxId),
      label: box?.label ?? box?.code ?? "Box",
      dimensionsIn: box?.dimensionsIn,
    };
  }
  if (placement.plannedItemId) {
    const plannedItem = plannedItemsById.get(String(placement.plannedItemId));
    return {
      kind: "plannedItem",
      sourceId: String(placement.plannedItemId),
      label: plannedItem?.name ?? `Planned item ${placement.plannedItemId}`,
      dimensionsIn: plannedItem?.dimensionsIn,
      confidence: plannedItem?.dimensionsConfidence,
    };
  }
  if (placement.templateKey) {
    return {
      kind: "template",
      sourceId: placement.templateKey,
      label: placement.templateKey,
      confidence: "medium",
    };
  }
  return undefined;
}

function safePlanProposal(proposal: Doc<"planProposals">) {
  return {
    proposalId: proposal._id,
    planId: proposal.planId,
    moveId: proposal.moveId,
    batchId: proposal.batchId,
    ops: proposal.ops,
    agentLabel: proposal.agentLabel,
    reasoning: proposal.reasoning,
    status: proposal.status,
    appliedOpIndexes: proposal.appliedOpIndexes,
    reviewedByUserId: proposal.reviewedByUserId,
    reviewedAt: proposal.reviewedAt,
    createdByApiKeyId: proposal.createdByApiKeyId,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };
}

function requiredOps(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("ops must be an array.");
  }
  return value;
}

function structuredPlanOpError(error: unknown) {
  if (!(error instanceof Error)) return null;
  try {
    const parsed = JSON.parse(error.message) as {
      code?: unknown;
      index?: unknown;
      reason?: unknown;
    };
    if (
      parsed.code === "plan_op_invalid" &&
      typeof parsed.index === "number" &&
      typeof parsed.reason === "string"
    ) {
      return {
        code: parsed.code,
        index: parsed.index,
        reason: parsed.reason,
      };
    }
  } catch {
    return null;
  }
  return null;
}

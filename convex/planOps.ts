import { v } from "convex/values";

import type { PlanOp } from "../src/lib/plan-ops";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";
import { planOpValidator } from "./lib/planValidators";

type ApplyContext = {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  planId: Id<"floorPlans">;
  batchId: string;
  actorUserId?: Id<"users">;
  actorApiKeyId?: Id<"apiKeys">;
  agentLabel?: string;
  now: number;
  nextSeq: number;
  created: {
    levelIds: Id<"planLevels">[];
    entityIds: Id<"planEntities">[];
    placementIds: Id<"planPlacements">[];
  };
};

export const applyOps = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
    batchId: v.string(),
    ops: v.array(planOpValidator),
    agentLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await applyPlanOps(ctx, {
      ...args,
      ops: args.ops as PlanOp[],
    });
  },
});

export const applyApiOps = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
    batchId: v.string(),
    ops: v.array(planOpValidator),
    apiKeyId: v.id("apiKeys"),
    agentLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await applyPlanOps(ctx, {
      ...args,
      ops: args.ops as PlanOp[],
      actorApiKeyId: args.apiKeyId,
      skipPermissionCheck: true,
    });
  },
});

export const listProposals = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
    includeReviewed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "plan:read",
    );
    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.householdId !== args.householdId ||
      plan.moveId !== args.moveId ||
      plan.archivedAt
    ) {
      return [];
    }

    const statuses = args.includeReviewed
      ? (["pending", "applied", "partiallyApplied", "rejected"] as const)
      : (["pending"] as const);
    const proposals = (
      await Promise.all(
        statuses.map((status) =>
          ctx.db
            .query("planProposals")
            .withIndex("by_plan_status", (q) =>
              q.eq("planId", args.planId).eq("status", status),
            )
            .collect(),
        ),
      )
    ).flat();

    return proposals
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((proposal) => safeProposal(proposal));
  },
});

export const listRecentAgentBatches = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "plan:read",
    );
    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.householdId !== args.householdId ||
      plan.moveId !== args.moveId ||
      plan.archivedAt
    ) {
      return [];
    }

    const entries = await ctx.db
      .query("planOps")
      .withIndex("by_plan_seq", (q) => q.eq("planId", args.planId))
      .collect();
    const batches = new Map<
      string,
      {
        batchId: string;
        agentLabel?: string;
        actorApiKeyId?: Id<"apiKeys">;
        opCount: number;
        firstSeq: number;
        lastSeq: number;
        createdAt: number;
        updatedAt: number;
      }
    >();

    for (const entry of entries) {
      if (entry.actorType !== "apiKey") {
        continue;
      }
      const batch = batches.get(entry.batchId);
      if (!batch) {
        batches.set(entry.batchId, {
          batchId: entry.batchId,
          agentLabel: entry.agentLabel,
          actorApiKeyId: entry.actorApiKeyId,
          opCount: 1,
          firstSeq: entry.seq,
          lastSeq: entry.seq,
          createdAt: entry.createdAt,
          updatedAt: entry.createdAt,
        });
        continue;
      }
      batch.opCount += 1;
      batch.firstSeq = Math.min(batch.firstSeq, entry.seq);
      batch.lastSeq = Math.max(batch.lastSeq, entry.seq);
      batch.createdAt = Math.min(batch.createdAt, entry.createdAt);
      batch.updatedAt = Math.max(batch.updatedAt, entry.createdAt);
      batch.agentLabel ??= entry.agentLabel;
      batch.actorApiKeyId ??= entry.actorApiKeyId;
    }

    return [...batches.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, args.limit ?? 8);
  },
});

export const reviewProposal = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
    proposalId: v.id("planProposals"),
    acceptedOpIndexes: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const { actor } = await ensurePlanEditor(ctx, args);
    const proposal = await requirePendingProposal(ctx, args);
    const acceptedIndexes = normalizeAcceptedIndexes(
      args.acceptedOpIndexes,
      proposal.ops.length,
    );
    const now = Date.now();

    if (!acceptedIndexes.length) {
      await ctx.db.patch(args.proposalId, {
        status: "rejected",
        appliedOpIndexes: [],
        reviewedByUserId: actor.userId,
        reviewedAt: now,
        updatedAt: now,
      });
      await auditProposalReview(ctx, args, actor.userId, "plan.proposal_rejected", {
        batchId: proposal.batchId,
        acceptedOpIndexes: [],
      });
      return {
        proposalId: args.proposalId,
        status: "rejected" as const,
        appliedOpIndexes: [],
      };
    }

    const acceptedOps = acceptedIndexes.map((index) => proposal.ops[index] as PlanOp);
    const result = await applyPlanOps(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      planId: args.planId,
      batchId: proposal.batchId,
      ops: acceptedOps,
      agentLabel: proposal.agentLabel,
      actorUserId: actor.userId,
      skipPermissionCheck: true,
    });
    const status =
      acceptedIndexes.length === proposal.ops.length
        ? ("applied" as const)
        : ("partiallyApplied" as const);
    await ctx.db.patch(args.proposalId, {
      status,
      appliedOpIndexes: acceptedIndexes,
      reviewedByUserId: actor.userId,
      reviewedAt: now,
      updatedAt: now,
    });
    await auditProposalReview(ctx, args, actor.userId, "plan.proposal_applied", {
      batchId: proposal.batchId,
      status,
      acceptedOpIndexes: acceptedIndexes,
    });

    return {
      proposalId: args.proposalId,
      status,
      appliedOpIndexes: acceptedIndexes,
      result,
    };
  },
});

export const rejectProposal = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
    proposalId: v.id("planProposals"),
  },
  handler: async (ctx, args) => {
    const { actor } = await ensurePlanEditor(ctx, args);
    const proposal = await requirePendingProposal(ctx, args);
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      status: "rejected",
      appliedOpIndexes: [],
      reviewedByUserId: actor.userId,
      reviewedAt: now,
      updatedAt: now,
    });
    await auditProposalReview(ctx, args, actor.userId, "plan.proposal_rejected", {
      batchId: proposal.batchId,
    });
    return {
      proposalId: args.proposalId,
      status: "rejected" as const,
      appliedOpIndexes: [],
    };
  },
});

export const revertBatch = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
    batchId: v.string(),
  },
  handler: async (ctx, args) => {
    await ensurePlanEditor(ctx, args);
    const entries = await ctx.db
      .query("planOps")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect();

    const inverseOps = entries
      .filter((entry) => entry.planId === args.planId)
      .sort((a, b) => b.seq - a.seq)
      .map((entry) => entry.inverse as PlanOp);

    if (!inverseOps.length) {
      throw structuredOpError(0, "No operations found for that batch.");
    }

    return await applyPlanOps(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      planId: args.planId,
      batchId: `revert_${args.batchId}_${Date.now().toString(36)}`,
      ops: inverseOps,
    });
  },
});

export const seedExampleHome = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
  },
  handler: async (ctx, args) => {
    const { plan, actorUserId } = await ensurePlanEditor(ctx, args);
    const levels = await ctx.db
      .query("planLevels")
      .withIndex("by_plan_sort", (q) => q.eq("planId", args.planId))
      .collect();
    const level = levels.find((entry) => entry.levelType === "indoor");
    const yardLevel = levels.find((entry) => entry.levelType === "outdoor");

    if (!level) {
      throw structuredOpError(0, "Plan needs at least one level.");
    }

    const wallHeight = plan.defaultCeilingHeightIn;
    const wallThickness = plan.defaultWallThicknessIn;
    const ops: PlanOp[] = [
      {
        type: "createEntity",
        entity: {
          levelId: level._id,
          entityType: "room",
          name: "Living room",
          room: {
            points: [
              { x: 0, y: 0 },
              { x: 192, y: 0 },
              { x: 192, y: 144 },
              { x: 0, y: 144 },
            ],
          },
        },
      },
      ...[
        [0, 0, 192, 0],
        [192, 0, 192, 144],
        [192, 144, 0, 144],
        [0, 144, 0, 0],
      ].map(
        ([x1, y1, x2, y2]) =>
          ({
            type: "createEntity",
            entity: {
              levelId: level._id,
              entityType: "wall",
              wall: {
                x1,
                y1,
                x2,
                y2,
                thicknessIn: wallThickness,
                heightIn: wallHeight,
              },
            },
          }) satisfies PlanOp,
      ),
    ];

    const firstBatch = await applyPlanOps(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      planId: args.planId,
      batchId: `seed_home_${Date.now().toString(36)}`,
      ops,
      actorUserId,
      skipPermissionCheck: true,
    });

    const createdEntities = await Promise.all(
      firstBatch.created.entityIds.map((entityId) => ctx.db.get(entityId)),
    );
    const walls = createdEntities.filter(
      (entity): entity is Doc<"planEntities"> =>
        Boolean(entity && entity.entityType === "wall" && entity.wall),
    );
    const northWall = walls.find((wall) => wall.wall?.y1 === 0 && wall.wall.y2 === 0);
    const eastWall = walls.find((wall) => wall.wall?.x1 === 192 && wall.wall.x2 === 192);
    const secondOps: PlanOp[] = [
      ...(northWall
        ? [
            {
              type: "createEntity",
              entity: {
                levelId: level._id,
                entityType: "opening",
                name: "Front door",
                opening: {
                  wallShortId: northWall.shortId,
                  offsetAlongWallIn: 72,
                  widthIn: 36,
                  kind: "door",
                  swing: "right",
                },
              },
            } satisfies PlanOp,
          ]
        : []),
      ...(eastWall
        ? [
            {
              type: "createEntity",
              entity: {
                levelId: level._id,
                entityType: "opening",
                name: "Picture window",
                opening: {
                  wallShortId: eastWall.shortId,
                  offsetAlongWallIn: 44,
                  widthIn: 48,
                  kind: "window",
                  swing: "none",
                  sillHeightIn: 30,
                  headHeightIn: 78,
                },
              },
            } satisfies PlanOp,
          ]
        : []),
      {
        type: "createEntity",
        entity: {
          levelId: level._id,
          entityType: "feature",
          name: "Built-in counter",
          feature: {
            x: 132,
            y: 30,
            rotationDeg: 0,
            featureKind: "counter",
            widthIn: 48,
            depthIn: 24,
          },
        },
      },
      {
        type: "createEntity",
        entity: {
          levelId: level._id,
          entityType: "annotation",
          annotation: {
            x: 24,
            y: 126,
            text: "Example room - trace or draw your real house next.",
            fontSizeIn: 6,
          },
        },
      },
      ...(yardLevel
        ? [
            {
              type: "createEntity",
              entity: {
                levelId: yardLevel._id,
                entityType: "zone",
                name: "Driveway",
                zone: {
                  points: [
                    { x: -48, y: -24 },
                    { x: 216, y: -24 },
                    { x: 216, y: 72 },
                    { x: -48, y: 72 },
                  ],
                  zoneKind: "driveway",
                },
              },
            } satisfies PlanOp,
          ]
        : []),
    ];

    const secondBatch = await applyPlanOps(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      planId: args.planId,
      batchId: `seed_details_${Date.now().toString(36)}`,
      ops: secondOps,
      actorUserId,
      skipPermissionCheck: true,
    });

    return {
      batchId: secondBatch.batchId,
      created: {
        levelIds: [...firstBatch.created.levelIds, ...secondBatch.created.levelIds],
        entityIds: [
          ...firstBatch.created.entityIds,
          ...secondBatch.created.entityIds,
        ],
        placementIds: [
          ...firstBatch.created.placementIds,
          ...secondBatch.created.placementIds,
        ],
      },
    };
  },
});

async function applyPlanOps(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    planId: Id<"floorPlans">;
    batchId: string;
    ops: PlanOp[];
    agentLabel?: string;
    actorUserId?: Id<"users">;
    actorApiKeyId?: Id<"apiKeys">;
    skipPermissionCheck?: boolean;
  },
) {
  const { plan, actorUserId } = args.skipPermissionCheck
    ? {
        plan: await requirePlan(ctx, args),
        actorUserId: args.actorUserId,
      }
    : await ensurePlanEditor(ctx, args);

  if (!actorUserId && !args.actorApiKeyId) {
    throw new Error(directConvexUserContextRequiredMessage);
  }

  const now = Date.now();
  const state: ApplyContext = {
    householdId: args.householdId,
    moveId: args.moveId,
    planId: args.planId,
    batchId: args.batchId,
    actorUserId,
    actorApiKeyId: args.actorApiKeyId,
    agentLabel: args.agentLabel,
    now,
    nextSeq: plan.nextSeq,
    created: {
      levelIds: [],
      entityIds: [],
      placementIds: [],
    },
  };

  for (const [index, op] of args.ops.entries()) {
    try {
      await applyOneOp(ctx, state, op, index);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("{")) {
        throw error;
      }
      throw structuredOpError(
        index,
        error instanceof Error ? error.message : "Unknown plan op error.",
      );
    }
  }

  await ctx.db.patch(args.planId, {
    nextSeq: state.nextSeq,
    updatedAt: now,
  });

  await recordAuditEvent(ctx, {
    householdId: args.householdId,
    moveId: args.moveId,
    actorType: args.actorApiKeyId ? "apiKey" : "user",
    actorUserId,
    actorApiKeyId: args.actorApiKeyId ? String(args.actorApiKeyId) : undefined,
    category: "plan",
    action: "plan.ops_applied",
    objectTable: "floorPlans",
    objectId: args.planId,
    metadata: {
      batchId: args.batchId,
      opCount: args.ops.length,
      agentLabel: args.agentLabel,
    },
  });

  return {
    batchId: args.batchId,
    created: state.created,
  };
}

async function requirePendingProposal(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    planId: Id<"floorPlans">;
    proposalId: Id<"planProposals">;
  },
) {
  const proposal = await ctx.db.get(args.proposalId);
  if (
    !proposal ||
    proposal.householdId !== args.householdId ||
    proposal.moveId !== args.moveId ||
    proposal.planId !== args.planId
  ) {
    throw structuredOpError(0, "Proposal not found.");
  }
  if (proposal.status !== "pending") {
    throw structuredOpError(0, "Proposal has already been reviewed.");
  }
  return proposal;
}

function normalizeAcceptedIndexes(indexes: number[], opCount: number) {
  return Array.from(
    new Set(
      indexes
        .filter((index) => Number.isInteger(index) && index >= 0 && index < opCount)
        .sort((a, b) => a - b),
    ),
  );
}

async function auditProposalReview(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    planId: Id<"floorPlans">;
    proposalId: Id<"planProposals">;
  },
  actorUserId: Id<"users">,
  action: string,
  metadata?: Record<string, unknown>,
) {
  await recordAuditEvent(ctx, {
    householdId: args.householdId,
    moveId: args.moveId,
    actorType: "user",
    actorUserId,
    category: "plan",
    action,
    objectTable: "planProposals",
    objectId: args.proposalId,
    metadata: {
      planId: args.planId,
      ...metadata,
    },
  });
}

function safeProposal(proposal: Doc<"planProposals">) {
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

async function ensurePlanEditor(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    planId: Id<"floorPlans">;
  },
) {
  const { actor } = await requireMovePermission(
    ctx,
    args.householdId,
    args.moveId,
    "household:edit",
  );
  if (actor.type !== "user") {
    throw new Error(directConvexUserContextRequiredMessage);
  }

  return { plan: await requirePlan(ctx, args), actor, actorUserId: actor.userId };
}

async function requirePlan(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    planId: Id<"floorPlans">;
  },
) {
  const plan = await ctx.db.get(args.planId);
  if (
    !plan ||
    plan.householdId !== args.householdId ||
    plan.moveId !== args.moveId ||
    plan.archivedAt ||
    plan.status !== "active"
  ) {
    throw structuredOpError(0, "Active plan not found.");
  }
  return plan;
}

async function applyOneOp(
  ctx: MutationCtx,
  state: ApplyContext,
  op: PlanOp,
  opIndex: number,
) {
  switch (op.type) {
    case "createLevel":
      return await createLevel(ctx, state, op, opIndex);
    case "updateLevel":
      return await updateLevel(ctx, state, op, opIndex);
    case "deleteLevel":
      return await deleteLevel(ctx, state, op.levelId, op, opIndex);
    case "restoreLevel":
      return await restoreLevel(ctx, state, op, opIndex);
    case "setLevelUnderlay":
      return await setLevelUnderlay(ctx, state, op, opIndex);
    case "createEntity":
      return await createEntity(ctx, state, op, opIndex);
    case "updateEntity":
      return await updateEntity(ctx, state, op, opIndex);
    case "renameEntity":
      return await renameEntity(ctx, state, op, opIndex);
    case "deleteEntity":
      return await deleteEntity(ctx, state, op.entityId, op, opIndex);
    case "restoreEntity":
      return await restoreEntity(ctx, state, op, opIndex);
    case "createPlacement":
      return await createPlacement(ctx, state, op, opIndex);
    case "movePlacement":
      return await movePlacement(ctx, state, op, opIndex);
    case "updatePlacement":
      return await updatePlacement(ctx, state, op, opIndex);
    case "setContainment":
      return await setContainment(ctx, state, op, opIndex);
    case "deletePlacement":
      return await deletePlacement(ctx, state, op.placementId, op, opIndex);
    case "restorePlacement":
      return await restorePlacement(ctx, state, op, opIndex);
    case "updatePlanSettings":
      return await updatePlanSettings(ctx, state, op, opIndex);
  }
}

async function createLevel(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "createLevel" }>,
  opIndex: number,
) {
  const underlay = await normalizeUnderlay(ctx, state, op.level.underlay);
  const levelId = await ctx.db.insert("planLevels", {
    householdId: state.householdId,
    moveId: state.moveId,
    planId: state.planId,
    name: requiredText(op.level.name, "Level name is required."),
    levelType: op.level.levelType,
    sortOrder: finiteNumber(op.level.sortOrder, "Level sort order is required."),
    ceilingHeightIn: optionalPositiveNumber(op.level.ceilingHeightIn),
    underlay,
    createdAt: state.now,
    updatedAt: state.now,
  });
  state.created.levelIds.push(levelId);

  await journal(ctx, state, op, { type: "deleteLevel", levelId }, opIndex);
}

async function updateLevel(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "updateLevel" }>,
  opIndex: number,
) {
  const levelId = normalizeId(ctx, "planLevels", op.levelId, "Invalid level.");
  const level = await requireLevel(ctx, state, levelId);
  const underlay =
    op.patch.underlay === undefined
      ? undefined
      : await normalizeUnderlay(ctx, state, op.patch.underlay);
  const patch = cleanPatch({
    name:
      op.patch.name === undefined
        ? undefined
        : requiredText(op.patch.name, "Level name is required."),
    levelType: op.patch.levelType,
    sortOrder:
      op.patch.sortOrder === undefined
        ? undefined
        : finiteNumber(op.patch.sortOrder, "Level sort order is required."),
    ceilingHeightIn:
      op.patch.ceilingHeightIn === undefined
        ? undefined
        : optionalPositiveNumber(op.patch.ceilingHeightIn),
    underlay,
    updatedAt: state.now,
  });
  const inversePatch = pickPrevious(level, patch);

  await ctx.db.patch(levelId, patch);
  await journal(ctx, state, op, { type: "updateLevel", levelId, patch: inversePatch }, opIndex);
}

async function setLevelUnderlay(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "setLevelUnderlay" }>,
  opIndex: number,
) {
  const levelId = normalizeId(ctx, "planLevels", op.levelId, "Invalid level.");
  const level = await requireLevel(ctx, state, levelId);
  const underlay = await normalizeUnderlay(ctx, state, op.underlay);
  await ctx.db.patch(levelId, {
    underlay,
    updatedAt: state.now,
  });
  await journal(
    ctx,
    state,
    op,
    { type: "setLevelUnderlay", levelId, underlay: level.underlay },
    opIndex,
  );
}

async function deleteLevel(
  ctx: MutationCtx,
  state: ApplyContext,
  levelIdInput: string,
  op: PlanOp,
  opIndex: number,
) {
  const levelId = normalizeId(ctx, "planLevels", levelIdInput, "Invalid level.");
  const level = await requireLevel(ctx, state, levelId);
  await ctx.db.patch(levelId, { archivedAt: state.now, updatedAt: state.now });
  await journal(ctx, state, op, { type: "restoreLevel", level }, opIndex);
}

async function restoreLevel(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "restoreLevel" }>,
  opIndex: number,
) {
  const level = op.level as Doc<"planLevels">;
  const levelId = normalizeId(ctx, "planLevels", level._id, "Invalid level.");
  await ctx.db.patch(levelId, {
    ...stripSystemFields(level),
    archivedAt: undefined,
    updatedAt: state.now,
  });
  await journal(ctx, state, op, { type: "deleteLevel", levelId }, opIndex);
}

async function createEntity(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "createEntity" }>,
  opIndex: number,
) {
  const levelId = normalizeId(ctx, "planLevels", op.entity.levelId, "Invalid level.");
  await requireLevel(ctx, state, levelId);
  validateEntityShape(op.entity);

  const shortId = await allocateShortId(ctx, state.planId, op.entity.entityType);
  const entityId = await ctx.db.insert("planEntities", {
    householdId: state.householdId,
    moveId: state.moveId,
    planId: state.planId,
    levelId,
    shortId,
    entityType: op.entity.entityType,
    name: normalizeOptionalText(op.entity.name),
    color: normalizeOptionalText(op.entity.color),
    locked: op.entity.locked ?? false,
    wall: op.entity.wall,
    room: op.entity.room,
    opening: op.entity.opening,
    feature: op.entity.feature,
    zone: op.entity.zone,
    annotation: op.entity.annotation,
    createdAt: state.now,
    updatedAt: state.now,
  });
  state.created.entityIds.push(entityId);

  await journal(ctx, state, op, { type: "deleteEntity", entityId }, opIndex);
}

async function updateEntity(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "updateEntity" }>,
  opIndex: number,
) {
  const entityId = normalizeId(
    ctx,
    "planEntities",
    op.entityId,
    "Invalid entity.",
  );
  const entity = await requireEntity(ctx, state, entityId);
  if (entity.locked && !isLockOnlyPatch(op.patch)) {
    throw new Error("Locked entities cannot be modified.");
  }
  const patch = cleanPatch({
    name: normalizeOptionalText(op.patch.name),
    color: normalizeOptionalText(op.patch.color),
    locked: op.patch.locked,
    wall: op.patch.wall,
    room: op.patch.room,
    opening: op.patch.opening,
    feature: op.patch.feature,
    zone: op.patch.zone,
    annotation: op.patch.annotation,
    updatedAt: state.now,
  });
  validateEntityShape({ ...entity, ...patch });
  const inversePatch = pickPrevious(entity, patch);

  await ctx.db.patch(entityId, patch);
  await journal(
    ctx,
    state,
    op,
    { type: "updateEntity", entityId, patch: inversePatch },
    opIndex,
  );
}

async function renameEntity(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "renameEntity" }>,
  opIndex: number,
) {
  const entityId = normalizeId(
    ctx,
    "planEntities",
    op.entityId,
    "Invalid entity.",
  );
  const entity = await requireEntity(ctx, state, entityId);
  assertUnlocked(entity, "Locked entities cannot be renamed.");
  await ctx.db.patch(entityId, {
    name: normalizeOptionalText(op.name),
    updatedAt: state.now,
  });
  await journal(
    ctx,
    state,
    op,
    { type: "renameEntity", entityId, name: entity.name },
    opIndex,
  );
}

async function deleteEntity(
  ctx: MutationCtx,
  state: ApplyContext,
  entityIdInput: string,
  op: PlanOp,
  opIndex: number,
) {
  const entityId = normalizeId(ctx, "planEntities", entityIdInput, "Invalid entity.");
  const entity = await requireEntity(ctx, state, entityId);
  assertUnlocked(entity, "Locked entities cannot be deleted.");

  if (entity.entityType === "wall") {
    const openings = await ctx.db
      .query("planEntities")
      .withIndex("by_plan_type", (q) =>
        q.eq("planId", state.planId).eq("entityType", "opening"),
      )
      .collect();
    for (const opening of openings.filter(
      (candidate) =>
        !candidate.archivedAt &&
        candidate.opening?.wallShortId === entity.shortId,
    )) {
      await deleteEntity(
        ctx,
        state,
        opening._id,
        { type: "deleteEntity", entityId: opening._id },
        opIndex,
      );
    }
  }

  await ctx.db.patch(entityId, { archivedAt: state.now, updatedAt: state.now });
  await journal(ctx, state, op, { type: "restoreEntity", entity }, opIndex);
}

async function restoreEntity(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "restoreEntity" }>,
  opIndex: number,
) {
  const entity = op.entity as Doc<"planEntities">;
  const entityId = normalizeId(ctx, "planEntities", entity._id, "Invalid entity.");
  await ctx.db.patch(entityId, {
    ...stripSystemFields(entity),
    archivedAt: undefined,
    updatedAt: state.now,
  });
  await journal(ctx, state, op, { type: "deleteEntity", entityId }, opIndex);
}

async function createPlacement(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "createPlacement" }>,
  opIndex: number,
) {
  const levelId = normalizeId(
    ctx,
    "planLevels",
    op.placement.levelId,
    "Invalid level.",
  );
  await requireLevel(ctx, state, levelId);
  validatePlacementSource(op.placement);
  if (op.placement.parentPlacementId || op.placement.containmentMode) {
    await validateContainment(ctx, state, undefined, {
      parentPlacementId: op.placement.parentPlacementId,
      containmentMode: op.placement.containmentMode,
    });
  }

  const shortId = await allocateShortId(ctx, state.planId, "placement");
  const placementId = await ctx.db.insert("planPlacements", {
    householdId: state.householdId,
    moveId: state.moveId,
    planId: state.planId,
    levelId,
    shortId,
    itemId: optionalId(ctx, "items", op.placement.itemId),
    boxId: optionalId(ctx, "boxes", op.placement.boxId),
    plannedItemId: optionalId(ctx, "plannedItems", op.placement.plannedItemId),
    templateKey: normalizeOptionalText(op.placement.templateKey),
    x: finiteNumber(op.placement.x, "Placement x is required."),
    y: finiteNumber(op.placement.y, "Placement y is required."),
    rotationDeg: finiteNumber(
      op.placement.rotationDeg,
      "Placement rotation is required.",
    ),
    footprintOverrideIn: op.placement.footprintOverrideIn,
    parentPlacementId: optionalId(
      ctx,
      "planPlacements",
      op.placement.parentPlacementId,
    ),
    containmentMode: op.placement.containmentMode,
    zOrder: op.placement.zOrder ?? state.now,
    color: normalizeOptionalText(op.placement.color),
    locked: op.placement.locked ?? false,
    createdAt: state.now,
    updatedAt: state.now,
  });
  state.created.placementIds.push(placementId);

  await journal(ctx, state, op, { type: "deletePlacement", placementId }, opIndex);
}

async function movePlacement(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "movePlacement" }>,
  opIndex: number,
) {
  const placementId = normalizeId(
    ctx,
    "planPlacements",
    op.placementId,
    "Invalid placement.",
  );
  const placement = await requirePlacement(ctx, state, placementId);
  assertUnlocked(placement, "Locked placements cannot be moved.");
  await ctx.db.patch(placementId, {
    x: finiteNumber(op.x, "Placement x is required."),
    y: finiteNumber(op.y, "Placement y is required."),
    rotationDeg: finiteNumber(op.rotationDeg, "Placement rotation is required."),
    updatedAt: state.now,
  });
  await journal(
    ctx,
    state,
    op,
    {
      type: "movePlacement",
      placementId,
      x: placement.x,
      y: placement.y,
      rotationDeg: placement.rotationDeg,
    },
    opIndex,
  );
}

async function updatePlacement(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "updatePlacement" }>,
  opIndex: number,
) {
  const placementId = normalizeId(
    ctx,
    "planPlacements",
    op.placementId,
    "Invalid placement.",
  );
  const placement = await requirePlacement(ctx, state, placementId);
  if (placement.locked && !isLockOnlyPatch(op.patch)) {
    throw new Error("Locked placements cannot be modified.");
  }
  const sourcePatch = hasPlacementSourcePatch(op.patch)
    ? {
        itemId: optionalId(ctx, "items", op.patch.itemId),
        boxId: optionalId(ctx, "boxes", op.patch.boxId),
        plannedItemId: optionalId(ctx, "plannedItems", op.patch.plannedItemId),
        templateKey: normalizeOptionalText(op.patch.templateKey),
      }
    : {};
  if (hasPlacementSourcePatch(op.patch)) {
    validatePlacementSource(sourcePatch);
  }
  const patch = {
    ...sourcePatch,
    ...cleanPatch({
      footprintOverrideIn: op.patch.footprintOverrideIn,
      color: normalizeOptionalText(op.patch.color),
      locked: op.patch.locked,
      zOrder: op.patch.zOrder,
      updatedAt: state.now,
    }),
  };
  const inversePatch = pickPrevious(placement, patch);

  await ctx.db.patch(placementId, patch);
  await journal(
    ctx,
    state,
    op,
    { type: "updatePlacement", placementId, patch: inversePatch },
    opIndex,
  );
}

function hasPlacementSourcePatch(
  patch: Extract<PlanOp, { type: "updatePlacement" }>["patch"],
) {
  return (
    "itemId" in patch ||
    "boxId" in patch ||
    "plannedItemId" in patch ||
    "templateKey" in patch
  );
}

async function setContainment(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "setContainment" }>,
  opIndex: number,
) {
  const placementId = normalizeId(
    ctx,
    "planPlacements",
    op.placementId,
    "Invalid placement.",
  );
  const placement = await requirePlacement(ctx, state, placementId);
  assertUnlocked(placement, "Locked placements cannot be contained.");
  await validateContainment(ctx, state, placementId, op);
  await ctx.db.patch(placementId, {
    parentPlacementId: optionalId(ctx, "planPlacements", op.parentPlacementId),
    containmentMode: op.containmentMode,
    updatedAt: state.now,
  });
  await journal(
    ctx,
    state,
    op,
    {
      type: "setContainment",
      placementId,
      parentPlacementId: placement.parentPlacementId,
      containmentMode: placement.containmentMode,
    },
    opIndex,
  );
}

async function deletePlacement(
  ctx: MutationCtx,
  state: ApplyContext,
  placementIdInput: string,
  op: PlanOp,
  opIndex: number,
) {
  const placementId = normalizeId(
    ctx,
    "planPlacements",
    placementIdInput,
    "Invalid placement.",
  );
  const placement = await requirePlacement(ctx, state, placementId);
  assertUnlocked(placement, "Locked placements cannot be deleted.");
  const children = await ctx.db
    .query("planPlacements")
    .withIndex("by_parent", (q) => q.eq("parentPlacementId", placementId))
    .collect();

  for (const child of children.filter((candidate) => !candidate.archivedAt)) {
    await deletePlacement(
      ctx,
      state,
      child._id,
      {
        type: "deletePlacement",
        placementId: child._id,
      },
      opIndex,
    );
  }

  await ctx.db.patch(placementId, {
    archivedAt: state.now,
    updatedAt: state.now,
  });
  await journal(ctx, state, op, { type: "restorePlacement", placement }, opIndex);
}

async function restorePlacement(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "restorePlacement" }>,
  opIndex: number,
) {
  const placement = op.placement as Doc<"planPlacements">;
  const placementId = normalizeId(
    ctx,
    "planPlacements",
    placement._id,
    "Invalid placement.",
  );
  await ctx.db.patch(placementId, {
    ...stripSystemFields(placement),
    archivedAt: undefined,
    updatedAt: state.now,
  });
  await journal(ctx, state, op, { type: "deletePlacement", placementId }, opIndex);
}

async function updatePlanSettings(
  ctx: MutationCtx,
  state: ApplyContext,
  op: Extract<PlanOp, { type: "updatePlanSettings" }>,
  opIndex: number,
) {
  const plan = await requirePlan(ctx, state);
  const patch = cleanPatch({
    name:
      op.patch.name === undefined
        ? undefined
        : requiredText(op.patch.name, "Plan name is required."),
    northAngleDeg: op.patch.northAngleDeg,
    defaultWallThicknessIn: optionalPositiveNumber(
      op.patch.defaultWallThicknessIn,
    ),
    defaultCeilingHeightIn: optionalPositiveNumber(
      op.patch.defaultCeilingHeightIn,
    ),
    gridSnapIn: optionalPositiveNumber(op.patch.gridSnapIn),
    updatedAt: state.now,
  });
  const inversePatch = pickPrevious(plan, patch);
  await ctx.db.patch(state.planId, patch);
  await journal(
    ctx,
    state,
    op,
    { type: "updatePlanSettings", patch: inversePatch },
    opIndex,
  );
}

async function journal(
  ctx: MutationCtx,
  state: ApplyContext,
  op: PlanOp,
  inverse: PlanOp,
  _opIndex: number,
) {
  void _opIndex;
  await ctx.db.insert("planOps", {
    householdId: state.householdId,
    moveId: state.moveId,
    planId: state.planId,
    seq: state.nextSeq,
    batchId: state.batchId,
    actorType: state.actorApiKeyId ? "apiKey" : "user",
    actorUserId: state.actorUserId,
    actorApiKeyId: state.actorApiKeyId,
    agentLabel: state.agentLabel,
    op,
    inverse,
    createdAt: state.now,
  });
  state.nextSeq += 1;
}

async function allocateShortId(
  ctx: MutationCtx,
  planId: Id<"floorPlans">,
  entityType: Doc<"planEntities">["entityType"] | "placement",
) {
  const plan = await ctx.db.get(planId);
  if (!plan) {
    throw new Error("Plan not found.");
  }

  const counters = { ...plan.shortIdCounters };
  const [counterKey, prefix] =
    entityType === "wall"
      ? (["nextWall", "W"] as const)
      : entityType === "room"
        ? (["nextRoom", "R"] as const)
        : entityType === "opening"
          ? (["nextOpening", "D"] as const)
          : entityType === "feature"
            ? (["nextFeature", "F"] as const)
            : entityType === "zone"
              ? (["nextZone", "Z"] as const)
              : entityType === "annotation"
                ? (["nextAnnotation", "A"] as const)
                : (["nextPlacement", "P"] as const);

  const value = counters[counterKey];
  counters[counterKey] += 1;
  await ctx.db.patch(planId, { shortIdCounters: counters, updatedAt: Date.now() });
  return `${prefix}${value}`;
}

async function requireLevel(
  ctx: MutationCtx,
  state: ApplyContext,
  levelId: Id<"planLevels">,
) {
  const level = await ctx.db.get(levelId);
  if (
    !level ||
    level.planId !== state.planId ||
    level.householdId !== state.householdId ||
    level.moveId !== state.moveId ||
    level.archivedAt
  ) {
    throw new Error("Level not found.");
  }
  return level;
}

async function requireEntity(
  ctx: MutationCtx,
  state: ApplyContext,
  entityId: Id<"planEntities">,
) {
  const entity = await ctx.db.get(entityId);
  if (
    !entity ||
    entity.planId !== state.planId ||
    entity.householdId !== state.householdId ||
    entity.moveId !== state.moveId ||
    entity.archivedAt
  ) {
    throw new Error("Entity not found.");
  }
  return entity;
}

async function requirePlacement(
  ctx: MutationCtx,
  state: ApplyContext,
  placementId: Id<"planPlacements">,
) {
  const placement = await ctx.db.get(placementId);
  if (
    !placement ||
    placement.planId !== state.planId ||
    placement.householdId !== state.householdId ||
    placement.moveId !== state.moveId ||
    placement.archivedAt
  ) {
    throw new Error("Placement not found.");
  }
  return placement;
}

async function validateContainment(
  ctx: MutationCtx,
  state: ApplyContext,
  placementId: Id<"planPlacements"> | undefined,
  op: {
    parentPlacementId?: string;
    containmentMode?: "inside" | "onTop";
  },
) {
  if (!op.parentPlacementId && !op.containmentMode) {
    return;
  }
  if (!op.parentPlacementId || !op.containmentMode) {
    throw new Error("Containment needs both a parent placement and mode.");
  }

  let parentId: Id<"planPlacements"> | undefined = normalizeId(
    ctx,
    "planPlacements",
    op.parentPlacementId,
    "Invalid parent placement.",
  );
  let depth = 1;
  while (parentId) {
    if (placementId && parentId === placementId) {
      throw new Error("Containment cannot create a cycle.");
    }
    depth += 1;
    if (depth > 3) {
      throw new Error("Containment cannot be deeper than 3 levels.");
    }
    const parent = await requirePlacement(ctx, state, parentId);
    parentId = parent.parentPlacementId;
  }
}

function validateEntityShape(entity: {
  entityType: Doc<"planEntities">["entityType"];
  wall?: unknown;
  room?: unknown;
  opening?: unknown;
  feature?: unknown;
  zone?: unknown;
  annotation?: unknown;
}) {
  const expected = entity.entityType;
  const keys = ["wall", "room", "opening", "feature", "zone", "annotation"];
  const populated = keys.filter((key) => entity[key as keyof typeof entity]);
  if (populated.length !== 1 || populated[0] !== expected) {
    throw new Error(`Entity type ${expected} needs exactly its matching shape.`);
  }
}

function validatePlacementSource(source: {
  itemId?: unknown;
  boxId?: unknown;
  plannedItemId?: unknown;
  templateKey?: unknown;
}) {
  const count = [
    source.itemId,
    source.boxId,
    source.plannedItemId,
    source.templateKey,
  ].filter((value) => value !== undefined && value !== null && value !== "")
    .length;
  if (count !== 1) {
    throw new Error("Placement needs exactly one source.");
  }
}

function normalizeId<
  TableName extends
    | "planLevels"
    | "planEntities"
    | "planPlacements"
    | "plannedItems"
    | "items"
    | "boxes"
    | "itemPhotos",
>(
  ctx: MutationCtx,
  tableName: TableName,
  value: unknown,
  message: string,
) {
  if (typeof value !== "string") {
    throw new Error(message);
  }
  const id = ctx.db.normalizeId(tableName, value);
  if (!id) {
    throw new Error(message);
  }
  return id;
}

function optionalId<
  TableName extends "planPlacements" | "plannedItems" | "items" | "boxes",
>(
  ctx: MutationCtx,
  tableName: TableName,
  value: unknown,
) {
  return value === undefined || value === null || value === ""
    ? undefined
    : normalizeId(ctx, tableName, value, `Invalid ${tableName} id.`);
}

async function normalizeUnderlay(
  ctx: MutationCtx,
  state: ApplyContext,
  underlay: unknown,
): Promise<Doc<"planLevels">["underlay"]> {
  if (!underlay) {
    return undefined;
  }
  if (typeof underlay !== "object") {
    throw new Error("Invalid level underlay.");
  }
  const input = underlay as {
    photoId?: unknown;
    opacity?: unknown;
    originX?: unknown;
    originY?: unknown;
    scaleInPerPx?: unknown;
    rotationDeg?: unknown;
  };
  const photoId = normalizeId(
    ctx,
    "itemPhotos",
    input.photoId,
    "Invalid underlay photo.",
  );
  const photo = await ctx.db.get(photoId);
  if (
    !photo ||
    photo.householdId !== state.householdId ||
    photo.moveId !== state.moveId ||
    photo.archivedAt ||
    photo.photoType !== "blueprint"
  ) {
    throw new Error("Underlay must reference a blueprint photo from this move.");
  }

  return {
    photoId,
    opacity: clampNumber(
      finiteNumber(input.opacity, "Underlay opacity is required."),
      0.05,
      1,
    ),
    originX: finiteNumber(input.originX, "Underlay X origin is required."),
    originY: finiteNumber(input.originY, "Underlay Y origin is required."),
    scaleInPerPx: positiveNumber(
      input.scaleInPerPx,
      "Underlay scale is required.",
    ),
    rotationDeg: finiteNumber(
      input.rotationDeg,
      "Underlay rotation is required.",
    ),
  };
}

function requiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value.trim().slice(0, 2000);
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 2000)
    : undefined;
}

function finiteNumber(value: unknown, message: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(message);
  }
  return value;
}

function optionalPositiveNumber(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return positiveNumber(value, "Expected a positive number.");
}

function positiveNumber(value: unknown, message: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(message);
  }
  return value;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanPatch<T extends Record<string, unknown>>(patch: T) {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function pickPrevious<T extends Record<string, unknown>>(
  doc: T,
  patch: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.keys(patch)
      .filter((key) => key !== "updatedAt")
      .map((key) => [key, doc[key]]),
  );
}

function stripSystemFields<T extends Record<string, unknown>>(doc: T) {
  const { _id, _creationTime, ...rest } = doc;
  void _id;
  void _creationTime;
  return rest;
}

function structuredOpError(index: number, reason: string) {
  return new Error(
    JSON.stringify({
      code: "plan_op_invalid",
      index,
      reason,
    }),
  );
}

function assertUnlocked(
  doc: { locked?: boolean },
  message: string,
) {
  if (doc.locked) {
    throw new Error(message);
  }
}

function isLockOnlyPatch(patch: Record<string, unknown>) {
  const keys = Object.keys(patch).filter((key) => patch[key] !== undefined);
  return keys.length === 1 && keys[0] === "locked";
}

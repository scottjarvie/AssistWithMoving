import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  estimateConfidence,
  floorplanAreaRole,
  floorplanConstraintStrength,
  floorplanMeasurementKind,
  floorplanMeasurementSubjectType,
  floorplanMeasurementType,
  floorplanMeasurementUnit,
  floorplanObservationStatus,
  floorplanObservationType,
  floorplanRelationshipType,
  floorplanSubjectKind,
} from "./schema";
import { recordAuditEvent } from "./lib/audit";
import { normalizeOptionalText } from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

export const listForPlan = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.optional(v.id("floorPlans")),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "plan:read",
    );
    const planId = args.planId;
    if (planId) {
      await requirePlan(ctx, args);
    }

    const [
      evidence,
      observations,
      relationships,
      measurements,
      calculations,
      solveRuns,
    ] = await Promise.all([
      planId
        ? ctx.db
            .query("floorplanEvidenceRecords")
            .withIndex("by_plan_status", (q) =>
              q.eq("planId", planId).eq("status", "active"),
            )
            .collect()
        : ctx.db
            .query("floorplanEvidenceRecords")
            .withIndex("by_move_status", (q) =>
              q.eq("moveId", args.moveId).eq("status", "active"),
            )
            .collect(),
      planId
        ? ctx.db
            .query("floorplanObservations")
            .withIndex("by_plan_status", (q) =>
              q.eq("planId", planId).eq("status", "active"),
            )
            .collect()
        : ctx.db
            .query("floorplanObservations")
            .withIndex("by_move_status", (q) =>
              q.eq("moveId", args.moveId).eq("status", "active"),
            )
            .collect(),
      planId
        ? ctx.db
            .query("floorplanRelationships")
            .withIndex("by_plan_status", (q) =>
              q.eq("planId", planId).eq("status", "active"),
            )
            .collect()
        : ctx.db
            .query("floorplanRelationships")
            .withIndex("by_move_status", (q) =>
              q.eq("moveId", args.moveId).eq("status", "active"),
            )
            .collect(),
      planId
        ? ctx.db
            .query("floorplanMeasurements")
            .withIndex("by_plan_subject", (q) => q.eq("planId", planId))
            .collect()
        : ctx.db
            .query("floorplanMeasurements")
            .withIndex("by_move_status", (q) =>
              q.eq("moveId", args.moveId).eq("status", "active"),
            )
            .collect(),
      planId
        ? ctx.db
            .query("floorplanCalculationRecords")
            .withIndex("by_plan_status", (q) =>
              q.eq("planId", planId).eq("status", "active"),
            )
            .collect()
        : ctx.db
            .query("floorplanCalculationRecords")
            .withIndex("by_move_status", (q) =>
              q.eq("moveId", args.moveId).eq("status", "active"),
            )
            .collect(),
      planId
        ? ctx.db
            .query("floorplanSolveRuns")
            .withIndex("by_plan_created", (q) => q.eq("planId", planId))
            .order("desc")
            .take(5)
        : [],
    ]);

    return {
      evidence: evidence
        .filter((entry) => entry.householdId === args.householdId)
        .sort((left, right) => right.updatedAt - left.updatedAt),
      observations: observations
        .filter(
          (entry) =>
            entry.householdId === args.householdId &&
            entry.moveId === args.moveId,
        )
        .sort((left, right) => right.updatedAt - left.updatedAt),
      relationships: relationships
        .filter(
          (entry) =>
            entry.householdId === args.householdId &&
            entry.moveId === args.moveId,
        )
        .sort((left, right) => right.updatedAt - left.updatedAt),
      measurements: measurements
        .filter(
          (entry) =>
            entry.householdId === args.householdId &&
            entry.moveId === args.moveId &&
            entry.status === "active",
        )
        .sort((left, right) => right.updatedAt - left.updatedAt),
      calculations: calculations
        .filter(
          (entry) =>
            entry.householdId === args.householdId &&
            entry.moveId === args.moveId &&
            entry.status === "active",
        )
        .sort((left, right) => right.updatedAt - left.updatedAt),
      latestSolveRun: solveRuns.find(
        (entry) =>
          entry.householdId === args.householdId &&
          entry.moveId === args.moveId &&
          entry.status !== "archived",
      ),
    };
  },
});

export const recordObservations = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.optional(v.id("floorPlans")),
    observations: v.array(
      v.object({
        evidenceId: v.optional(v.id("floorplanEvidenceRecords")),
        sourcePhotoId: v.optional(v.id("itemPhotos")),
        sourceLabel: v.optional(v.string()),
        sourceRegion: v.optional(
          v.object({
            xPct: v.number(),
            yPct: v.number(),
            widthPct: v.number(),
            heightPct: v.number(),
          }),
        ),
        imageNumber: v.optional(v.number()),
        observationType: floorplanObservationType,
        status: v.optional(floorplanObservationStatus),
        title: v.string(),
        subjectKey: v.optional(v.string()),
        subjectLabel: v.optional(v.string()),
        subjectKind: v.optional(floorplanSubjectKind),
        rawText: v.optional(v.string()),
        normalized: v.optional(v.any()),
        confidence: estimateConfidence,
        relatedMeasurementIds: v.optional(v.array(v.id("floorplanMeasurements"))),
        relatedObservationIds: v.optional(v.array(v.id("floorplanObservations"))),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "plan:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    if (args.planId) {
      await requirePlan(ctx, args);
    }
    if (!args.observations.length) {
      throw new Error("At least one observation is required.");
    }

    const now = Date.now();
    const observationIds = [];
    for (const observation of args.observations) {
      if (observation.sourcePhotoId) {
        await requireMovePhoto(ctx, args, observation.sourcePhotoId);
      }
      const sourceLabel =
        normalizeOptionalText(observation.sourceLabel) ??
        "User-entered floorplan observation";
      const observationId = await ctx.db.insert("floorplanObservations", {
        householdId: args.householdId,
        moveId: args.moveId,
        planId: args.planId,
        evidenceId: observation.evidenceId,
        sourcePhotoId: observation.sourcePhotoId,
        sourceLabel,
        sourceRegion: observation.sourceRegion,
        imageNumber: observation.imageNumber,
        observationType: observation.observationType,
        status: observation.status ?? "active",
        title: observation.title.trim(),
        subjectKey: normalizeOptionalText(observation.subjectKey),
        subjectLabel: normalizeOptionalText(observation.subjectLabel),
        subjectKind: observation.subjectKind,
        rawText: normalizeOptionalText(observation.rawText),
        normalized: observation.normalized,
        confidence: observation.confidence,
        provenance: [
          {
            sourceType: "userEdit",
            sourceId: observation.evidenceId
              ? String(observation.evidenceId)
              : undefined,
            sourcePhotoId: observation.sourcePhotoId,
            sourceLabel,
            imageNumber: observation.imageNumber,
            imageRegion: observation.sourceRegion,
            notes: normalizeOptionalText(observation.notes),
            recordedAt: now,
            recordedByUserId: actor.userId,
            recordedByLabel: "MovingManifest user",
          },
        ],
        relatedMeasurementIds: observation.relatedMeasurementIds,
        relatedObservationIds: observation.relatedObservationIds,
        createdByUserId: actor.userId,
        createdAt: now,
        updatedAt: now,
      });
      observationIds.push(observationId);
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "plan",
      action: "floorplan.observations_recorded",
      objectTable: "floorplanObservations",
      objectId: observationIds[0],
      metadata: {
        planId: args.planId,
        observationCount: observationIds.length,
      },
    });

    return { observationIds };
  },
});

export const recordRelationships = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.optional(v.id("floorPlans")),
    relationships: v.array(
      v.object({
        evidenceId: v.optional(v.id("floorplanEvidenceRecords")),
        relationshipType: floorplanRelationshipType,
        status: v.optional(floorplanObservationStatus),
        fromSubjectKey: v.string(),
        fromSubjectLabel: v.string(),
        toSubjectKey: v.string(),
        toSubjectLabel: v.string(),
        confidence: estimateConfidence,
        sourceObservationIds: v.optional(v.array(v.id("floorplanObservations"))),
        sourceMeasurementIds: v.optional(v.array(v.id("floorplanMeasurements"))),
        evidenceIds: v.optional(v.array(v.id("floorplanEvidenceRecords"))),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "plan:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    if (args.planId) {
      await requirePlan(ctx, args);
    }
    if (!args.relationships.length) {
      throw new Error("At least one relationship is required.");
    }

    const now = Date.now();
    const relationshipIds = [];
    for (const relationship of args.relationships) {
      const relationshipId = await ctx.db.insert("floorplanRelationships", {
        householdId: args.householdId,
        moveId: args.moveId,
        planId: args.planId,
        evidenceId: relationship.evidenceId,
        relationshipType: relationship.relationshipType,
        status: relationship.status ?? "active",
        fromSubjectKey: relationship.fromSubjectKey.trim(),
        fromSubjectLabel: relationship.fromSubjectLabel.trim(),
        toSubjectKey: relationship.toSubjectKey.trim(),
        toSubjectLabel: relationship.toSubjectLabel.trim(),
        confidence: relationship.confidence,
        sourceObservationIds: relationship.sourceObservationIds,
        sourceMeasurementIds: relationship.sourceMeasurementIds,
        evidenceIds: relationship.evidenceIds,
        notes: normalizeOptionalText(relationship.notes),
        provenance: [
          {
            sourceType: "userEdit",
            sourceId: relationship.evidenceId
              ? String(relationship.evidenceId)
              : undefined,
            sourceLabel: "User-entered floorplan relationship",
            notes: normalizeOptionalText(relationship.notes),
            recordedAt: now,
            recordedByUserId: actor.userId,
            recordedByLabel: "MovingManifest user",
          },
        ],
        createdByUserId: actor.userId,
        createdAt: now,
        updatedAt: now,
      });
      relationshipIds.push(relationshipId);
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "plan",
      action: "floorplan.relationships_recorded",
      objectTable: "floorplanRelationships",
      objectId: relationshipIds[0],
      metadata: {
        planId: args.planId,
        relationshipCount: relationshipIds.length,
      },
    });

    return { relationshipIds };
  },
});

export const resetDraft = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "plan:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    await requirePlan(ctx, args);

    const now = Date.now();
    const solveRuns = await ctx.db
      .query("floorplanSolveRuns")
      .withIndex("by_plan_created", (q) => q.eq("planId", args.planId))
      .collect();
    let archivedSolveRunCount = 0;
    for (const run of solveRuns) {
      if (
        run.householdId === args.householdId &&
        run.moveId === args.moveId &&
        run.status !== "archived"
      ) {
        await ctx.db.patch(run._id, { status: "archived" });
        archivedSolveRunCount += 1;
      }
    }

    const proposals = await ctx.db
      .query("planProposals")
      .withIndex("by_plan_status", (q) =>
        q.eq("planId", args.planId).eq("status", "pending"),
      )
      .collect();
    let rejectedProposalCount = 0;
    for (const proposal of proposals) {
      if (
        proposal.householdId === args.householdId &&
        proposal.moveId === args.moveId &&
        proposal.batchId.startsWith("floorplan_solve")
      ) {
        await ctx.db.patch(proposal._id, {
          status: "rejected",
          reviewedByUserId: actor.userId,
          reviewedAt: now,
          updatedAt: now,
        });
        rejectedProposalCount += 1;
      }
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "plan",
      action: "floorplan.draft_reset",
      objectTable: "floorPlans",
      objectId: args.planId,
      metadata: {
        archivedSolveRunCount,
        rejectedProposalCount,
      },
    });

    return { archivedSolveRunCount, rejectedProposalCount };
  },
});

export const recordMeasurement = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.optional(v.id("floorPlans")),
    subjectType: floorplanMeasurementSubjectType,
    subjectKey: v.string(),
    subjectLabel: v.string(),
    measurementType: floorplanMeasurementType,
    kind: floorplanMeasurementKind,
    valueIn: v.optional(v.number()),
    minIn: v.optional(v.number()),
    maxIn: v.optional(v.number()),
    unit: v.optional(floorplanMeasurementUnit),
    value: v.optional(v.number()),
    minValue: v.optional(v.number()),
    maxValue: v.optional(v.number()),
    displayValue: v.string(),
    confidence: estimateConfidence,
    areaRole: v.optional(floorplanAreaRole),
    constraintStrength: v.optional(floorplanConstraintStrength),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "plan:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    if (args.planId) {
      await requirePlan(ctx, args);
    }

    const now = Date.now();
    const title = `${args.subjectLabel} ${args.measurementType}`;
    const evidenceId = await ctx.db.insert("floorplanEvidenceRecords", {
      householdId: args.householdId,
      moveId: args.moveId,
      planId: args.planId,
      evidenceType: "measurement",
      status: "active",
      title,
      summary: args.displayValue,
      confidence: args.confidence,
      sourceType: "userEdit",
      areaRole: args.areaRole,
      constraintStrength: args.constraintStrength,
      sourceLabel: "User-entered measurement",
      facts: [`${args.subjectLabel} ${args.measurementType}: ${args.displayValue}`],
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });
    const measurementId = await ctx.db.insert("floorplanMeasurements", {
      householdId: args.householdId,
      moveId: args.moveId,
      planId: args.planId,
      evidenceId,
      subjectType: args.subjectType,
      subjectKey: args.subjectKey.trim(),
      subjectLabel: args.subjectLabel.trim(),
      measurementType: args.measurementType,
      kind: args.kind,
      status: "active",
      valueIn: positive(args.valueIn),
      minIn: positive(args.minIn),
      maxIn: positive(args.maxIn),
      unit: args.unit,
      value: positive(args.value),
      minValue: positive(args.minValue),
      maxValue: positive(args.maxValue),
      displayValue: args.displayValue.trim(),
      confidence: args.confidence,
      areaRole: args.areaRole,
      constraintStrength: args.constraintStrength,
      provenance: [
        {
          sourceType: "userEdit",
          sourceId: String(evidenceId),
          sourceLabel: "User-entered measurement",
          notes: normalizeOptionalText(args.notes),
          recordedAt: now,
          recordedByUserId: actor.userId,
          recordedByLabel: "MovingManifest user",
        },
      ],
      sourceObservationIds: undefined,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "plan",
      action: "floorplan.measurement_recorded",
      objectTable: "floorplanMeasurements",
      objectId: measurementId,
      metadata: {
        planId: args.planId,
        evidenceId,
        subjectKey: args.subjectKey,
        measurementType: args.measurementType,
      },
    });

    return { evidenceId, measurementId };
  },
});

async function requirePlan(
  ctx: QueryCtx | MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    planId?: Id<"floorPlans">;
  },
) {
  if (!args.planId) return null;
  const plan = await ctx.db.get(args.planId);
  if (
    !plan ||
    plan.householdId !== args.householdId ||
    plan.moveId !== args.moveId ||
    plan.archivedAt
  ) {
    throw new Error("Floor plan not found.");
  }
  return plan;
}

async function requireMovePhoto(
  ctx: QueryCtx | MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
  },
  photoId: Id<"itemPhotos">,
) {
  const photo = await ctx.db.get(photoId);
  if (
    !photo ||
    photo.householdId !== args.householdId ||
    photo.moveId !== args.moveId ||
    photo.archivedAt
  ) {
    throw new Error("Source photo not found.");
  }
  return photo;
}

function positive(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

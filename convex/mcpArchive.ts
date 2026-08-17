/**
 * Reversible archive and restore for a connected AI.
 *
 * Archive is Moving's destructive default, and it is deliberately the *only*
 * destructive verb an AI ever gets. An inventory pass that mis-read a photo
 * should be able to retire the wrong row without the person having to clean up
 * by hand — and the person should be able to put it back without asking anyone.
 *
 * Permanent deletion is not here, and it is not reachable from here. It stays a
 * signed-in action a person takes themselves, which is what makes granting
 * `moving.archive` a small decision rather than a frightening one.
 */
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  mcpError,
  mcpPrincipalValidator,
  requireMcpMove,
} from "./lib/mcpGrantAccess";

const MAX_ARCHIVE_ROWS = 50;

export const archivableKind = v.union(
  v.literal("item"),
  v.literal("box"),
  v.literal("space"),
  v.literal("planningRecord"),
);

export const archiveMoveRecords = internalMutation({
  args: {
    principal: mcpPrincipalValidator,
    moveId: v.id("moves"),
    operationId: v.string(),
    action: v.union(v.literal("archive"), v.literal("restore")),
    records: v.array(v.object({ kind: archivableKind, id: v.string() })),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { move, policy } = await requireMcpMove(
      ctx,
      args.principal,
      args.moveId,
      "inventory:edit",
      "moving.archive",
    );
    if (args.records.length === 0 || args.records.length > MAX_ARCHIVE_ROWS) {
      mcpError(
        "VALIDATION_ERROR",
        `Archive between 1 and ${MAX_ARCHIVE_ROWS} records at a time.`,
        "Split the pass into bounded batches.",
      );
    }
    const reason = args.reason.trim();
    if (reason.length < 3) {
      mcpError(
        "VALIDATION_ERROR",
        "Say why these records are being retired.",
        "Provide a short reason the person will understand later.",
      );
    }

    const now = Date.now();
    const archiving = args.action === "archive";
    const results: Array<{
      kind: string;
      id: string;
      outcome: "changed" | "alreadyInState" | "notFound";
    }> = [];

    for (const record of args.records) {
      // Per-item results rather than one all-or-nothing failure: a batch pass
      // that half-worked should say so, not silently discard the half that did.
      if (record.kind === "item") {
        const id = ctx.db.normalizeId("items", record.id);
        const row = id ? await ctx.db.get(id) : null;
        if (!row || row.moveId !== move._id) {
          results.push({ ...record, outcome: "notFound" });
          continue;
        }
        if (archiving === Boolean(row.deletedAt)) {
          results.push({ ...record, outcome: "alreadyInState" });
          continue;
        }
        await ctx.db.patch(row._id, {
          status: archiving ? "archived" : "active",
          deletedAt: archiving ? now : undefined,
          updatedAt: now,
        });
        results.push({ ...record, outcome: "changed" });
        continue;
      }

      const table =
        record.kind === "box"
          ? "boxes"
          : record.kind === "space"
            ? "moveSpaces"
            : "movePlanningRecords";
      const id = ctx.db.normalizeId(table, record.id);
      const row = id ? await ctx.db.get(id) : null;
      if (!row || (row as { moveId?: Id<"moves"> }).moveId !== move._id) {
        results.push({ ...record, outcome: "notFound" });
        continue;
      }
      const archived = (row as { archivedAt?: number }).archivedAt !== undefined;
      if (archiving === archived) {
        results.push({ ...record, outcome: "alreadyInState" });
        continue;
      }
      await ctx.db.patch(row._id, {
        archivedAt: archiving ? now : undefined,
        updatedAt: now,
      } as never);
      results.push({ ...record, outcome: "changed" });
    }

    const changed = results.filter((row) => row.outcome === "changed").length;
    await recordAuditEvent(ctx, {
      householdId: move.householdId,
      moveId: move._id,
      actorType: "agent",
      actorUserId: policy.user._id,
      category: "inventory",
      action: archiving ? "mcp.records_archived" : "mcp.records_restored",
      objectTable: "moves",
      objectId: move._id,
      metadata: {
        clientId: args.principal.clientId,
        operationId: args.operationId,
        reason,
        requested: args.records.length,
        changed,
      },
    });

    return {
      moveId: move._id,
      action: args.action,
      results,
      changed,
      reversible: true,
      note: archiving
        ? "Archived records stay recoverable. Restore them with the same tool, or from Assist With Moving."
        : "Restored records are active again.",
    };
  },
});

import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export function safeConnectionText(text: string) {
  return text.replace(/Bearer\s+\S+|\bmmk_[A-Za-z0-9_-]+|\b(?:sk|pk)_[A-Za-z0-9_-]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi, "[redacted]").slice(0, 500);
}
export function requireOpId(opId?: string): string {
  if (!opId || !/^[A-Za-z0-9_.:-]{1,120}$/.test(opId) || safeConnectionText(opId) !== opId) throw new ConvexError("Supply a non-secret opId of 1–120 letters, digits, dots, colons, underscores or hyphens.");
  return opId;
}
export function connectionRequest(input: object) {
  return JSON.stringify(Object.entries(input).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)));
}
export async function previousChange(ctx: MutationCtx, connectionId: string, opId?: string, actor?: "ai" | "person", request?: object) {
  requireOpId(opId);
  const row = await ctx.db.query("aiConnectionChanges").withIndex("by_connection_op", q => q.eq("connectionId", connectionId).eq("opId", opId!)).unique();
  if (row && ((actor && row.actor !== actor) || (request && row.requestKey !== connectionRequest(request)))) throw new ConvexError("This opId already belongs to a different connection change. Use a new opId.");
  return row;
}
export async function connectionChange(ctx: MutationCtx, input: {
  ownerUserId: Id<"users">; accessOwnerId?: Id<"aiAccessOwners">; connectionId: string; actor: "person" | "ai" | "system";
  before: unknown; after: unknown; message: string; opId: string; requestKey?: string;
}) {
  requireOpId(input.opId);
  return ctx.db.insert("aiConnectionChanges", { ...input, message: safeConnectionText(input.message), createdAt: Date.now() });
}

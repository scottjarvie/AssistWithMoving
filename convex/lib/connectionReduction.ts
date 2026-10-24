import { ConvexError, v } from "convex/values";

export const SETTINGS_REFUSAL = "Your AI can only reduce its own connection. To increase or restore access, the person must open https://movingmanifest.com/settings/ai.";
export const reductionArgs = {
  expectedVersion: v.number(),
  scopes: v.optional(v.array(v.string())),
  moveIds: v.optional(v.array(v.string())),
  expiresAt: v.optional(v.union(v.number(), v.null())),
  action: v.optional(v.string()),
};
export type Reduction = {
  expectedVersion: number; scopes?: string[]; moveIds?: string[];
  expiresAt?: number | null; action?: string;
};
/** The same subset law applies to each door, using that door's own ceiling. */
export function reducedAccess(current: {
  version: number; scopes: readonly string[]; moveIds?: readonly string[];
  expiresAt?: number; active: boolean;
}, input: Reduction, now = Date.now()) {
  if (current.version !== input.expectedVersion) throw new ConvexError(`This connection changed. Current version: ${current.version}. Retry the reduction with that version.`);
  if (!current.active || (current.expiresAt !== undefined && current.expiresAt <= now)) throw new ConvexError(SETTINGS_REFUSAL);
  if (input.action && !["narrow", "pause", "revoke"].includes(input.action)) throw new ConvexError(SETTINGS_REFUSAL);
  if (input.scopes?.some(scope => !current.scopes.includes(scope))) throw new ConvexError(SETTINGS_REFUSAL);
  if (input.moveIds && (input.moveIds.length === 0 || (current.moveIds && input.moveIds.some(id => !current.moveIds!.includes(id))))) throw new ConvexError(SETTINGS_REFUSAL);
  if (input.expiresAt !== undefined && (input.expiresAt === null || !Number.isFinite(input.expiresAt) || (current.expiresAt !== undefined && input.expiresAt > current.expiresAt))) throw new ConvexError(SETTINGS_REFUSAL);
  return {
    scopes: input.scopes ? [...new Set(input.scopes)] : undefined,
    moveIds: input.moveIds ? [...new Set(input.moveIds)] : undefined,
    expiresAt: input.action === "pause" ? Math.min(now, input.expiresAt ?? Infinity, current.expiresAt ?? Infinity) : input.expiresAt,
  };
}

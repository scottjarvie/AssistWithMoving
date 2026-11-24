import {
  anyApi,
  type FunctionReference,
} from "convex/server";
import type { Id } from "../../_generated/dataModel";

// Keep exact internal addresses without importing the generated API into REST.
export const internalFunctions = anyApi as unknown as {
  apiKeys: { reduceCallingKey: FunctionReference<"mutation", "internal", { apiKeyId: Id<"apiKeys"> } & import("../connectionReduction").Reduction, { version: number; receipt: Id<"aiConnectionChanges">; settings: string }> };
  planOps: {
    applyApiOps: FunctionReference<
      "mutation",
      "internal",
      {
        householdId: Id<"households">;
        moveId: Id<"moves">;
        planId: Id<"floorPlans">;
        batchId: string;
        ops: unknown[];
        apiKeyId: Id<"apiKeys">;
        agentLabel?: string;
        acknowledgeContactDetails?: unknown;
        restorePrivately?: boolean;
      },
      unknown
    >;
  };
};

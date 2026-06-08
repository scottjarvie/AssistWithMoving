import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const aiUsageLimits = {
  maxInputBytes: 200_000,
  maxPhotoInputBytes: 25 * 1024 * 1024,
  maxDailyJobsPerMove: 120,
  maxDailyJobsPerHousehold: 200,
  maxDailyJobsPerUser: 80,
  maxInFlightJobsPerMove: 10,
  maxSingleJobCents: 100,
  maxDailyEstimatedCentsPerMove: 500,
  expensiveJobCents: 50,
} as const;

const inFlightStatuses = new Set(["queued", "running"]);
const dayMs = 24 * 60 * 60 * 1000;

export type AiUsageStatus = Doc<"aiJobs">["status"];
export type AiUsageJob = Pick<
  Doc<"aiJobs">,
  | "_id"
  | "type"
  | "status"
  | "provider"
  | "model"
  | "cost"
  | "maxCostCents"
  | "error"
  | "createdAt"
  | "updatedAt"
>;

export type AiUsageLimitInput = {
  inputSizeBytes?: number;
  estimatedCents?: number;
  moveDailyJobCount: number;
  householdDailyJobCount: number;
  userDailyJobCount: number;
  moveInFlightJobCount: number;
  moveDailyEstimatedCents: number;
};

export function evaluateAiUsageLimits(input: AiUsageLimitInput) {
  const requestedCents = Math.max(0, input.estimatedCents ?? 0);

  if (
    typeof input.inputSizeBytes === "number" &&
    input.inputSizeBytes > aiUsageLimits.maxInputBytes
  ) {
    return {
      allowed: false,
      reason: `AI input is too large. Limit is ${formatBytes(aiUsageLimits.maxInputBytes)} per request.`,
    };
  }

  if (requestedCents > aiUsageLimits.maxSingleJobCents) {
    return {
      allowed: false,
      reason: `AI job estimate exceeds the per-job limit of ${formatCents(aiUsageLimits.maxSingleJobCents)}.`,
    };
  }

  if (input.moveInFlightJobCount >= aiUsageLimits.maxInFlightJobsPerMove) {
    return {
      allowed: false,
      reason: "Too many AI jobs are already queued or running for this move.",
    };
  }

  if (input.moveDailyJobCount >= aiUsageLimits.maxDailyJobsPerMove) {
    return {
      allowed: false,
      reason: "This move has reached its daily AI job limit.",
    };
  }

  if (input.householdDailyJobCount >= aiUsageLimits.maxDailyJobsPerHousehold) {
    return {
      allowed: false,
      reason: "This household has reached its daily AI job limit.",
    };
  }

  if (input.userDailyJobCount >= aiUsageLimits.maxDailyJobsPerUser) {
    return {
      allowed: false,
      reason: "Your account has reached its daily AI job limit.",
    };
  }

  if (
    input.moveDailyEstimatedCents + requestedCents >
    aiUsageLimits.maxDailyEstimatedCentsPerMove
  ) {
    return {
      allowed: false,
      reason: `This move has reached its daily AI budget of ${formatCents(aiUsageLimits.maxDailyEstimatedCentsPerMove)}.`,
    };
  }

  return { allowed: true, reason: undefined };
}

export async function assertAiUsageAllowed(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    userId: Id<"users">;
    inputSizeBytes?: number;
    estimatedCents?: number;
  }
) {
  const now = Date.now();
  const dayStart = now - dayMs;

  const [moveDailyJobs, householdDailyJobs, userDailyJobs, queuedJobs, runningJobs] =
    await Promise.all([
      ctx.db
        .query("aiJobs")
        .withIndex("by_move_created", (q) =>
          q.eq("moveId", args.moveId).gte("createdAt", dayStart)
        )
        .collect(),
      ctx.db
        .query("aiJobs")
        .withIndex("by_household_created", (q) =>
          q.eq("householdId", args.householdId).gte("createdAt", dayStart)
        )
        .collect(),
      ctx.db
        .query("aiJobs")
        .withIndex("by_created_by_created", (q) =>
          q.eq("createdByUserId", args.userId).gte("createdAt", dayStart)
        )
        .collect(),
      ctx.db
        .query("aiJobs")
        .withIndex("by_move_status", (q) =>
          q.eq("moveId", args.moveId).eq("status", "queued")
        )
        .collect(),
      ctx.db
        .query("aiJobs")
        .withIndex("by_move_status", (q) =>
          q.eq("moveId", args.moveId).eq("status", "running")
        )
        .collect(),
    ]);

  const result = evaluateAiUsageLimits({
    inputSizeBytes: args.inputSizeBytes,
    estimatedCents: args.estimatedCents,
    moveDailyJobCount: moveDailyJobs.length,
    householdDailyJobCount: householdDailyJobs.length,
    userDailyJobCount: userDailyJobs.length,
    moveInFlightJobCount: queuedJobs.length + runningJobs.length,
    moveDailyEstimatedCents: sumJobCostCents(moveDailyJobs),
  });

  if (!result.allowed) {
    throw new Error(result.reason);
  }
}

export function summarizeAiUsage(jobs: AiUsageJob[], now = Date.now()) {
  const dayStart = now - dayMs;
  const byStatus = createCountMap([
    "queued",
    "running",
    "succeeded",
    "failed",
    "canceled",
  ] satisfies AiUsageStatus[]);
  const byType: Record<string, number> = {};
  const byProviderModel: Record<string, number> = {};
  const dailyJobs = jobs.filter((job) => job.createdAt >= dayStart);
  const failedRecent = jobs
    .filter((job) => job.status === "failed")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);
  const expensiveJobs = jobs
    .filter((job) => jobCostCents(job) >= aiUsageLimits.expensiveJobCents)
    .sort((a, b) => jobCostCents(b) - jobCostCents(a))
    .slice(0, 5);

  for (const job of jobs) {
    byStatus[job.status] = (byStatus[job.status] ?? 0) + 1;
    byType[job.type] = (byType[job.type] ?? 0) + 1;
    const providerModel = `${job.provider}/${job.model}`;
    byProviderModel[providerModel] = (byProviderModel[providerModel] ?? 0) + 1;
  }

  const dailyCostCents = sumJobCostCents(dailyJobs);
  const inFlight = jobs.filter((job) => inFlightStatuses.has(job.status)).length;

  return {
    limits: aiUsageLimits,
    totalJobs: jobs.length,
    dailyJobs: dailyJobs.length,
    inFlightJobs: inFlight,
    failedJobs: byStatus.failed ?? 0,
    dailyCostCents,
    totalCostCents: sumJobCostCents(jobs),
    remainingDailyMoveJobs: Math.max(
      0,
      aiUsageLimits.maxDailyJobsPerMove - dailyJobs.length
    ),
    remainingDailyMoveCents: Math.max(
      0,
      aiUsageLimits.maxDailyEstimatedCentsPerMove - dailyCostCents
    ),
    byStatus,
    byType,
    byProviderModel,
    failedRecent: failedRecent.map(publicJobSummary),
    expensiveJobs: expensiveJobs.map(publicJobSummary),
  };
}

export function estimatedCentsForDeterministicJob(maxCostCents?: number) {
  if (typeof maxCostCents === "number") {
    return Math.max(0, maxCostCents);
  }
  return 1;
}

export function inputBytesFromText(value: string) {
  return new TextEncoder().encode(value).length;
}

export function jobCostCents(job: AiUsageJob) {
  return Math.max(
    0,
    job.cost?.actualCents ?? job.cost?.estimatedCents ?? job.maxCostCents ?? 0
  );
}

function sumJobCostCents(jobs: AiUsageJob[]) {
  return jobs.reduce((total, job) => total + jobCostCents(job), 0);
}

function publicJobSummary(job: AiUsageJob) {
  return {
    id: job._id,
    type: job.type,
    status: job.status,
    provider: job.provider,
    model: job.model,
    costCents: jobCostCents(job),
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function createCountMap<T extends string>(keys: T[]) {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  }
  return `${Math.round(bytes / 1024)}KB`;
}

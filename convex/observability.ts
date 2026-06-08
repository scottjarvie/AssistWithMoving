import { mutation, type MutationCtx } from "./_generated/server";
import { requireAppAdmin, recordAdminAccess } from "./lib/admin";
import { countBy, safeAuditSummary, sumBy } from "./lib/adminSummaries";
import {
  evaluateOperationalSignals,
  operationalHealth,
  type OperationalMetrics,
} from "./lib/observability";

export const status = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAppAdmin(ctx);
    const now = Date.now();
    const dayStart = now - 24 * 60 * 60 * 1000;
    const [
      authAudits,
      apiAudits,
      shareAudits,
      exportAudits,
      aiAudits,
      photoAudits,
      systemAudits,
      aiJobs,
      exportJobs,
      uploadSessions,
      shareLinks,
      apiKeys,
      photos,
    ] = await Promise.all([
      recentAuditsByCategory(ctx, "auth", 100),
      recentAuditsByCategory(ctx, "apiKey", 200),
      recentAuditsByCategory(ctx, "shareLink", 200),
      recentAuditsByCategory(ctx, "export", 200),
      recentAuditsByCategory(ctx, "ai", 200),
      recentAuditsByCategory(ctx, "photo", 200),
      recentAuditsByCategory(ctx, "system", 100),
      ctx.db.query("aiJobs").collect(),
      ctx.db.query("exportJobs").collect(),
      ctx.db.query("photoUploadSessions").collect(),
      ctx.db.query("shareLinks").collect(),
      ctx.db.query("apiKeys").collect(),
      ctx.db.query("itemPhotos").collect(),
    ]);

    const audits = [
      ...authAudits,
      ...apiAudits,
      ...shareAudits,
      ...exportAudits,
      ...aiAudits,
      ...photoAudits,
      ...systemAudits,
    ];
    const recentAudits = audits.filter((entry) => entry.createdAt >= dayStart);
    const recentAiJobs = aiJobs.filter((job) => job.createdAt >= dayStart);
    const recentExportJobs = exportJobs.filter((job) => job.createdAt >= dayStart);
    const recentUploadSessions = uploadSessions.filter(
      (session) => session.createdAt >= dayStart
    );
    const metrics: OperationalMetrics = {
      authFailures24h: recentAudits.filter(
        (entry) =>
          entry.category === "auth" &&
          /failed|failure|error|rejected/i.test(entry.action)
      ).length,
      apiEvents24h: recentAudits.filter((entry) => entry.category === "apiKey")
        .length,
      shareLinkAccesses24h: recentAudits.filter(
        (entry) => entry.action === "share_link.accessed"
      ).length,
      activeShareLinks: shareLinks.filter(
        (link) => link.status === "active" && link.expiresAt > now
      ).length,
      exportJobs24h: recentExportJobs.length,
      failedAiJobs24h: recentAiJobs.filter((job) => job.status === "failed")
        .length,
      aiEstimatedCents24h: sumBy(
        recentAiJobs,
        (job) => job.cost?.estimatedCents
      ),
      uploadFailures24h: recentUploadSessions.filter(
        (session) => session.status === "failed"
      ).length,
      photoStorageBytes: sumBy(
        photos.filter((photo) => !photo.archivedAt),
        (photo) => photo.sizeBytes
      ),
      activeApiKeys: apiKeys.filter((key) => key.status === "active").length,
    };
    const signals = evaluateOperationalSignals(metrics);

    await recordAdminAccess(ctx, admin, "admin.observability_viewed", {
      health: operationalHealth(signals),
      signalCount: signals.length,
    });

    return {
      generatedAt: now,
      health: operationalHealth(signals),
      signals,
      metrics,
      distributions: {
        auditByCategory24h: countBy(recentAudits, (entry) => entry.category),
        aiJobsByStatus24h: countBy(recentAiJobs, (job) => job.status),
        exportsByStatus24h: countBy(recentExportJobs, (job) => job.status),
        uploadSessionsByStatus24h: countBy(
          recentUploadSessions,
          (session) => session.status
        ),
      },
      healthChecks: [
        {
          key: "convexFunctions",
          label: "Convex functions",
          status: "ok",
          detail: "Observability mutation executed successfully.",
        },
        {
          key: "auditRedaction",
          label: "Audit redaction",
          status: "ok",
          detail:
            "Operational rows use the shared redacted audit summary helper before reaching the admin UI.",
        },
        {
          key: "externalAlerting",
          label: "External alerting",
          status: "planned",
          detail:
            "No paid alerting provider is active yet; admin-visible signals are live and provider-ready.",
        },
      ],
      recentEvents: audits
        .sort((first, second) => second.createdAt - first.createdAt)
        .slice(0, 25)
        .map(safeAuditSummary),
    };
  },
});

async function recentAuditsByCategory(
  ctx: MutationCtx,
  category:
    | "auth"
    | "apiKey"
    | "shareLink"
    | "export"
    | "ai"
    | "photo"
    | "system",
  limit: number
) {
  return await ctx.db
    .query("auditLogs")
    .withIndex("by_category_time", (q) => q.eq("category", category))
    .order("desc")
    .take(limit);
}

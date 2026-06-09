export type OperationalSeverity = "ok" | "info" | "warning" | "critical";

export type OperationalMetrics = {
  authFailures24h: number;
  apiEvents24h: number;
  shareLinkAccesses24h: number;
  activeShareLinks: number;
  exportJobs24h: number;
  failedAiJobs24h: number;
  aiEstimatedCents24h: number;
  uploadFailures24h: number;
  photoStorageBytes: number;
  activeApiKeys: number;
  apiRateLimitedWindows24h: number;
  apiHighestWindowUsagePercent24h: number;
};

export type OperationalSignal = {
  key: keyof OperationalMetrics;
  label: string;
  severity: Exclude<OperationalSeverity, "ok" | "info">;
  value: number;
  warningAt: number;
  criticalAt: number;
  description: string;
};

export type AbuseReviewAuditInput = {
  id: string;
  householdId?: string;
  moveId?: string;
  actorType: string;
  actorUserId?: string;
  actorApiKeyId?: string;
  category: string;
  action: string;
  objectTable?: string;
  objectId?: string;
  createdAt: number;
};

export type AbuseReviewRateLimitInput = {
  id: string;
  householdId: string;
  moveId?: string;
  apiKeyId: string;
  windowStart: number;
  windowEnd: number;
  count: number;
  limit: number;
  lastAction?: string;
  updatedAt: number;
};

export type AbuseReviewCard = {
  id: string;
  title: string;
  severity: Exclude<OperationalSeverity, "ok" | "info">;
  area: string;
  reason: string;
  count: number;
  thresholdLabel: string;
  householdId?: string;
  moveId?: string;
  actorType?: string;
  actorUserId?: string;
  actorApiKeyId?: string;
  objectTable?: string;
  objectId?: string;
  lastSeenAt: number;
  recommendedAction: string;
  events: AbuseReviewAuditInput[];
};

export const operationalThresholds: Record<
  keyof OperationalMetrics,
  {
    label: string;
    warningAt: number;
    criticalAt: number;
    description: string;
  }
> = {
  authFailures24h: {
    label: "Auth failures",
    warningAt: 5,
    criticalAt: 25,
    description: "Failed auth/webhook verification events in the last 24 hours.",
  },
  apiEvents24h: {
    label: "API events",
    warningAt: 500,
    criticalAt: 2_000,
    description: "API-key audit events in the last 24 hours.",
  },
  shareLinkAccesses24h: {
    label: "Share-link access",
    warningAt: 100,
    criticalAt: 500,
    description: "Share-link access events in the last 24 hours.",
  },
  activeShareLinks: {
    label: "Active share links",
    warningAt: 500,
    criticalAt: 2_000,
    description: "Currently active, unexpired share links.",
  },
  exportJobs24h: {
    label: "Export jobs",
    warningAt: 250,
    criticalAt: 1_000,
    description: "Generated export jobs in the last 24 hours.",
  },
  failedAiJobs24h: {
    label: "Failed AI jobs",
    warningAt: 10,
    criticalAt: 50,
    description: "Failed AI jobs in the last 24 hours.",
  },
  aiEstimatedCents24h: {
    label: "AI estimated cost",
    warningAt: 2_500,
    criticalAt: 10_000,
    description: "Estimated AI cost in cents over the last 24 hours.",
  },
  uploadFailures24h: {
    label: "Upload failures",
    warningAt: 10,
    criticalAt: 50,
    description: "Failed photo upload sessions in the last 24 hours.",
  },
  photoStorageBytes: {
    label: "Photo storage",
    warningAt: 100 * 1024 * 1024 * 1024,
    criticalAt: 500 * 1024 * 1024 * 1024,
    description: "Total non-archived photo storage tracked in Convex metadata.",
  },
  activeApiKeys: {
    label: "Active API keys",
    warningAt: 500,
    criticalAt: 2_000,
    description: "Currently active API keys.",
  },
  apiRateLimitedWindows24h: {
    label: "API rate-limited windows",
    warningAt: 1,
    criticalAt: 10,
    description: "API-key windows that exceeded their configured limit in the last 24 hours.",
  },
  apiHighestWindowUsagePercent24h: {
    label: "Highest API window usage",
    warningAt: 90,
    criticalAt: 100,
    description: "Highest API-key rate-limit window utilization in the last 24 hours.",
  },
};

export function evaluateOperationalSignals(metrics: OperationalMetrics) {
  return (Object.keys(operationalThresholds) as Array<keyof OperationalMetrics>)
    .map((key) => {
      const threshold = operationalThresholds[key];
      const value = metrics[key] ?? 0;
      const severity =
        value >= threshold.criticalAt
          ? "critical"
          : value >= threshold.warningAt
            ? "warning"
            : null;

      if (!severity) {
        return null;
      }

      return {
        key,
        label: threshold.label,
        severity,
        value,
        warningAt: threshold.warningAt,
        criticalAt: threshold.criticalAt,
        description: threshold.description,
      } satisfies OperationalSignal;
    })
    .filter((signal) => signal !== null);
}

export function operationalHealth(signals: OperationalSignal[]) {
  if (signals.some((signal) => signal.severity === "critical")) {
    return "critical" as const;
  }
  if (signals.some((signal) => signal.severity === "warning")) {
    return "warning" as const;
  }
  return "ok" as const;
}

export function formatOperationalMetric(value: number, key: keyof OperationalMetrics) {
  if (key === "photoStorageBytes") {
    return formatBytes(value);
  }
  if (key === "aiEstimatedCents24h") {
    return `$${(value / 100).toFixed(2)}`;
  }
  if (key === "apiHighestWindowUsagePercent24h") {
    return `${value.toLocaleString()}%`;
  }
  return value.toLocaleString();
}

export function buildAbuseReviewQueue({
  signals,
  audits,
  rateLimitWindows,
  now,
  maxCards = 12,
}: {
  signals: OperationalSignal[];
  audits: AbuseReviewAuditInput[];
  rateLimitWindows: AbuseReviewRateLimitInput[];
  now: number;
  maxCards?: number;
}) {
  const cards = [
    ...cardsFromSignals(signals, audits, now),
    ...cardsFromRateLimitWindows(rateLimitWindows),
    ...cardsFromAuditClusters(audits),
  ];
  const uniqueCards = Array.from(
    cards
      .reduce<Map<string, AbuseReviewCard>>((byId, card) => {
        const existing = byId.get(card.id);
        if (!existing || compareReviewCards(card, existing) < 0) {
          byId.set(card.id, card);
        }
        return byId;
      }, new Map())
      .values()
  );

  return uniqueCards.sort(compareReviewCards).slice(0, maxCards);
}

function cardsFromSignals(
  signals: OperationalSignal[],
  audits: AbuseReviewAuditInput[],
  now: number
) {
  return signals.map((signal) => {
    const matchingEvents = recentEventsForSignal(signal.key, audits);
    return {
      id: `signal:${signal.key}`,
      title: `${signal.label} needs review`,
      severity: signal.severity,
      area: areaForMetric(signal.key),
      reason: `${signal.description} Current value is ${formatOperationalMetric(
        signal.value,
        signal.key
      )}.`,
      count: signal.value,
      thresholdLabel: `Warns at ${formatOperationalMetric(
        signal.warningAt,
        signal.key
      )}; critical at ${formatOperationalMetric(signal.criticalAt, signal.key)}.`,
      lastSeenAt: matchingEvents[0]?.createdAt ?? now,
      recommendedAction: recommendationForMetric(signal.key),
      events: matchingEvents,
    } satisfies AbuseReviewCard;
  });
}

function cardsFromRateLimitWindows(windows: AbuseReviewRateLimitInput[]) {
  return windows
    .filter((window) => rateLimitUsagePercent(window) >= 90)
    .sort((first, second) => rateLimitUsagePercent(second) - rateLimitUsagePercent(first))
    .slice(0, 8)
    .map((window) => {
      const usage = rateLimitUsagePercent(window);
      const overLimit = window.count > window.limit;
      return {
        id: `rate-limit:${window.apiKeyId}:${window.windowStart}`,
        title: overLimit ? "API key is rate limited" : "API key near rate limit",
        severity: overLimit ? "critical" : "warning",
        area: "API",
        reason: `This API key used ${usage}% of its ${window.limit.toLocaleString()} request window.`,
        count: window.count,
        thresholdLabel: "Warns at 90% of the request window; critical above 100%.",
        householdId: window.householdId,
        moveId: window.moveId,
        actorType: "apiKey",
        actorApiKeyId: window.apiKeyId,
        objectTable: "apiRateLimitWindows",
        objectId: window.id,
        lastSeenAt: window.updatedAt,
        recommendedAction:
          "Review the key scope, allowed move restriction, recent action, and whether automation should slow down or be revoked.",
        events: window.lastAction
          ? [
              {
                id: window.id,
                householdId: window.householdId,
                moveId: window.moveId,
                actorType: "apiKey",
                actorApiKeyId: window.apiKeyId,
                category: "apiKey",
                action: window.lastAction,
                objectTable: "apiRateLimitWindows",
                objectId: window.id,
                createdAt: window.updatedAt,
              },
            ]
          : [],
      } satisfies AbuseReviewCard;
    });
}

function cardsFromAuditClusters(audits: AbuseReviewAuditInput[]) {
  const groups = audits.reduce<Map<string, AbuseReviewAuditInput[]>>((byKey, audit) => {
    const cluster = clusterDefinitionForAudit(audit);
    if (!cluster) {
      return byKey;
    }
    const key = [
      cluster.id,
      audit.actorApiKeyId,
      audit.actorUserId,
      audit.objectId,
      audit.moveId,
      audit.householdId,
    ]
      .filter(Boolean)
      .join(":");
    const existing = byKey.get(key) ?? [];
    existing.push(audit);
    byKey.set(key, existing);
    return byKey;
  }, new Map());

  return Array.from(groups.values())
    .map((events) => {
      const sortedEvents = [...events].sort((first, second) => second.createdAt - first.createdAt);
      const cluster = clusterDefinitionForAudit(sortedEvents[0]);
      if (!cluster || events.length < cluster.warningAt) {
        return null;
      }
      const severity = events.length >= cluster.criticalAt ? "critical" : "warning";
      const firstEvent = sortedEvents[0];
      return {
        id: `cluster:${cluster.id}:${firstEvent.actorApiKeyId ?? firstEvent.actorUserId ?? firstEvent.objectId ?? firstEvent.moveId ?? firstEvent.householdId ?? "system"}`,
        title: cluster.title,
        severity,
        area: cluster.area,
        reason: cluster.reason,
        count: events.length,
        thresholdLabel: `Warns at ${cluster.warningAt}; critical at ${cluster.criticalAt}.`,
        householdId: firstEvent.householdId,
        moveId: firstEvent.moveId,
        actorType: firstEvent.actorType,
        actorUserId: firstEvent.actorUserId,
        actorApiKeyId: firstEvent.actorApiKeyId,
        objectTable: firstEvent.objectTable,
        objectId: firstEvent.objectId,
        lastSeenAt: firstEvent.createdAt,
        recommendedAction: cluster.recommendedAction,
        events: sortedEvents.slice(0, 5),
      } satisfies AbuseReviewCard;
    })
    .filter((card) => card !== null);
}

function recentEventsForSignal(
  key: keyof OperationalMetrics,
  audits: AbuseReviewAuditInput[]
) {
  const categories = categoriesForMetric(key);
  return audits
    .filter((audit) => categories.includes(audit.category))
    .sort((first, second) => second.createdAt - first.createdAt)
    .slice(0, 5);
}

function categoriesForMetric(key: keyof OperationalMetrics) {
  switch (key) {
    case "authFailures24h":
      return ["auth"];
    case "apiEvents24h":
    case "activeApiKeys":
    case "apiRateLimitedWindows24h":
    case "apiHighestWindowUsagePercent24h":
      return ["apiKey"];
    case "shareLinkAccesses24h":
    case "activeShareLinks":
      return ["shareLink"];
    case "exportJobs24h":
      return ["export"];
    case "failedAiJobs24h":
    case "aiEstimatedCents24h":
      return ["ai"];
    case "uploadFailures24h":
    case "photoStorageBytes":
      return ["photo"];
  }
}

function areaForMetric(key: keyof OperationalMetrics) {
  switch (key) {
    case "authFailures24h":
      return "Auth";
    case "apiEvents24h":
    case "activeApiKeys":
    case "apiRateLimitedWindows24h":
    case "apiHighestWindowUsagePercent24h":
      return "API";
    case "shareLinkAccesses24h":
    case "activeShareLinks":
      return "Sharing";
    case "exportJobs24h":
      return "Exports";
    case "failedAiJobs24h":
    case "aiEstimatedCents24h":
      return "AI";
    case "uploadFailures24h":
    case "photoStorageBytes":
      return "Photos";
  }
}

function recommendationForMetric(key: keyof OperationalMetrics) {
  switch (key) {
    case "authFailures24h":
      return "Check recent auth/webhook failures for bad configuration, replay attempts, or unusual sign-in patterns.";
    case "apiEvents24h":
    case "activeApiKeys":
      return "Review active keys, scopes, allowed move restrictions, and whether high-volume automation is expected.";
    case "apiRateLimitedWindows24h":
    case "apiHighestWindowUsagePercent24h":
      return "Inspect the rate-limit cards below, then throttle or revoke keys that are not expected automation.";
    case "shareLinkAccesses24h":
    case "activeShareLinks":
      return "Review active share links, expiration dates, roles, and recent access patterns.";
    case "exportJobs24h":
      return "Confirm export volume is user-driven and revoke suspicious share or API access if needed.";
    case "failedAiJobs24h":
    case "aiEstimatedCents24h":
      return "Check AI job failures and spend against household limits before increasing provider quotas.";
    case "uploadFailures24h":
    case "photoStorageBytes":
      return "Review failed sessions, storage growth, and original-download access without opening private photo contents.";
  }
}

function clusterDefinitionForAudit(audit: AbuseReviewAuditInput) {
  if (audit.action === "photo.original_download_url_created") {
    return {
      id: "photo-original-downloads",
      title: "Repeated original photo downloads",
      area: "Photos",
      warningAt: 3,
      criticalAt: 10,
      reason:
        "Original photo downloads are sensitive and should stay rare, deliberate, and auditable.",
      recommendedAction:
        "Confirm the requester needed originals, then review household permissions and revoke suspicious access.",
    };
  }
  if (audit.action === "share_link.accessed") {
    return {
      id: "share-link-accesses",
      title: "Repeated share-link access",
      area: "Sharing",
      warningAt: 25,
      criticalAt: 100,
      reason:
        "High access on one public share link can indicate broad forwarding, scraping, or an overly permissive packet.",
      recommendedAction:
        "Check the share-link role, expiration, allowed actions, and revoke the link if access is not expected.",
    };
  }
  if (audit.category === "apiKey") {
    return {
      id: "api-key-events",
      title: "High API-key activity",
      area: "API",
      warningAt: 50,
      criticalAt: 200,
      reason:
        "A concentrated API-key event cluster can indicate runaway automation or an overly broad integration.",
      recommendedAction:
        "Review the API key scope and move restriction, then rotate or revoke it if the pattern is unexpected.",
    };
  }
  if (audit.action === "ai_job.failed") {
    return {
      id: "ai-job-failures",
      title: "Repeated AI job failures",
      area: "AI",
      warningAt: 5,
      criticalAt: 20,
      reason:
        "Repeated AI failures can burn budget, block users, or signal bad provider configuration.",
      recommendedAction:
        "Review recent job status, provider configuration, and household AI limits before retrying more work.",
    };
  }
  return null;
}

function rateLimitUsagePercent(window: AbuseReviewRateLimitInput) {
  if (window.limit <= 0) {
    return 0;
  }
  return Math.round((window.count / window.limit) * 100);
}

function compareReviewCards(first: AbuseReviewCard, second: AbuseReviewCard) {
  const severityDelta = severityScore(second.severity) - severityScore(first.severity);
  if (severityDelta !== 0) {
    return severityDelta;
  }
  const countDelta = second.count - first.count;
  if (countDelta !== 0) {
    return countDelta;
  }
  return second.lastSeenAt - first.lastSeenAt;
}

function severityScore(severity: AbuseReviewCard["severity"]) {
  return severity === "critical" ? 2 : 1;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value.toLocaleString()} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

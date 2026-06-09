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
  severity: Exclude<OperationalSeverity, "ok">;
  value: number;
  warningAt: number;
  criticalAt: number;
  description: string;
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

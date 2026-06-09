export type RedactedCspReport = {
  effectiveDirective?: string;
  violatedDirective?: string;
  blockedUri?: string;
  documentUri?: string;
  sourceFile?: string;
  disposition?: string;
  statusCode?: number;
  lineNumber?: number;
  columnNumber?: number;
  sample?: string;
};

type UnknownRecord = Record<string, unknown>;

const maxSampleLength = 120;

export function parseCspReports(payload: unknown): RedactedCspReport[] {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload)) {
    return payload.flatMap(parseReportingApiEntry).filter(hasReportSignal);
  }

  const record = payload as UnknownRecord;
  const cspReport = record["csp-report"];
  if (cspReport && typeof cspReport === "object" && !Array.isArray(cspReport)) {
    return [redactLegacyCspReport(cspReport as UnknownRecord)].filter(
      hasReportSignal
    );
  }

  return [redactLegacyCspReport(record)].filter(hasReportSignal);
}

export function redactCspUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (trimmed === "inline" || trimmed === "eval" || trimmed === "self") {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname}`;
  } catch {
    return trimmed.slice(0, 180);
  }
}

function parseReportingApiEntry(entry: unknown): RedactedCspReport[] {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
  const record = entry as UnknownRecord;
  if (record.type !== "csp-violation") return [];
  const body = record.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const bodyRecord = body as UnknownRecord;

  return [
    {
      effectiveDirective: asText(bodyRecord.effectiveDirective),
      violatedDirective: asText(bodyRecord.effectiveDirective),
      blockedUri: redactCspUrl(bodyRecord.blockedURL),
      documentUri: redactCspUrl(bodyRecord.documentURL),
      sourceFile: redactCspUrl(bodyRecord.sourceFile),
      disposition: asText(bodyRecord.disposition),
      statusCode: asNumber(bodyRecord.statusCode),
      lineNumber: asNumber(bodyRecord.lineNumber),
      columnNumber: asNumber(bodyRecord.columnNumber),
      sample: trimSample(bodyRecord.sample),
    },
  ];
}

function redactLegacyCspReport(report: UnknownRecord): RedactedCspReport {
  return {
    effectiveDirective: asText(report["effective-directive"]),
    violatedDirective: asText(report["violated-directive"]),
    blockedUri: redactCspUrl(report["blocked-uri"]),
    documentUri: redactCspUrl(report["document-uri"]),
    sourceFile: redactCspUrl(report["source-file"]),
    disposition: asText(report.disposition),
    statusCode: asNumber(report["status-code"]),
    lineNumber: asNumber(report["line-number"]),
    columnNumber: asNumber(report["column-number"]),
    sample: trimSample(report["script-sample"]),
  };
}

function hasReportSignal(report: RedactedCspReport) {
  return Boolean(
    report.effectiveDirective ||
      report.violatedDirective ||
      report.blockedUri ||
      report.documentUri ||
      report.sourceFile
  );
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 180)
    : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function trimSample(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxSampleLength)
    : undefined;
}

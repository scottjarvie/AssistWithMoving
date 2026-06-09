import { NextResponse } from "next/server";

import { parseCspReports } from "@/lib/csp-report";

const maxReportBytes = 16 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxReportBytes) {
    return NextResponse.json({ error: "CSP report too large." }, { status: 413 });
  }

  let payload: unknown = null;
  try {
    const text = await request.text();
    if (text.length > maxReportBytes) {
      return NextResponse.json(
        { error: "CSP report too large." },
        { status: 413 }
      );
    }
    payload = text.trim() ? JSON.parse(text) : null;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const reports = parseCspReports(payload);
  if (reports.length > 0 && process.env.CSP_REPORT_LOGGING !== "disabled") {
    console.warn(
      "movingmanifest_csp_violation",
      JSON.stringify({ reports: reports.slice(0, 5) })
    );
  }

  return new NextResponse(null, { status: 204 });
}

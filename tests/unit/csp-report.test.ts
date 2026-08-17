import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/csp-report/route";
import { parseCspReports, redactCspUrl } from "@/lib/csp-report";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CSP report handling", () => {
  it("redacts URL query strings and fragments", () => {
    expect(
      redactCspUrl("https://movingmanifest.com/app/dashboard?token=secret#frag")
    ).toBe("https://movingmanifest.com/app/dashboard");
  });

  it("parses legacy CSP reports into safe summaries", () => {
    expect(
      parseCspReports({
        "csp-report": {
          "document-uri": "https://movingmanifest.com/app/dashboard?secret=1",
          "blocked-uri": "https://cdn.example.test/script.js?token=secret",
          "violated-directive": "script-src-elem",
          "effective-directive": "script-src-elem",
          "source-file": "https://movingmanifest.com/app.js?cache=1",
          "line-number": 12,
          "column-number": 4,
        },
      })
    ).toEqual([
      {
        effectiveDirective: "script-src-elem",
        violatedDirective: "script-src-elem",
        blockedUri: "https://cdn.example.test/script.js",
        documentUri: "https://movingmanifest.com/app/dashboard",
        sourceFile: "https://movingmanifest.com/app.js",
        disposition: undefined,
        statusCode: undefined,
        lineNumber: 12,
        columnNumber: 4,
        sample: undefined,
      },
    ]);
  });

  it("parses Reporting API CSP entries", () => {
    expect(
      parseCspReports([
        {
          type: "csp-violation",
          body: {
            documentURL: "https://movingmanifest.com/settings?x=1",
            blockedURL: "inline",
            effectiveDirective: "style-src",
            disposition: "report",
            statusCode: 200,
          },
        },
      ])
    ).toEqual([
      {
        effectiveDirective: "style-src",
        violatedDirective: "style-src",
        blockedUri: "inline",
        documentUri: "https://movingmanifest.com/settings",
        sourceFile: undefined,
        disposition: "report",
        statusCode: 200,
        lineNumber: undefined,
        columnNumber: undefined,
        sample: undefined,
      },
    ]);
  });

  it("accepts and redacts CSP reports at the route boundary", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await POST(
      new Request("https://movingmanifest.com/api/csp-report", {
        method: "POST",
        headers: { "content-type": "application/csp-report" },
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "https://movingmanifest.com/app/dashboard?secret=1",
            "blocked-uri": "https://cdn.example.test/script.js?token=secret",
            "violated-directive": "script-src-elem",
          },
        }),
      })
    );

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledWith(
      "assistwithmoving_csp_violation",
      JSON.stringify({
        reports: [
          {
            effectiveDirective: undefined,
            violatedDirective: "script-src-elem",
            blockedUri: "https://cdn.example.test/script.js",
            documentUri: "https://movingmanifest.com/app/dashboard",
            sourceFile: undefined,
            disposition: undefined,
            statusCode: undefined,
            lineNumber: undefined,
            columnNumber: undefined,
            sample: undefined,
          },
        ],
      })
    );
  });

  it("rejects oversized reports before parsing", async () => {
    const response = await POST(
      new Request("https://movingmanifest.com/api/csp-report", {
        method: "POST",
        headers: { "content-length": String(17 * 1024) },
        body: "{}",
      })
    );

    expect(response.status).toBe(413);
  });
});

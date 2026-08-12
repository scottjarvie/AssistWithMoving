import { describe, expect, it } from "vitest";

import {
  contractDriftResults,
  formatContractDriftResults,
  mcpEnumManifest,
  openApiEnumManifest,
  restRouteManifest,
} from "../../scripts/contract-drift-check.mjs";

describe("REST/OpenAPI/MCP contract drift", () => {
  it("keeps the current public REST manifest, OpenAPI routes, MCP route coverage, and enum baselines in sync", () => {
    expect(contractDriftResults()).toEqual([]);
  });

  it("keeps the guardrail scoped to route and enum drift only", () => {
    expect(restRouteManifest).toHaveLength(27);
    expect(Object.keys(openApiEnumManifest).sort()).toEqual([
      "confidence",
      "itemDisposition",
      "itemFragility",
      "photoDerivativeVariant",
    ]);
    expect(Object.keys(mcpEnumManifest).sort()).toEqual([
      "confidence",
      "itemDisposition",
      "itemFragility",
    ]);
  });

  it("reports actionable route and enum drift details", () => {
    const results = contractDriftResults({
      openapi: {
        paths: {
          "/me": { get: {} },
          "/unexpected": { get: {} },
        },
        components: {
          schemas: {
            Confidence: { enum: ["low"] },
          },
        },
      },
      mcpApiSource: "",
      mcpServerSource:
        'const estimateConfidenceSchema = z.enum(["none", "low"]);',
    });

    expect(formatContractDriftResults(results)).toContain(
      "openapi_missing_manifest_route"
    );
    expect(formatContractDriftResults(results)).toContain(
      "openapi_unknown_route"
    );
    expect(formatContractDriftResults(results)).toContain(
      "mcp_missing_required_route"
    );
    expect(formatContractDriftResults(results)).toContain(
      "openapi_enum_drift"
    );
    expect(formatContractDriftResults(results)).toContain("mcp_enum_drift");
  });
});

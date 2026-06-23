import { describe, expect, it } from "vitest";

import { shouldRouteMcpSetupRequestToEndpoint } from "@/lib/mcp-endpoint-routing";

describe("MCP setup endpoint routing", () => {
  it("keeps browser visits on the human /mcp setup page", () => {
    expect(
      shouldRouteMcpSetupRequestToEndpoint({
        pathname: "/mcp",
        method: "GET",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8",
      })
    ).toBe(false);
    expect(
      shouldRouteMcpSetupRequestToEndpoint({
        pathname: "/mcp",
        method: "GET",
        accept: "*/*",
      })
    ).toBe(false);
  });

  it("keeps Next.js RSC prefetches on the human /mcp setup page", () => {
    for (const input of [
      {
        pathname: "/mcp",
        method: "GET",
        accept: "text/x-component",
        rsc: "1",
        search: "?_rsc=5CB6814pnAekjehf",
      },
      {
        pathname: "/mcp",
        method: "GET",
        accept: "*/*",
        nextRouterPrefetch: "1",
        nextRouterStateTree: "%5B%22%22%5D",
      },
      {
        pathname: "/mcp",
        method: "GET",
        accept: "*/*",
        search: "?_rsc=5CB6814pnAekjehf",
      },
    ]) {
      expect(shouldRouteMcpSetupRequestToEndpoint(input)).toBe(false);
    }
  });

  it("routes connector-looking /mcp requests to the MCP protocol endpoint", () => {
    for (const input of [
      {
        pathname: "/mcp",
        method: "POST",
        accept: "application/json, text/event-stream",
        contentType: "application/json",
      },
      {
        pathname: "/mcp/",
        method: "GET",
        accept: "application/json",
      },
      {
        pathname: "/mcp",
        method: "GET",
        accept: "text/event-stream",
      },
      {
        pathname: "/mcp",
        method: "GET",
        authorization: "Bearer fake-token",
      },
      {
        pathname: "/mcp",
        method: "GET",
        mcpProtocolVersion: "2025-06-18",
      },
    ]) {
      expect(shouldRouteMcpSetupRequestToEndpoint(input)).toBe(true);
    }
  });

  it("does not route unrelated pages", () => {
    expect(
      shouldRouteMcpSetupRequestToEndpoint({
        pathname: "/ai",
        method: "POST",
        accept: "application/json",
      })
    ).toBe(false);
  });
});

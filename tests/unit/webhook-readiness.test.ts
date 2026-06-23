import { describe, expect, it } from "vitest";

import {
  baseUrl,
  runWebhookReadiness,
  summarizeResults,
} from "../../scripts/webhook-readiness.mjs";

describe("webhook readiness", () => {
  it("derives the Convex webhook URL from the HTTP actions origin", () => {
    expect(
      baseUrl({
        CONVEX_HTTP_ACTIONS_URL: "https://fine-crocodile-51.convex.site",
      } as unknown as NodeJS.ProcessEnv)
    ).toBe("https://fine-crocodile-51.convex.site/clerk-webhook");
  });

  it("passes without a local signing secret when the remote endpoint rejects unsigned payloads", async () => {
    const results = await runWebhookReadiness({
      env: {
        CONVEX_HTTP_ACTIONS_URL: "https://fine-crocodile-51.convex.site",
      } as unknown as NodeJS.ProcessEnv,
      fetchImpl: async () =>
        new Response("verification failed", { status: 400 }),
    });

    expect(results).toContainEqual({
      status: "pass",
      label: "unsigned webhook rejection",
      detail: "endpoint rejects unsigned payloads with HTTP 400",
    });
    expect(results).toContainEqual({
      status: "pass",
      label: "webhook signing secret",
      detail:
        "remote endpoint has a signing secret; local env is optional for unsigned-rejection readiness",
    });
    expect(summarizeResults(results)).toEqual({
      pass: 3,
      warn: 0,
      blocked: 0,
      fail: 0,
    });
  });

  it("blocks when the remote endpoint reports that its signing secret is missing", async () => {
    const results = await runWebhookReadiness({
      env: {
        CONVEX_HTTP_ACTIONS_URL: "https://fine-crocodile-51.convex.site",
      } as unknown as NodeJS.ProcessEnv,
      fetchImpl: async () =>
        new Response("signing secret missing", { status: 500 }),
    });

    expect(results).toContainEqual({
      status: "blocked",
      label: "unsigned webhook rejection",
      detail:
        "endpoint is reachable but signing secret is not configured; tracked by MOVE-68",
    });
    expect(results).toContainEqual({
      status: "blocked",
      label: "webhook signing secret",
      detail:
        "missing CLERK_WEBHOOK_SIGNING_SECRET or CLERK_WEBHOOK_SECRET; tracked by MOVE-68",
    });
  });
});

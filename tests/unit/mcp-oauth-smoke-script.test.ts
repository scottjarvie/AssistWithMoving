import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

import {
  bearerChallengeParams,
  browserOpenCommand,
  connectionEmailFromContext,
  connectionNeedsHousehold,
  fetchForSmoke,
  firstSupported,
  formatDuration,
  invalidBearerBoundaryResult,
  oauthSmokeProofPayload,
  oauthCallbackTimeoutMessage,
  openBrowserUrl,
  manualOAuthHandoffLines,
  parsePositiveInteger,
  trustedHelperForbiddenTools,
  trustedHelperRequiredTools,
  trustedHelperToolsetResults,
  verifyExpectedConnectionEmail,
} from "../../scripts/mcp-oauth-smoke.mjs";
import { MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS } from "../../mcp-server/movingmanifest-mcp.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MCP OAuth smoke script helpers", () => {
  it("parses Bearer challenge params used for MCP resource metadata discovery", () => {
    expect(
      bearerChallengeParams(
        'Bearer realm="MovingManifest MCP", resource_metadata="https://movingmanifest.test/.well-known/oauth-protected-resource/api/mcp", scope="openid profile email"'
      )
    ).toEqual({
      realm: "MovingManifest MCP",
      resource_metadata:
        "https://movingmanifest.test/.well-known/oauth-protected-resource/api/mcp",
      scope: "openid profile email",
    });
  });

  it("selects the first supported OAuth metadata value", () => {
    expect(firstSupported(["plain", "S256"], ["S256"])).toBe("S256");
    expect(firstSupported(["client_secret_basic"], ["none"])).toBeNull();
    expect(firstSupported(undefined, ["none"])).toBeNull();
  });

  it("builds platform browser-open commands for manual OAuth handoff", () => {
    expect(browserOpenCommand("https://movingmanifest.test/oauth", "darwin")).toEqual({
      command: "open",
      args: ["https://movingmanifest.test/oauth"],
    });
    expect(browserOpenCommand("https://movingmanifest.test/oauth", "win32")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "https://movingmanifest.test/oauth"],
    });
    expect(browserOpenCommand("https://movingmanifest.test/oauth", "linux")).toEqual({
      command: "xdg-open",
      args: ["https://movingmanifest.test/oauth"],
    });
  });

  it("opens the manual OAuth URL without exposing tokens in the result", async () => {
    const child = Object.assign(new EventEmitter(), {
      unref: vi.fn(),
    });
    const spawnFn = vi.fn(() => {
      setTimeout(() => child.emit("spawn"), 0);
      return child;
    });

    await expect(
      openBrowserUrl("https://movingmanifest.test/oauth?code=secret", {
        platform: "darwin",
        spawnFn: spawnFn as unknown as typeof import("node:child_process").spawn,
      })
    ).resolves.toEqual({
      ok: true,
      detail: "open",
    });
    expect(spawnFn).toHaveBeenCalledWith("open", [
      "https://movingmanifest.test/oauth?code=secret",
    ], {
      detached: true,
      stdio: "ignore",
    });
    expect(child.unref).toHaveBeenCalled();
  });

  it("prints clear manual OAuth handoff instructions for the intended account", () => {
    const lines = manualOAuthHandoffLines({
      authorizationUrl: new URL("https://clerk.movingmanifest.com/oauth/authorize"),
      expectedEmail: "Scott@TheJarvie.com",
      callbackUrl: "http://localhost:8091/callback",
      timeoutMs: 120000,
    });

    expect(lines).toEqual([
      "Manual OAuth handoff:",
      "  1. Keep this terminal running; it is listening at http://localhost:8091/callback.",
      "  2. In the browser, sign in as scott@thejarvie.com.",
      "  3. Approve/continue the MovingManifest consent screen if Google or Clerk shows one.",
      "  4. Wait until the browser says MovingManifest OAuth connected, then return here.",
      "  5. This attempt times out after 2 minutes; rerun it if the browser gets stuck.",
      "  Authorization URL: https://clerk.movingmanifest.com/oauth/authorize",
    ]);
  });

  it("formats OAuth callback timeout guidance without leaking auth URLs", () => {
    expect(parsePositiveInteger("90000", 300000)).toBe(90000);
    expect(parsePositiveInteger("0", 300000)).toBe(300000);
    expect(formatDuration(300000)).toBe("5 minutes");
    expect(formatDuration(4500)).toBe("5 seconds");
    expect(oauthCallbackTimeoutMessage(300000, 8091)).toBe(
      "OAuth callback timed out after 5 minutes. Dismiss any browser extension popover, sign in as the expected account, then rerun this smoke. The local callback listener was http://localhost:8091/callback."
    );
  });

  it("returns a warning detail when the browser-open command is unavailable", async () => {
    const spawnFn = vi.fn(() => {
      throw new Error("not installed\nwith stack");
    });

    await expect(
      openBrowserUrl("https://movingmanifest.test/oauth", {
        platform: "linux",
        spawnFn: spawnFn as unknown as typeof import("node:child_process").spawn,
      })
    ).resolves.toEqual({
      ok: false,
      detail: "xdg-open failed: not installed",
    });
  });

  it("wraps fetch failures with the metadata label without dumping stacks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network exploded\nstack line that should not print");
      })
    );

    await expect(
      fetchForSmoke("https://movingmanifest.test/api/mcp", {}, "MCP endpoint")
    ).rejects.toThrow("MCP endpoint fetch failed: network exploded");
  });

  it("extracts and verifies the intended OAuth connection email", () => {
    const contextPayload = {
      data: {
        connection: {
          user: { email: "Scott@TheJarvie.com" },
        },
      },
    };

    expect(connectionEmailFromContext(contextPayload)).toBe("Scott@TheJarvie.com");
    expect(
      verifyExpectedConnectionEmail({
        contextPayload,
        expectedEmail: "scott@thejarvie.com",
      })
    ).toMatchObject({ ok: true, actualEmail: "scott@thejarvie.com" });
    expect(
      verifyExpectedConnectionEmail({
        contextPayload,
        expectedEmail: "jarvie@gmail.com",
      })
    ).toMatchObject({
      ok: false,
      detail: "expected jarvie@gmail.com, got scott@thejarvie.com",
    });
    expect(
      verifyExpectedConnectionEmail({
        contextPayload: { data: { connection: {} } },
        expectedEmail: "scott@thejarvie.com",
      })
    ).toMatchObject({
      ok: false,
      detail:
        "expected scott@thejarvie.com, but get_api_context did not return connection.user.email",
    });
  });

  it("recognizes an authenticated OAuth account that still needs a household", () => {
    expect(
      connectionNeedsHousehold({
        data: {
          connection: { status: "needs_household" },
          onboarding: { status: "needs_household" },
        },
      })
    ).toBe(true);
    expect(
      connectionNeedsHousehold({
        data: {
          connection: {
            type: "oauth",
            householdMember: { status: "active" },
          },
        },
      })
    ).toBe(false);
  });

  it("validates the trusted-helper OAuth tool surface", () => {
    expect(trustedHelperRequiredTools).toBe(
      MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS
    );
    expect(trustedHelperRequiredTools).toEqual(
      expect.arrayContaining([
        "agent_workbench",
        "get_api_context",
        "save_box_intake",
        "append_item_note",
        "upload_photo",
        "upload_photos",
        "ingestion_queue",
        "apply_assignments",
      ])
    );

    const validToolNames = [
      ...trustedHelperRequiredTools,
    ];

    expect(trustedHelperToolsetResults(validToolNames)).toEqual({
      ok: true,
      missingRequired: [],
      exposedForbidden: [],
    });

    expect(
      trustedHelperToolsetResults([
        ...trustedHelperRequiredTools.filter((name) => name !== "upload_photo"),
        trustedHelperForbiddenTools[0],
        "delete_item",
      ])
    ).toEqual({
      ok: false,
      missingRequired: ["upload_photo"],
      exposedForbidden: ["add_household_member", "delete_item"],
    });
  });

  it("builds a secret-free authorized OAuth proof payload", () => {
    const proof = oauthSmokeProofPayload({
      endpointUrl: "https://movingmanifest.com/api/mcp",
      toolCount: 42,
      contextChecked: true,
      connectionEmail: "Scott@TheJarvie.com",
      expectedConnectionEmail: "SCOTT@THEJARVIE.COM",
      connectionEmailVerified: true,
      trustedHelperToolsetVerified: true,
      boxIntakeSmoke: true,
      writeSmoke: true,
      revokeSmoke: false,
      createdAt: new Date("2026-06-15T13:30:00.000Z"),
    });

    expect(proof).toEqual({
      schema: "movingmanifest.mcp-oauth-smoke-proof.v1",
      createdAt: "2026-06-15T13:30:00.000Z",
      endpoint: "https://movingmanifest.com/api/mcp",
      authorized: true,
      checks: {
        tokenExchange: true,
        mcpConnected: true,
        toolsListed: true,
        contextChecked: true,
        connectionEmailVerified: true,
        trustedHelperToolsetVerified: true,
        boxIntakeSmoke: true,
        writeSmoke: true,
        revokeSmoke: false,
      },
      connectionEmail: "scott@thejarvie.com",
      expectedConnectionEmail: "scott@thejarvie.com",
    });
    expect(JSON.stringify(proof)).not.toMatch(
      /access_token|refresh_token|secret|mmk_/i
    );
  });

  it("keeps actual and expected account emails in failed diagnostic proof payloads", () => {
    expect(
      oauthSmokeProofPayload({
        endpointUrl: "https://movingmanifest.com/api/mcp",
        toolCount: 42,
        contextChecked: true,
        connectionEmail: "jarvie@gmail.com",
        expectedConnectionEmail: "scott@thejarvie.com",
        connectionEmailVerified: false,
        trustedHelperToolsetVerified: false,
        boxIntakeSmoke: false,
        writeSmoke: false,
        revokeSmoke: false,
        createdAt: new Date("2026-06-15T13:30:00.000Z"),
      })
    ).toMatchObject({
      authorized: true,
      checks: {
        connectionEmailVerified: false,
        trustedHelperToolsetVerified: false,
        boxIntakeSmoke: false,
        writeSmoke: false,
      },
      connectionEmail: "jarvie@gmail.com",
      expectedConnectionEmail: "scott@thejarvie.com",
    });
  });

  it("flags the exact stale MCP auth regression seen by hosted agents", () => {
    expect(
      invalidBearerBoundaryResult({
        status: 401,
        authenticate:
          'Bearer realm="MovingManifest MCP", error="invalid_token", error_description="OAuth access token is invalid"',
        text: '{"error":{"code":"invalid_token"}}',
      })
    ).toEqual({ ok: true });

    expect(
      invalidBearerBoundaryResult({
        status: 200,
        authenticate: null,
        text: "Invalid API key format.",
      })
    ).toMatchObject({
      ok: false,
      detail: expect.stringContaining("HTTP 200"),
    });

    expect(
      invalidBearerBoundaryResult({
        status: 401,
        authenticate: null,
        text: "Invalid API key format.",
      })
    ).toMatchObject({
      ok: false,
      detail: expect.stringContaining("API-key validation"),
    });
  });
});

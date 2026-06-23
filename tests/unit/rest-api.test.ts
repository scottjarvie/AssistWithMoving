import { describe, expect, it } from "vitest";

import {
  bearerToken,
  bodyRecord,
  moveIdFromRestBodyOrQuery,
  moveIdFromRestRequest,
  oauthNeedsHouseholdContextPayload,
  isLooseMovableUnitRestItem,
  paginate,
  parseRestPath,
  restMeContextPayload,
  restBoxCreateFields,
  restBoxPatch,
  restMovableUnitSummary,
  restAgentAttributionFields,
  restPrivateItemNoteAppendPatch,
  restResponseErrorSummary,
  restMovableUnitLooseItemFailureRows,
  mergeRestItemResearchSources,
  normalizeRestBoxCode,
  requestHashInput,
  requiredScopesForRestRoute,
  restError,
  restOk,
  restRateLimitHeaders,
  restRateLimitResult,
  restRateLimitWindowStart,
  restRateLimited,
  RestApiError,
  restErrorFromUnknown,
  safeRestBox,
  withRestRateLimitHeaders,
} from "../../convex/lib/restApi";

describe("REST API helpers", () => {
  it("parses bearer tokens", () => {
    expect(bearerToken("Bearer mmk_prefix_secret")).toBe("mmk_prefix_secret");
    expect(bearerToken("bearer key")).toBe("key");
    expect(bearerToken("Basic key")).toBe(null);
    expect(bearerToken(undefined)).toBe(null);
  });

  it("parses route segments and scopes", () => {
    expect(parseRestPath("/moves/move1/items/")).toEqual([
      "moves",
      "move1",
      "items",
    ]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["me"],
      }),
    ).toEqual(["moves/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["households", "household1", "members"],
      }),
    ).toEqual(["members/manage"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["households", "household1", "members"],
      }),
    ).toEqual(["members/manage"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "items"],
      }),
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves"],
      }),
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "setup"],
      }),
    ).toEqual(["moves/read", "moves/write", "inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "items"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "items", "batch-upsert"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "items", "item1", "notes"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "box-items"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "movable-units", "batch-upsert"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["moves", "move1", "box-items"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "planned-items"],
      }),
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "planned-items"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "PATCH",
        segments: ["moves", "move1", "planned-items", "planned1"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "planned-items", "planned1", "convert"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["moves", "move1", "planned-items", "planned1"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "PATCH",
        segments: ["items", "item1"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["items", "item1"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "PATCH",
        segments: ["boxes", "box1"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["boxes", "box1", "items"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["boxes", "box1", "items", "item1"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["photos", "photo1", "attach"],
      }),
    ).toEqual(["photos/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["plans"],
      }),
    ).toEqual(["plans/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["plans"],
      }),
    ).toEqual(["plans/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["plans", "plan1", "summary"],
      }),
    ).toEqual(["plans/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["plans", "plan1", "snapshot.svg"],
      }),
    ).toEqual(["plans/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["plans", "plan1", "proposals"],
      }),
    ).toEqual(["plans/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["plans", "plan1", "ops"],
      }),
    ).toEqual(["plans/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["plans", "plan1", "proposals"],
      }),
    ).toEqual(["plans/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves"],
      }),
    ).toEqual(["moves/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "summary"],
      }),
    ).toEqual(["moves/read", "inventory/read", "exports/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "questions"],
      }),
    ).toEqual(["moves/read", "inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "move-day"],
      }),
    ).toEqual(["moves/read", "inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "capacity-report"],
      }),
    ).toEqual(["moves/read", "inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "agent-context"],
      }),
    ).toEqual(["moves/read", "inventory/read", "plans/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "ingestion-queue"],
      }),
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ingestion-queue"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "spaces"],
      }),
    ).toEqual(["moves/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "spaces"],
      }),
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "sale-listings"],
      }),
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "sale-listings"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "resources"],
      }),
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "PATCH",
        segments: ["moves", "move1", "resources", "resource1"],
      }),
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "people"],
      }),
    ).toEqual(["moves/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "people"],
      }),
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "PATCH",
        segments: ["moves", "move1", "people", "person1"],
      }),
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["moves", "move1", "people", "person1"],
      }),
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "zones"],
      }),
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "resources", "resource1", "zones"],
      }),
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "assignments", "suggest"],
      }),
    ).toEqual(["moves/read", "inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "assignments", "apply"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "planning-suggestions"],
      }),
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "ai-jobs"],
      }),
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "ai-text-suggestions"],
      }),
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "ai-photo-suggestions"],
      }),
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ai-text-suggestions", "generate"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ai-text-suggestions", "approve"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ai-text-suggestions", "reject"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ai-photo-suggestions", "generate"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ai-photo-suggestions", "approve"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ai-photo-suggestions", "reject"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "planning-suggestions", "generate"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "planning-suggestions", "approve"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "planning-suggestions", "reject"],
      }),
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["uploads", "init"],
      }),
    ).toEqual(["photos/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["photos", "upload"],
      }),
    ).toEqual(["photos/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["images", "upload"],
      }),
    ).toEqual(["photos/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["photos", "finalize"],
      }),
    ).toEqual(["photos/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "exports"],
      }),
    ).toEqual(["exports/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "exports"],
      }),
    ).toEqual(["exports/create"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "documentation-profiles"],
      }),
    ).toEqual(["exports/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "documentation-profiles"],
      }),
    ).toEqual(["exports/create"]);
    expect(
      requiredScopesForRestRoute({
        method: "PATCH",
        segments: ["moves", "move1", "documentation-profiles", "profile1"],
      }),
    ).toEqual(["exports/create"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["moves", "move1", "documentation-profiles", "profile1"],
      }),
    ).toEqual(["exports/create"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "share-links"],
      }),
    ).toEqual(["exports/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "share-links", "comments"],
      }),
    ).toEqual(["exports/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "share-links", "share1", "comments"],
      }),
    ).toEqual(["exports/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "share-links"],
      }),
    ).toEqual(["exports/create"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["moves", "move1", "share-links", "share1"],
      }),
    ).toEqual(["exports/create"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["exports", "export1"],
      }),
    ).toEqual(["exports/read"]);
  });

  it("builds OAuth no-household onboarding context without granting access", () => {
    expect(
      oauthNeedsHouseholdContextPayload({
        userId: "user_oauth_1",
        email: "Scott@TheJarvie.com",
        name: "Scott Jarvie",
        setupUrl: "https://movingmanifest.test/app/dashboard#household-setup",
        generatedAt: 1234,
      }),
    ).toEqual({
      data: {
        household: null,
        apiKey: null,
        connection: {
          type: "oauth",
          status: "needs_household",
          connectionId: null,
          scopes: [],
          moveRestricted: false,
          moveId: null,
          createdByUserId: "user_oauth_1",
          user: {
            userId: "user_oauth_1",
            email: "Scott@TheJarvie.com",
            name: "Scott Jarvie",
          },
          householdMember: null,
        },
        restrictedMove: null,
        onboarding: {
          status: "needs_household",
          setupUrl: "https://movingmanifest.test/app/dashboard#household-setup",
          message:
            "OAuth sign-in succeeded, but this account is not an active member of a MovingManifest household yet.",
          nextSteps: [
            "Open MovingManifest and create a household for this account.",
            "Or ask an existing household owner to invite this email with API access enabled.",
            "After the household exists, reconnect or retry the MCP tool call.",
          ],
        },
        generatedAt: 1234,
      },
    });
  });

  it("builds active OAuth /me context with the connection user email", () => {
    expect(
      restMeContextPayload({
        household: {
          householdId: "household1",
          name: "Scott Jarvie Household",
          slug: "scott-jarvie-household",
        },
        apiKeyId: "oauth_connection_1",
        connectionType: "oauth",
        scopes: ["moves/read", "inventory/read"],
        createdByUserId: "user_scott",
        user: {
          userId: "user_scott",
          email: "scott@thejarvie.com",
          name: "Scott Jarvie",
        },
        householdMember: {
          membershipId: "membership1",
          role: "owner",
          status: "active",
          apiAccessStatus: "enabled",
          apiAccessAllowed: true,
        },
        restrictedMove: null,
        generatedAt: 4321,
      }),
    ).toEqual({
      data: {
        household: {
          householdId: "household1",
          name: "Scott Jarvie Household",
          slug: "scott-jarvie-household",
        },
        apiKey: {
          apiKeyId: "oauth_connection_1",
          scopes: ["moves/read", "inventory/read"],
          moveRestricted: false,
          moveId: undefined,
          createdByUserId: "user_scott",
          user: {
            userId: "user_scott",
            email: "scott@thejarvie.com",
            name: "Scott Jarvie",
          },
          householdMember: {
            membershipId: "membership1",
            role: "owner",
            status: "active",
            apiAccessStatus: "enabled",
            apiAccessAllowed: true,
          },
        },
        connection: {
          type: "oauth",
          connectionId: "oauth_connection_1",
          scopes: ["moves/read", "inventory/read"],
          moveRestricted: false,
          moveId: undefined,
          createdByUserId: "user_scott",
          user: {
            userId: "user_scott",
            email: "scott@thejarvie.com",
            name: "Scott Jarvie",
          },
          householdMember: {
            membershipId: "membership1",
            role: "owner",
            status: "active",
            apiAccessStatus: "enabled",
            apiAccessAllowed: true,
          },
        },
        restrictedMove: null,
        generatedAt: 4321,
      },
    });
  });

  it("derives move context for move-restricted top-level routes", () => {
    expect(
      moveIdFromRestRequest({
        segments: ["moves", "move1", "items"],
        body: { moveId: "ignored" },
        query: { moveId: "also-ignored" },
      }),
    ).toBe("move1");

    expect(
      moveIdFromRestRequest({
        segments: ["moves"],
        body: { moveId: "ignored" },
        query: { moveId: "also-ignored" },
      }),
    ).toBeUndefined();

    expect(
      moveIdFromRestRequest({
        segments: ["moves", "setup"],
        body: { moveId: "move-from-setup" },
        query: {},
      }),
    ).toBe("move-from-setup");

    expect(
      moveIdFromRestRequest({
        segments: ["moves", "setup"],
        body: { title: "New move setup" },
        query: {},
      }),
    ).toBeUndefined();

    expect(
      moveIdFromRestRequest({
        segments: ["items", "item1"],
        body: { moveId: "move-from-body" },
        query: {},
      }),
    ).toBe("move-from-body");

    expect(
      moveIdFromRestRequest({
        segments: ["boxes", "box1", "items", "item1"],
        body: {},
        query: { moveId: "move-from-query" },
      }),
    ).toBe("move-from-query");

    expect(
      moveIdFromRestRequest({
        segments: ["photos", "photo1", "attach"],
        body: { moveId: "photo-move" },
        query: {},
      }),
    ).toBe("photo-move");

    expect(
      moveIdFromRestRequest({
        segments: ["plans", "plan1"],
        body: {},
        query: { moveId: "plan-move" },
      }),
    ).toBe("plan-move");
  });

  it("keeps body/query move context parsing safe for non-object bodies", () => {
    expect(
      moveIdFromRestBodyOrQuery({
        body: ["move1"],
        query: { moveId: "move-from-query" },
      }),
    ).toBe("move-from-query");
    expect(bodyRecord(null)).toEqual({});
    expect(bodyRecord(["not", "a", "record"])).toEqual({});
    expect(bodyRecord({ moveId: "move1" })).toEqual({ moveId: "move1" });
  });

  it("shapes REST box create payloads with dimensions", () => {
    expect(normalizeRestBoxCode(" b 012 ")).toBe("B-012");

    expect(
      restBoxCreateFields({
        auth: {
          householdId: "household1",
          createdByUserId: "user1",
          apiKeyName: "Claude import",
        },
        moveId: "move1",
        now: 1234,
        body: {
          code: " office 1 ",
          label: "Office books",
          containerType: "plasticTote",
          room: "Office",
          destinationRoom: "New house office",
          destinationSpaceId: "space-office",
          dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
          estimatedWeightLb: 30,
          assignedResourceId: "resource1",
          assignedZoneId: "zone1",
          assignmentOverrideReason: "Rough list load hint.",
        },
      }),
    ).toMatchObject({
      householdId: "household1",
      moveId: "move1",
      code: "OFFICE-1",
      label: "Office books",
      containerType: "plasticTote",
      room: "Office",
      destinationRoom: "New house office",
      destinationSpaceId: "space-office",
      status: "open",
      agentLabel: "Claude import",
      dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
      estimatedWeightLb: 30,
      assignedResourceId: "resource1",
      assignedZoneId: "zone1",
      assignmentOverrideReason: "Rough list load hint.",
      assignmentWarnings: [],
      assignmentHardBlocks: [],
      assignmentValidatedAt: 1234,
      createdByUserId: "user1",
      createdAt: 1234,
      updatedAt: 1234,
    });
  });

  it("rejects explicit REST box codes that normalize to empty", () => {
    expect(() =>
      restBoxCreateFields({
        auth: { householdId: "household1" },
        moveId: "move1",
        now: 1234,
        body: { code: "***" },
      }),
    ).toThrow("Box code must include letters or numbers.");
    expect(() => restBoxPatch({ code: "***" })).toThrow(
      "Box code must include letters or numbers.",
    );
    expect(() => restBoxPatch({ containerType: "paperBag" })).toThrow(
      "Unsupported containerType.",
    );
  });

  it("shapes REST box patch and readback payloads with dimensions", () => {
    expect(
      restBoxPatch(
        {
          status: "sealed",
          containerType: "carton",
          destinationSpaceId: "space-study",
          dimensionsIn: { lengthIn: 20, widthIn: 14 },
          actualWeightLb: 42,
          assignedResourceId: "truck1",
          assignedZoneId: "front",
          assignmentOverrideReason: "Owner confirmed.",
        },
        5678,
      ),
    ).toEqual({
      updatedAt: 5678,
      status: "sealed",
      containerType: "carton",
      destinationSpaceId: "space-study",
      dimensionsIn: { lengthIn: 20, widthIn: 14 },
      actualWeightLb: 42,
      assignedResourceId: "truck1",
      assignedZoneId: "front",
      assignmentOverrideReason: "Owner confirmed.",
      assignmentWarnings: [],
      assignmentHardBlocks: [],
      assignmentValidatedAt: 5678,
    });

    expect(
      safeRestBox({
        _id: "box1",
        code: "B-001",
        label: "Books",
        containerType: "carton",
        room: "Office",
        destinationRoom: "Study",
        destinationSpaceId: "space-study",
        status: "sealed",
        dimensionsIn: { lengthIn: 20, widthIn: 14 },
        estimatedWeightLb: 30,
        actualWeightLb: 42,
        estimatedVolumeCuFt: 3.2,
        createdAt: 111,
        updatedAt: 222,
      }),
    ).toMatchObject({
      boxId: "box1",
      code: "B-001",
      label: "Books",
      containerType: "carton",
      destinationSpaceId: "space-study",
      destinationSpaceName: "Study",
      dimensionsIn: { lengthIn: 20, widthIn: 14 },
      actualWeightLb: 42,
    });
  });

  it("summarizes REST movable units for agent context", () => {
    const summary = restMovableUnitSummary({
      boxes: [
        {
          _id: "box1",
          code: "B-001",
          label: "Books",
          room: "Office",
          estimatedWeightLb: 40,
          dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
          assignedResourceId: "truck1",
        },
        {
          _id: "box2",
          code: "B-002",
          label: "Garage tools",
          room: "Garage",
        },
        {
          _id: "box3",
          code: "B-003",
          archivedAt: 1,
          estimatedWeightLb: 999,
        },
      ],
      items: [
        {
          _id: "item1",
          name: "Tool chest",
          category: "tools",
          status: "packed",
          estimatedWeightLb: 30,
        },
        {
          _id: "item2",
          name: "Treadmill",
          status: "active",
          actualWeightLb: 220,
          estimatedVolumeCuFt: 28,
          dimensionsIn: { lengthIn: 72, widthIn: 34, heightIn: 58 },
          assignedZoneId: "zone1",
        },
        {
          _id: "item3",
          name: "Shovel",
          room: "Garage",
          status: "active",
          requiresPersonalTransport: true,
        },
        {
          _id: "item4",
          name: "Archived lamp",
          status: "archived",
          actualWeightLb: 12,
        },
        {
          _id: "item5",
          name: "Deleted tote",
          deletedAt: 1,
          actualWeightLb: 12,
        },
        {
          _id: "item6",
          name: "Loose drill bits",
          category: "Tools",
          status: "active",
          actualWeightLb: 2,
        },
        {
          _id: "item7",
          name: "Tagged moving sculpture",
          room: "Studio",
          status: "active",
          aiTags: ["movable-unit"],
        },
      ],
      boxItems: [
        {
          boxId: "box2",
          itemId: "item1",
          quantity: 2,
        },
        {
          boxId: "box3",
          itemId: "item2",
          quantity: 1,
        },
      ],
    });

    expect(summary).toMatchObject({
      total: 5,
      boxes: 2,
      looseItems: 3,
      knownWeightLb: 320,
      knownVolumeCuFt: 29.5,
      missingWeight: 2,
      missingDimensions: 3,
      missingVolume: 3,
      assigned: 3,
      unassigned: 2,
      measurementRoute: [
        {
          roomLabel: "Garage",
          unitCount: 2,
          missingWeight: 1,
          missingDimensions: 2,
          missingVolume: 2,
          unassigned: 1,
          exampleNames: ["Garage tools", "Shovel"],
          gapExamples: [
            {
              kind: "box",
              boxId: "box2",
              code: "B-002",
              name: "Garage tools",
              missingFields: ["dimensions", "volume"],
              measurementPatchHint: {
                tool: "batch_upsert_movable_units",
                target: {
                  kind: "box",
                  boxId: "box2",
                  code: "B-002",
                },
                fieldsToUpdate: ["dimensions", "volume"],
              },
            },
            {
              kind: "looseItem",
              itemId: "item3",
              name: "Shovel",
              missingFields: ["weight", "dimensions", "volume"],
              measurementPatchHint: {
                tool: "batch_upsert_movable_units",
                target: {
                  kind: "looseItem",
                  itemId: "item3",
                },
                fieldsToUpdate: ["weight", "dimensions", "volume"],
              },
            },
          ],
          assignmentExamples: [
            {
              kind: "box",
              boxId: "box2",
              code: "B-002",
              name: "Garage tools",
              assignmentPatchHint: {
                tool: "apply_assignments",
                target: {
                  kind: "box",
                  boxId: "box2",
                },
              },
            },
          ],
        },
        {
          roomLabel: "Studio",
          unitCount: 1,
          missingWeight: 1,
          missingDimensions: 1,
          missingVolume: 1,
          unassigned: 1,
          exampleNames: ["Tagged moving sculpture"],
        },
      ],
      assignmentExamples: [
        {
          kind: "box",
          boxId: "box2",
          code: "B-002",
          name: "Garage tools",
          assignmentPatchHint: {
            tool: "apply_assignments",
            target: {
              kind: "box",
              boxId: "box2",
            },
          },
        },
        {
          kind: "looseItem",
          itemId: "item7",
          name: "Tagged moving sculpture",
          assignmentPatchHint: {
            tool: "apply_assignments",
            target: {
              kind: "looseItem",
              itemId: "item7",
            },
          },
        },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain("Loose drill bits");
    expect(summary.gapExamples).toEqual([
      {
        kind: "box",
        boxId: "box2",
        code: "B-002",
        name: "Garage tools",
        missingFields: ["dimensions", "volume"],
        measurementPatchHint: {
          tool: "batch_upsert_movable_units",
          target: {
            kind: "box",
            boxId: "box2",
            code: "B-002",
          },
          fieldsToUpdate: ["dimensions", "volume"],
        },
      },
      {
        kind: "looseItem",
        itemId: "item3",
        name: "Shovel",
        missingFields: ["weight", "dimensions", "volume"],
        measurementPatchHint: {
          tool: "batch_upsert_movable_units",
          target: {
            kind: "looseItem",
            itemId: "item3",
          },
          fieldsToUpdate: ["weight", "dimensions", "volume"],
        },
      },
      {
        kind: "looseItem",
        itemId: "item7",
        name: "Tagged moving sculpture",
        missingFields: ["weight", "dimensions", "volume"],
        measurementPatchHint: {
          tool: "batch_upsert_movable_units",
          target: {
            kind: "looseItem",
            itemId: "item7",
          },
          fieldsToUpdate: ["weight", "dimensions", "volume"],
        },
      },
    ]);
  });

  it("keeps ordinary unboxed items out of loose movable-unit reports", () => {
    expect(
      isLooseMovableUnitRestItem({
        _id: "item_drill_bits",
        name: "Loose drill bits",
        category: "Tools",
        status: "active",
        estimatedWeightLb: 2,
      }),
    ).toBe(false);

    expect(
      isLooseMovableUnitRestItem({
        _id: "item_treadmill",
        name: "Treadmill",
        status: "active",
        estimatedWeightLb: 220,
      }),
    ).toBe(true);

    expect(
      isLooseMovableUnitRestItem({
        _id: "item_owner_bag",
        name: "Camera backpack",
        status: "active",
        disposition: "personalTransport",
      }),
    ).toBe(true);

    expect(
      isLooseMovableUnitRestItem({
        _id: "item_tagged",
        name: "Odd-shaped sculpture",
        status: "active",
        aiTags: ["movable-unit"],
      }),
    ).toBe(true);
  });

  it("normalizes agent attribution fields for REST writes", () => {
    expect(
      restAgentAttributionFields(
        { agentLabel: "  Claude room pass  ", aiConfidenceScore: 0.62 },
        { apiKeyName: "Fallback key" },
        { defaultLabel: true },
      ),
    ).toEqual({
      agentLabel: "Claude room pass",
      aiConfidenceScore: 0.62,
    });

    expect(
      restAgentAttributionFields(
        {},
        { apiKeyName: "Kitchen helper" },
        {
          defaultLabel: true,
        },
      ),
    ).toEqual({
      agentLabel: "Kitchen helper",
      aiConfidenceScore: undefined,
    });

    expect(() =>
      restAgentAttributionFields({ aiConfidenceScore: 1.5 }),
    ).toThrow("aiConfidenceScore must be a number from 0 to 1.");
  });

  it("builds append-only private item note patches without replacing existing notes", () => {
    const result = restPrivateItemNoteAppendPatch({
      body: {
        note: "  Glass top needs blanket wrap.  ",
        label: "  Codex intake  ",
      },
      auth: {
        apiKeyName: "Fallback key",
        createdByUserId: "user1",
      },
      item: {
        privateNotes: "Existing owner note.",
      },
      now: Date.parse("2026-06-17T18:45:00.000Z"),
    });

    expect(result).toEqual({
      patch: {
        privateNotes:
          "Existing owner note.\n[2026-06-17T18:45:00.000Z] Codex intake: Glass top needs blanket wrap.",
        updatedByUserId: "user1",
        updatedAt: 1781721900000,
      },
      noteLength: 29,
    });

    const longExistingNotes = "x".repeat(2500);
    const longResult = restPrivateItemNoteAppendPatch({
      body: { note: "New short note." },
      auth: { apiKeyName: "Fallback key" },
      item: { privateNotes: longExistingNotes },
      now: Date.parse("2026-06-17T18:46:00.000Z"),
    });

    expect(longResult.patch.privateNotes).toBe(
      `${longExistingNotes}\n[2026-06-17T18:46:00.000Z] Fallback key: New short note.`,
    );
  });

  it("validates append-only private item note inputs", () => {
    expect(() =>
      restPrivateItemNoteAppendPatch({
        body: { note: "   " },
        auth: { apiKeyName: "Fallback key" },
        item: {},
        now: 1,
      }),
    ).toThrow("note is required.");

    expect(() =>
      restPrivateItemNoteAppendPatch({
        body: { privateNote: "x".repeat(4001) },
        auth: { apiKeyName: "Fallback key" },
        item: {},
        now: 1,
      }),
    ).toThrow("note is limited to 4,000 characters.");

    expect(() =>
      restPrivateItemNoteAppendPatch({
        body: { text: "too much" },
        auth: { apiKeyName: "Fallback key" },
        item: { privateNotes: "x".repeat(19_990) },
        now: 1,
      }),
    ).toThrow(
      "Appending this note would exceed the 20,000 character item private note limit.",
    );
  });

  it("merges item research sources without dropping existing provenance", () => {
    const existingSources = [
      {
        title: "Old manual",
        url: "https://example.com/manual",
        status: "checked",
        summary: "Original source note.",
      },
      {
        title: "Existing source",
        url: "https://example.com/existing",
        status: "used",
      },
    ];
    const incomingSources = [
      {
        title: "Updated manual",
        url: "https://example.com/manual",
        status: "used",
        summary: "Better source note.",
      },
      {
        title: "New source",
        url: "https://example.com/new",
        status: "checked",
      },
    ];

    expect(
      mergeRestItemResearchSources(existingSources, incomingSources),
    ).toEqual([
      {
        title: "Updated manual",
        url: "https://example.com/manual",
        status: "used",
        summary: "Better source note.",
      },
      {
        title: "Existing source",
        url: "https://example.com/existing",
        status: "used",
      },
      {
        title: "New source",
        url: "https://example.com/new",
        status: "checked",
      },
    ]);

    expect(
      mergeRestItemResearchSources(
        Array.from({ length: 30 }, (_, index) => ({
          url: `https://example.com/${index}`,
        })),
        [{ url: "https://example.com/new-over-limit" }],
      ),
    ).toHaveLength(25);
  });

  it("paginates with cursor and limit", () => {
    expect(paginate([1, 2, 3, 4], { limit: "2" })).toEqual({
      data: [1, 2],
      page: { limit: 2, offset: 0, nextCursor: "2", nextOffset: "2", total: 4 },
    });
    expect(paginate([1, 2, 3, 4], { limit: "2", cursor: "2" })).toEqual({
      data: [3, 4],
      page: {
        limit: 2,
        offset: 2,
        nextCursor: null,
        nextOffset: null,
        total: 4,
      },
    });
    expect(paginate([1, 2, 3, 4], { limit: "2", offset: "2" })).toEqual({
      data: [3, 4],
      page: {
        limit: 2,
        offset: 2,
        nextCursor: null,
        nextOffset: null,
        total: 4,
      },
    });
  });

  it("uses stable request hash input for idempotency", () => {
    expect(
      requestHashInput({
        method: "POST",
        path: "moves/move1/items",
        body: { b: 2, a: 1 },
      }),
    ).toBe(
      requestHashInput({
        method: "POST",
        path: "moves/move1/items",
        body: { a: 1, b: 2 },
      }),
    );
  });

  it("returns consistent error shapes", () => {
    expect(
      restError({ status: 403, code: "forbidden", message: "No scope." }),
    ).toEqual({
      status: 403,
      body: {
        error: {
          code: "forbidden",
          message: "No scope.",
        },
      },
    });
  });

  it("wraps REST validation exceptions as structured agent-readable errors", () => {
    expect(
      restErrorFromUnknown(
        new RestApiError({
          status: 400,
          code: "validation_error",
          message: "Box count must be an integer from 1 to 100.",
          fields: [
            {
              path: "units.0.count",
              message: "Use count only for code-less rough box rows.",
            },
          ],
        }),
      ),
    ).toEqual({
      status: 400,
      body: {
        error: {
          code: "validation_error",
          message: "Box count must be an integer from 1 to 100.",
          fields: [
            {
              path: "units.0.count",
              message: "Use count only for code-less rough box rows.",
            },
          ],
        },
      },
    });
  });

  it("summarizes nested REST errors without losing status or fields", () => {
    const response = restError({
      status: 400,
      code: "validation_error",
      message: "items.0.name is required.",
      fields: [{ path: "items.0.name", message: "name is required." }],
    });

    expect(restResponseErrorSummary(response)).toEqual({
      status: 400,
      code: "validation_error",
      message: "items.0.name is required.",
      fields: [{ path: "items.0.name", message: "name is required." }],
    });
    expect(restResponseErrorSummary(restOk({ data: true }))).toBe(null);
    expect(
      restResponseErrorSummary(
        { status: 502, body: { unexpected: true } },
        "Loose movable-unit item batch failed.",
      ),
    ).toEqual({
      status: 502,
      code: undefined,
      message: "Loose movable-unit item batch failed. HTTP 502.",
      fields: undefined,
    });
  });

  it("maps nested item-batch failures back to rough movable-unit loose rows", () => {
    const error = restResponseErrorSummary(
      restError({
        status: 400,
        code: "validation_error",
        message: "items.0.externalId is required.",
      }),
    );

    expect(
      restMovableUnitLooseItemFailureRows({
        error,
        units: [
          {
            unitIndex: 2,
            unit: {
              kind: "looseItem",
              externalSource: "agent-rough-list",
              externalId: "garage-treadmill",
              name: "Treadmill",
            },
          },
          {
            unitIndex: 4,
            unit: {
              kind: "looseItem",
              itemId: "item_planer",
              name: "Planer",
            },
          },
        ],
      }),
    ).toEqual([
      {
        unitIndex: 2,
        itemIndex: 0,
        ok: false,
        action: "upsert",
        name: "Treadmill",
        externalSource: "agent-rough-list",
        externalId: "garage-treadmill",
        error: "items.0.externalId is required.",
        errorCode: "validation_error",
        errorStatus: 400,
      },
      {
        unitIndex: 4,
        itemIndex: 1,
        ok: false,
        action: "update",
        itemId: "item_planer",
        name: "Planer",
        error: "items.0.externalId is required.",
        errorCode: "validation_error",
        errorStatus: 400,
      },
    ]);
    expect(
      restMovableUnitLooseItemFailureRows({ error: null, units: [] }),
    ).toBe(null);
  });

  it("builds API rate-limit windows and headers", () => {
    const windowStart = restRateLimitWindowStart(301_000, 300_000);

    expect(windowStart).toBe(300_000);

    const allowed = restRateLimitResult({
      count: 2,
      now: 301_000,
      limit: 3,
      windowStart,
      windowMs: 300_000,
    });

    expect(allowed).toEqual({
      allowed: true,
      limit: 3,
      remaining: 1,
      resetAt: 600_000,
      retryAfterSeconds: 299,
    });
    expect(restRateLimitHeaders(allowed)).toEqual({
      "X-RateLimit-Limit": "3",
      "X-RateLimit-Remaining": "1",
      "X-RateLimit-Reset": "600",
    });
    expect(withRestRateLimitHeaders(restOk({ ok: true }), allowed)).toEqual({
      status: 200,
      body: { ok: true },
      headers: {
        "X-RateLimit-Limit": "3",
        "X-RateLimit-Remaining": "1",
        "X-RateLimit-Reset": "600",
      },
    });

    const limited = restRateLimitResult({
      count: 4,
      now: 301_000,
      limit: 3,
      windowStart,
      windowMs: 300_000,
    });

    expect(limited.allowed).toBe(false);
    expect(restRateLimited(limited)).toEqual({
      status: 429,
      body: {
        error: {
          code: "rate_limited",
          message: "API rate limit exceeded. Retry after 299 seconds.",
        },
      },
      headers: {
        "X-RateLimit-Limit": "3",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "600",
        "Retry-After": "299",
      },
    });
  });
});

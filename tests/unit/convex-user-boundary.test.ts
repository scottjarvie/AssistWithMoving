import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { AuthorizationError } from "../../convex/lib/auth";
import {
  directConvexUserContextRequiredMessage,
  requireSignedInUserActor,
  type ApiKeyActor,
  type UserActor,
} from "../../convex/lib/permissions";

describe("direct Convex user boundary", () => {
  it("returns signed-in user actors unchanged", () => {
    const actor: UserActor = {
      type: "user",
      userId: "user1" as Id<"users">,
      clerkUserId: "clerk-user",
      appRole: "member",
    };

    expect(requireSignedInUserActor(actor)).toBe(actor);
  });

  it("tells API-key callers to use the REST automation boundary", () => {
    const actor: ApiKeyActor = {
      type: "apiKey",
      apiKeyId: "key1",
      scopes: ["inventory/read"],
    };

    expect(() => requireSignedInUserActor(actor)).toThrow(AuthorizationError);
    expect(() => requireSignedInUserActor(actor)).toThrow(
      directConvexUserContextRequiredMessage,
    );
  });

  it("does not leave API-key not-implemented wording in runtime Convex code", () => {
    const files = runtimeConvexFiles(path.join(process.cwd(), "convex"));
    const offenders = files.filter((file) =>
      /API-key .*not implemented yet/.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});

function runtimeConvexFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const file = path.join(directory, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      return entry === "_generated" ? [] : runtimeConvexFiles(file);
    }
    return file.endsWith(".ts") ? [file] : [];
  });
}

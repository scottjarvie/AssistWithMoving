import { anyApi, httpRouter } from "convex/server";
import type { FunctionReference } from "convex/server";

import { httpAction } from "./_generated/server";
import {
  ClerkWebhookPayloadError,
  normalizeClerkOrganization,
  normalizeClerkOrganizationFromMembership,
  normalizeClerkOrganizationMembership,
  normalizeClerkPublicUserFromMembership,
  normalizeClerkUser,
  verifyClerkWebhookRequest,
} from "./lib/clerk";

const http = httpRouter();

const internalMutations = anyApi as unknown as {
  audit: {
    record: FunctionReference<
      "mutation",
      "internal",
      {
        actorType: "system";
        category: "auth";
        action: string;
        objectTable?: string;
        objectId?: string;
        metadata?: Record<string, unknown>;
      },
      unknown
    >;
  };
  clerkUsers: {
    upsertFromWebhook: FunctionReference<
      "mutation",
      "internal",
      ReturnType<typeof normalizeClerkUser>
    >;
    disableFromWebhook: FunctionReference<
      "mutation",
      "internal",
      { clerkUserId: string }
    >;
    upsertOrganizationFromWebhook: FunctionReference<
      "mutation",
      "internal",
      ReturnType<typeof normalizeClerkOrganization>
    >;
    disableOrganizationFromWebhook: FunctionReference<
      "mutation",
      "internal",
      { clerkOrganizationId: string }
    >;
    upsertOrganizationMembershipFromWebhook: FunctionReference<
      "mutation",
      "internal",
      ReturnType<typeof normalizeClerkOrganizationMembership>
    >;
    disableOrganizationMembershipFromWebhook: FunctionReference<
      "mutation",
      "internal",
      { clerkOrganizationMembershipId: string }
    >;
  };
};

const internalActions = anyApi as unknown as {
  restApiActions: {
    handle: FunctionReference<
      "action",
      "internal",
      {
        method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
        path: string;
        query: Record<string, string>;
        authorization?: string;
        idempotencyKey?: string;
        body?: unknown;
      },
      {
        status: number;
        body: unknown;
        headers?: Record<string, string>;
      }
    >;
  };
};

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signingSecret =
      process.env.CLERK_WEBHOOK_SIGNING_SECRET ??
      process.env.CLERK_WEBHOOK_SECRET;

    if (!signingSecret) {
      await ctx.runMutation(internalMutations.audit.record, {
        actorType: "system",
        category: "auth",
        action: "clerk_webhook.signing_secret_missing",
        metadata: { endpoint: "clerk-webhook" },
      });
      return new Response("Webhook signing secret is not configured.", {
        status: 500,
      });
    }

    let event;
    try {
      event = await verifyClerkWebhookRequest(request, signingSecret);
    } catch {
      await ctx.runMutation(internalMutations.audit.record, {
        actorType: "system",
        category: "auth",
        action: "clerk_webhook.verification_failed",
        metadata: { endpoint: "clerk-webhook" },
      });
      return new Response("Webhook verification failed.", { status: 400 });
    }

    if (event.type === "user.created" || event.type === "user.updated") {
      await ctx.runMutation(
        internalMutations.clerkUsers.upsertFromWebhook,
        normalizeClerkUser(event.data)
      );

      return Response.json({ ok: true, handled: event.type });
    }

    if (event.type === "user.deleted") {
      if (!event.data.id) {
        return new Response("Deleted user payload is missing an id.", {
          status: 400,
        });
      }

      await ctx.runMutation(internalMutations.clerkUsers.disableFromWebhook, {
        clerkUserId: event.data.id,
      });

      return Response.json({ ok: true, handled: event.type });
    }

    if (
      event.type === "organization.created" ||
      event.type === "organization.updated"
    ) {
      await ctx.runMutation(
        internalMutations.clerkUsers.upsertOrganizationFromWebhook,
        normalizeClerkOrganization(event.data)
      );

      return Response.json({ ok: true, handled: event.type });
    }

    if (event.type === "organization.deleted") {
      if (!event.data.id) {
        return new Response("Deleted organization payload is missing an id.", {
          status: 400,
        });
      }

      await ctx.runMutation(
        internalMutations.clerkUsers.disableOrganizationFromWebhook,
        {
          clerkOrganizationId: event.data.id,
        }
      );

      return Response.json({ ok: true, handled: event.type });
    }

    if (
      event.type === "organizationMembership.created" ||
      event.type === "organizationMembership.updated"
    ) {
      try {
        const organization = normalizeClerkOrganizationFromMembership(event.data);
        const publicUser = normalizeClerkPublicUserFromMembership(event.data);

        if (organization) {
          await ctx.runMutation(
            internalMutations.clerkUsers.upsertOrganizationFromWebhook,
            organization
          );
        }

        if (publicUser) {
          await ctx.runMutation(
            internalMutations.clerkUsers.upsertFromWebhook,
            publicUser
          );
        }

        await ctx.runMutation(
          internalMutations.clerkUsers.upsertOrganizationMembershipFromWebhook,
          normalizeClerkOrganizationMembership(event.data)
        );
      } catch (error) {
        if (error instanceof ClerkWebhookPayloadError) {
          return new Response(error.message, { status: 400 });
        }
        throw error;
      }

      return Response.json({ ok: true, handled: event.type });
    }

    if (event.type === "organizationMembership.deleted") {
      if (!event.data.id) {
        return new Response(
          "Deleted organization membership payload is missing an id.",
          {
            status: 400,
          }
        );
      }

      await ctx.runMutation(
        internalMutations.clerkUsers.disableOrganizationMembershipFromWebhook,
        {
          clerkOrganizationMembershipId: event.data.id,
        }
      );

      return Response.json({ ok: true, handled: event.type });
    }

    return Response.json({ ok: true, ignored: event.type });
  }),
});

for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
  http.route({
    pathPrefix: "/api/v1/",
    method,
    handler: httpAction(async (ctx, request) => {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/api\/v1\/?/, "");
      const query = Object.fromEntries(url.searchParams.entries());
      const body = await parseJsonBody(request);
      const response = await ctx.runAction(internalActions.restApiActions.handle, {
        method,
        path,
        query,
        authorization: request.headers.get("authorization") ?? undefined,
        idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
        body,
      });

      return Response.json(response.body, {
        status: response.status,
        headers: response.headers,
      });
    }),
  });
}

export default http;

async function parseJsonBody(request: Request) {
  if (request.method === "GET" || request.method === "DELETE") {
    return undefined;
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

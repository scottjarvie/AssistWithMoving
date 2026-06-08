import { verifyWebhook } from "@clerk/backend/webhooks";
import { anyApi, httpRouter } from "convex/server";
import type { FunctionReference } from "convex/server";

import { httpAction } from "./_generated/server";
import { normalizeClerkUser } from "./lib/clerk";

const http = httpRouter();

const internalMutations = anyApi as unknown as {
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
  };
  restApi: {
    handle: FunctionReference<
      "mutation",
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
      return new Response("Webhook signing secret is not configured.", {
        status: 500,
      });
    }

    let event;
    try {
      event = await verifyWebhook(request, { signingSecret });
    } catch {
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
      const response = await ctx.runMutation(internalMutations.restApi.handle, {
        method,
        path,
        query,
        authorization: request.headers.get("authorization") ?? undefined,
        idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
        body,
      });

      return Response.json(response.body, { status: response.status });
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

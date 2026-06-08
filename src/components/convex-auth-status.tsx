"use client";

import { useQuery } from "convex/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { ShieldCheck, ShieldQuestion } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const convexEnabled = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function ViewerEmail() {
  const viewer = useQuery(api.health.viewer);

  return (
    <p className="text-sm text-muted-foreground">
      Convex sees this browser session as{" "}
      <span className="font-medium text-foreground">
        {viewer?.email ?? viewer?.subject ?? "authenticated"}
      </span>
      .
    </p>
  );
}

export function ConvexAuthStatus() {
  if (!convexEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldQuestion className="size-4 text-muted-foreground" />
            Convex not configured
          </CardTitle>
          <CardDescription>
            Set `NEXT_PUBLIC_CONVEX_URL` to enable live backend status.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" />
            Clerk + Convex auth
          </CardTitle>
          <AuthLoading>
            <Badge variant="secondary">checking</Badge>
          </AuthLoading>
          <Unauthenticated>
            <Badge variant="outline">signed out</Badge>
          </Unauthenticated>
          <Authenticated>
            <Badge>verified</Badge>
          </Authenticated>
        </div>
        <CardDescription>
          Convex receives identity through Clerk session tokens.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuthLoading>
          <p className="text-sm text-muted-foreground">
            Waiting for Clerk and Convex to agree on the current session.
          </p>
        </AuthLoading>
        <Unauthenticated>
          <p className="text-sm text-muted-foreground">
            Sign in to verify the authenticated Convex query path.
          </p>
        </Unauthenticated>
        <Authenticated>
          <ViewerEmail />
        </Authenticated>
      </CardContent>
    </Card>
  );
}

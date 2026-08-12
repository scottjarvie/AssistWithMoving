"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function QueueRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const denied = /access|available to this actor|cannot view|permission|not found/i.test(
    error.message,
  );
  const Icon = denied ? ShieldAlert : AlertTriangle;

  return (
    <div className="p-3 sm:p-6">
      <Card className="mx-auto max-w-2xl border-destructive/25">
        <CardHeader>
          <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <CardTitle>
            {denied ? "This Queue is not available to you" : "The Queue could not be loaded"}
          </CardTitle>
          <CardDescription className="leading-6">
            {denied
              ? "Queue handoffs stay isolated to the people and moves that have been explicitly shared with them."
              : "Your move records are unchanged. Retry the bounded Queue read, or return to your moves."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {!denied ? (
            <Button onClick={reset}>
              <RotateCcw aria-hidden="true" />
              Retry Queue
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/app/moves">Back to moves</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm text-destructive">
          {error.digest ?? "workspace-error"}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Something went wrong loading this workspace
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your data is safe. Retry once; if this keeps happening, mention the
          code above when you contact support.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Retry</Button>
          <Button asChild variant="outline">
            <Link href="/app/moves">Back to moves</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

"use client";

import { Button } from "@/components/ui/button";

export default function Error({
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
          {error.digest ?? "runtime-error"}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The app hit an unexpected state. Retry once; if it repeats, the error
          belongs in Linear with the route and browser details.
        </p>
        <Button className="mt-6" onClick={reset}>
          Retry
        </Button>
      </div>
    </main>
  );
}

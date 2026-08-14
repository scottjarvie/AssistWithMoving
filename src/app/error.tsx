"use client";

import Link from "next/link";

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
          Your move records are unchanged. Retry once; if it repeats, share the
          short code above when you ask for help.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button size="touch" onClick={reset}>Retry</Button>
          <Button asChild size="touch" variant="outline">
            <Link href="/app/moves">Back to moves</Link>
          </Button>
          <Button asChild size="touch" variant="ghost">
            <Link href="/faq">Get help</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { LockKeyhole } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
        <BrandMark />
        <div className="mt-8">
          <LockKeyhole className="mb-4 size-8 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Clerk will power this route in Phase 1. The foundation route exists
            now so auth can be wired without reshaping navigation.
          </p>
        </div>
        <Button asChild className="mt-6 w-full">
          <Link href="/app/dashboard">Continue to preview</Link>
        </Button>
      </div>
    </main>
  );
}

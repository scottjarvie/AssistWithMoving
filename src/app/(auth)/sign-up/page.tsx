import Link from "next/link";
import { UserPlus } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
        <BrandMark />
        <div className="mt-8">
          <UserPlus className="mb-4 size-8 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">Create account</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This will become the Clerk sign-up surface. Household creation and
            move onboarding will follow after auth and tenancy are in place.
          </p>
        </div>
        <Button asChild className="mt-6 w-full">
          <Link href="/app/dashboard">Open workspace preview</Link>
        </Button>
      </div>
    </main>
  );
}

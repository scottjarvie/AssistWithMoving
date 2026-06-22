import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { UserPlus } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
        <BrandMark />
        {clerkEnabled ? (
          <div className="mt-8">
            <SignUp
              routing="path"
              path="/sign-up"
              signInUrl="/sign-in"
              fallbackRedirectUrl="/app/moves"
            />
          </div>
        ) : (
          <>
            <div className="mt-8">
              <UserPlus
                className="mb-4 size-8 text-primary"
                aria-hidden="true"
              />
              <h1 className="text-2xl font-semibold">Create account</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Clerk is not configured in this environment. Add Clerk keys to
                enable account creation.
              </p>
            </div>
            <Button asChild className="mt-6 w-full">
              <Link href="/">Return home</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}

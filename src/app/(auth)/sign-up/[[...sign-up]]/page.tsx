import Link from "next/link";
import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { UserPlus } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export const metadata: Metadata = {
  title: "Create account",
  description: "Create an Assist With Moving account.",
};

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full min-w-0 max-w-sm rounded-lg border border-border bg-card p-6">
        <BrandMark />
        {clerkEnabled ? (
          <div className="mt-8">
            <h1 className="text-2xl font-semibold">Create your Assist With Moving workspace</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Start with one move. Add detail and connect your chosen AI when
              you are ready.
            </p>
            <SignUp
              routing="path"
              path="/sign-up"
              signInUrl="/sign-in"
              fallbackRedirectUrl="/app"
              appearance={{
                elements: {
                  rootBox: { width: "100%", maxWidth: "100%" },
                  cardBox: { width: "100%", maxWidth: "100%" },
                  card: { width: "100%", maxWidth: "100%" },
                  headerTitle: { display: "none" },
                  headerSubtitle: { display: "none" },
                },
              }}
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

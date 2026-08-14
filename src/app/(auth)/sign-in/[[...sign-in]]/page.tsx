import Link from "next/link";
import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { LockKeyhole } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Assist With Moving workspace.",
};

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full min-w-0 max-w-sm rounded-lg border border-border bg-card p-6">
        <BrandMark />
        {clerkEnabled ? (
          <div className="mt-8">
            <h1 className="text-2xl font-semibold">Sign in to Assist With Moving</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Open your private move workspace and continue where you left off.
            </p>
            <SignIn
              routing="path"
              path="/sign-in"
              signUpUrl="/sign-up"
              fallbackRedirectUrl="/app"
              appearance={{
                elements: {
                  rootBox: { width: "100%", maxWidth: "100%" },
                  cardBox: { width: "100%", maxWidth: "100%" },
                  card: { width: "100%", maxWidth: "100%" },
                  headerTitle: { display: "none" },
                  headerSubtitle: { display: "none" },
                  formButtonPrimary: "min-h-11",
                  socialButtonsBlockButton: "min-h-11",
                  formFieldInput: "min-h-11",
                  footerActionLink: "inline-flex min-h-11 items-center",
                },
              }}
            />
          </div>
        ) : (
          <>
            <div className="mt-8">
              <LockKeyhole
                className="mb-4 size-8 text-primary"
                aria-hidden="true"
              />
              <h1 className="text-2xl font-semibold">Sign in</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Clerk is not configured in this environment. Add Clerk keys to
                enable authentication.
              </p>
            </div>
            <Button asChild size="touch" className="mt-6 w-full">
              <Link href="/">Return home</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}

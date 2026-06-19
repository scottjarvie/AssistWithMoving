"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { LockKeyhole, RefreshCw, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function AiStartActions() {
  if (!clerkPublishableKey) {
    return <AiStartLinks />;
  }

  return <ClerkAwareAiStartActions />;
}

function ClerkAwareAiStartActions() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/settings/ai-connections");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <Button size="lg" disabled>
        <RefreshCw className="animate-spin" aria-hidden="true" />
        Checking sign-in
      </Button>
    );
  }

  if (isSignedIn) {
    return (
      <Button asChild size="lg">
        <Link href="/settings/ai-connections">
          <RefreshCw className="animate-spin" aria-hidden="true" />
          Opening connection setup
        </Link>
      </Button>
    );
  }

  return (
    <AiStartLinks />
  );
}

function AiStartLinks() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button asChild size="lg">
        <Link href="/sign-up?redirect_url=/settings/ai-connections">
          <UserPlus aria-hidden="true" />
          Create account and connection
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/sign-in?redirect_url=/settings/ai-connections">
          <LockKeyhole aria-hidden="true" />
          Sign in and connect AI
        </Link>
      </Button>
    </div>
  );
}

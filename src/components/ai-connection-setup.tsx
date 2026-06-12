"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { RefreshCw } from "lucide-react";

import { ApiKeyManager } from "@/components/api-key-manager";
import { Button } from "@/components/ui/button";

export function AiConnectionSetup() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
        Checking your signed-in session.
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="rounded-md border border-border p-4">
        <p className="text-sm text-muted-foreground">
          Sign in first, then this page will open the AI connection setup.
        </p>
        <Button asChild className="mt-3">
          <Link href="/sign-in?redirect_url=/settings/ai-connections">
            Sign in and connect AI
          </Link>
        </Button>
      </div>
    );
  }

  return <ApiKeyManager enabled={isLoaded && isSignedIn} mode="setup" />;
}

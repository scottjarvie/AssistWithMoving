"use client";

import Link from "next/link";
import { LockKeyhole, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AiStartActions() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button asChild size="lg">
        <Link href="/settings/ai-connections">
          <UserPlus aria-hidden="true" />
          Open connection setup
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

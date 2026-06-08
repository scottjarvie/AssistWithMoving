"use client";

import Link from "next/link";
import {
  SignInButton,
  SignOutButton,
  SignUpButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import { LockKeyhole, LogOut, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function AuthControls() {
  if (!clerkEnabled) {
    return (
      <Button asChild size="sm">
        <Link href="/sign-in" prefetch={false}>
          <LockKeyhole aria-hidden="true" />
          Sign in
        </Link>
      </Button>
    );
  }

  return <EnabledAuthControls />;
}

function EnabledAuthControls() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <Button size="sm" variant="outline" disabled>
        <LockKeyhole aria-hidden="true" />
        Checking
      </Button>
    );
  }

  if (!isSignedIn) {
    return (
      <>
        <SignInButton mode="modal" fallbackRedirectUrl="/app/dashboard">
          <Button size="sm" variant="outline">
            <LockKeyhole aria-hidden="true" />
            Sign in
          </Button>
        </SignInButton>
        <SignUpButton mode="modal" fallbackRedirectUrl="/app/dashboard">
          <Button size="sm">
            <UserPlus aria-hidden="true" />
            Create account
          </Button>
        </SignUpButton>
      </>
    );
  }

  return (
    <>
      <UserButton
        appearance={{
          elements: {
            avatarBox: "size-8",
          },
        }}
      />
      <SignOutButton>
        <Button size="sm" variant="outline">
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      </SignOutButton>
    </>
  );
}

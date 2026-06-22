"use client";

import Link from "next/link";
import {
  SignInButton,
  SignUpButton,
  useClerk,
  useUser,
} from "@clerk/nextjs";
import {
  ArrowRight,
  KeyRound,
  LockKeyhole,
  LogOut,
  Settings,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

// The single account surface in the top bar. Folds the old standalone Settings
// button and the AI-connection entry point into one menu, with "Connect your AI
// agent" highlighted as the only setup step that lives outside a move.
export function AccountMenu() {
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

  return <EnabledAccountMenu />;
}

function EnabledAccountMenu() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

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
        <SignInButton mode="modal" fallbackRedirectUrl="/app/moves">
          <Button size="sm" variant="outline">
            <LockKeyhole aria-hidden="true" />
            Sign in
          </Button>
        </SignInButton>
        <SignUpButton mode="modal" fallbackRedirectUrl="/app/moves">
          <Button size="sm">
            <UserPlus aria-hidden="true" />
            Create account
          </Button>
        </SignUpButton>
      </>
    );
  }

  const avatarUrl = user?.imageUrl;
  const initial =
    user?.firstName?.[0] ??
    user?.primaryEmailAddress?.emailAddress?.[0]?.toUpperCase() ??
    "?";
  const displayName =
    user?.fullName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="rounded-full"
          aria-label="Account menu"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="size-8 rounded-full object-cover"
            />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-primary/12 text-sm font-medium text-primary">
              {initial}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {displayName ? (
          <>
            <DropdownMenuLabel className="truncate">
              {displayName}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          asChild
          className="bg-primary/10 text-primary focus:bg-primary/15 focus:text-primary"
        >
          <Link href="/settings/ai-connections">
            <KeyRound aria-hidden="true" />
            Connect your AI agent
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/ai">
            AI setup guide
            <ArrowRight className="ml-auto" aria-hidden="true" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void signOut({ redirectUrl: "/" })}
        >
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

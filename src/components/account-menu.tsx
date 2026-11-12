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
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";
import { FamilySurface } from "@/components/family-surface";

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
  // Surface the otherwise-unlinked /admin page, but only for app admins.
  const me = useQuery(api.users.current);
  const isAdmin = me?.appRole === "admin";

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

  return <SignedInAccountSurface avatarUrl={avatarUrl} initial={initial} displayName={displayName} email={user?.primaryEmailAddress?.emailAddress} isAdmin={isAdmin} signOut={() => signOut({ redirectUrl: "/" })} />;
}

export function SignedInAccountSurface({ avatarUrl, initial, displayName, email, isAdmin, signOut }: {
  avatarUrl?: string; initial: string; displayName?: string | null; email?: string;
  isAdmin: boolean; signOut: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const locked = useRef(false);
  const exit = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(false);
    try { await signOut(); } catch { setError(true); }
    finally { locked.current = false; setBusy(false); }
  };
  return <FamilySurface label="Account menu" title="Account" trigger={avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt="" className="size-8 rounded-full object-cover" />
  ) : <span className="flex size-8 items-center justify-center rounded-full bg-primary/12 text-sm font-medium text-primary">{initial}</span>}>
    {close => <>
      <div className="account-band">
        <p className="text-xs text-muted-foreground">Signed in as</p>
        <p className="account-identity font-medium">{displayName || email || "Account"}</p>
        {email && email !== displayName && <p className="account-identity text-xs text-muted-foreground">{email}</p>}
        {isAdmin && <span className="account-badge">Admin</span>}
        <div className="account-links">
          <Link href="/settings/ai" onClick={close} className="text-primary"><KeyRound aria-hidden="true" />Connect your chosen AI</Link>
          <Link href="/ai" onClick={close}>AI setup guide<ArrowRight aria-hidden="true" /></Link>
        </div>
      </div>
      <div className="account-links account-settings"><Link href="/settings" onClick={close}><Settings aria-hidden="true" />Settings</Link></div>
      {isAdmin && <div className="account-links account-role"><Link href="/admin" onClick={close}><ShieldAlert aria-hidden="true" />Admin</Link></div>}
      {error && <div role="alert" className="account-feedback">Could not sign out. <button type="button" onClick={() => void exit()} disabled={busy}>Retry</button></div>}
      <div className="account-exit"><button type="button" onClick={() => void exit()} disabled={busy}><LogOut aria-hidden="true" />{busy ? "Signing out…" : "Sign out"}</button></div>
    </>}
  </FamilySurface>;
}

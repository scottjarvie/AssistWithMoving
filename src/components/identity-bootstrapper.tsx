"use client";

import { useEffect, useMemo, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { usePathname } from "next/navigation";

import { api } from "../../convex/_generated/api";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const convexEnabled = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
const identitySyncPathPrefixes = ["/app", "/admin", "/settings"];

export function isIdentitySyncPath(pathname: string) {
  return identitySyncPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function IdentityBootstrapper() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const upsertCurrentUser = useMutation(api.users.upsertCurrent);
  const lastSyncedKey = useRef<string | null>(null);
  const shouldSyncIdentity = isIdentitySyncPath(pathname);

  const profile = useMemo(() => {
    if (!user) {
      return null;
    }

    return {
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName ?? user.username ?? undefined,
      imageUrl: user.imageUrl,
    };
  }, [user]);

  useEffect(() => {
    if (!clerkEnabled || !convexEnabled || !isLoaded || !isSignedIn || !profile) {
      return;
    }
    if (!shouldSyncIdentity) {
      return;
    }

    const syncKey = JSON.stringify(profile);
    if (lastSyncedKey.current === syncKey) {
      return;
    }

    lastSyncedKey.current = syncKey;
    void upsertCurrentUser(profile).catch(() => {
      lastSyncedKey.current = null;
    });
  }, [isLoaded, isSignedIn, profile, shouldSyncIdentity, upsertCurrentUser]);

  return null;
}

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const convexEnabled = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

export function IdentityBootstrapper() {
  const { isLoaded, isSignedIn, user } = useUser();
  const upsertCurrentUser = useMutation(api.users.upsertCurrent);
  const lastSyncedKey = useRef<string | null>(null);

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

    const syncKey = JSON.stringify(profile);
    if (lastSyncedKey.current === syncKey) {
      return;
    }

    lastSyncedKey.current = syncKey;
    void upsertCurrentUser(profile).catch(() => {
      lastSyncedKey.current = null;
    });
  }, [isLoaded, isSignedIn, profile, upsertCurrentUser]);

  return null;
}

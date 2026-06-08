"use client";

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import { IdentityBootstrapper } from "@/components/identity-bootstrapper";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const convex = useMemo(() => {
    if (!convexUrl) {
      return null;
    }

    return new ConvexReactClient(convexUrl);
  }, []);

  if (!convex) {
    return children;
  }

  if (!clerkPublishableKey) {
    return <ConvexProvider client={convex}>{children}</ConvexProvider>;
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <IdentityBootstrapper />
      {children}
    </ConvexProviderWithClerk>
  );
}

"use client";

import { ClerkProvider } from "@clerk/nextjs";

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function ClerkClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!clerkPublishableKey) {
    return children;
  }

  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}

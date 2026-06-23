"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const clerkPathPrefixes = ["/app", "/admin", "/settings", "/sign-in", "/sign-up"];

export function ClerkClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (!clerkEnabled || !usesClerk(pathname)) {
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

function usesClerk(pathname: string) {
  return clerkPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

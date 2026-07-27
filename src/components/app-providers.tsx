"use client";

import { ClerkClientProvider } from "@/components/clerk-client-provider";
import { ConvexClientProvider } from "@/components/convex-client-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ClerkClientProvider>
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ClerkClientProvider>
  );
}

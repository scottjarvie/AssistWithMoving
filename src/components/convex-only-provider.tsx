"use client";

import { useMemo } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

export function ConvexOnlyProvider({
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

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}

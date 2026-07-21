"use client";

import { useCallback, useSyncExternalStore } from "react";

function getServerSnapshot() {
  return undefined;
}

/**
 * Returns the current media-query result after hydration.
 *
 * `undefined` is an intentional server/first-hydration snapshot so responsive
 * callers can render one lightweight placeholder instead of server-rendering
 * multiple hidden interactive trees.
 */
export function useMediaQuery(query: string): boolean | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", onStoreChange);
      return () => mediaQuery.removeEventListener("change", onStoreChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

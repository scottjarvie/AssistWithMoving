"use client";

import { useCallback, useSyncExternalStore } from "react";

const mediaQueryLists = new Map<string, MediaQueryList>();

function getMediaQueryList(query: string) {
  const cached = mediaQueryLists.get(query);
  if (cached) return cached;

  const mediaQuery = window.matchMedia(query);
  mediaQueryLists.set(query, mediaQuery);
  return mediaQuery;
}

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
      const mediaQuery = getMediaQueryList(query);
      mediaQuery.addEventListener("change", onStoreChange);
      return () => mediaQuery.removeEventListener("change", onStoreChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => getMediaQueryList(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

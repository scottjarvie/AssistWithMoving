"use client";

import { useCallback, useEffect, useState } from "react";

export function useHashTab<T extends string>(
  defaultValue: T,
  hashTabs: Partial<Record<string, T>>
) {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    function syncHashTab() {
      const nextValue = hashTabs[window.location.hash] ?? defaultValue;
      setValue(nextValue);
    }

    syncHashTab();
    window.addEventListener("hashchange", syncHashTab);

    return () => window.removeEventListener("hashchange", syncHashTab);
  }, [defaultValue, hashTabs]);

  const onValueChange = useCallback((nextValue: string) => {
    setValue(nextValue as T);
  }, []);

  return [value, onValueChange] as const;
}

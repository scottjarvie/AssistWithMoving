"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

export type CollectionView = "table" | "list" | "grid";
export type CollectionPresentation = { view: CollectionView; density: "compact" | "comfortable"; groupBy: string; groupDesc: boolean };
const cache = new Map<string, string | null>();
const memoryOnly = new Set<string>();
const eventName = "assistwithmoving:collection-presentation";

function readStored(raw: string | null): Record<string, unknown> {
  try { const value: unknown = JSON.parse(raw ?? "null"); if (value && typeof value === "object") return value as Record<string, unknown>; } catch { /* Keep defaults for invalid browser preferences. */ }
  return {};
}
function persist(key: string, value: CollectionPresentation) {
  const raw = JSON.stringify(value);
  cache.set(key, raw);
  try { window.localStorage.setItem(key, raw); memoryOnly.delete(key); } catch { memoryOnly.add(key); }
  window.dispatchEvent(new CustomEvent(eventName, { detail: key }));
}

export function useCollectionPresentation(id: string, initialView: CollectionView = "table") {
  const key = `assistwithmoving.collection.${id}.v1`;
  const getSnapshot = useCallback(() => {
    if (!memoryOnly.has(key)) try { cache.set(key, window.localStorage.getItem(key)); } catch { /* Keep any in-memory fallback. */ }
    return cache.get(key) ?? null;
  }, [key]);
  const subscribe = useCallback((listener: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      cache.set(key, event.newValue);
      memoryOnly.delete(key);
      listener();
    };
    const onLocal = (event: Event) => { if ((event as CustomEvent<string>).detail === key) listener(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(eventName, onLocal);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(eventName, onLocal); };
  }, [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  useEffect(() => {
    const stored = readStored(getSnapshot());
    if (stored.view === "table" || stored.view === "list" || stored.view === "grid") return;
    // Choose once on the first client visit, then keep that choice across
    // resizes and remounts. SSR remains deterministic; no resize listener.
    persist(key, {
      view: initialView === "list" || window.innerWidth < 768 ? "list" : "table",
      density: stored.density === "comfortable" ? "comfortable" : "compact",
      groupBy: typeof stored.groupBy === "string" ? stored.groupBy : "",
      groupDesc: stored.groupDesc === true,
    });
  }, [getSnapshot, initialView, key]);
  const preferences = useMemo<CollectionPresentation>(() => {
    const stored = readStored(raw);
    return {
      view: stored.view === "table" || stored.view === "list" || stored.view === "grid" ? stored.view : initialView,
      density: stored.density === "comfortable" ? "comfortable" : "compact",
      groupBy: typeof stored.groupBy === "string" ? stored.groupBy : "",
      groupDesc: stored.groupDesc === true,
    };
  }, [raw, initialView]);
  const setPreferences = useCallback((patch: Partial<CollectionPresentation>) => {
    persist(key, { ...preferences, ...patch });
  }, [key, preferences]);
  const initialized = ["table", "list", "grid"].includes(String(readStored(raw).view));
  return [preferences, setPreferences, initialized] as const;
}

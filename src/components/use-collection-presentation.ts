"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export type CollectionView = "table" | "list" | "grid";
export type CollectionPresentation = { view: CollectionView; density: "compact" | "comfortable"; groupBy: string; groupDesc: boolean };
const cache = new Map<string, string | null>();
const memoryOnly = new Set<string>();
const eventName = "assistwithmoving:collection-presentation";

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
  const preferences = useMemo<CollectionPresentation>(() => {
    let stored: Record<string, unknown> = {};
    try { const value: unknown = JSON.parse(raw ?? "null"); if (value && typeof value === "object") stored = value as Record<string, unknown>; } catch { /* Invalid browser preference: keep defaults. */ }
    return {
      view: stored.view === "table" || stored.view === "list" || stored.view === "grid" ? stored.view : initialView,
      density: stored.density === "comfortable" ? "comfortable" : "compact",
      groupBy: typeof stored.groupBy === "string" ? stored.groupBy : "",
      groupDesc: stored.groupDesc === true,
    };
  }, [raw, initialView]);
  const setPreferences = useCallback((patch: Partial<CollectionPresentation>) => {
    const value = JSON.stringify({ ...preferences, ...patch });
    cache.set(key, value);
    try { window.localStorage.setItem(key, value); memoryOnly.delete(key); } catch { memoryOnly.add(key); }
    window.dispatchEvent(new CustomEvent(eventName, { detail: key }));
  }, [key, preferences]);
  return [preferences, setPreferences] as const;
}

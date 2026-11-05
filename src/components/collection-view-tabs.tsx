"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SavedView<T> = { id: string; label: string; snapshot: T };
type BuiltInView<T> = SavedView<T> & { count?: number; description?: string };
const memory = new Map<string, string>();
const memoryOnly = new Set<string>();
const eventName = "assistwithmoving:collection-views";

function signature(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(signature).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${signature(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function useSavedViews<T>(key: string, parseSnapshot: (value: unknown) => T | null) {
  const snapshot = useCallback(() => {
    if (!memoryOnly.has(key)) try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) memory.delete(key); else memory.set(key, raw);
    } catch { /* Session memory remains available if storage is refused. */ }
    return memory.get(key) ?? null;
  }, [key]);
  const subscribe = useCallback((listener: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      memoryOnly.delete(key);
      if (event.newValue === null) memory.delete(key); else memory.set(key, event.newValue);
      listener();
    };
    const onLocal = (event: Event) => { if ((event as CustomEvent<string>).detail === key) listener(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(eventName, onLocal);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(eventName, onLocal); };
  }, [key]);
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const views = useMemo<SavedView<T>[]>(() => {
    try {
      const stored: unknown = JSON.parse(raw ?? "[]");
      if (!Array.isArray(stored)) return [];
      const ids = new Set<string>();
      return stored.flatMap(value => {
        if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id.startsWith("saved:") || ids.has(value.id) || typeof value.label !== "string" || !value.label.trim()) return [];
        const parsed = parseSnapshot(value.snapshot);
        if (!parsed) return [];
        ids.add(value.id);
        return [{ id: value.id, label: value.label, snapshot: parsed }];
      });
    } catch { return []; }
  }, [raw, parseSnapshot]);
  function save(view: SavedView<T>) {
    const next = JSON.stringify([...views, view]);
    memory.set(key, next);
    let persisted = true;
    try { window.localStorage.setItem(key, next); memoryOnly.delete(key); } catch { memoryOnly.add(key); persisted = false; }
    window.dispatchEvent(new CustomEvent(eventName, { detail: key }));
    return persisted;
  }
  return { views, save };
}

/** Built-ins describe real states. Named views exist only after someone saves one. */
export function CollectionViewTabs<T>({ storageKey, builtIns, snapshot, onApply, parseSnapshot }: {
  storageKey: string;
  builtIns: BuiltInView<T>[];
  snapshot: T;
  onApply: (value: T) => void;
  parseSnapshot: (value: unknown) => T | null;
}) {
  const { views, save } = useSavedViews(storageKey, parseSnapshot);
  const [selectedId, setSelectedId] = useState(builtIns[0]?.id ?? "");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const saveButton = useRef<HTMLButtonElement>(null);
  const allViews: BuiltInView<T>[] = [...builtIns, ...views];
  const selected = allViews.find(view => view.id === selectedId) ?? builtIns[0];
  const edited = Boolean(selected && signature(selected.snapshot) !== signature(snapshot));
  return <div className="space-y-2">
    <div role="group" aria-label="Inventory views" className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
      {allViews.map(view => <Button key={view.id} type="button" size="sm" variant={selected?.id === view.id ? "secondary" : "ghost"} className="min-h-11 max-w-full whitespace-normal text-left sm:min-h-8" title={view.description ?? "Saved on this browser"} aria-pressed={selected?.id === view.id} onClick={() => { setSelectedId(view.id); onApply(view.snapshot); setMessage(""); }}>
        {view.label}{selected?.id === view.id && edited ? <><span aria-hidden="true" className="size-1.5 rounded-full bg-accent" /><span className="sr-only">modified</span></> : null}{typeof view.count === "number" ? <span className="font-mono text-xs text-muted-foreground">{view.count}</span> : null}
      </Button>)}
    </div>
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {edited && selected ? <><span>{selected.label} modified</span><Button type="button" size="sm" variant="ghost" onClick={() => onApply(selected.snapshot)}>Discard</Button></> : null}
      <Button ref={saveButton} type="button" variant="ghost" size="sm" onClick={() => { setName(""); setNaming(true); }}>Save as view</Button>
      <span>Named views stay on this browser.</span>
    </div>
    {message ? <p role="status" className="text-xs text-muted-foreground">{message}</p> : null}
    <Dialog open={naming} onOpenChange={setNaming}><DialogContent className="p-4 sm:max-w-md" onCloseAutoFocus={event => { event.preventDefault(); saveButton.current?.focus(); }}>
      <form onSubmit={event => {
        event.preventDefault();
        if (!name.trim()) return;
        const view = { id: `saved:${crypto.randomUUID()}`, label: name.trim(), snapshot };
        const persisted = save(view);
        setSelectedId(view.id); setNaming(false);
        setMessage(persisted ? "View saved on this browser." : "View kept for this session; browser storage is unavailable.");
      }}>
        <DialogHeader className="p-0 pr-8"><DialogTitle>Save this view</DialogTitle><DialogDescription>Keep its search, filters, sorting, grouping, presentation, density and columns on this browser.</DialogDescription></DialogHeader>
        <label className="mt-4 grid gap-2 text-sm font-medium">View name<Input autoFocus maxLength={80} value={name} onChange={event => setName(event.target.value)} required /></label>
        <DialogFooter className="mt-4 p-0"><Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)}>Cancel</Button><Button type="submit" size="sm" disabled={!name.trim()}>Save view</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </div>;
}

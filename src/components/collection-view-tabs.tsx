"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { revealHorizontalItem } from "@/lib/reveal-horizontal-item";
import { MovingSymbol } from "@/components/moving-symbol";

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
  function write(nextViews: SavedView<T>[]) {
    const next = JSON.stringify(nextViews);
    memory.set(key, next);
    let persisted = true;
    try { window.localStorage.setItem(key, next); memoryOnly.delete(key); } catch { memoryOnly.add(key); persisted = false; }
    window.dispatchEvent(new CustomEvent(eventName, { detail: key }));
    return persisted;
  }
  return { views, save: (view: SavedView<T>) => write([...views, view]), update: (view: SavedView<T>) => write(views.map(current => current.id === view.id ? view : current)), remove: (id: string) => write(views.filter(view => view.id !== id)) };
}

/** Built-ins describe real states. Named views exist only after someone saves one. */
export function CollectionViewTabs<T>({ storageKey, builtIns, snapshot, onApply, parseSnapshot, ready = true }: {
  storageKey: string;
  builtIns: BuiltInView<T>[];
  snapshot: T;
  onApply: (value: T) => void;
  parseSnapshot: (value: unknown) => T | null;
  ready?: boolean;
}) {
  const { views, save, update, remove } = useSavedViews(storageKey, parseSnapshot);
  const [selection, setSelection] = useState<SavedView<T> | null>(() => ready ? builtIns[0] ?? null : null);
  const [naming, setNaming] = useState<"save" | "rename" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const strip = useRef<HTMLDivElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const chooserTarget = useRef<string | null>(null);
  const allViews: BuiltInView<T>[] = [...builtIns, ...views];
  // Pick the first baseline only after the actual stored/phone presentation
  // is available. A guarded adjustment of this component's own state prevents
  // an intermediate false modified mark; later edits never replace baseline.
  if (ready && (!selection || !allViews.some(view => view.id === selection.id)) && builtIns[0]) setSelection(builtIns[0]);
  const selected = allViews.find(view => view.id === selection?.id) ?? builtIns[0];
  const baseline = selected && selection && selected.id === selection.id && selected.id.startsWith("built-in:") ? selection.snapshot : selected?.snapshot;
  const edited = Boolean(selected && signature(baseline) !== signature(snapshot));
  const isSaved = selected?.id.startsWith("saved:") ?? false;
  useEffect(() => {
    if (selected?.id) revealHorizontalItem(strip.current, triggers.current.get(selected.id));
  }, [selected?.id, selected?.label, edited]);
  function selectView(view: SavedView<T>) { setSelection(view); onApply(view.snapshot); setMessage(""); }
  function report(persisted: boolean, action: string) { setMessage(persisted ? `${action} on this browser.` : `${action} for this session; browser storage is unavailable.`); }
  return <div className="space-y-2">
    <div className="flex min-w-0 items-start gap-2 border-b border-border pb-2">
    <div ref={strip} role="group" aria-label="Inventory views" className="moving-view-strip min-w-0 flex-1 overflow-x-auto sm:overflow-visible">
      <div className="moving-view-items">{allViews.map(view => <Button key={view.id} ref={element => { if (element) triggers.current.set(view.id, element); else triggers.current.delete(view.id); }} type="button" size="sm" variant={selected?.id === view.id ? "secondary" : "ghost"} className="h-auto min-h-11 min-w-0 shrink-0 whitespace-normal break-words py-1.5 text-left sm:min-h-8 sm:max-w-full" title={view.description ?? "Saved on this browser"} aria-pressed={selected?.id === view.id} onClick={() => selectView(view)}>
        {view.label}{selected?.id === view.id && edited ? <><span aria-hidden="true" className="size-1.5 rounded-full bg-accent" /><span className="sr-only">modified</span></> : null}{typeof view.count === "number" ? <span className="font-mono text-xs text-muted-foreground">{view.count}</span> : null}
      </Button>)}</div>
    </div>
    <Popover open={chooserOpen} onOpenChange={setChooserOpen}><PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0 sm:hidden" aria-label={`All ${allViews.length} views`}><MovingSymbol name="contents" className="size-4" />Views</Button></PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-[min(24rem,calc(100vw-2rem))] overflow-y-auto" onCloseAutoFocus={event => {
        const id = chooserTarget.current;
        if (id) { event.preventDefault(); const trigger = triggers.current.get(id); trigger?.focus({ preventScroll: true }); revealHorizontalItem(strip.current, trigger); chooserTarget.current = null; }
      }}><p className="mb-2 text-xs font-medium text-muted-foreground">All {allViews.length} views</p><div className="grid grid-cols-2 gap-1">{allViews.map(view => <Button key={view.id} type="button" variant={selected?.id === view.id ? "secondary" : "ghost"} className="min-h-11 min-w-0 justify-start whitespace-normal break-words text-left" onClick={() => { chooserTarget.current = view.id; selectView(view); setChooserOpen(false); }}>{view.label}</Button>)}</div></PopoverContent>
    </Popover>
    </div>
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {edited && selected && baseline ? <><span>{selected.label} modified</span><Button type="button" size="sm" variant="ghost" onClick={() => { onApply(baseline); saveButton.current?.focus(); }}>Discard</Button></> : null}
      {edited && isSaved && selected ? <Button type="button" size="sm" variant="ghost" onClick={() => { const next = { ...selected, snapshot }; report(update(next), "View updated"); setSelection(next); saveButton.current?.focus(); }}>Update view</Button> : null}
      <Button ref={saveButton} type="button" variant="ghost" size="sm" onClick={() => { setName(""); setNaming("save"); }}>Save as view</Button>
      {isSaved && selected ? <><Button type="button" size="sm" variant="ghost" onClick={() => { setName(selected.label); setNaming("rename"); }}>Rename view</Button><Button type="button" size="sm" variant="ghost" onClick={() => setDeleting(true)}>Delete view</Button></> : null}
      <span>Named views stay on this browser.</span>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" className={message ? "text-xs text-muted-foreground" : "sr-only"}>{message}</p>
    <Dialog open={naming !== null} onOpenChange={open => { if (!open) setNaming(null); }}><DialogContent className="collection-controls p-4 sm:max-w-md" onCloseAutoFocus={event => { event.preventDefault(); saveButton.current?.focus(); }}>
      <form onSubmit={event => {
        event.preventDefault();
        if (!name.trim()) return;
        const renaming = naming === "rename" && isSaved && selected;
        const view = renaming ? { ...selected, label: name.trim() } : { id: `saved:${crypto.randomUUID()}`, label: name.trim(), snapshot };
        const persisted = renaming ? update(view) : save(view);
        setSelection(view); setNaming(null);
        report(persisted, renaming ? "View renamed" : "View saved");
      }}>
        <DialogHeader className="p-0 pr-8"><DialogTitle>{naming === "rename" ? "Rename this view" : "Save this view"}</DialogTitle><DialogDescription>Keep its search, filters, sorting, grouping, presentation, density and columns on this browser.</DialogDescription></DialogHeader>
        <label className="mt-4 grid gap-2 text-sm font-medium">View name<Input autoFocus maxLength={80} value={name} onChange={event => setName(event.target.value)} required /></label>
        <DialogFooter className="mt-4 p-0"><Button type="button" size="sm" variant="ghost" onClick={() => setNaming(null)}>Cancel</Button><Button type="submit" size="sm" disabled={!name.trim()}>{naming === "rename" ? "Rename view" : "Save view"}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={deleting} onOpenChange={setDeleting}><DialogContent className="collection-controls p-4 sm:max-w-md" onCloseAutoFocus={event => { event.preventDefault(); saveButton.current?.focus(); }}>
      <DialogHeader className="p-0 pr-8"><DialogTitle>Delete saved view</DialogTitle><DialogDescription>Delete “{selected?.label}” from this browser&apos;s saved views?</DialogDescription></DialogHeader>
      <DialogFooter className="p-0"><Button type="button" size="sm" variant="ghost" onClick={() => setDeleting(false)}>Keep view</Button><Button type="button" size="sm" variant="destructive" onClick={() => {
        if (!selected || !isSaved) return;
        const persisted = remove(selected.id);
        const first = builtIns[0]; if (first) { setSelection(first); onApply(first.snapshot); }
        setDeleting(false); report(persisted, "View deleted");
      }}>Delete this view</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

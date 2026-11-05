"use client";

import { useEffect, useRef, useState } from "react";
import { MovingSymbol, type MovingSymbolName } from "@/components/moving-symbol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type RecordHistoryEntry = {
  id: string;
  action: string;
  category: string;
  actorType: "user" | "agent" | "apiKey" | "system" | "webhook";
  createdAt: number;
  changedKeys?: string[];
  summary?: string;
};

const categorySymbols: Record<string, MovingSymbolName> = { inventory: "box", photo: "camera", assignment: "truck", plan: "plan", documentation: "source", ai: "ai", queue: "queue", auth: "person", system: "settings" };
const authors = {
  user: { label: "Person", symbol: "person", detail: "Recorded by a person. This history does not provide their display name." },
  agent: { label: "AI / automation", symbol: "ai", detail: "Recorded by a connected AI or automation. This entry does not identify its model." },
  apiKey: { label: "API key", symbol: "source", detail: "Recorded through an API key. This does not identify whether a person or an AI used it." },
  system: { label: "Routine", symbol: "settings", detail: "Recorded by the site's routine background work." },
  webhook: { label: "Integration", symbol: "source", detail: "Recorded by a connected service notification." },
} satisfies Record<RecordHistoryEntry["actorType"], { label: string; symbol: MovingSymbolName; detail: string }>;

function readable(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[._-]/g, " "); }
export function historyEntryId(prefix: string, id: string) { return `${prefix}-entry-${encodeURIComponent(id)}`; }

export function RecordEvidenceStream({ entries, prefix, focusEntryId, atLimit, onLoadMore, notes, onEditNotes }: {
  entries: RecordHistoryEntry[] | undefined;
  prefix: string;
  focusEntryId?: string;
  atLimit?: boolean;
  onLoadMore?: () => void;
  notes?: { description?: string; reasoning?: string; privateNotes?: string };
  onEditNotes?: () => void;
}) {
  const [kind, setKind] = useState("all");
  const [showAll, setShowAll] = useState(Boolean(focusEntryId));
  const stream = useRef<HTMLElement>(null);
  const ordered = [...(entries ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  const kinds = [...new Set(ordered.map(entry => entry.category))];
  const matching = ordered.filter(entry => kind === "all" || entry.category === kind);
  const shown = showAll ? matching : matching.slice(0, 5);
  useEffect(() => {
    if (!focusEntryId) return;
    const target = document.getElementById(historyEntryId(prefix, focusEntryId));
    target?.scrollIntoView?.({ block: "nearest" });
    target?.focus({ preventScroll: true });
  }, [focusEntryId, prefix]);
  const hasNotes = notes?.description || notes?.reasoning || notes?.privateNotes;

  return <section ref={stream} aria-label="Item evidence and history" className="space-y-4">
    {hasNotes ? <div className="border-l-2 border-evidence bg-evidence/5 px-3 py-3">
      <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><MovingSymbol name="note" className="size-4 text-evidence" />Saved with this record</h3>
        {onEditNotes ? <Button type="button" variant="ghost" size="sm" onClick={onEditNotes}>Edit notes</Button> : null}
      </div>
      {notes?.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{notes.description}</p> : null}
      {notes?.reasoning ? <div className="mt-3"><p className="text-xs font-medium text-evidence">Saved reasoning</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{notes.reasoning}</p></div> : null}
      {notes?.privateNotes ? <div className="mt-3"><p className="text-xs font-medium text-muted-foreground">Private notes</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{notes.privateNotes}</p></div> : null}
      <p className="mt-2 text-xs text-muted-foreground">Current saved text. Authorship is recorded separately in the history below.</p>
    </div> : null}

    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2"><h3 className="text-sm font-semibold">Evidence history</h3><span className="font-mono text-xs text-muted-foreground">{entries === undefined ? "Loading" : `${ordered.length} loaded ${ordered.length === 1 ? "entry" : "entries"}`}</span></div>
    {kinds.length ? <div role="group" aria-label="History kinds" className="flex flex-wrap gap-1">
      {["all", ...kinds].map(value => <Button key={value} type="button" variant={kind === value ? "secondary" : "ghost"} size="sm" aria-pressed={kind === value} onClick={() => { setKind(value); setShowAll(false); }}>
        <MovingSymbol name={categorySymbols[value] ?? "note"} className="size-3.5" />{value === "all" ? "All kinds" : readable(value)}
      </Button>)}
    </div> : null}
    {entries === undefined ? <p role="status" className="py-3 text-sm text-muted-foreground">Loading activity.</p> : !matching.length ? <p className="py-3 text-sm text-muted-foreground">No item activity yet.</p> : <ol className="divide-y divide-border">
      {shown.map(entry => {
        const author = authors[entry.actorType];
        return <li key={entry.id} id={historyEntryId(prefix, entry.id)} tabIndex={-1} className="scroll-mt-16 py-3 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
          <div className="flex items-start gap-2.5"><MovingSymbol name={categorySymbols[entry.category] ?? "note"} className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className="text-sm font-medium capitalize">{readable(entry.action)}</p><time dateTime={new Date(entry.createdAt).toISOString()} className="font-mono text-xs text-muted-foreground">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(entry.createdAt)}</time></div>
              <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className={`mt-1 h-7 gap-1 px-1.5 text-xs ${entry.actorType === "agent" ? "bg-accent/10 text-accent" : entry.actorType === "user" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`} aria-label={`Entry author: ${author.label}`} title={author.detail}><MovingSymbol name={author.symbol} className="size-3.5" />{author.label}</Button></PopoverTrigger>
                <PopoverContent align="start" className="text-sm"><p>{author.detail}</p><p className="mt-2 text-xs text-muted-foreground">Original event: {entry.action}</p><p className="mt-2 break-words font-mono text-xs text-muted-foreground">Recorded: {new Date(entry.createdAt).toISOString()}</p></PopoverContent>
              </Popover>
              {entry.summary ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">{entry.summary}</p> : null}
              {entry.changedKeys?.length ? <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">Recorded fields: {entry.changedKeys.map(readable).join(", ")}</p> : null}
            </div>
          </div>
        </li>;
      })}
    </ol>}
    {matching.length > shown.length ? <Button type="button" variant="ghost" size="sm" className="h-auto whitespace-normal text-left" onClick={() => setShowAll(true)}>{matching.length - shown.length} earlier loaded {matching.length - shown.length === 1 ? "entry" : "entries"} · Show all loaded</Button> : null}
    {entries !== undefined && onLoadMore ? <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2"><Button type="button" variant="outline" size="sm" onClick={onLoadMore}>Load up to 50 history entries</Button><span className="text-xs text-muted-foreground">{ordered.length} loaded so far</span></div> : atLimit ? <Badge variant="outline" className="whitespace-normal">Latest 50 entries · older history may exist</Badge> : null}
  </section>;
}

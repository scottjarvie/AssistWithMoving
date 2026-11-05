"use client";

import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MovingSymbol, type MovingSymbolName } from "@/components/moving-symbol";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type MoveWorkspaceTab = {
  value: string;
  label: string;
  description?: string;
  count?: number | string;
  countLabel?: string;
  icon?: MovingSymbolName;
};

const sectionIcons: Record<string, MovingSymbolName> = {
  transport: "truck", trips: "truck", resources: "truck", load: "truck",
  start: "plan", end: "plan", spaces: "plan", layout: "plan", board: "plan",
  people: "people", household: "people", participants: "people", contacts: "people",
  queue: "queue", review: "queue", jobs: "queue",
  ai: "ai", suggestions: "ai", "ai-suggestions": "ai",
  items: "box", boxes: "box", units: "box", inventory: "box",
  defaults: "settings", details: "settings", configure: "settings",
  claims: "source", evidence: "source", coverage: "source",
  upload: "camera", photos: "camera", overview: "note",
};
function sectionIcon(value: string): MovingSymbolName { return sectionIcons[value] ?? "note"; }

export function MoveWorkspaceTabList({
  tabs,
  activeValue,
  ariaLabel = "Workspace task views",
  sticky = false,
}: {
  tabs: MoveWorkspaceTab[];
  activeValue?: string;
  ariaLabel?: string;
  sticky?: boolean | "below-operations";
}) {
  const activeTab = tabs.find((tab) => tab.value === activeValue);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const contentsTarget = useRef<string | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);

  return (
    <>
    <div className={sticky ? `sticky top-(--workspace-navigation-offset) z-10 bg-background pb-2 ${sticky === "below-operations" ? "sm:top-[calc(var(--workspace-navigation-offset,4rem)+2.75rem)]" : ""}` : undefined} data-moving-sections>
      <div className="flex min-w-0 items-start gap-2 border-b border-border bg-background py-1">
        <div className="moving-section-strip min-w-0 flex-1 overflow-x-auto pb-1">
        <TabsList variant="line" className="h-11! min-w-max justify-start sm:h-9!" aria-label={ariaLabel}>
          {tabs.map((tab) => {
            const hasCount = tab.count !== undefined;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                ref={element => { if (element) triggers.current.set(tab.value, element); else triggers.current.delete(tab.value); }}
                className={hasCount ? "gap-2" : undefined}
                aria-label={
                  hasCount
                    ? `${tab.label}: ${tab.countLabel ?? tab.count}`
                    : undefined
                }
              >
                <MovingSymbol name={tab.icon ?? sectionIcon(tab.value)} className="size-4 shrink-0" />
                {tab.label}
                {hasCount ? (
                  <Badge
                    variant={
                      activeValue === tab.value ? "secondary" : "outline"
                    }
                    className="h-5 min-w-5 px-1"
                  >
                    {tab.count}
                  </Badge>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
        </div>
        <Popover open={contentsOpen} onOpenChange={setContentsOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0 sm:min-h-9" aria-label={`All ${tabs.length} sections`}>
              <MovingSymbol name="contents" className="size-3.5" />All {tabs.length}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))]" onCloseAutoFocus={event => {
            const target = contentsTarget.current;
            if (target) { event.preventDefault(); triggers.current.get(target)?.focus(); contentsTarget.current = null; }
          }}>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Contents</p>
            <div aria-label={`${ariaLabel} contents`} className="grid grid-cols-2 gap-1">
              {tabs.map(tab => <Button key={tab.value} type="button" variant={activeValue === tab.value ? "secondary" : "ghost"} className="min-h-11 justify-start whitespace-normal text-left" aria-label={`${tab.label}${tab.count !== undefined ? `: ${tab.countLabel ?? tab.count}` : ""}`} aria-pressed={activeValue === tab.value} onClick={() => { contentsTarget.current = tab.value; setContentsOpen(false); }}>
                <MovingSymbol name={tab.icon ?? sectionIcon(tab.value)} className="size-4 shrink-0" />
                <span>{tab.label}{tab.count !== undefined ? <span className="ml-2 font-mono text-xs text-muted-foreground">{tab.count}</span> : null}</span>
              </Button>)}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
      {activeTab?.description ? (
        <p className="text-sm text-muted-foreground">{activeTab.description}</p>
      ) : null}
    </>
  );
}

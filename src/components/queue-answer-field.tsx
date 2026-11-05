"use client";

import { createContext, useContext, useId } from "react";
import type { QueueDeskItem } from "@/components/queue-experience";
import { MovingSymbol } from "@/components/moving-symbol";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const QueueAnswerContext = createContext<{
  getResponse: (item: QueueDeskItem) => string;
  onResponseChange: (item: QueueDeskItem, value: string) => void;
  onProvideInput: (item: QueueDeskItem, value: string) => void;
  busy: boolean;
} | null>(null);

/** Stable component identity keeps a typed answer mounted inside sorted cells. */
export function QueueAnswerField({ item, includeDirective = true }: { item: QueueDeskItem; includeDirective?: boolean }) {
  const context = useContext(QueueAnswerContext);
  const id = useId();
  if (!context || item.source !== "handoff" || item.state !== "needsYou") return null;
  const response = context.getResponse(item);
  return <form className="space-y-2" onSubmit={event => { event.preventDefault(); context.onProvideInput(item, response); }}>
    <label htmlFor={id} className="text-xs font-medium">Your answer{includeDirective ? <span className="sr-only"> for {item.directive}</span> : null}</label>
    <div className="flex items-end gap-2">
      <Textarea id={id} value={response} onChange={event => context.onResponseChange(item, event.target.value)} maxLength={4000} className="min-h-11 min-w-0 flex-1" placeholder="The smallest answer needed" disabled={context.busy} />
      <Button type="submit" variant="outline" size="sm" className="min-h-11 shrink-0 sm:min-h-8" disabled={context.busy || !response.trim()}><MovingSymbol name={context.busy ? "reset" : "arrow"} className={context.busy ? "animate-spin" : undefined} />Send answer</Button>
    </div>
  </form>;
}

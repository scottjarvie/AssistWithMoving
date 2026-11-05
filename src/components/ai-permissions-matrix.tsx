"use client";

import type { BoundaryScope, GrantRow } from "@/components/ai-connection-manager";
import { MovingSymbol } from "@/components/moving-symbol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** A read-only view of the server's actual grants, never an access editor. */
export function AiPermissionsMatrix({ grants, abilities, recentRefusals, onReview, onRevoke, onOpenActivity, detailsPrefix, reviewingId }: {
  grants: GrantRow[];
  abilities: BoundaryScope[];
  recentRefusals: ReadonlySet<string>;
  onReview: (id: string) => void;
  onRevoke: (id: string) => void;
  onOpenActivity: () => void;
  detailsPrefix: string;
  reviewingId: string | null;
}) {
  return <table role="table" aria-label="AI connection permissions" className="block w-full border-separate border-spacing-0 text-sm lg:table lg:table-fixed">
    <caption className="caption-bottom pb-2 text-left text-xs leading-5 text-muted-foreground">Approvals describe this grant only. Expired and revoked grants retain their history. Open a connection to see its approved wording, move names, usage and revocation controls.</caption>
    <thead role="rowgroup" className="hidden lg:table-header-group"><tr role="row">
      <th scope="col" className="w-56 border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground">Connection</th>
      {abilities.map(ability => <th key={ability.scope} scope="col" aria-label={ability.label} className="border-b border-border p-1 text-left align-top">
        <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="h-auto min-h-9 w-full justify-start whitespace-normal break-words text-left text-xs" aria-label={`About ${ability.label}`}>{ability.label}<MovingSymbol name="source" className="size-3 shrink-0" /></Button></PopoverTrigger>
          <PopoverContent className="text-sm"><p className="font-semibold">{ability.label}</p><p className="mt-2 leading-6">{ability.grants}</p><p className="mt-2 leading-6 text-muted-foreground">{ability.doesNotImply}</p></PopoverContent>
        </Popover>
      </th>)}
      <th scope="col" className="w-24 border-b border-border p-2 text-left text-xs font-medium text-muted-foreground">Actions</th>
    </tr></thead>
    <tbody role="rowgroup" className="block space-y-3 lg:table-row-group lg:space-y-0">{grants.map(grant => {
      const refused = recentRefusals.has(String(grant.grantId));
      const approved = abilities.filter(ability => grant.scopes.includes(ability.scope));
      return <tr role="row" key={String(grant.grantId)} className={`grid grid-cols-1 rounded-md border border-border bg-card lg:table-row lg:rounded-none lg:border-0 ${refused ? "ring-1 ring-accent/40 lg:ring-0" : ""}`}>
        <th role="rowheader" scope="row" className="border-b border-border px-3 py-3 text-left align-top font-normal">
          <div className="flex flex-wrap items-center gap-2"><span className="break-words font-semibold">{grant.label}</span><Badge variant={grant.status === "active" ? "secondary" : "outline"}>{grant.status === "active" ? "Active" : grant.status === "expired" ? "Expired" : "Revoked"}</Badge></div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{grant.status === "active" ? `${approved.length} of ${abilities.length} abilities approved` : "No current access through this grant"} · {grant.moveScope === "allMoves" ? "all your moves" : `${grant.moveIds.length} selected ${grant.moveIds.length === 1 ? "move" : "moves"}`}</p>
          {refused ? <Button type="button" size="sm" variant="link" className="mt-1 h-auto whitespace-normal px-0 text-left text-xs text-accent" onClick={onOpenActivity}><MovingSymbol name="ai" className="size-3" />Recent refused request · see Activity</Button> : null}
        </th>
        {abilities.map(ability => {
          const approved = grant.scopes.includes(ability.scope);
          return <td role="cell" key={ability.scope} className="flex items-start justify-between gap-3 border-b border-border px-3 py-2 align-top lg:table-cell lg:py-3">
            <Popover><PopoverTrigger asChild><Button type="button" size="sm" variant="ghost" className="h-auto min-h-9 min-w-0 flex-1 justify-start whitespace-normal text-left text-xs lg:hidden" aria-label={`About ${ability.label}`}>{ability.label}<MovingSymbol name="source" className="size-3 shrink-0" /></Button></PopoverTrigger><PopoverContent className="text-sm"><p className="font-semibold">{ability.label}</p><p className="mt-2 leading-6">{ability.grants}</p><p className="mt-2 leading-6 text-muted-foreground">{ability.doesNotImply}</p></PopoverContent></Popover>
            <span className={`inline-flex min-h-9 shrink-0 items-center gap-1 text-xs lg:min-h-0 ${approved && grant.status === "active" ? "text-success" : "text-muted-foreground"}`}><MovingSymbol name={approved ? "source" : "close"} className="size-3.5" />{approved ? grant.status === "active" ? "Approved" : "Previously approved" : "Not approved"}</span>
          </td>;
        })}
        <td role="cell" className="px-3 py-2 align-top lg:border-b lg:border-border lg:py-3"><div className="flex gap-1"><Button type="button" variant="ghost" size="sm" className="min-h-11 lg:min-h-8" aria-label={`Review ${grant.label}`} data-connection-review={String(grant.grantId)} aria-expanded={reviewingId === String(grant.grantId)} aria-controls={`${detailsPrefix}-${grant.grantId}`} onClick={() => onReview(String(grant.grantId))}><MovingSymbol name="note" className="size-4" /><span className="lg:sr-only">Review connection</span></Button>{grant.status === "active" ? <Button type="button" variant="ghost" size="icon-touch" className="text-destructive lg:size-8" aria-label={`Revoke ${grant.label}`} onClick={() => onRevoke(String(grant.grantId))}><MovingSymbol name="close" className="size-4" /></Button> : null}</div></td>
      </tr>;
    })}</tbody>
  </table>;
}

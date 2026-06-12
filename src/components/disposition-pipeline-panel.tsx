"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  Archive,
  ClipboardList,
  Gift,
  PackageCheck,
  Tags,
  Trash2,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  buildSubManifestPath,
  formatSubManifestCurrency,
} from "@/lib/sub-manifest";
import { cn } from "@/lib/utils";

type DispositionPipelinePanelProps = {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
};

type Summary = NonNullable<
  ReturnType<typeof useQuery<typeof api.dispositionPipelines.summaryForMove>>
>;
type PipelineGroup = Summary["groups"][number];
type PipelineAction = PipelineGroup["actions"][number];

const actionClasses: Record<PipelineAction["severity"], string> = {
  ok: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  info: "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300",
  warning:
    "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  critical:
    "border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300",
};

const groupIcons: Record<PipelineGroup["key"], typeof Tags> = {
  sell: Tags,
  free: Gift,
  donate: PackageCheck,
  dump: Trash2,
  storage: Archive,
};

const dispositionTabs = [
  { value: "actions", label: "Actions" },
  { value: "summary", label: "Summary" },
  { value: "shortcuts", label: "Shortcuts" },
  { value: "sellFree", label: "Sell / free" },
  { value: "donate", label: "Donation" },
  { value: "dump", label: "Dump" },
  { value: "storage", label: "Storage" },
] as const;

export function DispositionPipelinePanel({
  householdId,
  moveId,
}: DispositionPipelinePanelProps) {
  const summary = useQuery(
    api.dispositionPipelines.summaryForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const groupByKey = new Map(summary?.groups.map((group) => [group.key, group]));

  return (
    <Card id="disposition-pipelines">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-4 text-primary" aria-hidden="true" />
              Disposition pipelines
            </CardTitle>
            <CardDescription>
              Action queues for sale, giveaway, donation, dump, and storage
              items before they leave the house.
            </CardDescription>
          </div>
          {summary ? (
            <Badge variant={summary.counts.actionCount ? "secondary" : "outline"}>
              {summary.counts.actionCount
                ? `${summary.counts.actionCount} open queues`
                : "clear"}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary === undefined ? (
          <LoadingState />
        ) : summary.counts.itemCount === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No sell, donate, free, dump, or storage items yet. Set item
            dispositions in Inventory to start these workflows.
          </div>
        ) : (
          <Tabs defaultValue="actions" className="gap-4">
            <MoveWorkspaceTabList tabs={[...dispositionTabs]} />

            <TabsContent value="actions" className="space-y-4">
              {summary.topActions.length ? (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {summary.topActions.map((action) => (
                    <Link
                      key={`${action.groupKey}-${action.key}`}
                      href={action.anchor}
                      className={cn(
                        "rounded-md border p-3 transition-colors hover:bg-muted/70",
                        actionClasses[action.severity]
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">
                          {action.groupLabel}: {action.label}
                        </span>
                        <span className="font-mono text-2xl font-semibold leading-none">
                          {action.count}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs opacity-80">
                        {action.help}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
                  <div className="font-medium text-foreground">
                    No disposition actions are currently open.
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Pipeline items are photographed, boxed, assigned, shared, or
                    completed for their current dispositions.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="summary" className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <Metric label="Pipeline items" value={summary.counts.itemCount} />
                <Metric label="Quantity" value={summary.counts.quantity} />
                <Metric label="Ready now" value={summary.counts.readyCount} />
                <Metric
                  label="Share links"
                  value={summary.counts.activeShareLinkCount}
                />
                <Metric
                  label="Owner value"
                  value={formatSubManifestCurrency(summary.counts.totalValueCents)}
                />
              </div>
            </TabsContent>

            <TabsContent value="shortcuts" className="space-y-4">
              <div className="rounded-md border border-border p-3">
                <p className="text-sm font-medium">Go fix disposition inputs</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Disposition queues come from item records, photo evidence,
                  box assignments, load planning, and packet links.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href="#inventory">Inventory</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="#photos">Photos</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="#load-plan">Load planner</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="#documentation-packets">Packet links</Link>
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="sellFree">
              <PipelineTabContent
                groups={[groupByKey.get("sell"), groupByKey.get("free")]}
                householdId={householdId}
                moveId={moveId}
                emptyLabel="No sell or giveaway items yet."
              />
            </TabsContent>

            <TabsContent value="donate">
              <PipelineTabContent
                groups={[groupByKey.get("donate")]}
                householdId={householdId}
                moveId={moveId}
                emptyLabel="No donation items yet."
              />
            </TabsContent>

            <TabsContent value="dump">
              <PipelineTabContent
                groups={[groupByKey.get("dump")]}
                householdId={householdId}
                moveId={moveId}
                emptyLabel="No dump-run items yet."
              />
            </TabsContent>

            <TabsContent value="storage">
              <PipelineTabContent
                groups={[groupByKey.get("storage")]}
                householdId={householdId}
                moveId={moveId}
                emptyLabel="No storage inventory items yet."
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineTabContent({
  groups,
  householdId,
  moveId,
  emptyLabel,
}: {
  groups: Array<PipelineGroup | undefined>;
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  emptyLabel: string;
}) {
  const visibleGroups = groups.filter(
    (group): group is PipelineGroup => Boolean(group)
  );
  const activeGroups = visibleGroups.filter((group) => group.itemCount > 0);

  if (!activeGroups.length) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {activeGroups.map((group) => (
        <PipelineCard
          key={group.key}
          group={group}
          householdId={householdId}
          moveId={moveId}
        />
      ))}
    </div>
  );
}

function PipelineCard({
  group,
  householdId,
  moveId,
}: {
  group: PipelineGroup;
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const Icon = groupIcons[group.key];
  const manifestPath =
    householdId && moveId && group.manifestKind
      ? buildSubManifestPath({
          householdId,
          moveId,
          kind: group.manifestKind,
          mode: "recipient",
        })
      : null;

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="size-4 text-primary" aria-hidden="true" />
            <p className="font-medium">{group.label}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {group.description}
          </p>
        </div>
        <Badge variant={group.itemCount ? "secondary" : "outline"}>
          {group.itemCount} items
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <MiniMetric label="Ready" value={group.readyCount} />
        <MiniMetric label="Photos" value={group.photoCount} />
        <MiniMetric label="Boxed" value={group.boxedCount} />
        <MiniMetric label="Assigned" value={group.assignedCount} />
      </div>

      <div className="mt-3 space-y-1.5">
        {group.actions.map((action) => (
          <Link
            key={action.key}
            href={action.anchor}
            className="flex items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2 text-sm hover:bg-muted"
          >
            <span className="min-w-0 truncate text-muted-foreground">
              {action.label}
            </span>
            <Badge
              variant={action.count ? "secondary" : "outline"}
              className="shrink-0"
            >
              {action.count}
            </Badge>
          </Link>
        ))}
      </div>

      {group.highlights.length ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Next records
          </p>
          {group.highlights.map((item) => (
            <div
              key={item.itemId}
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[item.room, item.category].filter(Boolean).join(" - ") ||
                      "No room or category"}
                  </div>
                </div>
                <Badge variant="outline">{item.status}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge variant={item.hasPhoto ? "outline" : "secondary"}>
                  {item.hasPhoto ? "photo" : "needs photo"}
                </Badge>
                <Badge variant={item.boxed ? "outline" : "secondary"}>
                  {item.boxed ? "boxed" : "unboxed"}
                </Badge>
                <Badge
                  variant={item.assignedToPipeline ? "outline" : "secondary"}
                >
                  {item.assignedToPipeline ? "assigned" : "unassigned"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {group.activeProfileCount ? (
            <Badge variant="outline">{group.activeProfileCount} profiles</Badge>
          ) : null}
          {group.activeShareLinkCount ? (
            <Badge variant="outline">
              {group.activeShareLinkCount} share links
            </Badge>
          ) : null}
        </div>
        {manifestPath ? (
          <Button asChild size="sm" variant="outline">
            <Link href={manifestPath}>Manifest</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-36 rounded-md" />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-normal">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <p className="text-[0.7rem] uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

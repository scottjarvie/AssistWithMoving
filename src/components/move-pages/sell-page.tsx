"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BadgeDollarSign, Camera, RefreshCw, SearchCheck } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type SellRows = FunctionReturnType<typeof api.saleListings.listForMove>;
type SellRow = SellRows[number];
type SellFilterKey = "all" | "drafts" | "needsPhotos" | "researched" | "listed";
type SellRowTask = "overview" | "pricing" | "listing" | "status";

const sellFilters: Array<{
  key: SellFilterKey;
  label: string;
  description: string;
}> = [
  {
    key: "all",
    label: "All",
    description: "Every inventory item marked sell.",
  },
  {
    key: "drafts",
    label: "Drafts",
    description: "Items still being prepared, priced, or drafted.",
  },
  {
    key: "needsPhotos",
    label: "Needs photos",
    description: "Listings that need more photo evidence before posting.",
  },
  {
    key: "researched",
    label: "Researched",
    description: "Items with at least one pricing source.",
  },
  {
    key: "listed",
    label: "Listed",
    description: "Listings already posted or handling buyer interest.",
  },
];

const sellRowTasks: Array<{ value: SellRowTask; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "pricing", label: "Pricing" },
  { value: "listing", label: "Listing copy" },
  { value: "status", label: "Status" },
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatCurrency(cents: number | undefined) {
  return cents === undefined ? "Unset" : currencyFormatter.format(cents / 100);
}

function parseDollars(value: string) {
  const parsed = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

function researchBadgeVariant(depth: SellRow["researchDepth"]) {
  if (depth === "deep" || depth === "standard") return "secondary";
  if (depth === "quick") return "outline";
  return "destructive";
}

function filterSellRows(rows: SellRow[], filter: SellFilterKey) {
  switch (filter) {
    case "drafts":
      return rows.filter((row) =>
        ["needsPrep", "researchingPrice", "draftReady"].includes(row.status)
      );
    case "needsPhotos":
      return rows.filter((row) => row.needsMorePhotos);
    case "researched":
      return rows.filter((row) => row.researchSourceCount > 0);
    case "listed":
      return rows.filter((row) =>
        ["listed", "interestReceived", "offerPending"].includes(row.status)
      );
    case "all":
    default:
      return rows;
  }
}

export function SellWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();
  const rows = useQuery(
    api.saleListings.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const ensureListings = useMutation(api.saleListings.ensureForMove);
  const [message, setMessage] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<SellFilterKey>("all");
  const [activeTask, setActiveTask] = useState<SellRowTask>("overview");

  useEffect(() => {
    if (!householdId || !moveId || rows === undefined) return;
    const missing = rows.some((row) => !row.listing);
    if (!missing) return;
    void ensureListings({ householdId, moveId }).catch(() => {
      setMessage("Could not sync sell listings yet.");
    });
  }, [ensureListings, householdId, moveId, rows]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      total: all.length,
      needsPhotos: all.filter((row) => row.needsMorePhotos).length,
      researched: all.filter((row) => row.researchSourceCount > 0).length,
      drafts: all.filter((row) =>
        ["needsPrep", "researchingPrice", "draftReady"].includes(row.status)
      ).length,
      activeListings: all.filter((row) =>
        ["listed", "interestReceived", "offerPending"].includes(row.status)
      ).length,
    };
  }, [rows]);
  const activeRows = useMemo(
    () => filterSellRows(rows ?? [], activeFilter),
    [activeFilter, rows]
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Sell"
        description="Marketplace prep for inventory marked sell: photos, price research, listing draft, status, and buyer follow-up."
      />

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="All"
          value={counts.total}
          active={activeFilter === "all"}
          onClick={() => setActiveFilter("all")}
        />
        <Metric
          label="Drafts"
          value={counts.drafts}
          active={activeFilter === "drafts"}
          onClick={() => setActiveFilter("drafts")}
        />
        <Metric
          label="Needs photos"
          value={counts.needsPhotos}
          active={activeFilter === "needsPhotos"}
          onClick={() => setActiveFilter("needsPhotos")}
        />
        <Metric
          label="Researched"
          value={counts.researched}
          active={activeFilter === "researched"}
          onClick={() => setActiveFilter("researched")}
        />
        <Metric
          label="Listed"
          value={counts.activeListings}
          active={activeFilter === "listed"}
          onClick={() => setActiveFilter("listed")}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BadgeDollarSign className="size-4 text-primary" aria-hidden="true" />
                Sale pipeline
              </CardTitle>
              <CardDescription>
                {sellFilters.find((filter) => filter.key === activeFilter)
                  ?.description ??
                  "Facebook Marketplace is the default draft format."}
              </CardDescription>
            </div>
            {householdId && moveId ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void ensureListings({ householdId, moveId })
                    .then((ids) =>
                      setMessage(
                        ids.length
                          ? `${ids.length} sale listings created.`
                          : "Sell listings are synced.",
                      ),
                    )
                    .catch(() => setMessage("Could not sync sell listings yet."))
                }
              >
                <RefreshCw className="mr-2 size-4" aria-hidden="true" />
                Sync
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {message ? (
            <div className="rounded-md border border-border bg-muted/35 px-3 py-2 text-sm">
              {message}
            </div>
          ) : null}
          {rows === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-md" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No inventory is marked sell yet. Change an item disposition to
              sell and it will appear here.
            </div>
          ) : (
            <Tabs
              value={activeTask}
              onValueChange={(value) => setActiveTask(value as SellRowTask)}
              className="gap-3"
            >
              <MoveWorkspaceTabList tabs={sellRowTasks} />
              <TabsContent value={activeTask} className="space-y-2">
                {activeRows.length ? (
                  activeRows.map((row) => (
                    <SellRowEditor
                      key={row.item._id}
                      householdId={householdId}
                      moveId={moveId}
                      row={row}
                      task={activeTask}
                      onMessage={setMessage}
                    />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No sale listings match this view yet.
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SellRowEditor({
  householdId,
  moveId,
  row,
  task,
  onMessage,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  row: SellRow;
  task: SellRowTask;
  onMessage: (message: string | null) => void;
}) {
  const upsert = useMutation(api.saleListings.upsertForItem);
  const listing = row.listing;
  const [officialPrice, setOfficialPrice] = useState(
    listing?.officialPriceCents !== undefined
      ? String(Math.round(listing.officialPriceCents / 100))
      : "",
  );
  const [lowPrice, setLowPrice] = useState(
    listing?.suggestedPriceLowCents !== undefined
      ? String(Math.round(listing.suggestedPriceLowCents / 100))
      : "",
  );
  const [highPrice, setHighPrice] = useState(
    listing?.suggestedPriceHighCents !== undefined
      ? String(Math.round(listing.suggestedPriceHighCents / 100))
      : "",
  );
  const [description, setDescription] = useState(
    listing?.listingDescription ?? row.item.description ?? "",
  );
  const [saving, setSaving] = useState(false);

  async function saveDraft(status?: SellRow["status"]) {
    if (!householdId || !moveId) return;
    setSaving(true);
    onMessage(null);
    try {
      await upsert({
        householdId,
        moveId,
        itemId: row.item._id,
        status: status ?? listing?.status ?? "draftReady",
        platform: listing?.platform ?? "facebookMarketplace",
        listingTitle: listing?.listingTitle ?? row.item.name,
        listingDescription:
          description ||
          `${row.item.name}${row.item.room ? ` from ${row.item.room}` : ""}.`,
        suggestedPriceLowCents: lowPrice ? parseDollars(lowPrice) : undefined,
        suggestedPriceHighCents: highPrice ? parseDollars(highPrice) : undefined,
        officialPriceCents: officialPrice ? parseDollars(officialPrice) : undefined,
        pricingConfidence:
          lowPrice || highPrice || officialPrice ? "manual" : "none",
        priceDecisionSource:
          lowPrice || highPrice || officialPrice
            ? "User-entered sale workflow price."
            : undefined,
        userOverrodePrice: Boolean(officialPrice),
        needsMorePhotos: row.photoCount < 3,
      });
      onMessage("Sale listing saved.");
    } catch {
      onMessage("Could not save sale listing yet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{row.item.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {[row.item.room, row.item.category, row.item.condition]
              .filter(Boolean)
              .join(" - ") || "No room/category yet"}
          </p>
        </div>
        <Badge variant={row.status === "listed" ? "secondary" : "outline"}>
          {row.status}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <MiniMetric
          label="Official"
          value={formatCurrency(listing?.officialPriceCents)}
        />
        <MiniMetric
          label="Range"
          value={`${formatCurrency(listing?.suggestedPriceLowCents)} - ${formatCurrency(
            listing?.suggestedPriceHighCents,
          )}`}
        />
        <MiniMetric
          label="Photos"
          value={`${row.photoCount}${row.needsMorePhotos ? " / needs more" : ""}`}
          icon={Camera}
        />
        <MiniMetric
          label="Research"
          value={`${row.researchDepth} / ${row.researchSourceCount} src`}
          icon={SearchCheck}
          badgeVariant={researchBadgeVariant(row.researchDepth)}
        />
      </div>

      <div className="mt-3">
        {task === "overview" ? (
          <div className="rounded-md border border-border bg-muted/25 p-3 text-sm">
            <p className="line-clamp-3 text-muted-foreground">
              {description ||
                `${row.item.name}${row.item.room ? ` from ${row.item.room}` : ""}.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {row.needsMorePhotos ? (
                <Badge variant="secondary">needs photos</Badge>
              ) : (
                <Badge variant="outline">photos ready</Badge>
              )}
              <Badge variant={researchBadgeVariant(row.researchDepth)}>
                {row.researchDepth === "none" ? "unresearched" : "researched"}
              </Badge>
              <Badge variant={row.status === "listed" ? "secondary" : "outline"}>
                {row.status === "listed" ? "listed" : "not listed"}
              </Badge>
            </div>
          </div>
        ) : null}

        {task === "pricing" ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                inputMode="decimal"
                aria-label={`${row.item.name} low suggested price`}
                placeholder="Low $"
                value={lowPrice}
                onChange={(event) => setLowPrice(event.target.value)}
              />
              <Input
                inputMode="decimal"
                aria-label={`${row.item.name} high suggested price`}
                placeholder="High $"
                value={highPrice}
                onChange={(event) => setHighPrice(event.target.value)}
              />
              <Input
                inputMode="decimal"
                aria-label={`${row.item.name} official price`}
                placeholder="Official $"
                value={officialPrice}
                onChange={(event) => setOfficialPrice(event.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void saveDraft("draftReady")}
              >
                Save pricing
              </Button>
            </div>
          </div>
        ) : null}

        {task === "listing" ? (
          <div className="space-y-3">
            <Textarea
              aria-label={`${row.item.name} listing description`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Marketplace description"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void saveDraft("draftReady")}
              >
                Save listing copy
              </Button>
            </div>
          </div>
        ) : null}

        {task === "status" ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <MiniMetric label="Current" value={row.status} />
              <MiniMetric
                label="Photos"
                value={row.needsMorePhotos ? "needs more" : "ready"}
                icon={Camera}
              />
              <MiniMetric
                label="Research"
                value={`${row.researchSourceCount} sources`}
                icon={SearchCheck}
                badgeVariant={researchBadgeVariant(row.researchDepth)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => void saveDraft("draftReady")}
              >
                Keep as draft
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => void saveDraft("listed")}
              >
                Mark listed
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-md border p-3 text-left transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-muted"
      }`}
      aria-pressed={active}
      onClick={onClick}
    >
      <p
        className={`text-xs ${
          active ? "text-primary-foreground/80" : "text-muted-foreground"
        }`}
      >
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-normal">
        {value.toLocaleString()}
      </p>
    </button>
  );
}

function MiniMetric({
  label,
  value,
  icon: Icon,
  badgeVariant = "outline",
}: {
  label: string;
  value: string;
  icon?: typeof Camera;
  badgeVariant?: "outline" | "secondary" | "destructive";
}) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <p className="flex items-center gap-1 text-[0.7rem] uppercase text-muted-foreground">
        {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
        {label}
      </p>
      <Badge variant={badgeVariant} className="mt-1 max-w-full truncate">
        {value}
      </Badge>
    </div>
  );
}

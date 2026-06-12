"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, PackagePlus, ShoppingBag, Tag, Trash2 } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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
import {
  parseOptionalCurrencyCents,
  parseOptionalNumber,
} from "@/lib/inventory-detail";

type PlannedItem = FunctionReturnType<typeof api.plannedItems.listForMove>[number];
type PlannedItemStatus = PlannedItem["status"];
type PlannedItemFilter =
  | "needsDecision"
  | "all"
  | "idea"
  | "decided"
  | "purchased"
  | "dropped";

const plannedItemStatuses: PlannedItemStatus[] = [
  "idea",
  "decided",
  "purchased",
  "dropped",
];

const plannedItemFilters: Array<{ value: PlannedItemFilter; label: string }> = [
  { value: "needsDecision", label: "Needs decision" },
  { value: "all", label: "All" },
  { value: "idea", label: "Ideas" },
  { value: "decided", label: "Decided" },
  { value: "purchased", label: "Purchased" },
  { value: "dropped", label: "Dropped" },
];

function formatPrice(cents: number | undefined) {
  if (cents === undefined) return "No price";
  return `$${(cents / 100).toFixed(2)}`;
}

function dimensionsLabel(item: PlannedItem) {
  const dimensions = item.dimensionsIn;
  if (!dimensions) return "No size";
  return [dimensions.lengthIn, dimensions.widthIn, dimensions.heightIn]
    .filter((value): value is number => typeof value === "number")
    .map((value) => `${value}"`)
    .join(" x ") || "No size";
}

export function PlannedItemsPanel({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [lengthIn, setLengthIn] = useState("");
  const [widthIn, setWidthIn] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [url, setUrl] = useState("");
  const [priority, setPriority] = useState("2");
  const [message, setMessage] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [plannedFilter, setPlannedFilter] =
    useState<PlannedItemFilter>("needsDecision");

  const plannedItems = useQuery(
    api.plannedItems.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const createPlannedItem = useMutation(api.plannedItems.create);
  const updatePlannedItem = useMutation(api.plannedItems.update);
  const archivePlannedItem = useMutation(api.plannedItems.archive);
  const convertPlannedItem = useMutation(api.plannedItems.convertToOwned);

  const activePlannedItems = useMemo(
    () => (plannedItems ?? []).filter((item) => !item.archivedAt),
    [plannedItems],
  );
  const filteredPlannedItems = useMemo(
    () =>
      activePlannedItems.filter((item) =>
        matchesPlannedItemFilter(item, plannedFilter),
      ),
    [activePlannedItems, plannedFilter],
  );
  const filterCounts = useMemo(
    () =>
      plannedItemFilters.reduce<Record<PlannedItemFilter, number>>(
        (counts, filter) => {
          counts[filter.value] =
            filter.value === "all"
              ? activePlannedItems.length
              : activePlannedItems.filter((item) =>
                  matchesPlannedItemFilter(item, filter.value),
                ).length;
          return counts;
        },
        {} as Record<PlannedItemFilter, number>,
      ),
    [activePlannedItems],
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId || !moveId || !name.trim()) return;

    const compactDimensions: {
      lengthIn?: number;
      widthIn?: number;
      heightIn?: number;
    } = {};
    const parsedLengthIn = parseOptionalNumber(lengthIn);
    const parsedWidthIn = parseOptionalNumber(widthIn);
    const parsedHeightIn = parseOptionalNumber(heightIn);
    if (parsedLengthIn !== undefined) compactDimensions.lengthIn = parsedLengthIn;
    if (parsedWidthIn !== undefined) compactDimensions.widthIn = parsedWidthIn;
    if (parsedHeightIn !== undefined) compactDimensions.heightIn = parsedHeightIn;

    setMessage(null);
    try {
      await createPlannedItem({
        householdId,
        moveId,
        name,
        category: category || undefined,
        dimensionsIn: Object.keys(compactDimensions).length
          ? compactDimensions
          : undefined,
        dimensionsConfidence: Object.keys(compactDimensions).length
          ? "medium"
          : undefined,
        estimatedPriceCents: parseOptionalCurrencyCents(priceDollars),
        url: url || undefined,
        priority: parseOptionalNumber(priority),
        status: "idea",
      });
      setName("");
      setCategory("");
      setLengthIn("");
      setWidthIn("");
      setHeightIn("");
      setPriceDollars("");
      setUrl("");
      setPriority("2");
      setPlannedFilter("needsDecision");
      setShowAddForm(false);
      setMessage("Planned item added.");
    } catch {
      setMessage("Could not add that planned item yet.");
    }
  }

  async function updateStatus(item: PlannedItem, status: PlannedItemStatus) {
    if (!householdId || !moveId) return;
    await updatePlannedItem({
      householdId,
      moveId,
      plannedItemId: item._id,
      status,
    });
  }

  async function archiveItem(item: PlannedItem) {
    if (!householdId || !moveId) return;
    await archivePlannedItem({ householdId, moveId, plannedItemId: item._id });
    setMessage("Planned item archived.");
  }

  async function convertItem(item: PlannedItem) {
    if (!householdId || !moveId) return;
    const result = await convertPlannedItem({
      householdId,
      moveId,
      plannedItemId: item._id,
    });
    setMessage(
      `Converted to owned inventory. ${result.reparentedPlacementCount} plan placements updated.`,
    );
  }

  return (
    <Card id="planned-items">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tag className="size-5 text-primary" aria-hidden="true" />
              Planned items
            </CardTitle>
            <CardDescription>
              Future purchases for the destination home. These can appear on
              Layout Studio without entering owned inventory totals.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{activePlannedItems.length} planned</Badge>
            <Button
              type="button"
              size="sm"
              variant={showAddForm ? "secondary" : "outline"}
              disabled={!moveId}
              aria-expanded={showAddForm}
              onClick={() => setShowAddForm((current) => !current)}
            >
              <PackagePlus aria-hidden="true" />
              Add planned
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {plannedItems === undefined && moveId ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-5/6" />
          </div>
        ) : activePlannedItems.length ? (
          <div className="space-y-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
              {plannedItemFilters.map((filter) => (
                <Button
                  key={filter.value}
                  type="button"
                  size="sm"
                  className="h-10 shrink-0"
                  variant={
                    plannedFilter === filter.value ? "default" : "outline"
                  }
                  aria-label={`${filter.label} ${filterCounts[filter.value] ?? 0}`}
                  onClick={() => setPlannedFilter(filter.value)}
                >
                  {filter.label}
                  <Badge variant="secondary">
                    {filterCounts[filter.value] ?? 0}
                  </Badge>
                </Button>
              ))}
            </div>

            {filteredPlannedItems.length ? (
              <div
                className="grid gap-2"
                role="list"
                aria-label="Planned item cards"
              >
                {filteredPlannedItems.map((item) => (
                  <div
                    key={item._id}
                    role="listitem"
                    className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[minmax(0,1fr)_130px_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ShoppingBag
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <p className="truncate font-medium">{item.name}</p>
                        <Badge variant="secondary">{item.status}</Badge>
                        {item.convertedItemId ? (
                          <Badge variant="outline">owned</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[
                          item.category,
                          dimensionsLabel(item),
                          formatPrice(item.estimatedPriceCents),
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      </p>
                      {item.url ? (
                        <a
                          className="mt-1 block truncate text-sm text-primary underline-offset-4 hover:underline"
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.url}
                        </a>
                      ) : null}
                    </div>
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={item.status}
                      aria-label={`Status for ${item.name}`}
                      onChange={(event) =>
                        void updateStatus(
                          item,
                          event.target.value as PlannedItemStatus,
                        )
                      }
                    >
                      {plannedItemStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={Boolean(item.convertedItemId)}
                        onClick={() => void convertItem(item)}
                      >
                        <Check aria-hidden="true" />
                        Own it
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void archiveItem(item)}
                      >
                        <Trash2 aria-hidden="true" />
                        Archive
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No planned items match this status filter.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Add future furniture, appliances, or purchases here before they
            become owned inventory.
          </div>
        )}

        {showAddForm ? (
          <form
            className="space-y-3 rounded-md border border-border bg-muted/20 p-3"
            onSubmit={handleCreate}
          >
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Future item"
                aria-label="Planned item name"
                disabled={!moveId}
              />
              <Input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Category"
                aria-label="Planned item category"
                disabled={!moveId}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-[80px_80px_80px_110px_90px_minmax(0,1fr)]">
              <Input
                inputMode="decimal"
                value={lengthIn}
                onChange={(event) => setLengthIn(event.target.value)}
                placeholder="L"
                aria-label="Planned item length in inches"
                disabled={!moveId}
              />
              <Input
                inputMode="decimal"
                value={widthIn}
                onChange={(event) => setWidthIn(event.target.value)}
                placeholder="W"
                aria-label="Planned item width in inches"
                disabled={!moveId}
              />
              <Input
                inputMode="decimal"
                value={heightIn}
                onChange={(event) => setHeightIn(event.target.value)}
                placeholder="H"
                aria-label="Planned item height in inches"
                disabled={!moveId}
              />
              <Input
                inputMode="decimal"
                value={priceDollars}
                onChange={(event) => setPriceDollars(event.target.value)}
                placeholder="Price"
                aria-label="Planned item estimated price"
                disabled={!moveId}
              />
              <Input
                inputMode="numeric"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                placeholder="Priority"
                aria-label="Planned item priority"
                disabled={!moveId}
              />
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="Product link"
                aria-label="Planned item product link"
                disabled={!moveId}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!moveId || !name.trim()}>
                <PackagePlus aria-hidden="true" />
                Save planned
              </Button>
            </div>
          </form>
        ) : null}

        {message ? (
          <p
            className="rounded-md border border-border p-3 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function matchesPlannedItemFilter(
  item: PlannedItem,
  filter: PlannedItemFilter,
) {
  if (filter === "all") {
    return true;
  }

  if (filter === "needsDecision") {
    return item.status === "idea" || item.status === "decided";
  }

  return item.status === filter;
}

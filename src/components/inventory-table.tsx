"use client";

import { type FormEvent, useCallback, useMemo, useState } from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import {
  ClipboardList,
  Columns3,
  ListFilter,
  PackagePlus,
  PanelRightOpen,
  RotateCcw,
  Search,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BulkInventoryIntake } from "@/components/bulk-inventory-intake";
import { ItemDetailSheet } from "@/components/item-detail-sheet";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  type ColumnMeta,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  InlineCheckboxCell,
  InlineSelectCell,
  type OnBatchAction,
} from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import {
  DispositionBadge,
  StatusBadge,
} from "@/components/ui/status-badges";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useHashTab } from "@/components/use-hash-tab";
import {
  filterInventoryItemsByOwner,
  filterInventoryItems,
  inventorySavedFilters,
  type InventoryFilterKey,
  type InventoryOwnerFilter,
} from "@/lib/inventory-filters";
import {
  itemDispositionOptions,
  itemStatusOptions,
} from "@/lib/inventory-options";
import type { InventoryItem, InventoryItemPatch } from "@/lib/inventory-types";

type InventoryTaskTab = "browse" | "add" | "bulk";

const inventoryTaskHashes = {
  "#add-inventory": "add",
  "#bulk-inventory": "bulk",
  "#bulk-paste": "bulk",
  "#inventory": "browse",
  "#inventory-records": "browse",
} as const satisfies Partial<Record<string, InventoryTaskTab>>;

const inventoryTaskTabs: Array<{
  value: InventoryTaskTab;
  label: string;
  description: string;
}> = [
  {
    value: "browse",
    label: "Browse",
    description:
      "Find, filter, sort, edit, and bulk update existing inventory records.",
  },
  {
    value: "add",
    label: "Add",
    description:
      "Create one item quickly when you already know the basic details.",
  },
  {
    value: "bulk",
    label: "Bulk paste",
    description:
      "Paste rough room notes and let the app turn them into inventory drafts.",
  },
];

function formatInventoryTaskCount(task: InventoryTaskTab, count: number) {
  if (task === "browse") {
    return `${count} ${count === 1 ? "record" : "records"}`;
  }
  return `${count}`;
}

const visibleDefaultColumns: VisibilityState = {
  category: true,
  room: true,
  ownerContact: false,
  condition: false,
  confidence: false,
  indicators: true,
  status: true,
  disposition: true,
  review: true,
};

const columnLabels: Record<string, string> = {
  category: "Category",
  room: "Room",
  ownerContact: "Owner / contact",
  condition: "Condition",
  confidence: "Confidence",
  indicators: "Indicators",
  status: "Status",
  disposition: "Disposition",
  review: "Review",
};

const columnDescriptions: Record<string, string> = {
  ownerContact: "Person responsible for the item.",
  confidence: "Weight and volume estimate confidence.",
  indicators: "Compact flags for evidence, boxes, load, value, and review.",
  review: "Marks records that need another look.",
};

type ItemBatchAction =
  | { type: "status"; status: InventoryItem["status"] }
  | { type: "disposition"; disposition: InventoryItem["disposition"] }
  | { type: "personalTransport" }
  | { type: "needsReview" };

function SignalBadge({
  label,
  title,
  tone = "outline",
}: {
  label: string;
  title: string;
  tone?: "outline" | "secondary" | "destructive";
}) {
  return (
    <Badge variant={tone} title={title} className="max-w-full">
      {label}
    </Badge>
  );
}

type IndicatorBadgeModel = {
  label: string;
  title: string;
  tone: "outline" | "secondary" | "destructive";
};

function isIndicatorBadge(
  badge: IndicatorBadgeModel | null,
): badge is IndicatorBadgeModel {
  return badge !== null;
}

function indicatorBadges(item: InventoryItem): IndicatorBadgeModel[] {
  const signals = item.signals;
  const photoCount = signals?.photoCount ?? 0;
  const evidencePhotoCount = signals?.evidencePhotoCount ?? 0;
  const boxCount = signals?.boxCount ?? 0;
  const assignmentCount = signals?.assignmentCount ?? 0;
  const boxContext = signals?.boxCodes.length
    ? `Boxes: ${signals.boxCodes.join(", ")}`
    : "No boxes contain this item yet.";
  const loadContext = [
    ...(signals?.assignedResourceNames ?? []),
    ...(signals?.assignedZoneNames ?? []),
  ].join(", ");

  const badges: Array<IndicatorBadgeModel | null> = [
    item.needsReview
      ? {
          label: "review",
          title: "This item needs a human review.",
          tone: "secondary" as const,
        }
      : null,
    item.highValue
      ? {
          label: "value",
          title: "Marked high value.",
          tone: "secondary" as const,
        }
      : null,
    item.requiresPersonalTransport
      ? {
          label: "personal",
          title: "Should travel personally or outside the mover flow.",
          tone: "secondary" as const,
        }
      : null,
    photoCount > 0
      ? {
          label: `photos ${photoCount}`,
          title: `${photoCount} active photos are attached to this item.`,
          tone: "outline" as const,
        }
      : null,
    evidencePhotoCount > 0
      ? {
          label: `evidence ${evidencePhotoCount}`,
          title: `${evidencePhotoCount} claim, condition, serial, receipt, or handoff evidence photos are attached.`,
          tone: "outline" as const,
        }
      : null,
    boxCount > 0
      ? {
          label: `boxes ${boxCount}`,
          title: boxContext,
          tone: "outline" as const,
        }
      : null,
    assignmentCount > 0
      ? {
          label: `load ${assignmentCount}`,
          title: loadContext
            ? `Assigned through: ${loadContext}`
            : "Containing box is assigned to transport.",
          tone: "outline" as const,
        }
      : null,
    item.highValue && evidencePhotoCount === 0
      ? {
          label: "needs evidence",
          title: "High-value item without claim or condition evidence photos.",
          tone: "outline" as const,
        }
      : null,
  ];

  return badges.filter(isIndicatorBadge);
}

function InventoryIndicators({
  item,
  visibleLimit = 2,
}: {
  item: InventoryItem;
  visibleLimit?: number;
}) {
  const badges = indicatorBadges(item);
  const visibleBadges = badges.slice(0, visibleLimit);
  const hiddenCount = Math.max(badges.length - visibleBadges.length, 0);

  if (!badges.length) {
    return <span className="text-xs text-muted-foreground">No flags</span>;
  }

  return (
    <div className="flex max-w-[18rem] flex-wrap gap-1">
      {visibleBadges.map((badge) => (
        <SignalBadge
          key={badge.label}
          label={badge.label}
          title={badge.title}
          tone={badge.tone}
        />
      ))}
      {hiddenCount ? (
        <Badge
          variant="outline"
          title={badges
            .slice(visibleBadges.length)
            .map((badge) => badge.label)
            .join(", ")}
        >
          +{hiddenCount}
        </Badge>
      ) : null}
    </div>
  );
}

function InventoryItemCard({
  item,
  selected,
  onSelectedChange,
  onOpenDetails,
  onPatchItem,
}: {
  item: InventoryItem;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  onOpenDetails: () => void;
  onPatchItem: (item: InventoryItem, patch: InventoryItemPatch) => void;
}) {
  return (
    <div
      role="listitem"
      className="rounded-md border border-border bg-card p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={selected}
            aria-label={`Select ${item.name}`}
            onCheckedChange={(checked) => onSelectedChange(checked === true)}
          />
          Select
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onOpenDetails}
        >
          <PanelRightOpen aria-hidden="true" />
          Details
        </Button>
      </div>

      <div className="mt-3 min-w-0">
        <h3 className="break-words text-base font-medium">{item.name}</h3>
        <p className="mt-1 line-clamp-3 break-words text-xs leading-5 text-muted-foreground">
          {item.description ?? "No description"}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <InventoryCardField label="Room" value={item.room ?? "unassigned"} />
        <InventoryCardField
          label="Category"
          value={item.category ?? "uncategorized"}
        />
        <div className="min-w-0 rounded-md border border-border/70 p-2">
          <p className="block text-[0.68rem] uppercase text-muted-foreground">
            Status
          </p>
          <div className="mt-1">
            <InlineSelectCell
              value={item.status}
              options={itemStatusOptions}
              ariaLabel={`Status for ${item.name}`}
              onValueChange={(status) => onPatchItem(item, { status })}
            />
          </div>
        </div>
        <div className="min-w-0 rounded-md border border-border/70 p-2">
          <p className="block text-[0.68rem] uppercase text-muted-foreground">
            Disposition
          </p>
          <div className="mt-1">
            <InlineSelectCell
              value={item.disposition}
              options={itemDispositionOptions}
              ariaLabel={`Disposition for ${item.name}`}
              onValueChange={(disposition) =>
                onPatchItem(item, { disposition })
              }
              renderLabel={(disposition) =>
                disposition === "dump" ? "Trash" : disposition
              }
            />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <InventoryIndicators item={item} visibleLimit={3} />
      </div>

      <label className="mt-3 flex items-center gap-2 rounded-md border border-border/70 px-2 py-1.5 text-xs">
        <Checkbox
          checked={item.needsReview}
          aria-label={`Needs review for ${item.name}`}
          onCheckedChange={(checked) =>
            onPatchItem(item, { needsReview: checked === true })
          }
        />
        Needs review
      </label>
    </div>
  );
}

function InventoryCardField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border/70 p-2">
      <p className="text-[0.68rem] uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}

export function InventoryTable({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const [search, setSearch] = useState("");
  const [savedFilter, setSavedFilter] = useState<InventoryFilterKey>("all");
  const [ownerFilter, setOwnerFilter] = useState<InventoryOwnerFilter>("all");
  const [newItemName, setNewItemName] = useState("");
  const [newItemRoom, setNewItemRoom] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [newItemDisposition, setNewItemDisposition] =
    useState<(typeof itemDispositionOptions)[number]>("undecided");
  const [message, setMessage] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    visibleDefaultColumns,
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedItemId, setSelectedItemId] = useState<Id<"items"> | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTaskTab, setActiveTaskTab] = useHashTab<InventoryTaskTab>(
    "browse",
    inventoryTaskHashes,
  );

  const items = useQuery(
    api.items.listForMoveWithSignals,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const createItem = useMutation(api.items.create);
  const updateItem = useMutation(api.items.update);

  const filteredItems = useMemo(
    () =>
      filterInventoryItemsByOwner(
        filterInventoryItems(items ?? [], savedFilter, search),
        ownerFilter,
      ),
    [items, ownerFilter, savedFilter, search],
  );
  const ownerFilterOptions = useMemo(() => {
    const options = new Map<Id<"movePeople">, { name: string; role: string }>();

    for (const item of items ?? []) {
      if (item.ownerContact) {
        options.set(item.ownerContact._id, {
          name: item.ownerContact.name,
          role: item.ownerContact.role,
        });
      }
    }

    return Array.from(options.entries()).map(([id, owner]) => ({
      id,
      ...owner,
    }));
  }, [items]);
  const selectedItem = useMemo(
    () => items?.find((item) => item._id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  async function handleCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!householdId || !moveId || !newItemName.trim()) {
      return;
    }

    setMessage(null);

    try {
      await createItem({
        householdId,
        moveId,
        name: newItemName,
        room: newItemRoom || undefined,
        category: newItemCategory || undefined,
        disposition: newItemDisposition,
        needsReview: savedFilter === "needsReview",
        highValue: savedFilter === "highValue",
        requiresPersonalTransport: savedFilter === "personalTransport",
        planningDefaultKeys:
          savedFilter === "firstNight"
            ? ["firstNight"]
            : savedFilter === "personalTransport"
              ? ["doNotLetMoversTouch"]
              : [],
      });
      setNewItemName("");
      setNewItemRoom("");
      setNewItemCategory("");
      setNewItemDisposition("undecided");
      setMessage("Item added.");
    } catch {
      setMessage("Could not add that item yet.");
    }
  }

  const patchItem = useCallback(
    async (item: InventoryItem, patch: InventoryItemPatch) => {
      if (!householdId || !moveId) {
        return;
      }

      await updateItem({
        householdId,
        moveId,
        itemId: item._id,
        ...patch,
      });
    },
    [householdId, moveId, updateItem],
  );

  // Maps the typed item batch action to a patch. The contract is shaped so a
  // future server-side batch mutation can replace this client-side fan-out
  // without touching callers.
  const handleItemBatchAction = useCallback<
    OnBatchAction<InventoryItem, ItemBatchAction>
  >(
    async ({ action, rows, clearSelection }) => {
      if (!rows.length) {
        return;
      }

      const patch: InventoryItemPatch =
        action.type === "status"
          ? { status: action.status }
          : action.type === "disposition"
            ? { disposition: action.disposition }
            : action.type === "personalTransport"
              ? {
                  disposition: "personalTransport",
                  requiresPersonalTransport: true,
                }
              : { needsReview: true };

      setMessage(null);

      try {
        await Promise.all(rows.map((item) => patchItem(item, patch)));
        clearSelection();
        setMessage(`${rows.length} items updated.`);
      } catch {
        setMessage("Could not update the selected items yet.");
      }
    },
    [patchItem],
  );

  const columns = useMemo<ColumnDef<InventoryItem, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        meta: {
          label: "Item",
          mobile: "primary",
          headClassName: "min-w-[18rem] w-[28%]",
          cellClassName: "max-w-[32rem] whitespace-normal",
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Item" />
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.name}</p>
            <p className="mt-1 line-clamp-2 max-w-[30rem] whitespace-normal break-words text-xs leading-5 text-muted-foreground">
              {row.original.description ?? "No description"}
            </p>
          </div>
        ),
      },
      {
        id: "details",
        meta: { label: "Details", mobile: "hidden", headClassName: "w-24" },
        header: "",
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedItemId(row.original._id);
              setDetailOpen(true);
            }}
          >
            <PanelRightOpen aria-hidden="true" />
            Details
          </Button>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "status",
        meta: {
          label: "Status",
          mobile: "primary",
          headClassName: "w-36",
          editable: true,
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Status" />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <StatusBadge status={row.original.status} />
            <InlineSelectCell
              value={row.original.status}
              options={itemStatusOptions}
              ariaLabel={`Status for ${row.original.name}`}
              onValueChange={(status) =>
                void patchItem(row.original, { status })
              }
            />
          </div>
        ),
      },
      {
        accessorKey: "disposition",
        meta: {
          label: "Disposition",
          mobile: "primary",
          headClassName: "w-36",
          editable: true,
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Disposition" />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <DispositionBadge disposition={row.original.disposition} />
            <InlineSelectCell
              value={row.original.disposition}
              options={itemDispositionOptions}
              ariaLabel={`Disposition for ${row.original.name}`}
              onValueChange={(disposition) =>
                void patchItem(row.original, { disposition })
              }
              renderLabel={(disposition) =>
                disposition === "dump" ? "Trash" : disposition
              }
            />
          </div>
        ),
      },
      {
        id: "indicators",
        meta: {
          label: "Indicators",
          mobile: "primary",
          headClassName: "min-w-[14rem] w-[16rem]",
          cellClassName: "max-w-[18rem] whitespace-normal",
          description:
            "Compact flags for evidence, boxes, load, value, and review.",
        },
        header: "Indicators",
        enableSorting: false,
        cell: ({ row }) => <InventoryIndicators item={row.original} />,
      },
      {
        accessorKey: "room",
        meta: { label: "Room", mobile: "primary" },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Room" />
        ),
        cell: ({ row }) => row.original.room ?? "unassigned",
      },
      {
        accessorKey: "category",
        meta: { label: "Category", mobile: "expansion" },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Category" />
        ),
        cell: ({ row }) => row.original.category ?? "uncategorized",
      },
      {
        id: "ownerContact",
        accessorFn: (row) => row.ownerContact?.name ?? "",
        meta: {
          label: "Owner / contact",
          mobile: "expansion",
          cellClassName: "max-w-[14rem] whitespace-normal",
          description: "Person responsible for the item.",
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Owner" />
        ),
        cell: ({ row }) => {
          const owner = row.original.ownerContact;

          return owner ? (
            <div>
              <p className="font-medium">{owner.name}</p>
              <p className="text-xs text-muted-foreground">{owner.role}</p>
            </div>
          ) : row.original.ownerPersonId ? (
            <span className="text-muted-foreground">Archived contact</span>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          );
        },
      },
      {
        accessorKey: "condition",
        meta: { label: "Condition", mobile: "expansion" },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Condition" />
        ),
        cell: ({ row }) => row.original.condition,
      },
      {
        id: "confidence",
        meta: {
          label: "Confidence",
          mobile: "expansion",
          description: "Weight and volume estimate confidence.",
        },
        header: "Confidence",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">W {row.original.weightConfidence}</Badge>
            <Badge variant="outline">V {row.original.volumeConfidence}</Badge>
          </div>
        ),
      },
      {
        accessorKey: "needsReview",
        id: "review",
        meta: {
          label: "Review",
          mobile: "hidden",
          headClassName: "w-32",
          description: "Marks records that need another look.",
          editable: true,
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Review" />
        ),
        cell: ({ row }) => (
          <InlineCheckboxCell
            checked={row.original.needsReview}
            ariaLabel={`Needs review for ${row.original.name}`}
            label="needs review"
            onCheckedChange={(checked) =>
              void patchItem(row.original, { needsReview: checked })
            }
          />
        ),
      },
    ],
    [patchItem],
  );

  // The DataTable owns the tanstack instance; the adapter keeps the shared
  // sorting/filter/visibility/selection state and feeds it in controlled.
  const hideableColumns = useMemo(
    () =>
      columns
        .map((column) => {
          const id =
            column.id ??
            ("accessorKey" in column
              ? String(column.accessorKey)
              : undefined);
          if (!id || column.enableHiding === false) {
            return null;
          }
          return { id, meta: column.meta };
        })
        .filter(
          (entry): entry is { id: string; meta: ColumnMeta | undefined } =>
            entry !== null,
        ),
    [columns],
  );

  // Page reset on filter change is handled by the DataTable's tanstack
  // instance (autoResetPageIndex), so the adapter no longer manages it.
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const loadingItems = Boolean(moveId) && items === undefined;
  const totalItemCount = items?.length ?? filteredItems.length;
  const activeSavedFilter = inventorySavedFilters.find(
    (filter) => filter.key === savedFilter,
  );
  const activeInventoryTask =
    inventoryTaskTabs.find((task) => task.value === activeTaskTab) ??
    inventoryTaskTabs[0];
  const inventoryTaskCounts: Partial<Record<InventoryTaskTab, number>> = {
    browse: filteredItems.length,
  };
  const visibleColumnCount = hideableColumns.filter(
    (column) => columnVisibility[column.id] !== false,
  ).length;
  const hasActiveBrowseFilters =
    search.trim().length > 0 || ownerFilter !== "all" || savedFilter !== "all";

  function clearBrowseFilters() {
    setSearch("");
    setOwnerFilter("all");
    setSavedFilter("all");
  }

  return (
    <>
      <Card size="sm">
        <CardHeader className="gap-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Browse inventory</CardTitle>
              <CardDescription className="hidden sm:block">
                Search, filter, edit, and bulk update item records for the
                selected move.
              </CardDescription>
            </div>
            <Badge variant="secondary">{filteredItems.length} visible</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTaskTab}
            onValueChange={setActiveTaskTab}
            className="gap-2"
          >
            <MoveWorkspaceTabList
              tabs={inventoryTaskTabs.map((task) => {
                const count = inventoryTaskCounts[task.value];
                return {
                  ...task,
                  count,
                  countLabel:
                    count === undefined
                      ? undefined
                      : formatInventoryTaskCount(task.value, count),
                };
              })}
              activeValue={activeInventoryTask.value}
              ariaLabel="Inventory task views"
            />

            {message ? (
              <p
                className="rounded-md border border-border p-3 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {message}
              </p>
            ) : null}

            <TabsContent
              value="browse"
              id="inventory-records"
              className="space-y-2"
            >
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium">Inventory actions</h3>
                    <p className="text-xs text-muted-foreground">
                      {filteredItems.length} shown / {totalItemCount} total
                      {selectedCount ? ` / ${selectedCount} selected` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setActiveTaskTab("add")}
                    >
                      <PackagePlus aria-hidden="true" />
                      Add item
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveTaskTab("bulk")}
                    >
                      <ClipboardList aria-hidden="true" />
                      Bulk paste
                    </Button>
                    {hasActiveBrowseFilters ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={clearBrowseFilters}
                      >
                        <RotateCcw aria-hidden="true" />
                        Clear filters
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <section
                aria-labelledby="inventory-filter-heading"
                className="rounded-md border border-border bg-muted/20 p-3"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3
                      id="inventory-filter-heading"
                      className="flex items-center gap-2 text-sm font-medium"
                    >
                      <ListFilter
                        className="size-4 text-primary"
                        aria-hidden="true"
                      />
                      Find and filter
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">
                      {activeSavedFilter?.label ?? "All inventory"}
                    </Badge>
                    <Badge variant="secondary">
                      {filteredItems.length} of {totalItemCount} records
                    </Badge>
                    <Badge variant="outline">
                      {visibleColumnCount} columns
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
                  <div className="relative min-w-0">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      className="pl-8"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search items, rooms, people, categories"
                      aria-label="Search inventory"
                    />
                  </div>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={ownerFilter}
                    aria-label="Owner or contact filter"
                    onChange={(event) =>
                      setOwnerFilter(event.target.value as InventoryOwnerFilter)
                    }
                  >
                    <option value="all">All owners</option>
                    <option value="unassigned">Unassigned</option>
                    {ownerFilterOptions.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name} - {owner.role}
                      </option>
                    ))}
                  </select>
                  <details className="rounded-md border border-border bg-background px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
                      <Columns3
                        className="size-4 text-primary"
                        aria-hidden="true"
                      />
                      Columns
                    </summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {hideableColumns.map((column) => {
                        const visible = columnVisibility[column.id] !== false;
                        return (
                          <label
                            key={column.id}
                            className="flex items-start gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={visible}
                              aria-label={`Toggle ${
                                column.meta?.label ??
                                columnLabels[column.id] ??
                                column.id
                              } column`}
                              onCheckedChange={(checked) =>
                                setColumnVisibility((current) => ({
                                  ...current,
                                  [column.id]: checked === true,
                                }))
                              }
                            />
                            <span>
                              <span className="block font-medium">
                                {column.meta?.label ??
                                  columnLabels[column.id] ??
                                  column.id}
                              </span>
                              {(column.meta?.description ??
                                columnDescriptions[column.id]) ? (
                                <span className="block text-xs leading-5 text-muted-foreground">
                                  {column.meta?.description ??
                                    columnDescriptions[column.id]}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                </div>

                <details className="mt-2 rounded-md border border-border bg-background px-3 py-2 md:hidden">
                  <summary className="cursor-pointer list-none text-sm font-medium">
                    Saved views
                  </summary>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {inventorySavedFilters.map((filter) => (
                      <button
                        key={filter.key}
                        type="button"
                        className={`shrink-0 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                          savedFilter === filter.key
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                        title={filter.description}
                        aria-pressed={savedFilter === filter.key}
                        onClick={() => setSavedFilter(filter.key)}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </details>

                <div className="mt-3 hidden gap-2 md:flex md:flex-wrap">
                  {inventorySavedFilters.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      className={`shrink-0 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                        savedFilter === filter.key
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                      title={filter.description}
                      aria-pressed={savedFilter === filter.key}
                      onClick={() => setSavedFilter(filter.key)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </section>

              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Inventory records</h3>
                  <p className="text-xs text-muted-foreground">
                    {filteredItems.length} filtered
                    {selectedCount ? ` / ${selectedCount} selected` : ""}
                  </p>
                </div>
              </div>

              <DataTable
                data={filteredItems}
                columns={columns}
                getRowId={(item) => item._id}
                ariaLabel="Inventory records table"
                enableRowSelection
                loading={Boolean(loadingItems)}
                sorting={sorting}
                onSortingChange={setSorting}
                columnFilters={columnFilters}
                onColumnFiltersChange={setColumnFilters}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={setColumnVisibility}
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                renderMobileCard={({ row, selected, onSelectedChange }) => (
                  <InventoryItemCard
                    item={row}
                    selected={selected}
                    onSelectedChange={onSelectedChange}
                    onOpenDetails={() => {
                      setSelectedItemId(row._id);
                      setDetailOpen(true);
                    }}
                    onPatchItem={(item, patch) => void patchItem(item, patch)}
                  />
                )}
                batchActions={({ selectedRows, clearSelection }) => (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void handleItemBatchAction({
                          action: { type: "status", status: "packed" },
                          rows: selectedRows,
                          clearSelection,
                        })
                      }
                    >
                      Pack
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void handleItemBatchAction({
                          action: { type: "personalTransport" },
                          rows: selectedRows,
                          clearSelection,
                        })
                      }
                    >
                      Personal
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void handleItemBatchAction({
                          action: { type: "needsReview" },
                          rows: selectedRows,
                          clearSelection,
                        })
                      }
                    >
                      Review
                    </Button>
                  </>
                )}
                emptyState={
                  <EmptyState
                    title="No inventory records"
                    description="Add inventory items or change the saved filter and search terms."
                  />
                }
              />
            </TabsContent>

            <TabsContent value="add" id="add-inventory">
              <form
                className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-[minmax(0,1.2fr)_160px_160px_170px_auto]"
                onSubmit={handleCreateItem}
              >
                <Input
                  value={newItemName}
                  onChange={(event) => setNewItemName(event.target.value)}
                  placeholder="Item name"
                  aria-label="New item name"
                  disabled={!moveId}
                />
                <Input
                  value={newItemRoom}
                  onChange={(event) => setNewItemRoom(event.target.value)}
                  placeholder="Room"
                  aria-label="New item room"
                  disabled={!moveId}
                />
                <Input
                  value={newItemCategory}
                  onChange={(event) => setNewItemCategory(event.target.value)}
                  placeholder="Category"
                  aria-label="New item category"
                  disabled={!moveId}
                />
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={newItemDisposition}
                  aria-label="New item disposition"
                  disabled={!moveId}
                  onChange={(event) =>
                    setNewItemDisposition(
                      event.target.value as typeof newItemDisposition,
                    )
                  }
                >
                  {itemDispositionOptions.map((disposition) => (
                    <option key={disposition} value={disposition}>
                      {disposition}
                    </option>
                  ))}
                </select>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!moveId || !newItemName.trim()}
                >
                  <PackagePlus aria-hidden="true" />
                  Add
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="bulk" id="bulk-inventory">
              <BulkInventoryIntake
                householdId={householdId}
                moveId={moveId}
                onCreated={setMessage}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <ItemDetailSheet
        key={selectedItem?._id ?? "no-item-selected"}
        householdId={householdId}
        moveId={moveId}
        item={selectedItem}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSave={async (patch) => {
          if (!selectedItem) {
            return;
          }

          await patchItem(selectedItem, patch);
          setMessage("Item details saved.");
        }}
      />
    </>
  );
}

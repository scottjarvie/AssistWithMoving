"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function SortableHeader<TData, TValue>({
  column,
  label,
}: {
  column: Column<TData, TValue>;
  label: string;
}) {
  const sorted = column.getIsSorted();
  const Icon =
    sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

  if (!column.getCanSort()) {
    return <span>{label}</span>;
  }

  return (
    <button
      type="button"
      className="inline-flex h-8 items-center gap-1 rounded-md px-1 text-left hover:bg-muted"
      onClick={column.getToggleSortingHandler()}
      aria-label={`Sort by ${label}`}
    >
      <span>{label}</span>
      <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

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
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={selected}
            aria-label={`Select ${item.name}`}
            onChange={(event) => onSelectedChange(event.target.checked)}
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
          <label className="block text-[0.68rem] uppercase text-muted-foreground">
            Status
            <select
              className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={item.status}
              aria-label={`Status for ${item.name}`}
              onChange={(event) =>
                onPatchItem(item, {
                  status: event.target.value as InventoryItem["status"],
                })
              }
            >
              {itemStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="min-w-0 rounded-md border border-border/70 p-2">
          <label className="block text-[0.68rem] uppercase text-muted-foreground">
            Disposition
            <select
              className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={item.disposition}
              aria-label={`Disposition for ${item.name}`}
              onChange={(event) =>
                onPatchItem(item, {
                  disposition: event.target
                    .value as InventoryItem["disposition"],
                })
              }
            >
              {itemDispositionOptions.map((disposition) => (
                <option key={disposition} value={disposition}>
                  {disposition}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-3">
        <InventoryIndicators item={item} visibleLimit={3} />
      </div>

      <label className="mt-3 flex items-center gap-2 rounded-md border border-border/70 px-2 py-1.5 text-xs">
        <input
          type="checkbox"
          className="size-3.5 accent-primary"
          checked={item.needsReview}
          onChange={(event) =>
            onPatchItem(item, {
              needsReview: event.target.checked,
            })
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

function tableHeadClassName(columnId: string) {
  switch (columnId) {
    case "select":
      return "w-10";
    case "name":
      return "min-w-[18rem] w-[32%]";
    case "details":
      return "w-24";
    case "indicators":
      return "min-w-[14rem] w-[16rem]";
    case "status":
    case "disposition":
      return "w-36";
    case "review":
      return "w-32";
    default:
      return "min-w-28";
  }
}

function tableCellClassName(columnId: string) {
  switch (columnId) {
    case "name":
      return "max-w-[32rem] whitespace-normal";
    case "indicators":
      return "max-w-[18rem] whitespace-normal";
    case "ownerContact":
      return "max-w-[14rem] whitespace-normal";
    default:
      return "";
  }
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

  async function handleBulkPatch(patch: InventoryItemPatch) {
    const selectedItems = table
      .getSelectedRowModel()
      .rows.map((row) => row.original);

    if (!selectedItems.length) {
      return;
    }

    setMessage(null);

    try {
      await Promise.all(selectedItems.map((item) => patchItem(item, patch)));
      setRowSelection({});
      setMessage(`${selectedItems.length} items updated.`);
    } catch {
      setMessage("Could not update the selected items yet.");
    }
  }

  const columns = useMemo<ColumnDef<InventoryItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={table.getIsAllPageRowsSelected()}
            aria-label="Select all visible items"
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={row.getIsSelected()}
            aria-label={`Select ${row.original.name}`}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "name",
        header: ({ column }) => <SortableHeader column={column} label="Item" />,
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
        accessorKey: "room",
        header: ({ column }) => <SortableHeader column={column} label="Room" />,
        cell: ({ row }) => row.original.room ?? "unassigned",
      },
      {
        accessorKey: "category",
        header: ({ column }) => (
          <SortableHeader column={column} label="Category" />
        ),
        cell: ({ row }) => row.original.category ?? "uncategorized",
      },
      {
        id: "ownerContact",
        accessorFn: (row) => row.ownerContact?.name ?? "",
        header: ({ column }) => (
          <SortableHeader column={column} label="Owner" />
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
        header: ({ column }) => (
          <SortableHeader column={column} label="Condition" />
        ),
        cell: ({ row }) => row.original.condition,
      },
      {
        id: "confidence",
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
        id: "indicators",
        header: "Indicators",
        enableSorting: false,
        cell: ({ row }) => <InventoryIndicators item={row.original} />,
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <SortableHeader column={column} label="Status" />
        ),
        cell: ({ row }) => (
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={row.original.status}
            aria-label={`Status for ${row.original.name}`}
            onChange={(event) =>
              void patchItem(row.original, {
                status: event.target.value as InventoryItem["status"],
              })
            }
          >
            {itemStatusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        ),
      },
      {
        accessorKey: "disposition",
        header: ({ column }) => (
          <SortableHeader column={column} label="Disposition" />
        ),
        cell: ({ row }) => (
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={row.original.disposition}
            aria-label={`Disposition for ${row.original.name}`}
            onChange={(event) =>
              void patchItem(row.original, {
                disposition: event.target.value as InventoryItem["disposition"],
              })
            }
          >
            {itemDispositionOptions.map((disposition) => (
              <option key={disposition} value={disposition}>
                {disposition}
              </option>
            ))}
          </select>
        ),
      },
      {
        accessorKey: "needsReview",
        id: "review",
        header: ({ column }) => (
          <SortableHeader column={column} label="Review" />
        ),
        cell: ({ row }) => (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={row.original.needsReview}
              onChange={(event) =>
                void patchItem(row.original, {
                  needsReview: event.target.checked,
                })
              }
            />
            needs review
          </label>
        ),
      },
    ],
    [patchItem],
  );

  // TanStack Table intentionally returns mutable table helpers; this is the
  // supported API shape and is isolated to this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredItems,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 10,
      },
    },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  useEffect(() => {
    table.setPageIndex(0);
  }, [ownerFilter, savedFilter, search, table]);

  const selectedCount = table.getSelectedRowModel().rows.length;
  const loadingItems = moveId && items === undefined;
  const visibleRows = table.getRowModel().rows;
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
  const visibleColumnCount = table
    .getAllLeafColumns()
    .filter((column) => column.getIsVisible()).length;
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
                      {table
                        .getAllLeafColumns()
                        .filter((column) => column.getCanHide())
                        .map((column) => (
                          <label
                            key={column.id}
                            className="flex items-start gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 size-3.5 accent-primary"
                              checked={column.getIsVisible()}
                              onChange={column.getToggleVisibilityHandler()}
                            />
                            <span>
                              <span className="block font-medium">
                                {columnLabels[column.id] ?? column.id}
                              </span>
                              {columnDescriptions[column.id] ? (
                                <span className="block text-xs leading-5 text-muted-foreground">
                                  {columnDescriptions[column.id]}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        ))}
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

              {selectedCount ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
                  <Badge>{selectedCount} selected</Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleBulkPatch({ status: "packed" })}
                  >
                    Pack
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void handleBulkPatch({
                        disposition: "personalTransport",
                        requiresPersonalTransport: true,
                      })
                    }
                  >
                    Personal
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleBulkPatch({ needsReview: true })}
                  >
                    Review
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Inventory records</h3>
                  <p className="text-xs text-muted-foreground">
                    {visibleRows.length} on this page / {filteredItems.length}{" "}
                    filtered
                  </p>
                </div>
                {sorting.length ? (
                  <Badge variant="outline">
                    Sorted by {columnLabels[sorting[0].id] ?? sorting[0].id}
                  </Badge>
                ) : null}
              </div>

              {loadingItems ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-4/5" />
                </div>
              ) : visibleRows.length ? (
                <>
                  <div
                    role="list"
                    aria-label="Inventory item cards"
                    className="grid gap-3 md:hidden"
                  >
                    {visibleRows.map((row) => (
                      <InventoryItemCard
                        key={row.id}
                        item={row.original}
                        selected={row.getIsSelected()}
                        onSelectedChange={(checked) =>
                          row.toggleSelected(checked)
                        }
                        onOpenDetails={() => {
                          setSelectedItemId(row.original._id);
                          setDetailOpen(true);
                        }}
                        onPatchItem={(item, patch) =>
                          void patchItem(item, patch)
                        }
                      />
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto rounded-md border border-border md:block">
                    <Table
                      aria-label="Inventory records table"
                      className="min-w-[980px] table-fixed"
                    >
                      <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                          <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                              <TableHead
                                key={header.id}
                                className={tableHeadClassName(header.column.id)}
                              >
                                {header.isPlaceholder
                                  ? null
                                  : flexRender(
                                      header.column.columnDef.header,
                                      header.getContext(),
                                    )}
                              </TableHead>
                            ))}
                          </TableRow>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {table.getRowModel().rows.map((row) => (
                          <TableRow
                            key={row.id}
                            data-state={
                              row.getIsSelected() ? "selected" : undefined
                            }
                          >
                            {row.getVisibleCells().map((cell) => (
                              <TableCell
                                key={cell.id}
                                className={tableCellClassName(cell.column.id)}
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                  Add inventory items or change the saved filter/search terms.
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  Page {table.getState().pagination.pageIndex + 1} of{" "}
                  {Math.max(table.getPageCount(), 1)}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                  >
                    <ChevronLeft aria-hidden="true" />
                    Prev
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.nextPage()}
                  >
                    Next
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
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

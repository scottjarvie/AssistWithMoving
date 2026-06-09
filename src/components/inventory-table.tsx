"use client";

import { type FormEvent, useCallback, useMemo, useState } from "react";
import {
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
  ChevronLeft,
  ChevronRight,
  Columns3,
  ListFilter,
  PackagePlus,
  PanelRightOpen,
  Search,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BulkInventoryIntake } from "@/components/bulk-inventory-intake";
import { ItemDetailSheet } from "@/components/item-detail-sheet";
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

const visibleDefaultColumns: VisibilityState = {
  category: true,
  room: true,
  ownerContact: true,
  condition: false,
  confidence: true,
  indicators: true,
  status: true,
  disposition: true,
  review: true,
};

function SignalBadge({
  label,
  active,
  title,
}: {
  label: string;
  active: boolean;
  title: string;
}) {
  return (
    <Badge variant={active ? "secondary" : "outline"} title={title}>
      {label}
    </Badge>
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
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(visibleDefaultColumns);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedItemId, setSelectedItemId] = useState<Id<"items"> | null>(
    null
  );
  const [detailOpen, setDetailOpen] = useState(false);

  const items = useQuery(
    api.items.listForMoveWithSignals,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const createItem = useMutation(api.items.create);
  const updateItem = useMutation(api.items.update);

  const filteredItems = useMemo(
    () =>
      filterInventoryItemsByOwner(
        filterInventoryItems(items ?? [], savedFilter, search),
        ownerFilter
      ),
    [items, ownerFilter, savedFilter, search]
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
    [items, selectedItemId]
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
    [householdId, moveId, updateItem]
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
        header: "Item",
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">
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
        header: "Room",
        cell: ({ row }) => row.original.room ?? "unassigned",
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => row.original.category ?? "uncategorized",
      },
      {
        id: "ownerContact",
        header: "Owner / contact",
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
        header: "Condition",
        cell: ({ row }) => row.original.condition,
      },
      {
        id: "confidence",
        header: "Confidence",
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
        cell: ({ row }) => {
          const signals = row.original.signals;
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

          return (
            <div className="flex flex-wrap gap-1">
              <Badge variant={row.original.highValue ? "secondary" : "outline"}>
                value
              </Badge>
              <Badge
                variant={
                  row.original.requiresPersonalTransport ? "secondary" : "outline"
                }
              >
                personal
              </Badge>
              <SignalBadge
                label={`photos ${photoCount}`}
                active={photoCount > 0}
                title={`${photoCount} active photos are attached to this item.`}
              />
              <SignalBadge
                label={`evidence ${evidencePhotoCount}`}
                active={evidencePhotoCount > 0}
                title={`${evidencePhotoCount} claim, condition, serial, receipt, mover, or PCS evidence photos are attached.`}
              />
              <SignalBadge
                label={`boxes ${boxCount}`}
                active={boxCount > 0}
                title={boxContext}
              />
              <SignalBadge
                label={`load ${assignmentCount}`}
                active={assignmentCount > 0}
                title={
                  loadContext
                    ? `Assigned through: ${loadContext}`
                    : "No containing box is assigned to a transport resource yet."
                }
              />
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
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
        header: "Disposition",
        cell: ({ row }) => (
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={row.original.disposition}
            aria-label={`Disposition for ${row.original.name}`}
            onChange={(event) =>
              void patchItem(row.original, {
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
        ),
      },
      {
        accessorKey: "needsReview",
        header: "Review",
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
    [patchItem]
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

  const selectedCount = table.getSelectedRowModel().rows.length;
  const loadingItems = moveId && items === undefined;

  return (
    <>
      <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Inventory</CardTitle>
            <CardDescription>
              Search, filter, edit, and bulk update item records for the
              selected move.
            </CardDescription>
          </div>
          <Badge variant="secondary">{filteredItems.length} visible</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <BulkInventoryIntake
          householdId={householdId}
          moveId={moveId}
          onCreated={setMessage}
        />

        <form
          className="grid gap-2 md:grid-cols-[minmax(0,1.2fr)_160px_160px_170px_auto]"
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
                event.target.value as typeof newItemDisposition
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

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-64 flex-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground"
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
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
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
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={savedFilter}
                aria-label="Saved inventory filter"
                onChange={(event) =>
                  setSavedFilter(event.target.value as InventoryFilterKey)
                }
              >
                {inventorySavedFilters.map((filter) => (
                  <option key={filter.key} value={filter.key}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </div>

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

            {loadingItems ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-4/5" />
              </div>
            ) : table.getRowModel().rows.length ? (
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
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
                        data-state={row.getIsSelected() ? "selected" : undefined}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
          </div>

          <div className="space-y-3">
            <div className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ListFilter className="size-4 text-primary" aria-hidden="true" />
                Saved filters
              </div>
              <div className="space-y-1.5">
                {inventorySavedFilters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => setSavedFilter(filter.key)}
                  >
                    <span className="block font-medium">{filter.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {filter.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Columns3 className="size-4 text-primary" aria-hidden="true" />
                Columns
              </div>
              <div className="grid gap-1.5 text-sm">
                {table
                  .getAllLeafColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <label key={column.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-primary"
                        checked={column.getIsVisible()}
                        onChange={column.getToggleVisibilityHandler()}
                      />
                      {column.id}
                    </label>
                  ))}
              </div>
            </div>

            {message ? (
              <p
                className="rounded-md border border-border p-3 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {message}
              </p>
            ) : null}
          </div>
        </div>
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

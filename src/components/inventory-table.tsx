"use client";

import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { BulkInventoryIntake } from "@/components/bulk-inventory-intake";
import { ItemDetailSheet } from "@/components/item-detail-sheet";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { MoveIllustration, MovingSymbol } from "@/components/moving-symbol";
import { CollectionFilterChips, CollectionFilterSheet } from "@/components/collection-filter-sheet";
import { CollectionViewTabs } from "@/components/collection-view-tabs";
import { countFacets, matchesFacets, type CollectionFacet, type FacetSelection } from "@/lib/collection-facets";
import { useCollectionPresentation, type CollectionView } from "@/components/use-collection-presentation";
import { inventoryDefaultColumns as visibleDefaultColumns, normalizeInventoryColumns, parseInventoryView, type InventoryViewSnapshot } from "@/lib/inventory-views";
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
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  InlineCheckboxCell,
  InlineSelectCell,
  isRowOpenIgnoredTarget,
} from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  DispositionBadge,
  dispositionDisplayLabel,
  StatusBadge,
} from "@/components/ui/status-badges";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useHashTab } from "@/components/use-hash-tab";
import {
  filterInventoryItems,
  inventorySavedFilters,
  type InventoryFilterKey,
} from "@/lib/inventory-filters";
import {
  itemDispositionOptions,
  itemStatusOptions,
} from "@/lib/inventory-options";
import type { InventoryItem, InventoryItemPatch } from "@/lib/inventory-types";
import {
  compareBy,
  DEFAULT_SORT_FIELD,
  INVENTORY_SORT_OPTIONS,
  type SortableEntry,
  type SortFieldId,
} from "@/lib/inventory-sort";
import { calculateMovableUnitVolumeCuFt } from "@/lib/movable-units";
import { toastSaved, toastError } from "@/lib/toast";

type InventoryTaskTab = "browse" | "add" | "bulk";

// Primary disposition facet groups. The All/Moving/Sell/Trash/Donate pills are
// the headline filter; the saved-filter chips below stay as a secondary slice.
// The group -> disposition mapping mirrors the server's dispositionFacetGroups
// (convex/items.ts) so the client filter and the server facet counts agree.
type DispositionGroup = "all" | "moving" | "sell" | "trash" | "donate";

const dispositionGroupMembers: Record<
  Exclude<DispositionGroup, "all">,
  ReadonlyArray<InventoryItem["disposition"]>
> = {
  moving: ["take", "mover", "personalTransport", "storage"],
  sell: ["sell"],
  trash: ["dump"],
  donate: ["donate"],
};

const dispositionGroupChips: Array<{
  key: DispositionGroup;
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "moving", label: "Moving" },
  { key: "sell", label: "Sell" },
  { key: "trash", label: "Trash" },
  { key: "donate", label: "Donate" },
];

// Stored enum stays `dump`; only the visible label maps to "Trash".
function dispositionLabel(disposition: InventoryItem["disposition"]) {
  return dispositionDisplayLabel(disposition);
}

function enumDisplayLabel(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }

// Project an item onto the shared sort shape. Weight/volume are totalled across
// quantity to match how the other inventory surfaces sort.
function itemToSortable(item: InventoryItem): SortableEntry {
  const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
  const unitWeight = item.actualWeightLb ?? item.estimatedWeightLb;
  const unitVolume =
    item.estimatedVolumeCuFt ??
    item.estimatedPackedVolumeCuFt ??
    calculateMovableUnitVolumeCuFt(item.dimensionsIn);
  return {
    kind: "item",
    createdAt: item._creationTime,
    name: item.nickname ?? item.name,
    code: item.code,
    weightLb: typeof unitWeight === "number" ? unitWeight * qty : undefined,
    volumeCuFt: typeof unitVolume === "number" ? unitVolume * qty : undefined,
  };
}

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

// Batch actions that the server batchUpdate mutation can apply directly.
type ItemBatchPatch = {
  disposition?: InventoryItem["disposition"];
  status?: InventoryItem["status"];
  assignedResourceId?: Id<"transportResources">;
  assignedZoneId?: Id<"transportZones">;
};

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
  includeReview = true,
}: {
  item: InventoryItem;
  visibleLimit?: number;
  includeReview?: boolean;
}) {
  const badges = indicatorBadges(item).filter(badge => includeReview || badge.label !== "review");
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

// A short "code · room · category" line under the item name.
function itemMetaLine(item: InventoryItem): string {
  return [item.code, item.room, item.category]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

// The item's cover photo (44px), or an icon fallback. Mirrors the Spaces &
// Transport EntryThumbnail so the two lists look the same. Only the visible page
// of rows mounts (DataTable paginates), so this fetches few URLs at a time.
function ItemThumbnail({
  householdId,
  moveId,
  photoId,
  large = false,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  photoId?: Id<"itemPhotos">;
  large?: boolean;
}) {
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoId || !householdId || !moveId) return;
    let cancelled = false;
    void getDisplayUrl({ householdId, moveId, photoId, variant: "card" })
      .then((display) => {
        if (!cancelled) setUrl(display.url);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [getDisplayUrl, householdId, moveId, photoId]);

  return (
    <div className={large ? "aspect-[4/3] w-full shrink-0 overflow-hidden rounded-md border border-border bg-muted" : "size-11 shrink-0 overflow-hidden rounded-md border border-border bg-muted"}>
      {photoId && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          {large && !photoId ? <MoveIllustration decorative kind="box" className="size-full" /> : photoId ? (
            <MovingSymbol name="camera" className="size-4" />
          ) : (
            <MovingSymbol name="box" className="size-4" />
          )}
        </div>
      )}
    </div>
  );
}

// Compact, tappable item row (mirrors the Spaces & Transport list): thumbnail +
// name + one meta line + status/disposition badges. The whole row opens the
// detail sheet, where editing now lives — keeping the list short. A small
// selection checkbox stays for batch actions.
function InventoryItemCard({
  item,
  selected,
  onSelectedChange,
  onOpenDetails,
  photoId,
  householdId,
  moveId,
  presentation = "list",
}: {
  item: InventoryItem;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  onOpenDetails: () => void;
  photoId?: Id<"itemPhotos">;
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  presentation?: Exclude<CollectionView, "table">;
}) {
  function handleCardClick(event: ReactMouseEvent) {
    if (isRowOpenIgnoredTarget(event.target)) return;
    onOpenDetails();
  }
  function handleCardKeyDown(event: ReactKeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (isRowOpenIgnoredTarget(event.target)) return;
    event.preventDefault();
    onOpenDetails();
  }
  const meta = itemMetaLine(item);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${item.name}`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      className={`relative flex cursor-pointer gap-2.5 rounded-md border border-border bg-card p-2 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring ${presentation === "grid" ? "flex-col items-stretch" : "items-center"}`}
    >
      <label
        className={presentation === "grid" ? "absolute left-3 top-3 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-card" : "flex min-h-11 min-w-9 items-center justify-center"}
        aria-label={`Select ${item.name}`}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
        />
      </label>
      <ItemThumbnail householdId={householdId} moveId={moveId} photoId={photoId} large={presentation === "grid"} />
      <div className="min-w-0 flex-1">
        <p className={presentation === "grid" ? "break-words text-base font-semibold leading-snug" : "line-clamp-1 break-words text-sm font-medium leading-snug"}>
          {item.name}
        </p>
        {meta ? (
          <p className={presentation === "grid" ? "mt-1 break-words text-sm text-muted-foreground" : "truncate text-xs text-muted-foreground"} title={meta}>{meta}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <div className={presentation === "grid" ? "flex flex-wrap items-center gap-1" : "hidden flex-col items-end gap-1 xs:flex sm:flex"}>
          <StatusBadge status={item.status} />
          <DispositionBadge disposition={item.disposition} />
        </div>
        {item.needsReview ? (
          <Badge variant="outline" className="hidden sm:inline-flex">
            Review
          </Badge>
        ) : null}
        <MovingSymbol name="arrow"
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </div>
    </div>
  );
}

// Batch transport-assign control: pick a resource, then optionally a zone.
// Reuses the listForMoveWithZones option shape from the load planner and writes
// through the shared batchUpdate path.
function AssignResourceMenu({
  householdId,
  moveId,
  onAssign,
  disabled,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  onAssign: (target: {
    assignedResourceId: Id<"transportResources">;
    assignedZoneId?: Id<"transportZones">;
  }) => void;
  disabled?: boolean;
}) {
  const resourcesWithZones = useQuery(
    api.transportResources.listForMoveWithZones,
    householdId && moveId ? { householdId, moveId } : "skip",
  );

  const hasResources = (resourcesWithZones?.length ?? 0) > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          <MovingSymbol name="truck" />
          Assign
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>Assign to transport</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!hasResources ? (
          <DropdownMenuItem disabled>No transport resources</DropdownMenuItem>
        ) : (
          resourcesWithZones?.map(({ resource, zones }) => (
            <div key={resource._id}>
              <DropdownMenuItem
                onSelect={() =>
                  onAssign({ assignedResourceId: resource._id })
                }
              >
                {resource.name}
              </DropdownMenuItem>
              {zones.map((zone) => (
                <DropdownMenuItem
                  key={zone._id}
                  className="pl-6 text-xs"
                  onSelect={() =>
                    onAssign({
                      assignedResourceId: resource._id,
                      assignedZoneId: zone._id,
                    })
                  }
                >
                  {zone.name}
                </DropdownMenuItem>
              ))}
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const [dispositionGroup, setDispositionGroup] =
    useState<DispositionGroup>("all");
  const [savedFilter, setSavedFilter] = useState<InventoryFilterKey>("all");
  const [facetSelection, setFacetSelection] = useState<FacetSelection>({});
  const [presentation, setPresentation, presentationReady] = useCollectionPresentation("items");
  const [newItemName, setNewItemName] = useState("");
  const [newItemRoom, setNewItemRoom] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [newItemDisposition, setNewItemDisposition] =
    useState<(typeof itemDispositionOptions)[number]>("undecided");
  const [message, setMessage] = useState<string | null>(null);
  // Double-submit guards: a fast double-click on Add would create a DUPLICATE
  // item (create is not idempotent), and re-firing a batch mid-flight is wasted
  // work. These disable the relevant buttons while their mutation runs.
  const [creating, setCreating] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [sortField, setSortField] = useState<SortFieldId>(DEFAULT_SORT_FIELD);
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

  // The faceted query returns the full move set plus disposition facet counts.
  // We keep search/owner/saved-filter slicing client-side (reusing the existing
  // helpers) and apply the primary disposition-group filter client-side too,
  // because the facet groups (Moving spans four dispositions) don't map to the
  // server's single-disposition arg. Facet counts come straight from the server
  // and stay stable regardless of the active group.
  const faceted = useQuery(
    api.items.facetedListForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const items = faceted?.items;
  const facets = faceted?.facets;
  // Cover photos for the compact rows. Newest-first, so the first photo per item
  // is its most recent — a good default thumbnail.
  const photosData = useQuery(
    api.photos.listForMove,
    householdId && moveId ? { householdId, moveId, limit: 250 } : "skip",
  ) as Array<Doc<"itemPhotos">> | undefined;
  const photoByItem = useMemo(() => {
    const map = new Map<string, Id<"itemPhotos">>();
    for (const photo of photosData ?? []) {
      if (photo.archivedAt || !photo.itemId) continue;
      const key = String(photo.itemId);
      if (!map.has(key)) map.set(key, photo._id);
    }
    return map;
  }, [photosData]);
  const createItem = useMutation(api.items.create);
  const updateItem = useMutation(api.items.update);
  const setItemDisposition = useMutation(api.items.setDisposition);
  const batchUpdateItems = useMutation(api.items.batchUpdate);

  const dispositionFilteredItems = useMemo(() => {
    if (!items) {
      return [];
    }
    if (dispositionGroup === "all") {
      return items;
    }
    const members = new Set<InventoryItem["disposition"]>(
      dispositionGroupMembers[dispositionGroup],
    );
    return items.filter((item) => members.has(item.disposition));
  }, [items, dispositionGroup]);

  const facetDefinitions = useMemo<CollectionFacet<InventoryItem>[]>(() => {
    const owners = new Map((items ?? []).filter(item => item.ownerPersonId).map(item => [String(item.ownerPersonId), item.ownerContact ? `${item.ownerContact.name} — ${item.ownerContact.role}` : `Owner unavailable · includes ${item.name}`]));
    return [
      { id: "room", label: "Room", values: item => [item.room] },
      { id: "category", label: "Category", values: item => [item.category] },
      { id: "owner", label: "Owner / contact", values: item => [item.ownerPersonId], labelValue: value => owners.get(value) ?? "Owner not available", missingLabel: "Unassigned" },
      { id: "status", label: "Status", values: item => [item.status], labelValue: enumDisplayLabel },
      { id: "disposition", label: "Disposition", values: item => [item.disposition], labelValue: dispositionDisplayLabel },
      { id: "condition", label: "Condition", values: item => [item.condition], labelValue: enumDisplayLabel },
      { id: "review", label: "Review", values: item => [item.needsReview ? "Needs review" : "No review flag"] },
      { id: "value", label: "High value", values: item => [item.highValue ? "High value" : "Not flagged high value"] },
      { id: "photo", label: "Photos", values: item => [(item.signals?.photoCount ?? 0) > 0 ? "Has photos" : "No photos"] },
      { id: "evidence", label: "Evidence", values: item => [(item.signals?.evidencePhotoCount ?? 0) > 0 ? "Has evidence photos" : "No evidence photos"] },
      { id: "box", label: "Box", values: item => [item.signals?.boxCount ? "In a box" : "Not in a box"] },
      { id: "load", label: "Load", values: item => [item.assignedResourceId || item.signals?.assignmentCount ? "Has load assignment" : "No load assignment"] },
    ];
  }, [items]);
  const viewItems = useMemo(() => filterInventoryItems(dispositionFilteredItems, savedFilter, search), [dispositionFilteredItems, savedFilter, search]);
  const countedFacets = useMemo(() => countFacets(viewItems, facetDefinitions, facetSelection), [viewItems, facetDefinitions, facetSelection]);
  const filteredItems = useMemo(() => viewItems.filter(item => matchesFacets(item, facetDefinitions, facetSelection)), [viewItems, facetDefinitions, facetSelection]);
  // Preset order is shared by Table/List/Grid. Header sorts can refine it;
  // changing presentation never resets either sort or the current query.
  const sortedItems = useMemo(() => {
    const compare = compareBy(sortField);
    return [...filteredItems].sort((a, b) =>
      compare(itemToSortable(a), itemToSortable(b)),
    );
  }, [filteredItems, sortField]);
  const selectedItem = useMemo(
    () => items?.find((item) => item._id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  // Live facet pill counts straight from the server. Falls back to 0 while the
  // first query is in flight.
  const dispositionGroupCounts: Record<DispositionGroup, number> = {
    all: facets?.total ?? 0,
    moving: facets?.moving ?? 0,
    sell: facets?.sell ?? 0,
    trash: facets?.trash ?? 0,
    donate: facets?.donate ?? 0,
  };

  async function handleCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!householdId || !moveId || !newItemName.trim() || creating) {
      return;
    }

    setMessage(null);
    setCreating(true);

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
      toastSaved("Item added");
    } catch {
      setMessage("Could not add that item yet.");
      toastError("Could not add that item");
    } finally {
      setCreating(false);
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

  // Inline single-cell disposition quick-classify. Uses the lighter
  // setDisposition mutation (one row -> one focused write) instead of the full
  // update path. Status / needs-review inline edits keep using update.
  const quickClassify = useCallback(
    async (item: InventoryItem, disposition: InventoryItem["disposition"]) => {
      if (!householdId || !moveId) {
        return;
      }

      try {
        await setItemDisposition({
          householdId,
          moveId,
          itemId: item._id,
          disposition,
        });
      } catch {
        setMessage("Could not update that item's disposition yet.");
      }
    },
    [householdId, moveId, setItemDisposition],
  );

  // Server-side batch. Replaces the old per-row Promise.all fan-out: a single
  // batchUpdate call applies the same disposition / status / assignment patch to
  // every selected row, with one permission check and per-item audit on the
  // server.
  const handleBatchUpdate = useCallback(
    async (
      patch: ItemBatchPatch,
      rows: InventoryItem[],
      clearSelection: () => void,
    ) => {
      if (!householdId || !moveId || !rows.length || batchBusy) {
        return;
      }

      setMessage(null);
      setBatchBusy(true);

      try {
        const result = await batchUpdateItems({
          householdId,
          moveId,
          itemIds: rows.map((item) => item._id),
          patch,
        });
        clearSelection();
        if (result.failed > 0) {
          const detail = `${result.succeeded} updated, ${result.failed} could not be changed.`;
          setMessage(detail);
          toastError(detail);
        } else {
          setMessage(`${result.succeeded} items updated.`);
          toastSaved(`${result.succeeded} items updated`);
        }
      } catch {
        setMessage("Could not update the selected items yet.");
        toastError("Could not update the selected items");
      } finally {
        setBatchBusy(false);
      }
    },
    [batchBusy, batchUpdateItems, householdId, moveId],
  );

  // Personal transport + needs review are boolean flags the server batchUpdate
  // does not cover, so they stay on the per-row update path.
  const handleBatchFlag = useCallback(
    async (
      patch: InventoryItemPatch,
      rows: InventoryItem[],
      clearSelection: () => void,
    ) => {
      if (!rows.length || batchBusy) {
        return;
      }

      setMessage(null);
      setBatchBusy(true);

      try {
        // allSettled (not all): one row failing shouldn't mask how many of the
        // others succeeded — report real succeeded/failed counts.
        const results = await Promise.allSettled(
          rows.map((item) => patchItem(item, patch)),
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        const succeeded = results.length - failed;
        clearSelection();
        if (failed > 0) {
          const detail = `${succeeded} updated, ${failed} could not be changed.`;
          setMessage(detail);
          toastError(detail);
        } else {
          setMessage(`${succeeded} items updated.`);
          toastSaved(`${succeeded} items updated`);
        }
      } catch {
        setMessage("Could not update the selected items yet.");
        toastError("Could not update the selected items");
      } finally {
        setBatchBusy(false);
      }
    },
    [batchBusy, patchItem],
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
            {row.original.code ? (
              <p className="font-mono text-[0.7rem] tracking-wide text-muted-foreground">
                {row.original.code}
              </p>
            ) : null}
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
            <MovingSymbol name="note" />
            Details
          </Button>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "status",
        meta: {
          groupable: true,
          groupOrder: itemStatusOptions,
          groupLabel: value => enumDisplayLabel(String(value)),
          label: "Status",
          mobile: "primary",
          headClassName: "w-28",
          editable: true,
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Status" />
        ),
        cell: ({ row }) => (
            <InlineSelectCell
              value={row.original.status}
              options={itemStatusOptions}
              ariaLabel={`Status for ${row.original.name}`}
              className={row.original.status === "missing" || row.original.status === "damaged" ? "border-destructive/50 bg-destructive/10 text-destructive" : undefined}
              renderLabel={enumDisplayLabel}
              onValueChange={(status) =>
                void patchItem(row.original, { status })
              }
            />
        ),
      },
      {
        accessorKey: "disposition",
        meta: {
          groupable: true,
          groupLabel: value => dispositionDisplayLabel(String(value)),
          groupOrder: itemDispositionOptions,
          label: "Disposition",
          mobile: "primary",
          headClassName: "w-32",
          editable: true,
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Disposition" />
        ),
        cell: ({ row }) => (
            <InlineSelectCell
              value={row.original.disposition}
              options={itemDispositionOptions}
              ariaLabel={`Disposition for ${row.original.name}`}
              onValueChange={(disposition) =>
                void quickClassify(row.original, disposition)
              }
              renderLabel={dispositionLabel}
            />
        ),
      },
      {
        id: "indicators",
        meta: {
          label: "Indicators",
          mobile: "primary",
          headClassName: "min-w-[8rem] w-[12rem]",
          cellClassName: "max-w-[12rem] whitespace-normal",
          description:
            "Compact flags for evidence, boxes, load, value, and review.",
        },
        header: "Indicators",
        enableSorting: false,
        cell: ({ row, table }) => <InventoryIndicators item={row.original} includeReview={!table.getColumn("review")?.getIsVisible()} />,
      },
      {
        accessorKey: "room",
        meta: { label: "Room", mobile: "primary", groupable: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Room" />
        ),
        cell: ({ row }) => row.original.room ?? "Unassigned",
      },
      {
        accessorKey: "category",
        meta: { label: "Category", mobile: "expansion", groupable: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Category" />
        ),
        cell: ({ row }) => row.original.category ?? "Uncategorized",
      },
      {
        id: "ownerContact",
        accessorFn: (row) => row.ownerContact?.name ?? "",
        meta: {
          groupable: true,
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
        meta: { label: "Condition", mobile: "expansion", groupable: true, groupLabel: value => enumDisplayLabel(String(value)) },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Condition" />
        ),
        cell: ({ row }) => enumDisplayLabel(row.original.condition),
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
          groupable: true,
          label: "Review",
          mobile: "hidden",
          headClassName: "min-w-24 w-24",
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
            label="Review"
            onCheckedChange={(checked) =>
              void patchItem(row.original, { needsReview: checked })
            }
          />
        ),
      },
    ],
    [patchItem, quickClassify],
  );

  // The DataTable owns the tanstack instance; the adapter keeps the shared
  // sorting/filter/visibility/selection state and feeds it in controlled.
  const presentationColumns = useMemo(() => columns.map(column => {
    const id = column.id ?? ("accessorKey" in column ? String(column.accessorKey) : "");
    const next: ColumnDef<InventoryItem, unknown> = { ...column };
    next.meta = { ...column.meta, mobile: column.meta?.mobile ?? "expansion", label: column.meta?.label ?? columnLabels[id] ?? id, description: column.meta?.description ?? columnDescriptions[id] };
    return next;
  }), [columns]);

  // Page reset on filter change is handled by the DataTable's tanstack
  // instance (autoResetPageIndex), so the adapter no longer manages it.
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const loadingItems = Boolean(moveId) && faceted === undefined;
  const totalItemCount = items?.length ?? filteredItems.length;
  const activeInventoryTask =
    inventoryTaskTabs.find((task) => task.value === activeTaskTab) ??
    inventoryTaskTabs[0];
  const inventoryTaskCounts: Partial<Record<InventoryTaskTab, number>> = {
    browse: filteredItems.length,
  };
  const hasActiveBrowseFilters =
    search.trim().length > 0 ||
    Object.values(facetSelection).some(values => values.length > 0) ||
    savedFilter !== "all" ||
    dispositionGroup !== "all";

  function clearBrowseFilters() {
    setSearch("");
    setFacetSelection({});
    setColumnFilters([]);
    setSavedFilter("all");
    setDispositionGroup("all");
  }

  const viewSnapshot: InventoryViewSnapshot = {
    search, savedFilter, dispositionGroup,
    facets: Object.fromEntries(Object.entries(facetSelection).filter(([, values]) => values.length).map(([id, values]) => [id, [...values].sort()])),
    sorting, sortField, columns: normalizeInventoryColumns(columnVisibility), presentation,
  };
  const builtInViews = inventorySavedFilters.map(filter => ({
    id: `built-in:${filter.key}`, label: filter.label, description: filter.description,
    count: items ? filterInventoryItems(items, filter.key, "").length : undefined,
    snapshot: { search: "", savedFilter: filter.key, dispositionGroup: "all" as const, facets: {}, sorting, sortField, columns: normalizeInventoryColumns(columnVisibility), presentation },
  }));
  function applyView(view: InventoryViewSnapshot) {
    setSearch(view.search); setSavedFilter(view.savedFilter); setDispositionGroup(view.dispositionGroup);
    setFacetSelection(view.facets); setSorting(view.sorting); setSortField(view.sortField);
    setColumnVisibility(view.columns); setPresentation(view.presentation); setColumnFilters([]);
  }

  return (
    <>
      <Card size="sm">
        <CardHeader className="gap-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Items</CardTitle>
              <CardDescription className="hidden sm:block">
                Every item in this move. Slice by disposition, search, classify
                inline, or select rows to re-classify in a batch.
              </CardDescription>
            </div>
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
              {/* Primary disposition facet — the headline slice. Counts come
                  from the server facets and stay stable while a chip is active. */}
              <div
                role="group"
                aria-label="Disposition filter"
                className="flex flex-wrap gap-1 rounded-md border border-border bg-background p-1"
              >
                {dispositionGroupChips.map((chip) => {
                  const active = dispositionGroup === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors md:min-h-8 ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                      aria-pressed={active}
                      onClick={() => setDispositionGroup(chip.key)}
                    >
                      <span className="font-medium">{chip.label}</span>
                      <span
                        className={`rounded px-1.5 text-xs ${
                          active
                            ? "bg-primary-foreground/20"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {dispositionGroupCounts[chip.key]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <section aria-labelledby="inventory-filter-heading" className="collection-controls space-y-3">
                <h3 id="inventory-filter-heading" className="sr-only">Find and filter</h3>
                <CollectionViewTabs<InventoryViewSnapshot> key={`${householdId}:${moveId}`} storageKey={`assistwithmoving.views.items.${householdId}.${moveId}.v1`} builtIns={builtInViews} snapshot={viewSnapshot} onApply={applyView} parseSnapshot={parseInventoryView} ready={presentationReady} />
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="relative min-w-40 flex-1">
                    <MovingSymbol name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="h-11 pl-8 md:h-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search items, rooms, people, categories" aria-label="Search inventory" />
                  </div>
                  <CollectionFilterSheet facets={countedFacets} selection={facetSelection} onChange={setFacetSelection} loading={loadingItems} />
                </div>
                {hasActiveBrowseFilters ? <div role="group" aria-label="Active inventory filters" className="flex flex-wrap items-center gap-1">
                  {search.trim() ? <Button type="button" variant="secondary" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal text-left" aria-label="Remove search filter" onClick={() => setSearch("")}>Search: {search}<MovingSymbol name="close" className="size-3.5 shrink-0" /></Button> : null}
                  {dispositionGroup !== "all" ? <Button type="button" variant="secondary" size="sm" aria-label="Remove disposition group filter" onClick={() => setDispositionGroup("all")}>Disposition: {dispositionGroupChips.find(chip => chip.key === dispositionGroup)?.label}<MovingSymbol name="close" className="size-3.5" /></Button> : null}
                  <CollectionFilterChips facets={countedFacets} selection={facetSelection} onChange={setFacetSelection} />
                  <Button type="button" variant="ghost" size="sm" onClick={clearBrowseFilters}>Clear all</Button>
                </div> : null}
              </section>

              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Inventory records</h3>
                  <p className="text-xs text-muted-foreground" role="status">
                    {filteredItems.length} of {totalItemCount} records
                    {selectedCount ? ` · ${selectedCount} selected` : ""}
                  </p>
                </div>

              </div>

              <DataTable
                data={sortedItems}
                columns={presentationColumns}
                getRowId={(item) => item._id}
                onRowOpen={(item) => {
                  setSelectedItemId(item._id);
                  setDetailOpen(true);
                }}
                getRowOpenLabel={(item) => `Open ${item.name} details`}
                ariaLabel="Inventory records table"
                preferenceKey="items"
                sortPresets={{ options: INVENTORY_SORT_OPTIONS, value: sorting.length ? null : sortField, onChange: field => { setSortField(field as SortFieldId); setSorting([]); } }}
                unfilteredCount={totalItemCount}
                onClearFilters={clearBrowseFilters}
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
                renderMobileCard={({ row, selected, onSelectedChange, view }) => (
                  <InventoryItemCard
                    presentation={view}
                    item={row}
                    selected={selected}
                    onSelectedChange={onSelectedChange}
                    onOpenDetails={() => {
                      setSelectedItemId(row._id);
                      setDetailOpen(true);
                    }}
                    photoId={photoByItem.get(String(row._id))}
                    householdId={householdId}
                    moveId={moveId}
                  />
                )}
                batchActions={({ selectedRows, clearSelection }) => (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={batchBusy}
                      onClick={() =>
                        void handleBatchUpdate(
                          { disposition: "take" },
                          selectedRows,
                          clearSelection,
                        )
                      }
                    >
                      Moving
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={batchBusy}
                      onClick={() =>
                        void handleBatchUpdate(
                          { disposition: "sell" },
                          selectedRows,
                          clearSelection,
                        )
                      }
                    >
                      Sell
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={batchBusy}
                      onClick={() =>
                        void handleBatchUpdate(
                          { disposition: "donate" },
                          selectedRows,
                          clearSelection,
                        )
                      }
                    >
                      Donate
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={batchBusy}
                      onClick={() =>
                        void handleBatchUpdate(
                          { disposition: "dump" },
                          selectedRows,
                          clearSelection,
                        )
                      }
                    >
                      Trash
                    </Button>
                    <AssignResourceMenu
                      householdId={householdId}
                      moveId={moveId}
                      onAssign={(target) =>
                        void handleBatchUpdate(
                          target,
                          selectedRows,
                          clearSelection,
                        )
                      }
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" variant="outline">
                          More
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          onSelect={() =>
                            void handleBatchUpdate(
                              { status: "packed" },
                              selectedRows,
                              clearSelection,
                            )
                          }
                        >
                          Mark packed
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            void handleBatchUpdate(
                              { status: "staged" },
                              selectedRows,
                              clearSelection,
                            )
                          }
                        >
                          Mark staged
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() =>
                            void handleBatchFlag(
                              {
                                disposition: "personalTransport",
                                requiresPersonalTransport: true,
                              },
                              selectedRows,
                              clearSelection,
                            )
                          }
                        >
                          Personal transport
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            void handleBatchFlag(
                              { needsReview: true },
                              selectedRows,
                              clearSelection,
                            )
                          }
                        >
                          Flag for review
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
                emptyState={
                  <EmptyState
                    title="No inventory records"
                    description="Add inventory items or change the disposition facet, saved filter, and search terms."
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
                      {dispositionLabel(disposition)}
                    </option>
                  ))}
                </select>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!moveId || !newItemName.trim() || creating}
                >
                  <MovingSymbol name="add" />
                  {creating ? "Adding…" : "Add"}
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
        origin="items"
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

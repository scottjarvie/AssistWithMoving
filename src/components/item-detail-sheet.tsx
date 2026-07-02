"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  Boxes,
  Camera,
  ClipboardList,
  Images,
  Ruler,
  PackageCheck,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { buildBoxLookupPath, type BoxLookupReturnTo } from "@/lib/box-labels";
import { toastSaved, toastError } from "@/lib/toast";
import { physicalSpaceNames } from "@/lib/space-kinds";
import { SpaceSelect } from "@/components/space-select";
import { PhotoEvidenceStrip } from "@/components/photo-evidence-strip";
import { PhotoUploadControl } from "@/components/photo-upload-control";
import { ItemHeroImage } from "@/components/item-hero-image";
import { PhotoPickerDialog } from "@/components/photo-picker-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  formatOptionalCurrencyCents,
  formatOptionalNumber,
  parseCommaList,
  parseOptionalCurrencyCents,
  parseOptionalNumber,
} from "@/lib/inventory-detail";
import { itemDimensionsConfidenceForRead } from "@/lib/inventory-measurements";
import {
  itemConditionOptions,
  itemDispositionOptions,
  itemFragilityOptions,
  itemStatusOptions,
} from "@/lib/inventory-options";
import type { InventoryItem, InventoryItemPatch } from "@/lib/inventory-types";

type ItemDetailSheetProps = {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: InventoryItemPatch) => Promise<void>;
  // Which list page this sheet was opened from. Used so "Convert to box" sends
  // the new box's Back button to where the user actually is — not always
  // Movable Units. Defaults to "movable-units" when unset.
  origin?: BoxLookupReturnTo;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function FlagField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-sm">
      <input
        type="checkbox"
        className="size-3.5 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function InfoBlock({
  icon: Icon,
  title,
  value,
}: {
  icon: typeof PackageCheck;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        {title}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{value}</p>
    </div>
  );
}

type MeasurementProvenance = NonNullable<
  InventoryItem["measurementProvenance"]
>;
type MeasurementProvenanceEntry = NonNullable<
  MeasurementProvenance["dimensions"]
>;

const provenanceSourceLabels: Record<
  MeasurementProvenanceEntry["sourceType"],
  string
> = {
  unknown: "Unknown source",
  photoEstimate: "Photo estimate",
  conversationEstimate: "Conversation estimate",
  aiEstimate: "AI estimate",
  manualEstimate: "Manual estimate",
  manualMeasurement: "Manual measurement",
  productResearch: "Product research",
  manufacturerSpec: "Manufacturer spec",
  moverEstimate: "Mover estimate",
  moverConfirmed: "Mover confirmed",
  import: "Imported",
  api: "API supplied",
};

function ProvenanceCard({
  title,
  entry,
  fallbackConfidence,
  onConfirm,
}: {
  title: string;
  entry: MeasurementProvenanceEntry | undefined;
  fallbackConfidence: string | undefined;
  onConfirm?: () => void;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Badge
          variant={
            !entry ? "outline" : entry.needsVerification ? "destructive" : "secondary"
          }
        >
          {!entry ? "no source" : entry.needsVerification ? "verify" : "recorded"}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-muted-foreground">
        <div>
          <dt className="font-medium text-foreground">Source</dt>
          <dd>
            {entry
              ? provenanceSourceLabels[entry.sourceType]
              : "No source recorded"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Confidence</dt>
          <dd>{entry?.confidence ?? fallbackConfidence ?? "none"}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Recorded</dt>
          <dd>
            {entry
              ? `${new Date(entry.recordedAt).toLocaleDateString()}${
                  entry.recordedByLabel ? ` by ${entry.recordedByLabel}` : ""
                }`
              : "Not recorded"}
          </dd>
        </div>
        {entry?.label ? (
          <div>
            <dt className="font-medium text-foreground">Label</dt>
            <dd>{entry.label}</dd>
          </div>
        ) : null}
        {entry?.notes ? (
          <div>
            <dt className="font-medium text-foreground">Notes</dt>
            <dd>{entry.notes}</dd>
          </div>
        ) : null}
      </dl>
      {entry?.needsVerification && onConfirm ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3 w-full"
          onClick={onConfirm}
        >
          Mark verified
        </Button>
      ) : null}
    </div>
  );
}

// A measurement is "an estimate" when its confidence is low/medium (a guess),
// as opposed to a real measured value (actual/high/manual). Drives the
// "this is an estimate" checkboxes in Measurements.
function isEstimateConfidence(
  confidence: InventoryItem["weightConfidence"] | undefined,
): boolean {
  return (
    confidence === "low" || confidence === "medium" || confidence === "high"
  );
}

export function ItemDetailSheet({
  householdId,
  moveId,
  item,
  open,
  onOpenChange,
  onSave,
  origin = "movable-units",
}: ItemDetailSheetProps) {
  const initialWeightIsEstimate =
    isEstimateConfidence(item?.weightConfidence) ||
    Boolean(item?.actualWeightLb == null && item?.estimatedWeightLb != null);
  const initialVolumeIsEstimate = isEstimateConfidence(item?.volumeConfidence);
  const initialDimensionsAreEstimate = isEstimateConfidence(
    item?.dimensionsConfidence,
  );
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [room, setRoom] = useState(item?.room ?? "");
  const [destinationRoom, setDestinationRoom] = useState(
    item?.destinationRoom ?? ""
  );
  // Present location is a SINGLE value — a space OR a transport (MOVE-349 ph.7).
  const [presentSpaceId, setPresentSpaceId] = useState<string>(
    item?.currentSpaceId ?? ""
  );
  const [presentResourceId, setPresentResourceId] = useState<string>(
    item?.assignedResourceId ?? ""
  );
  const [presentZoneId, setPresentZoneId] = useState<string>(
    item?.assignedZoneId ?? ""
  );
  const [category, setCategory] = useState(item?.category ?? "");
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? "");
  const [ownerPersonId, setOwnerPersonId] = useState<Id<"movePeople"> | "">(
    item?.ownerPersonId ?? ""
  );
  const [status, setStatus] = useState<InventoryItem["status"]>(
    item?.status ?? "active"
  );
  const [disposition, setDisposition] = useState<
    InventoryItem["disposition"]
  >(item?.disposition ?? "undecided");
  const [quantity, setQuantity] = useState(
    formatOptionalNumber(item?.quantity ?? 1)
  );
  const [condition, setCondition] = useState<InventoryItem["condition"]>(
    item?.condition ?? "unknown"
  );
  const [fragility, setFragility] = useState<InventoryItem["fragility"]>(
    item?.fragility ?? "low"
  );
  const [stackable, setStackable] = useState(item?.stackable ?? true);
  const [hazardousFlag, setHazardousFlag] = useState(
    item?.hazardousFlag ?? false
  );
  const [highValue, setHighValue] = useState(item?.highValue ?? false);
  const [requiresPersonalTransport, setRequiresPersonalTransport] = useState(
    item?.requiresPersonalTransport ?? false
  );
  const [needsReview, setNeedsReview] = useState(item?.needsReview ?? false);
  const [valueDollars, setValueDollars] = useState(
    formatOptionalCurrencyCents(item?.valueCents)
  );
  const [replacementValueDollars, setReplacementValueDollars] = useState(
    formatOptionalCurrencyCents(item?.replacementValueCents)
  );
  const [serialNumber, setSerialNumber] = useState(item?.serialNumber ?? "");
  const [modelNumber, setModelNumber] = useState(item?.modelNumber ?? "");
  const [lengthIn, setLengthIn] = useState(
    formatOptionalNumber(item?.dimensionsIn?.lengthIn)
  );
  const [widthIn, setWidthIn] = useState(
    formatOptionalNumber(item?.dimensionsIn?.widthIn)
  );
  const [heightIn, setHeightIn] = useState(
    formatOptionalNumber(item?.dimensionsIn?.heightIn)
  );
  const [dimensionsConfidence, setDimensionsConfidence] = useState<
    InventoryItem["dimensionsConfidence"]
  >(
    itemDimensionsConfidenceForRead({
      dimensionsIn: item?.dimensionsIn,
      dimensionsConfidence: item?.dimensionsConfidence,
    }) ?? "none",
  );
  const [estimatedWeightLowLb, setEstimatedWeightLowLb] = useState(
    formatOptionalNumber(item?.estimatedWeightLowLb)
  );
  const [estimatedWeightHighLb, setEstimatedWeightHighLb] = useState(
    formatOptionalNumber(item?.estimatedWeightHighLb)
  );
  // ONE weight field, init from the actual weight or, failing that, the estimate
  // (so the value always shows). The "estimate" checkbox below records whether
  // it's a guess vs a measured value (via weightConfidence) and reveals a range.
  const [actualWeightLb, setActualWeightLb] = useState(
    formatOptionalNumber(item?.actualWeightLb ?? item?.estimatedWeightLb)
  );
  const [estimatedVolumeCuFt, setEstimatedVolumeCuFt] = useState(
    formatOptionalNumber(item?.estimatedVolumeCuFt)
  );
  const [estimatedPackedVolumeCuFt, setEstimatedPackedVolumeCuFt] = useState(
    formatOptionalNumber(item?.estimatedPackedVolumeCuFt)
  );
  const [weightConfidence, setWeightConfidence] = useState<
    InventoryItem["weightConfidence"]
  >(item?.weightConfidence ?? "none");
  const [volumeConfidence, setVolumeConfidence] = useState<
    InventoryItem["volumeConfidence"]
  >(item?.volumeConfidence ?? "none");
  // "This is an estimate" toggles — one per measurement. Checked ⇒ the value is a
  // guess (stored as confidence "estimated") and the estimate extras (weight
  // range / packed volume) show; unchecked ⇒ a real measurement ("manual").
  const [weightIsEstimate, setWeightIsEstimate] = useState(
    initialWeightIsEstimate,
  );
  const [volumeIsEstimate, setVolumeIsEstimate] = useState(
    initialVolumeIsEstimate,
  );
  const [dimensionsAreEstimate, setDimensionsAreEstimate] = useState(
    initialDimensionsAreEstimate,
  );
  // Owner / Condition / Fragility are rarely touched — hidden behind a toggle.
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [privateNotes, setPrivateNotes] = useState(item?.privateNotes ?? "");
  const [reviewFlags, setReviewFlags] = useState(
    (item?.reviewFlags ?? []).join(", ")
  );
  const [aiSummary, setAiSummary] = useState(item?.aiSummary ?? "");
  const [aiTags, setAiTags] = useState((item?.aiTags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Convert a misclassified item (a real tote/box entered as an item) into a
  // numbered box (MOVE: "they should have a box number").
  const router = useRouter();
  const convertToBox = useMutation(api.boxes.convertItemToBox);
  const removeItem = useMutation(api.items.remove);
  const [converting, setConverting] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // "Choose from existing photos" picker (MOVE-354) — reuse a move photo on
  // this item instead of only uploading new ones.
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

  async function handleConvertToBox() {
    if (!householdId || !moveId || !item) return;
    setConverting(true);
    setMessage(null);
    try {
      const result = await convertToBox({
        householdId,
        moveId,
        itemId: item._id,
      });
      toastSaved("Converted to a box");
      onOpenChange(false);
      router.push(
        buildBoxLookupPath({
          householdId,
          moveId,
          boxId: result.boxId,
          returnTo: origin,
        }),
      );
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Could not convert to a box.";
      setMessage(detail);
      toastError(detail);
      setConverting(false);
      setConfirmConvert(false);
    }
  }

  async function handleRemoveItem() {
    if (!householdId || !moveId || !item) return;
    setRemoving(true);
    setMessage(null);
    try {
      await removeItem({ householdId, moveId, itemId: item._id });
      toastSaved("Item removed");
      onOpenChange(false);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Could not remove this item.";
      setMessage(detail);
      toastError(detail);
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  // Sell / trash end-states + pricing. The asking price lives on the item's sale
  // listing; "sold"/"trashed" archive the item (we don't own it anymore).
  const sellListing = useQuery(
    api.saleListings.getForItem,
    householdId && moveId && item
      ? { householdId, moveId, itemId: item._id }
      : "skip",
  );
  const upsertListing = useMutation(api.saleListings.upsertForItem);
  const markSoldMutation = useMutation(api.saleListings.markSold);
  const markTrashedMutation = useMutation(api.items.markTrashed);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [confirmSell, setConfirmSell] = useState(false);
  const [soldPriceDraft, setSoldPriceDraft] = useState("");

  async function handleSaveAskingPrice(value: string) {
    if (!householdId || !moveId || !item) return;
    const trimmed = value.trim();
    const currentPrice = sellListing?.officialPriceCents ?? undefined;
    if (!trimmed) {
      if (currentPrice === undefined) return;
      try {
        await upsertListing({
          householdId,
          moveId,
          itemId: item._id,
          clearOfficialPrice: true,
        });
        toastSaved("Asking price cleared");
      } catch {
        setMessage("Could not save the asking price.");
        toastError("Could not save the asking price");
      }
      return;
    }
    const cents = parseOptionalCurrencyCents(value);
    if (cents === undefined) {
      toastError("Enter a number for the asking price");
      return;
    }
    if (cents === currentPrice) return;
    try {
      await upsertListing({
        householdId,
        moveId,
        itemId: item._id,
        officialPriceCents: cents,
      });
      // Live-on-blur field — only fires when the value actually changed (guard
      // above), so this is a confirmation, not noise on every tab-out.
      toastSaved("Asking price saved");
    } catch {
      setMessage("Could not save the asking price.");
      toastError("Could not save the asking price");
    }
  }

  async function handleMarkSold(finalPrice: string) {
    if (!householdId || !moveId || !item) return;
    setLifecycleBusy(true);
    setMessage(null);
    try {
      await markSoldMutation({
        householdId,
        moveId,
        itemId: item._id,
        soldPriceCents: parseOptionalCurrencyCents(finalPrice),
      });
      toastSaved("Marked sold");
      onOpenChange(false);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Could not mark it sold.";
      setMessage(detail);
      toastError(detail);
      setLifecycleBusy(false);
      setConfirmSell(false);
    }
  }

  async function handleMarkTrashed() {
    if (!householdId || !moveId || !item) return;
    setLifecycleBusy(true);
    setMessage(null);
    try {
      await markTrashedMutation({ householdId, moveId, itemId: item._id });
      toastSaved("Marked trashed");
      onOpenChange(false);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Could not mark it trashed.";
      setMessage(detail);
      toastError(detail);
      setLifecycleBusy(false);
    }
  }

  const activity = useQuery(
    api.audit.listForObject,
    householdId && moveId && item
      ? {
          householdId,
          moveId,
          objectTable: "items",
          objectId: item._id,
          limit: 8,
        }
      : "skip"
  );
  const people = useQuery(
    api.movePeople.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const presentSpaces = useQuery(
    api.moveSpaces.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const presentTransport = useQuery(
    api.transportResources.listForMoveWithZones,
    householdId && moveId ? { householdId, moveId } : "skip"
  );

  if (!item) {
    return null;
  }
  const currentItem = item;

  // Origination / Destination are SPACE-only pickers (no transports).
  const spaceNameOptions = physicalSpaceNames(presentSpaces);

  // One present-location value, encoded as "space:<id>" | "transport:<id>".
  const presentValue = presentResourceId
    ? `transport:${presentResourceId}`
    : presentSpaceId
      ? `space:${presentSpaceId}`
      : "";
  const presentZones =
    presentTransport?.find(
      (entry) => String(entry.resource._id) === presentResourceId
    )?.zones ?? [];
  function onPresentLocationChange(value: string) {
    if (value.startsWith("space:")) {
      setPresentSpaceId(value.slice("space:".length));
      setPresentResourceId("");
      setPresentZoneId("");
    } else if (value.startsWith("transport:")) {
      setPresentResourceId(value.slice("transport:".length));
      setPresentSpaceId("");
      setPresentZoneId("");
    } else {
      setPresentSpaceId("");
      setPresentResourceId("");
      setPresentZoneId("");
    }
  }

  // A short, read-only label for the rail's key-facts strip — kept visible while
  // the form scrolls (MOVE-357).
  const presentLocationLabel = presentResourceId
    ? (presentTransport?.find(
        (entry) => String(entry.resource._id) === presentResourceId,
      )?.resource.name ?? "Transport")
    : presentSpaceId
      ? ((presentSpaces ?? []).find(
          (space) => String(space._id) === presentSpaceId,
        )?.name ?? "Space")
      : "Not set";

  const selectedOwner =
    people?.find((person) => person._id === ownerPersonId) ?? null;
  const ownerSummary = selectedOwner
    ? `${selectedOwner.name} (${selectedOwner.role})`
    : ownerPersonId
      ? "Owner no longer active"
      : "Unassigned";
  const itemSignals = item.signals;
  const photoSummary = `${itemSignals?.photoCount ?? 0} attached${
    itemSignals?.evidencePhotoCount
      ? `, ${itemSignals.evidencePhotoCount} evidence`
      : ""
  }`;
  const boxSummary = itemSignals?.boxCount
    ? `${itemSignals.boxCount} boxed${
        itemSignals.boxCodes.length ? `: ${itemSignals.boxCodes.join(", ")}` : ""
      }`
    : "Unboxed";
  const assignmentSummary = itemSignals?.assignmentCount
    ? [
        ...itemSignals.assignedResourceNames,
        ...itemSignals.assignedZoneNames,
      ].join(", ") || `${itemSignals.assignmentCount} assigned box`
    : item.requiresPersonalTransport
      ? "Personal transport"
      : "None";

  function updateDimensionInput(
    value: string,
    setter: (nextValue: string) => void,
  ) {
    setter(value);
    setDimensionsConfidence("manual");
  }

  function updateWeightEstimateInput(
    value: string,
    setter: (nextValue: string) => void,
  ) {
    setter(value);
    setWeightConfidence("manual");
  }

  function updateActualWeightInput(value: string) {
    setActualWeightLb(value);
    setWeightConfidence("actual");
  }

  function updateVolumeInput(
    value: string,
    setter: (nextValue: string) => void,
  ) {
    setter(value);
    setVolumeConfidence("manual");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const patch: InventoryItemPatch = {
        name,
        description,
        room,
        destinationRoom,
        // Present location is mutually exclusive: a transport clears the room,
        // a room clears the transport (MOVE-349). Origination/destination stand.
        ...(presentResourceId
          ? {
              assignedResourceId: presentResourceId as Id<"transportResources">,
              ...(presentZoneId
                ? { assignedZoneId: presentZoneId as Id<"transportZones"> }
                : { clearAssignedZone: true }),
              clearCurrentSpace: true,
            }
          : {
              clearAssignedResource: true,
              clearAssignedZone: true,
              ...(presentSpaceId
                ? { currentSpaceId: presentSpaceId as Id<"moveSpaces"> }
                : { clearCurrentSpace: true }),
            }),
        category,
        subcategory,
        status,
        disposition,
        quantity: parseOptionalNumber(quantity),
        condition,
        fragility,
        stackable,
        hazardousFlag,
        highValue,
        requiresPersonalTransport,
        needsReview,
        ...(ownerPersonId
          ? { ownerPersonId }
          : currentItem.ownerPersonId
            ? { clearOwnerPersonId: true }
            : {}),
        serialNumber,
        modelNumber,
        reviewFlags: parseCommaList(reviewFlags),
        privateNotes,
        aiSummary,
        aiTags: parseCommaList(aiTags),
      };
      const parsedQuantity = parseOptionalNumber(quantity);
      const parsedValueCents = parseOptionalCurrencyCents(valueDollars);
      const parsedReplacementValueCents = parseOptionalCurrencyCents(
        replacementValueDollars
      );
      const parsedEstimatedWeightLowLb =
        parseOptionalNumber(estimatedWeightLowLb);
      const parsedEstimatedWeightHighLb =
        parseOptionalNumber(estimatedWeightHighLb);
      const parsedActualWeightLb = parseOptionalNumber(actualWeightLb);
      const parsedEstimatedVolumeCuFt =
        parseOptionalNumber(estimatedVolumeCuFt);
      const parsedEstimatedPackedVolumeCuFt = parseOptionalNumber(
        estimatedPackedVolumeCuFt
      );
      const dimensions: NonNullable<InventoryItemPatch["dimensionsIn"]> = {};
      const parsedLengthIn = parseOptionalNumber(lengthIn);
      const parsedWidthIn = parseOptionalNumber(widthIn);
      const parsedHeightIn = parseOptionalNumber(heightIn);

      if (parsedQuantity !== undefined) patch.quantity = parsedQuantity;
      if (parsedValueCents !== undefined) patch.valueCents = parsedValueCents;
      if (parsedReplacementValueCents !== undefined) {
        patch.replacementValueCents = parsedReplacementValueCents;
      }
      if (parsedEstimatedWeightLowLb !== undefined) {
        patch.estimatedWeightLowLb = parsedEstimatedWeightLowLb;
      }
      if (parsedEstimatedWeightHighLb !== undefined) {
        patch.estimatedWeightHighLb = parsedEstimatedWeightHighLb;
      }
      if (parsedActualWeightLb !== undefined) {
        if (weightIsEstimate) {
          patch.estimatedWeightLb = parsedActualWeightLb;
        } else {
          patch.actualWeightLb = parsedActualWeightLb;
        }
      }
      if (
        parsedActualWeightLb !== undefined &&
        weightIsEstimate &&
        currentItem.actualWeightLb != null
      ) {
        patch.clearActualWeight = true;
      }
      if (parsedEstimatedVolumeCuFt !== undefined) {
        patch.estimatedVolumeCuFt = parsedEstimatedVolumeCuFt;
      }
      if (parsedEstimatedPackedVolumeCuFt !== undefined) {
        patch.estimatedPackedVolumeCuFt = parsedEstimatedPackedVolumeCuFt;
      }
      if (parsedLengthIn !== undefined) dimensions.lengthIn = parsedLengthIn;
      if (parsedWidthIn !== undefined) dimensions.widthIn = parsedWidthIn;
      if (parsedHeightIn !== undefined) dimensions.heightIn = parsedHeightIn;
      if (Object.keys(dimensions).length) {
        patch.dimensionsIn = dimensions;
      }
      const displayedWeightLb =
        currentItem.actualWeightLb ?? currentItem.estimatedWeightLb;
      const weightValueChanged =
        (parsedActualWeightLb !== undefined &&
          parsedActualWeightLb !== displayedWeightLb) ||
        (parsedEstimatedWeightLowLb !== undefined &&
          parsedEstimatedWeightLowLb !== currentItem.estimatedWeightLowLb) ||
        (parsedEstimatedWeightHighLb !== undefined &&
          parsedEstimatedWeightHighLb !== currentItem.estimatedWeightHighLb);
      const dimensionsValueChanged =
        (parsedLengthIn !== undefined &&
          parsedLengthIn !== currentItem.dimensionsIn?.lengthIn) ||
        (parsedWidthIn !== undefined &&
          parsedWidthIn !== currentItem.dimensionsIn?.widthIn) ||
        (parsedHeightIn !== undefined &&
          parsedHeightIn !== currentItem.dimensionsIn?.heightIn);
      const volumeValueChanged =
        (parsedEstimatedVolumeCuFt !== undefined &&
          parsedEstimatedVolumeCuFt !== currentItem.estimatedVolumeCuFt) ||
        (parsedEstimatedPackedVolumeCuFt !== undefined &&
          parsedEstimatedPackedVolumeCuFt !==
            currentItem.estimatedPackedVolumeCuFt);

      if (weightIsEstimate !== initialWeightIsEstimate || weightValueChanged) {
        patch.weightConfidence = weightIsEstimate ? "low" : "actual";
      }
      if (
        dimensionsAreEstimate !== initialDimensionsAreEstimate ||
        dimensionsValueChanged
      ) {
        patch.dimensionsConfidence = dimensionsAreEstimate ? "low" : "actual";
      }
      if (volumeIsEstimate !== initialVolumeIsEstimate || volumeValueChanged) {
        patch.volumeConfidence = volumeIsEstimate ? "low" : "actual";
      }

      await onSave(patch);
      // Close on success so the save unmistakably "lands" — a silent modal that
      // stayed open with a faint footer line was the app's #1 looks-broken bug.
      // The toast floats above everything (incl. this modal as it closes), so the
      // confirmation is visible even mid-transition.
      toastSaved("Item saved");
      onOpenChange(false);
    } catch {
      // Keep the modal open on failure so edits aren't lost; surface the error
      // both in the footer and as a toast.
      setMessage("Could not save item changes yet.");
      toastError("Could not save item changes — please try again");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmMeasurement(
    key: keyof MeasurementProvenance,
  ) {
    if (!item?.measurementProvenance?.[key]) return;
    const now = Date.now();
    await onSave({
      measurementProvenance: {
        ...item.measurementProvenance,
        [key]: {
          ...item.measurementProvenance[key],
          sourceType: "manualMeasurement",
          confidence: "manual",
          recordedAt: now,
          recordedByLabel: "Signed-in user",
          needsVerification: false,
          notes: [
            item.measurementProvenance[key]?.notes,
            "Measurement source marked verified in item detail.",
          ]
            .filter(Boolean)
            .join(" "),
        },
      },
    });
    setMessage(`${key} marked verified.`);
    toastSaved("Marked verified");
  }

  // Disposition-driven field gating. An item that is LEAVING the inventory
  // (sell / donate / free / dump) doesn't need move logistics — where it starts,
  // ends, or rides are all moot. Gated fields are only hidden (never reset), so
  // flipping the disposition back restores the values.
  const isLeavingInventory =
    disposition === "sell" ||
    disposition === "donate" ||
    disposition === "free" ||
    disposition === "dump";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-y-auto sm:max-w-5xl">
        <form className="flex min-h-full flex-col" onSubmit={handleSubmit}>
          <DialogHeader className="pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{item.name}</DialogTitle>
              <Badge variant={item.needsReview ? "destructive" : "secondary"}>
                {item.needsReview ? "review" : item.status}
              </Badge>
              <Badge variant="outline">{item.disposition}</Badge>
            </div>
            <DialogDescription>
              {item.code ? `${item.code} · ` : ""}Last updated{" "}
              {new Date(item.updatedAt).toLocaleDateString()}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 flex-col gap-4 px-4 pb-4 md:flex-row md:gap-6">
            {/* Left rail — hero + the facts that should stay visible while the
                form scrolls + the convert-to-box lifecycle. Pinned on desktop
                across every tab (MOVE-357). */}
            <aside className="space-y-3 md:sticky md:top-2 md:h-fit md:w-2/5 md:max-w-[20rem] md:shrink-0">
              <ItemHeroImage
                householdId={householdId}
                moveId={moveId}
                itemId={item._id}
              />
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-md border border-border p-3 text-sm">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="text-right font-medium capitalize">{status}</dd>
                <dt className="text-muted-foreground">Disposition</dt>
                <dd className="text-right font-medium capitalize">
                  {disposition}
                </dd>
                <dt className="text-muted-foreground">Present</dt>
                <dd className="text-right font-medium">
                  {presentLocationLabel}
                </dd>
                <dt className="text-muted-foreground">Value</dt>
                <dd className="text-right font-medium">
                  {valueDollars ? `$${valueDollars}` : "—"}
                </dd>
              </dl>
              {confirmConvert ? (
                <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
                  <p className="text-muted-foreground">
                    Turn this into a numbered box/tote? The item entry is replaced
                    by a box that can hold things.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={converting}
                      onClick={() => void handleConvertToBox()}
                    >
                      {converting ? "Converting…" : "Convert to box"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={converting}
                      onClick={() => setConfirmConvert(false)}
                    >
                      Keep as item
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setConfirmConvert(true)}
                  disabled={converting}
                >
                  <Boxes className="size-4" aria-hidden="true" />
                  Convert to a box/tote
                </Button>
              )}

              {confirmRemove ? (
                <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <p className="text-muted-foreground">
                    Permanently delete this item? It&apos;s removed from the move
                    along with its photos and any sale listing.{" "}
                    <span className="font-medium text-foreground">
                      This can&apos;t be undone.
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={removing}
                      onClick={() => void handleRemoveItem()}
                    >
                      {removing ? "Removing…" : "Remove item"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={removing}
                      onClick={() => setConfirmRemove(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => setConfirmRemove(true)}
                  disabled={removing}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Remove item
                </Button>
              )}
            </aside>

            <div className="md:min-w-0 md:flex-1">
            <Tabs defaultValue="details" className="gap-4">
              {/* On a phone six tabs can't share one 32px row — a 3-col grid
                  with real height beats a clipped flex-wrap. Releases the
                  primitive's h-8 cap with h-auto and gives each tab a 36px target. */}
              <TabsList className="grid h-auto w-full grid-cols-3 gap-1 [&>*]:min-h-9 sm:flex sm:flex-wrap sm:justify-start">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="measurements">Measurements</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
                <TabsTrigger value="handling">Handling</TabsTrigger>
                <TabsTrigger value="review">Review</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Name">
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Status">
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                      value={status}
                      onChange={(event) =>
                        setStatus(
                          event.target.value as InventoryItem["status"]
                        )
                      }
                    >
                      {itemStatusOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Disposition">
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                      value={disposition}
                      onChange={(event) =>
                        setDisposition(
                          event.target.value as InventoryItem["disposition"]
                        )
                      }
                    >
                      {itemDispositionOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Quantity">
                    <Input
                      inputMode="decimal"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                    />
                  </Field>
                  <Field label="Category">
                    <Input
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                    />
                  </Field>
                  <Field label="Subcategory">
                    <Input
                      value={subcategory}
                      onChange={(event) => setSubcategory(event.target.value)}
                    />
                  </Field>
                </div>

                <Field label="Description">
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>

                {disposition === "sell" ? (
                  <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Sell
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs">
                        <span className="mb-1 block text-muted-foreground">
                          Asking price ($)
                        </span>
                        <Input
                          key={`ask-${sellListing?.officialPriceCents ?? "none"}`}
                          inputMode="decimal"
                          defaultValue={formatOptionalCurrencyCents(
                            sellListing?.officialPriceCents ?? undefined,
                          )}
                          onBlur={(event) =>
                            void handleSaveAskingPrice(event.target.value)
                          }
                          className="h-9 w-32"
                          aria-label="Asking price in dollars"
                        />
                      </label>
                      {!confirmSell ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={lifecycleBusy}
                          onClick={() => {
                            setSoldPriceDraft(
                              formatOptionalCurrencyCents(
                                sellListing?.officialPriceCents ?? undefined,
                              ),
                            );
                            setConfirmSell(true);
                          }}
                        >
                          Mark sold
                        </Button>
                      ) : null}
                    </div>
                    {confirmSell ? (
                      <div className="flex flex-wrap items-end gap-2 rounded-md bg-background p-2">
                        <label className="text-xs">
                          <span className="mb-1 block text-muted-foreground">
                            Sold for ($)
                          </span>
                          <Input
                            inputMode="decimal"
                            value={soldPriceDraft}
                            onChange={(event) =>
                              setSoldPriceDraft(event.target.value)
                            }
                            className="h-9 w-32"
                            aria-label="Sold price in dollars"
                          />
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          disabled={lifecycleBusy}
                          onClick={() => void handleMarkSold(soldPriceDraft)}
                        >
                          {lifecycleBusy ? "Saving…" : "Confirm sold — archive"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={lifecycleBusy}
                          onClick={() => setConfirmSell(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : null}
                    <p className="text-[0.68rem] text-muted-foreground">
                      Marking sold records the amount and archives the item — you
                      no longer own it.
                    </p>
                  </div>
                ) : null}
                {disposition === "dump" ? (
                  <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Trash
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={lifecycleBusy}
                      onClick={() => void handleMarkTrashed()}
                    >
                      {lifecycleBusy ? "Saving…" : "Mark trashed — archive"}
                    </Button>
                    <p className="text-[0.68rem] text-muted-foreground">
                      Marking trashed archives the item — you no longer own it.
                    </p>
                  </div>
                ) : null}

                {/* Owner / Condition / Fragility — advanced, behind a toggle. */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedDetails((value) => !value)}
                    className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {showAdvancedDetails ? "Hide" : "Show"} advanced fields (owner,
                    condition, fragility)
                  </button>
                  {showAdvancedDetails ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Owner / contact">
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                          value={ownerPersonId}
                          onChange={(event) =>
                            setOwnerPersonId(
                              event.target.value as Id<"movePeople"> | ""
                            )
                          }
                        >
                          <option value="">Unassigned</option>
                          {people?.map((person) => (
                            <option key={person._id} value={person._id}>
                              {person.name} - {person.role}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Condition">
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                          value={condition}
                          onChange={(event) =>
                            setCondition(
                              event.target.value as InventoryItem["condition"]
                            )
                          }
                        >
                          {itemConditionOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Fragility">
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                          value={fragility}
                          onChange={(event) =>
                            setFragility(
                              event.target.value as InventoryItem["fragility"]
                            )
                          }
                        >
                          {itemFragilityOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  ) : null}
                </div>

                {/* Move logistics. Leaving-inventory items hide room routing, but
                    keep an existing transport assignment visible so it can be
                    cleared and stop counting against truck capacity. */}
                {!isLeavingInventory || presentResourceId ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {!isLeavingInventory ? (
                      <>
                        <Field label="Origination space">
                          <SpaceSelect
                            value={room}
                            onChange={setRoom}
                            spaceNames={spaceNameOptions}
                            ariaLabel="Origination space"
                          />
                        </Field>
                        <Field label="Destination space">
                          <SpaceSelect
                            value={destinationRoom}
                            onChange={setDestinationRoom}
                            spaceNames={spaceNameOptions}
                            ariaLabel="Destination space"
                          />
                        </Field>
                      </>
                    ) : null}
                    <div className="md:col-span-2">
                      <Field label="Transportation Method">
                        <select
                          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm sm:h-8"
                          value={presentValue}
                          onChange={(event) =>
                            onPresentLocationChange(event.target.value)
                          }
                          aria-label="Transportation method"
                        >
                          <option value="">Not set</option>
                          {(presentTransport ?? []).length === 0 ? (
                            <option value="" disabled>
                              Add a truck or trailer first
                            </option>
                          ) : (
                            (presentTransport ?? []).map((entry) => (
                              <option
                                key={entry.resource._id}
                                value={`transport:${entry.resource._id}`}
                              >
                                {entry.resource.name}
                              </option>
                            ))
                          )}
                        </select>
                        {presentResourceId && presentZones.length ? (
                          <select
                            className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-sm sm:h-8"
                            value={presentZoneId}
                            onChange={(event) =>
                              setPresentZoneId(event.target.value)
                            }
                            aria-label="Transport zone"
                          >
                            <option value="">No specific zone</option>
                            {presentZones.map((zone) => (
                              <option key={zone._id} value={zone._id}>
                                {zone.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        {isLeavingInventory && presentResourceId ? (
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            This item is leaving your inventory but is still
                            assigned to transport — clear this unless it&apos;s
                            riding along.
                          </p>
                        ) : null}
                      </Field>
                    </div>
                  </div>
                ) : null}

              </TabsContent>

              <TabsContent value="evidence" className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoBlock
                    icon={Camera}
                    title="Attached photos"
                    value={photoSummary}
                  />
                  <InfoBlock
                    icon={PackageCheck}
                    title="Evidence target"
                    value={
                      item.room ? `Item evidence in ${item.room}` : "Item evidence"
                    }
                  />
                </div>

                <PhotoUploadControl
                  householdId={householdId}
                  moveId={moveId}
                  itemId={item._id}
                  room={item.room}
                  label="Other Photos"
                  multiple
                />
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPhotoPickerOpen(true)}
                  >
                    <Images className="size-4" aria-hidden="true" />
                    Choose from existing photos
                  </Button>
                  <PhotoPickerDialog
                    householdId={householdId}
                    moveId={moveId}
                    target={{ kind: "item", itemId: item._id }}
                    targetLabel={item.name}
                    open={photoPickerOpen}
                    onOpenChange={setPhotoPickerOpen}
                    onAttached={() => {
                      setMessage("Photo attached to this item.");
                      toastSaved("Photo attached");
                    }}
                  />
                </div>
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  The main item photo is already used as the thumbnail. Add
                  extra angles, labels, condition shots, and evidence photos
                  here.
                </p>
                <PhotoEvidenceStrip
                  householdId={householdId}
                  moveId={moveId}
                  itemId={item._id}
                  omitFirstPhoto
                  label="Other photos"
                  emptyLabel="No other photos yet."
                />
              </TabsContent>

              <TabsContent value="measurements" className="space-y-5">
                {/* One field per measurement. The "estimate" checkbox marks it a
                    guess (low confidence) and reveals the estimate extras. */}
                <div className="space-y-2">
                  <Field label="Weight (lb)">
                    <Input
                      inputMode="decimal"
                      value={actualWeightLb}
                      onChange={(event) =>
                        updateActualWeightInput(event.target.value)
                      }
                    />
                  </Field>
                  <FlagField
                    label="I only have an estimate"
                    checked={weightIsEstimate}
                    onChange={(checked) => {
                      setWeightIsEstimate(checked);
                      setWeightConfidence(checked ? "low" : "actual");
                    }}
                  />
                  {weightIsEstimate ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Low estimate (lb)">
                        <Input
                          inputMode="decimal"
                          value={estimatedWeightLowLb}
                          onChange={(event) =>
                            updateWeightEstimateInput(
                              event.target.value,
                              setEstimatedWeightLowLb,
                            )
                          }
                        />
                      </Field>
                      <Field label="High estimate (lb)">
                        <Input
                          inputMode="decimal"
                          value={estimatedWeightHighLb}
                          onChange={(event) =>
                            updateWeightEstimateInput(
                              event.target.value,
                              setEstimatedWeightHighLb,
                            )
                          }
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Length (in)">
                      <Input
                        inputMode="decimal"
                        value={lengthIn}
                        onChange={(event) =>
                          updateDimensionInput(event.target.value, setLengthIn)
                        }
                      />
                    </Field>
                    <Field label="Width (in)">
                      <Input
                        inputMode="decimal"
                        value={widthIn}
                        onChange={(event) =>
                          updateDimensionInput(event.target.value, setWidthIn)
                        }
                      />
                    </Field>
                    <Field label="Height (in)">
                      <Input
                        inputMode="decimal"
                        value={heightIn}
                        onChange={(event) =>
                          updateDimensionInput(event.target.value, setHeightIn)
                        }
                      />
                    </Field>
                  </div>
                  <FlagField
                    label="These are estimates"
                    checked={dimensionsAreEstimate}
                    onChange={(checked) => {
                      setDimensionsAreEstimate(checked);
                      setDimensionsConfidence(checked ? "low" : "actual");
                    }}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Field label="Volume (cu ft)">
                    <Input
                      inputMode="decimal"
                      value={estimatedVolumeCuFt}
                      onChange={(event) =>
                        updateVolumeInput(
                          event.target.value,
                          setEstimatedVolumeCuFt,
                        )
                      }
                    />
                  </Field>
                  <FlagField
                    label="I only have an estimate"
                    checked={volumeIsEstimate}
                    onChange={(checked) => {
                      setVolumeIsEstimate(checked);
                      setVolumeConfidence(checked ? "low" : "actual");
                    }}
                  />
                  {volumeIsEstimate ? (
                    <Field label="Packed volume (cu ft)">
                      <Input
                        inputMode="decimal"
                        value={estimatedPackedVolumeCuFt}
                        onChange={(event) =>
                          updateVolumeInput(
                            event.target.value,
                            setEstimatedPackedVolumeCuFt,
                          )
                        }
                      />
                    </Field>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Value ($)">
                    <Input
                      inputMode="decimal"
                      value={valueDollars}
                      onChange={(event) => setValueDollars(event.target.value)}
                    />
                  </Field>
                  <Field label="Replacement value ($)">
                    <Input
                      inputMode="decimal"
                      value={replacementValueDollars}
                      onChange={(event) =>
                        setReplacementValueDollars(event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Serial number">
                    <Input
                      value={serialNumber}
                      onChange={(event) => setSerialNumber(event.target.value)}
                    />
                  </Field>
                  <Field label="Model number">
                    <Input
                      value={modelNumber}
                      onChange={(event) => setModelNumber(event.target.value)}
                    />
                  </Field>
                </div>

                <Separator />

                <div className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Ruler className="size-4 text-primary" aria-hidden="true" />
                    Measurement source
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <ProvenanceCard
                      title="Dimensions"
                      entry={item.measurementProvenance?.dimensions}
                      fallbackConfidence={dimensionsConfidence}
                      onConfirm={() => void handleConfirmMeasurement("dimensions")}
                    />
                    <ProvenanceCard
                      title="Weight"
                      entry={item.measurementProvenance?.weight}
                      fallbackConfidence={weightConfidence}
                      onConfirm={() => void handleConfirmMeasurement("weight")}
                    />
                    <ProvenanceCard
                      title="Volume"
                      entry={item.measurementProvenance?.volume}
                      fallbackConfidence={volumeConfidence}
                      onConfirm={() => void handleConfirmMeasurement("volume")}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="handling" className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-4">
                  <InfoBlock
                    icon={UserRound}
                    title="Owner"
                    value={ownerSummary}
                  />
                  <InfoBlock
                    icon={Boxes}
                    title="Box membership"
                    value={boxSummary}
                  />
                  <InfoBlock
                    icon={PackageCheck}
                    title="Transport assignment"
                    value={assignmentSummary}
                  />
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <FlagField
                    label="Stackable"
                    checked={stackable}
                    onChange={setStackable}
                  />
                  <FlagField
                    label="High value"
                    checked={highValue}
                    onChange={setHighValue}
                  />
                  <FlagField
                    label="Hazardous"
                    checked={hazardousFlag}
                    onChange={setHazardousFlag}
                  />
                  <FlagField
                    label="Personal transport"
                    checked={requiresPersonalTransport}
                    onChange={setRequiresPersonalTransport}
                  />
                </div>
              </TabsContent>

              <TabsContent value="review" className="space-y-4">
                <FlagField
                  label="Needs review"
                  checked={needsReview}
                  onChange={setNeedsReview}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Review flags">
                    <Input
                      value={reviewFlags}
                      onChange={(event) => setReviewFlags(event.target.value)}
                      placeholder="comma separated"
                    />
                  </Field>
                  <Field label="AI tags">
                    <Input
                      value={aiTags}
                      onChange={(event) => setAiTags(event.target.value)}
                      placeholder="comma separated"
                    />
                  </Field>
                </div>

                <Field label="Private notes">
                  <Textarea
                    value={privateNotes}
                    onChange={(event) => setPrivateNotes(event.target.value)}
                  />
                </Field>

                <Field label="AI reasoning">
                  <Textarea
                    value={aiSummary}
                    onChange={(event) => setAiSummary(event.target.value)}
                  />
                </Field>
              </TabsContent>

              <TabsContent value="activity" className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardList
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  Item activity
                </div>
                {activity === undefined ? (
                  <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                    Loading activity.
                  </div>
                ) : activity.length ? (
                  <div className="space-y-2">
                    {activity.map((entry) => (
                      <div
                        key={entry._id}
                        className="rounded-md border border-border p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{entry.action}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.actorType}
                          {entry.metadata?.changedKeys
                            ? ` - ${String(entry.metadata.changedKeys)}`
                            : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                    No item activity yet.
                  </div>
                )}
              </TabsContent>
            </Tabs>
            </div>
          </div>

          <DialogFooter className="border-t border-border p-4">
            <div className="w-full space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                {message ?? "Detailed edits are saved to the item history."}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? "Saving" : "Save item"}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

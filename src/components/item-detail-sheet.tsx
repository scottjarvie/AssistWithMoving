"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { useQuery } from "convex/react";
import {
  Boxes,
  Camera,
  ClipboardList,
  Ruler,
  PackageCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PhotoEvidenceStrip } from "@/components/photo-evidence-strip";
import { PhotoUploadControl } from "@/components/photo-upload-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  estimateConfidenceOptions,
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

export function ItemDetailSheet({
  householdId,
  moveId,
  item,
  open,
  onOpenChange,
  onSave,
}: ItemDetailSheetProps) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [room, setRoom] = useState(item?.room ?? "");
  const [destinationRoom, setDestinationRoom] = useState(
    item?.destinationRoom ?? ""
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
  const [estimatedWeightLb, setEstimatedWeightLb] = useState(
    formatOptionalNumber(item?.estimatedWeightLb)
  );
  const [estimatedWeightLowLb, setEstimatedWeightLowLb] = useState(
    formatOptionalNumber(item?.estimatedWeightLowLb)
  );
  const [estimatedWeightHighLb, setEstimatedWeightHighLb] = useState(
    formatOptionalNumber(item?.estimatedWeightHighLb)
  );
  const [actualWeightLb, setActualWeightLb] = useState(
    formatOptionalNumber(item?.actualWeightLb)
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
  const [privateNotes, setPrivateNotes] = useState(item?.privateNotes ?? "");
  const [reviewFlags, setReviewFlags] = useState(
    (item?.reviewFlags ?? []).join(", ")
  );
  const [aiSummary, setAiSummary] = useState(item?.aiSummary ?? "");
  const [aiTags, setAiTags] = useState((item?.aiTags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  if (!item) {
    return null;
  }
  const currentItem = item;

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
        dimensionsConfidence,
        weightConfidence,
        volumeConfidence,
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
      const parsedEstimatedWeightLb = parseOptionalNumber(estimatedWeightLb);
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
      if (parsedEstimatedWeightLb !== undefined) {
        patch.estimatedWeightLb = parsedEstimatedWeightLb;
      }
      if (parsedEstimatedWeightLowLb !== undefined) {
        patch.estimatedWeightLowLb = parsedEstimatedWeightLowLb;
      }
      if (parsedEstimatedWeightHighLb !== undefined) {
        patch.estimatedWeightHighLb = parsedEstimatedWeightHighLb;
      }
      if (parsedActualWeightLb !== undefined) {
        patch.actualWeightLb = parsedActualWeightLb;
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

      await onSave(patch);
      setMessage("Item saved.");
    } catch {
      setMessage("Could not save item changes yet.");
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
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
        <form className="flex min-h-full flex-col" onSubmit={handleSubmit}>
          <SheetHeader className="pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle>{item.name}</SheetTitle>
              <Badge variant={item.needsReview ? "destructive" : "secondary"}>
                {item.needsReview ? "review" : item.status}
              </Badge>
              <Badge variant="outline">{item.disposition}</Badge>
            </div>
            <SheetDescription>
              {item.code ? `${item.code} · ` : ""}Last updated{" "}
              {new Date(item.updatedAt).toLocaleDateString()}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 px-4 pb-4">
            <Tabs defaultValue="details" className="gap-4">
              {/* On a phone six tabs can't share one 32px row — a 3-col grid
                  with real height beats a clipped flex-wrap. Releases the
                  primitive's h-8 cap with h-auto and gives each tab a 36px target. */}
              <TabsList className="grid h-auto w-full grid-cols-3 gap-1 [&>*]:min-h-9 sm:flex sm:flex-wrap sm:justify-start">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
                <TabsTrigger value="measurements">Measurements</TabsTrigger>
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

                <Field label="Description">
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Current room">
                    <Input
                      value={room}
                      onChange={(event) => setRoom(event.target.value)}
                    />
                  </Field>
                  <Field label="Destination room">
                    <Input
                      value={destinationRoom}
                      onChange={(event) =>
                        setDestinationRoom(event.target.value)
                      }
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

              <TabsContent value="measurements" className="space-y-4">
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

                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Estimated weight (lb)">
                    <Input
                      inputMode="decimal"
                      value={estimatedWeightLb}
                      onChange={(event) =>
                        updateWeightEstimateInput(
                          event.target.value,
                          setEstimatedWeightLb,
                        )
                      }
                    />
                  </Field>
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
                  <Field label="Actual weight (lb)">
                    <Input
                      inputMode="decimal"
                      value={actualWeightLb}
                      onChange={(event) =>
                        updateActualWeightInput(event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Estimated volume (cu ft)">
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
                  <Field label="Dimensions confidence">
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                      value={dimensionsConfidence}
                      onChange={(event) =>
                        setDimensionsConfidence(
                          event.target
                            .value as InventoryItem["dimensionsConfidence"]
                        )
                      }
                    >
                      {estimateConfidenceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Weight confidence">
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                      value={weightConfidence}
                      onChange={(event) =>
                        setWeightConfidence(
                          event.target
                            .value as InventoryItem["weightConfidence"]
                        )
                      }
                    >
                      {estimateConfidenceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Volume confidence">
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                      value={volumeConfidence}
                      onChange={(event) =>
                        setVolumeConfidence(
                          event.target
                            .value as InventoryItem["volumeConfidence"]
                        )
                      }
                    >
                      {estimateConfidenceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
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

          <SheetFooter className="border-t border-border px-0 pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                {message ?? "Detailed edits are saved to the item history."}
              </div>
              <div className="flex items-center gap-2">
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
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

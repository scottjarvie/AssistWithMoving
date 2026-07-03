"use client";

import { type FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CalendarClock, ShieldCheck } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
import { Textarea } from "@/components/ui/textarea";
import {
  moveTypeOptions,
  pcsBranchOptions,
  pcsDependentStatusOptions,
  pcsShipmentTypeOptions,
  type PcsBranch,
  type PcsDependentStatus,
  type PcsShipmentType,
} from "@/lib/move-presets";
import { describeMutationError } from "@/lib/mutation-error";

type MoveEntries = FunctionReturnType<typeof api.moves.listForHousehold>;
type Move = MoveEntries[number];

function moveTypeLabel(type: string): string {
  return moveTypeOptions.find(([value]) => value === type)?.[1] ?? type;
}

export function MoveDetailsPanel({
  householdId,
  moveId,
  move,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  move: Move | undefined;
}) {
  const updateBasics = useMutation(api.moves.updateBasics);

  // Logistics. Native date inputs expect YYYY-MM-DD; the stored strings already
  // use that shape from the create form.
  const [dateStart, setDateStart] = useState(move?.dateStart ?? "");
  const [dateEnd, setDateEnd] = useState(move?.dateEnd ?? "");
  const [distanceMiles, setDistanceMiles] = useState(
    move?.distanceMiles !== undefined ? String(move.distanceMiles) : "",
  );
  const [travelMinutes, setTravelMinutes] = useState(
    move?.travelMinutes !== undefined ? String(move.travelMinutes) : "",
  );
  const [logisticsMessage, setLogisticsMessage] = useState<string | null>(null);
  const [savingLogistics, setSavingLogistics] = useState(false);

  // PCS template block.
  const isPcs = move?.type === "pcs";
  const [pcsBranch, setPcsBranch] = useState<PcsBranch | "">(
    (move?.pcsBranch as PcsBranch | undefined) ?? "",
  );
  const [pcsShipmentType, setPcsShipmentType] = useState<PcsShipmentType | "">(
    (move?.pcsShipmentType as PcsShipmentType | undefined) ?? "",
  );
  const [pcsDependentStatus, setPcsDependentStatus] =
    useState<PcsDependentStatus>(
      (move?.pcsDependentStatus as PcsDependentStatus | undefined) ?? "unknown",
    );
  const [pcsOrdersNumber, setPcsOrdersNumber] = useState(
    move?.pcsOrdersNumber ?? "",
  );
  const [pcsAllowanceNotes, setPcsAllowanceNotes] = useState(
    move?.pcsAllowanceNotes ?? "",
  );
  const [proGearNotes, setProGearNotes] = useState(move?.proGearNotes ?? "");
  const [pcsMessage, setPcsMessage] = useState<string | null>(null);
  const [savingPcs, setSavingPcs] = useState(false);

  async function handleSaveLogistics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId || !moveId) return;
    setSavingLogistics(true);
    setLogisticsMessage(null);
    const distance = Number(distanceMiles);
    const travel = Number(travelMinutes);
    try {
      await updateBasics({
        householdId,
        moveId,
        dateStart: dateStart.trim() || undefined,
        dateEnd: dateEnd.trim() || undefined,
        distanceMiles:
          distanceMiles.trim() !== "" && Number.isFinite(distance)
            ? distance
            : undefined,
        travelMinutes:
          travelMinutes.trim() !== "" && Number.isFinite(travel)
            ? travel
            : undefined,
      });
      setLogisticsMessage("Logistics saved.");
    } catch (error) {
      setLogisticsMessage(
        describeMutationError(
          error,
          "Couldn't save the logistics. Check the values and try again.",
        ),
      );
    } finally {
      setSavingLogistics(false);
    }
  }

  async function handleSavePcs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId || !moveId) return;
    setSavingPcs(true);
    setPcsMessage(null);
    try {
      await updateBasics({
        householdId,
        moveId,
        pcsBranch: pcsBranch || undefined,
        pcsShipmentType: pcsShipmentType || undefined,
        pcsDependentStatus,
        pcsOrdersNumber: pcsOrdersNumber.trim() || undefined,
        pcsAllowanceNotes: pcsAllowanceNotes.trim() || undefined,
        proGearNotes: proGearNotes.trim() || undefined,
      });
      setPcsMessage("PCS template saved.");
    } catch (error) {
      setPcsMessage(
        describeMutationError(
          error,
          "Couldn't save the PCS template. Check the PCS fields and try again.",
        ),
      );
    } finally {
      setSavingPcs(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" aria-hidden="true" />
            Logistics
          </CardTitle>
          <CardDescription>
            Dates, distance, and travel time for the move.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleSaveLogistics}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Start date
                </label>
                <Input
                  type="date"
                  value={dateStart}
                  onChange={(event) => setDateStart(event.target.value)}
                  aria-label="Move start date"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  End date
                </label>
                <Input
                  type="date"
                  value={dateEnd}
                  onChange={(event) => setDateEnd(event.target.value)}
                  aria-label="Move end date"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Distance (miles)
                </label>
                <Input
                  type="number"
                  min={0}
                  value={distanceMiles}
                  onChange={(event) => setDistanceMiles(event.target.value)}
                  placeholder="0"
                  aria-label="Distance in miles"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Travel time (minutes)
                </label>
                <Input
                  type="number"
                  min={0}
                  value={travelMinutes}
                  onChange={(event) => setTravelMinutes(event.target.value)}
                  placeholder="0"
                  aria-label="Travel time in minutes"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Units:</span>
              <Badge variant="outline">{move?.unitSystem ?? "imperial"}</Badge>
              <span>(set when the move was created)</span>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!moveId || savingLogistics}>
                Save logistics
              </Button>
              {logisticsMessage ? (
                <p
                  className="text-xs text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  {logisticsMessage}
                </p>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Type &amp; template
          </CardTitle>
          <CardDescription>
            The move template, and the military PCS details when that template is
            in use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Move type:
            </span>
            <Badge variant="secondary">
              {move ? moveTypeLabel(move.type) : "—"}
            </Badge>
          </div>

          {isPcs ? (
            <form className="space-y-3" onSubmit={handleSavePcs}>
              <p className="text-sm font-medium">PCS / PPM details</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Branch
                  </label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={pcsBranch}
                    aria-label="Branch"
                    onChange={(event) =>
                      setPcsBranch(event.target.value as PcsBranch | "")
                    }
                  >
                    <option value="">Branch</option>
                    {pcsBranchOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Shipment type
                  </label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={pcsShipmentType}
                    aria-label="Shipment type"
                    onChange={(event) =>
                      setPcsShipmentType(
                        event.target.value as PcsShipmentType | "",
                      )
                    }
                  >
                    <option value="">Shipment type</option>
                    {pcsShipmentTypeOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Dependent status
                  </label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={pcsDependentStatus}
                    aria-label="Dependent status"
                    onChange={(event) =>
                      setPcsDependentStatus(
                        event.target.value as PcsDependentStatus,
                      )
                    }
                  >
                    {pcsDependentStatusOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Orders number
                  </label>
                  <Input
                    value={pcsOrdersNumber}
                    onChange={(event) => setPcsOrdersNumber(event.target.value)}
                    placeholder="Orders number"
                    aria-label="Orders number"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Allowance / restricted notes
                </label>
                <Textarea
                  value={pcsAllowanceNotes}
                  onChange={(event) => setPcsAllowanceNotes(event.target.value)}
                  placeholder="Weight allowance, restricted items..."
                  aria-label="Allowance notes"
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Pro gear / PBP&amp;E notes
                </label>
                <Textarea
                  value={proGearNotes}
                  onChange={(event) => setProGearNotes(event.target.value)}
                  placeholder="Pro gear / PBP&E notes"
                  aria-label="Pro gear notes"
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={!moveId || savingPcs}>
                  Save PCS template
                </Button>
                {pcsMessage ? (
                  <p
                    className="text-xs text-muted-foreground"
                    role="status"
                    aria-live="polite"
                  >
                    {pcsMessage}
                  </p>
                ) : null}
              </div>
            </form>
          ) : (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              This move uses the {move ? moveTypeLabel(move.type) : "current"}{" "}
              template. Military PCS fields appear when a move is created with the
              Military PCS template.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

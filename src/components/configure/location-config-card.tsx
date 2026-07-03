"use client";

import { type FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { MapPin, Save } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
import { describeMutationError } from "@/lib/mutation-error";

// The structured location stored on a move. All fields optional so the form can
// be present-but-partial; the legacy origin/destination strings stay canonical
// for the public MCP/REST contract and the workspace header route label.
export type StructuredLocation = {
  label?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
};

type LocationSide = "start" | "end";

// Render the structured-location fields out of the move doc so the form is a
// controlled mirror of server state without setState-in-effect: we key the
// component on the move id in the parent so a move switch remounts it.
function fieldValue(location: StructuredLocation | undefined, key: keyof StructuredLocation) {
  const value = location?.[key];
  return typeof value === "string" ? value : "";
}

export function LocationConfigCard({
  householdId,
  moveId,
  side,
  location,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  side: LocationSide;
  location: StructuredLocation | undefined;
}) {
  const updateBasics = useMutation(api.moves.updateBasics);

  const [label, setLabel] = useState(() => fieldValue(location, "label"));
  const [street, setStreet] = useState(() => fieldValue(location, "street"));
  const [city, setCity] = useState(() => fieldValue(location, "city"));
  const [stateRegion, setStateRegion] = useState(() =>
    fieldValue(location, "state"),
  );
  const [postalCode, setPostalCode] = useState(() =>
    fieldValue(location, "postalCode"),
  );
  const [country, setCountry] = useState(() => fieldValue(location, "country"));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const heading = side === "start" ? "Start address" : "End address";
  const description =
    side === "start"
      ? "Where the move begins. Add via your connected AI agent or here."
      : "Where the move ends. Add via your connected AI agent or here.";
  const argKey = side === "start" ? "startLocation" : "endLocation";

  if (!householdId || !moveId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            {heading}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 rounded-md" />
          <Skeleton className="h-9 rounded-md" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
          </div>
          <Skeleton className="h-9 w-36 rounded-md" />
        </CardContent>
      </Card>
    );
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId || !moveId) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateBasics({
        householdId,
        moveId,
        [argKey]: {
          label: label.trim() || undefined,
          street: street.trim() || undefined,
          city: city.trim() || undefined,
          state: stateRegion.trim() || undefined,
          postalCode: postalCode.trim() || undefined,
          country: country.trim() || undefined,
          latitude: location?.latitude,
          longitude: location?.longitude,
        },
      });
      setMessage("Address saved.");
    } catch (error) {
      setMessage(
        describeMutationError(
          error,
          "Couldn't save the address. Try again, and reload the page if it keeps failing.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="size-4 text-primary" aria-hidden="true" />
          {heading}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSave}>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Label
            </label>
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Home, storage unit, office..."
              aria-label={`${heading} label`}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Street
            </label>
            <Input
              value={street}
              onChange={(event) => setStreet(event.target.value)}
              placeholder="123 Main St"
              aria-label={`${heading} street`}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                City
              </label>
              <Input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="City"
                aria-label={`${heading} city`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                State / region
              </label>
              <Input
                value={stateRegion}
                onChange={(event) => setStateRegion(event.target.value)}
                placeholder="State"
                aria-label={`${heading} state or region`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Postal code
              </label>
              <Input
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                placeholder="Postal code"
                aria-label={`${heading} postal code`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Country
              </label>
              <Input
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                placeholder="Country"
                aria-label={`${heading} country`}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!moveId || saving}>
              <Save aria-hidden="true" />
              Save address
            </Button>
            {message ? (
              <p
                className="text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {message}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

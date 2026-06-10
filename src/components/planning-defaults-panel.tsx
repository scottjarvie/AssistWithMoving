"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";

export function PlanningDefaultsPanel({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const planningDefaults = useQuery(
    api.movePlanningDefaults.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const ensurePlanningDefaults = useMutation(
    api.movePlanningDefaults.ensureForMove
  );

  const [ensuringDefaults, setEnsuringDefaults] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadingPlanningDefaults = moveId && planningDefaults === undefined;

  async function handleEnsurePlanningDefaults() {
    if (!householdId || !moveId) {
      return;
    }

    setEnsuringDefaults(true);
    setMessage(null);

    try {
      const insertedIds = await ensurePlanningDefaults({ householdId, moveId });
      setMessage(
        insertedIds.length
          ? "Planning defaults added."
          : "Planning defaults already exist."
      );
    } catch {
      setMessage("Could not add planning defaults yet.");
    } finally {
      setEnsuringDefaults(false);
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Planning defaults</CardTitle>
              <CardDescription>
                These tags steer personal transport, evidence, packet
                visibility, and later AI/load suggestions.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!moveId || ensuringDefaults}
              onClick={() => void handleEnsurePlanningDefaults()}
            >
              <Plus aria-hidden="true" />
              Ensure
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingPlanningDefaults ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-5/6" />
            </div>
          ) : planningDefaults?.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {planningDefaults.map((defaultRecord) => (
                <div
                  key={defaultRecord._id}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {defaultRecord.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {defaultRecord.description}
                      </p>
                    </div>
                    <Badge
                      variant={
                        defaultRecord.sensitiveByDefault
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {defaultRecord.handling}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {defaultRecord.recommendedResourceTypes.map((type) => (
                      <Badge key={type} variant="outline">
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              Add first-night, personal transport, high-value, document,
              medication, electronics, fragile, sensitive, and restricted
              review defaults for the selected move.
            </div>
          )}
          {message ? (
            <p
              className="text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy posture</CardTitle>
          <CardDescription>
            Sensitive defaults hide fields from helper and mover-safe views.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Values, serials, private notes, and sensitive photos stay out of
            helper/mover packets unless an owner explicitly changes the packet.
          </p>
          <p>
            AI suggestions should use these defaults as hints, not automatic
            trusted decisions.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const planningDefaultTabs = [
  { value: "defaults", label: "Defaults" },
  { value: "privacy", label: "Privacy" },
] as const;

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
    <Card id="planning-defaults">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Planning defaults</CardTitle>
            <CardDescription>
              These tags steer personal transport, evidence, packet visibility,
              and later AI/load suggestions.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={!moveId || ensuringDefaults}
            onClick={() => void handleEnsurePlanningDefaults()}
          >
            <Plus aria-hidden="true" />
            Ensure
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="defaults" className="gap-4">
          <TabsList
            className="w-full justify-start overflow-x-auto sm:w-fit"
            aria-label="Planning defaults tasks"
          >
            {planningDefaultTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="defaults">
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
          </TabsContent>

          <TabsContent value="privacy">
            <div className="rounded-md border border-border p-4">
              <h3 className="text-sm font-medium">Privacy posture</h3>
              <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                <p>
                  Sensitive defaults hide fields from helper and mover-safe
                  views.
                </p>
                <p>
                  Values, serials, private notes, and sensitive photos stay out
                  of helper/mover packets unless an owner explicitly changes the
                  packet.
                </p>
                <p>
                  AI suggestions should use these defaults as hints, not
                  automatic trusted decisions.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

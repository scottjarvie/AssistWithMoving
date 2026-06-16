"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { FloorplansPageShell } from "@/components/floorplans/floorplans-page-shell";
import { useMoveWorkspace } from "@/components/move-workspace-context";

export function MoveFloorplansPage() {
  const { householdId, moveId } = useMoveWorkspace();
  const activePlanDocument = useQuery(
    api.floorPlans.getActiveDocumentForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const plan = activePlanDocument?.plan;

  return (
    <FloorplansPageShell
      householdId={householdId}
      mode="move"
      moveId={moveId}
      savedPlanSummary={
        plan
          ? {
              name: plan.name,
              levels: activePlanDocument.levels.length,
              entities: activePlanDocument.entities.length,
              placements: activePlanDocument.placements.length,
            }
          : null
      }
      targetPlanId={plan?._id}
    />
  );
}

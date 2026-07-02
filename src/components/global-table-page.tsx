"use client";

import Link from "next/link";

import { InventoryTable } from "@/components/inventory-table";
import { MovableUnitsTable } from "@/components/movable-units-table";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// The global Movable Units / Items pages render the active move's tables. With
// no active move they show a friendly prompt to pick or create one — both
// surfaces are scoped to a single move.
function NoActiveMove({ title, blurb }: { title: string; blurb: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{blurb}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="sm">
          <Link href="/app/moves">Go to moves</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function MovableUnitsPageContent() {
  const { householdId, moveId, loadingMoves } = useMoveWorkspace();

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {loadingMoves ? (
        <Skeleton className="h-44 rounded-md" />
      ) : moveId ? (
        <MovableUnitsTable
          key={moveId}
          householdId={householdId}
          moveId={moveId}
        />
      ) : (
        <NoActiveMove
          title="No active move"
          blurb="Select or create a move to see its movable units."
        />
      )}
    </div>
  );
}

export function ItemsPageContent() {
  const { householdId, moveId, loadingMoves } = useMoveWorkspace();

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {loadingMoves ? (
        <Skeleton className="h-44 rounded-md" />
      ) : moveId ? (
        <InventoryTable key={moveId} householdId={householdId} moveId={moveId} />
      ) : (
        <NoActiveMove
          title="No active move"
          blurb="Select or create a move to see its items."
        />
      )}
    </div>
  );
}

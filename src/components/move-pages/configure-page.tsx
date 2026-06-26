"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { LocationConfigCard } from "@/components/configure/location-config-card";
import { MoveAreasPanel } from "@/components/configure/move-areas-panel";
import { MoveDetailsPanel } from "@/components/configure/move-details-panel";
import { TransportMethodsPanel } from "@/components/configure/transport-methods-panel";
import { MoveParticipantsManager } from "@/components/move-participants-manager";
import { MoveOperationsNav } from "@/components/move-operations-nav";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useHashTab } from "@/components/use-hash-tab";

const configureTabHashes = {
  "#start": "start",
  "#end": "end",
  "#transport": "transport",
  "#details": "details",
  "#household": "household",
} as const;

type ConfigureTab = (typeof configureTabHashes)[keyof typeof configureTabHashes];

export function MoveConfigurePage() {
  const { householdId, moveId, selectedMove } = useMoveWorkspace();
  const [activeTab, setActiveTab] = useHashTab<ConfigureTab>(
    "start",
    configureTabHashes,
  );

  // Counts power the tab badges. moveSpaces + resources are also queried by the
  // child panels; Convex dedupes identical subscriptions so this is not a
  // second fetch.
  const spaces = useQuery(
    api.moveSpaces.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const resources = useQuery(
    api.transportResources.listForMoveWithZones,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const members = useQuery(
    api.households.listMembers,
    householdId ? { householdId } : "skip",
  );

  const counts = useMemo(() => {
    const originCount = (spaces ?? []).filter(
      (space) => space.kind === "originRoom",
    ).length;
    const endCount = (spaces ?? []).filter(
      (space) =>
        space.kind === "destinationRoom" || space.kind === "yardOutdoor",
    ).length;
    return {
      start: spaces ? originCount : undefined,
      end: spaces ? endCount : undefined,
      transport: resources ? resources.length : undefined,
      household: members ? members.length : undefined,
    };
  }, [spaces, resources, members]);

  const tabs = [
    {
      value: "start",
      label: "Start location",
      description:
        "Where the move begins and the rooms or areas being packed there.",
      count: counts.start,
      countLabel: counts.start !== undefined ? `${counts.start} areas` : undefined,
    },
    {
      value: "end",
      label: "End location",
      description:
        "Where the move ends and the rooms or areas being unloaded there.",
      count: counts.end,
      countLabel: counts.end !== undefined ? `${counts.end} areas` : undefined,
    },
    {
      value: "transport",
      label: "Transportation",
      description:
        "Methods, the trips each one makes, and the spaces inside each trip.",
      count: counts.transport,
      countLabel:
        counts.transport !== undefined
          ? `${counts.transport} methods`
          : undefined,
    },
    {
      value: "details",
      label: "Details",
      description:
        "Dates, distance, travel time, and the move type or PCS template.",
    },
    {
      value: "household",
      label: "Participants",
      description:
        "Everyone on this move — family, helpers, movers, and contacts.",
      count: counts.household,
      countLabel:
        counts.household !== undefined
          ? `${counts.household} members`
          : undefined,
    },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title={selectedMove?.title ?? "Configure move"}
        description="Where the move starts and ends, how it travels, its facts, and who shares it."
      />

      <MoveOperationsNav />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <MoveWorkspaceTabList tabs={tabs} activeValue={activeTab} />

        <TabsContent value="start">
          <div className="grid gap-4 xl:grid-cols-2">
            <LocationConfigCard
              key={`start-${moveId ?? "none"}`}
              householdId={householdId}
              moveId={moveId}
              side="start"
              location={selectedMove?.startLocation}
            />
            <MoveAreasPanel
              householdId={householdId}
              moveId={moveId}
              kind="originRoom"
              title="Start areas"
              description="Rooms and areas being packed at the start location."
            />
          </div>
        </TabsContent>

        <TabsContent value="end">
          <div className="grid gap-4 xl:grid-cols-2">
            <LocationConfigCard
              key={`end-${moveId ?? "none"}`}
              householdId={householdId}
              moveId={moveId}
              side="end"
              location={selectedMove?.endLocation}
            />
            <MoveAreasPanel
              householdId={householdId}
              moveId={moveId}
              kind="destinationRoom"
              title="End areas"
              description="Rooms, yards, and areas being unloaded at the end location."
            />
          </div>
        </TabsContent>

        <TabsContent value="transport">
          <TransportMethodsPanel
            householdId={householdId}
            moveId={moveId}
            moveType={selectedMove?.type}
          />
        </TabsContent>

        <TabsContent value="details">
          <MoveDetailsPanel
            key={`details-${moveId ?? "none"}`}
            householdId={householdId}
            moveId={moveId}
            move={selectedMove}
          />
        </TabsContent>

        <TabsContent value="household">
          <MoveParticipantsManager householdId={householdId} moveId={moveId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

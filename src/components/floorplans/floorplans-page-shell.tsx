"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Calculator,
  FileImage,
  GitBranch,
  Layers3,
  ListChecks,
  PanelRightOpen,
  Trash2,
} from "lucide-react";

import { AreaTargetsPanel } from "@/components/floorplans/area-targets-panel";
import { AssumptionsPanel } from "@/components/floorplans/assumptions-panel";
import { CalculationsPanel } from "@/components/floorplans/calculations-panel";
import { ConflictsPanel } from "@/components/floorplans/conflicts-panel";
import { DraftPreviewPanel } from "@/components/floorplans/draft-preview-panel";
import { EvidenceCalculationsPanel } from "@/components/floorplans/evidence-calculations-panel";
import { EvidencePanel } from "@/components/floorplans/evidence-panel";
import { FloorplanKeyPanel } from "@/components/floorplans/floorplan-key-panel";
import { FloorplanViewer } from "@/components/floorplans/floorplan-viewer";
import { GapPriorityPanel } from "@/components/floorplans/gap-priority-panel";
import { MeasurementsPanel } from "@/components/floorplans/measurements-panel";
import { ObservationsPanel } from "@/components/floorplans/observations-panel";
import { RelationshipsPanel } from "@/components/floorplans/relationships-panel";
import { ResourcesUploadPanel } from "@/components/floorplans/resources-upload-panel";
import { SelectedGraphPanel } from "@/components/floorplans/selected-graph-panel";
import { SubjectsPanel } from "@/components/floorplans/subjects-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  evidenceFirstGapPriorities,
  floorplanMeasurements,
  floorplanObservations,
  floorplanRelationships,
  floorplanResources,
  floorplanSubjects,
} from "@/lib/floorplans/sample-data";
import { createDraftStateFromEvidence } from "@/lib/floorplans/evidence-engine";
import { buildAreaTargetsFromMeasurements } from "@/lib/floorplans/calculations";
import { solveFloorplanPuzzle } from "@/lib/floorplans/solver";
import type {
  FloorplanCanonicalSubject,
  FloorplanDraftState,
  FloorplanMeasurement,
  FloorplanObservation,
  FloorplanRelationship,
  FloorplanResource,
  FloorplanSelectableSubject,
  FloorplanSelection,
  FloorplanSolveResult,
  FloorplanSubjectKind,
} from "@/lib/floorplans/types";
import type { Id } from "../../../convex/_generated/dataModel";

export function FloorplansPageShell({
  mode,
  householdId,
  moveId,
  targetPlanId,
  savedPlanSummary,
}: {
  mode: "public" | "move";
  householdId?: Id<"households"> | null;
  moveId?: Id<"moves"> | null;
  targetPlanId?: Id<"floorPlans"> | null;
  savedPlanSummary?: {
    name: string;
    levels: number;
    entities: number;
    placements: number;
  } | null;
}) {
  const moveBacked = mode === "move" && moveId;
  const [measurements, setMeasurements] =
    useState<FloorplanMeasurement[]>(floorplanMeasurements);
  const [selectedSelection, setSelectedSelection] =
    useState<FloorplanSelection | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState("sources");
  const [draft, setDraft] = useState<FloorplanDraftState>({
    status: "notGenerated",
    title: "No generated draft",
    summary:
      "The evidence graph is stored, but this workspace has not generated a layout preview yet.",
    sourceObservationIds: [],
    sourceRelationshipIds: [],
    diagnostics: [],
  });
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [generatedSolve, setGeneratedSolve] = useState<FloorplanSolveResult | null>(
    null,
  );

  const evidenceGraph = useMemo(
    () => ({
      observations: floorplanObservations,
      relationships: floorplanRelationships,
      measurements,
    }),
    [measurements],
  );
  const liveDraft = useMemo(
    () => createDraftStateFromEvidence(evidenceGraph),
    [evidenceGraph],
  );
  const selectableSubjects = useMemo(
    () => buildSelectableSubjects(floorplanSubjects),
    [],
  );
  const areaTargets = useMemo(
    () => generatedSolve?.areaTargets ?? buildAreaTargetsFromMeasurements(measurements),
    [generatedSolve, measurements],
  );
  const selectedResource =
    selectedSelection?.kind === "resource"
      ? floorplanResources.find((resource) => resource.id === selectedSelection.id) ??
        null
      : null;
  const selectedObservation =
    selectedSelection?.kind === "observation"
      ? floorplanObservations.find(
          (observation) => observation.id === selectedSelection.id,
        ) ?? null
      : null;
  const selectedRelationship =
    selectedSelection?.kind === "relationship"
      ? floorplanRelationships.find(
          (relationship) => relationship.id === selectedSelection.id,
        ) ?? null
      : null;
  const selectedSubject =
    selectedSelection?.kind === "subject"
      ? floorplanSubjects.find(
          (subject) => subject.subjectKey === selectedSelection.id,
        ) ?? null
      : null;
  const selectedSubjectKey =
    selectedSubject?.subjectKey ??
    selectedObservation?.subjectKey ??
    selectedRelationship?.fromSubjectKey ??
    null;

  function handleMeasurementsRecorded(nextMeasurements: FloorplanMeasurement[]) {
    setMeasurements((current) => [...current, ...nextMeasurements]);
    setDraft((current) => ({
      ...current,
      status: "stale",
      title: "Draft is stale",
      summary:
        "New user evidence was recorded. Regenerate after the AI/solver reviews the updated graph.",
    }));
    setGeneratedSolve(null);
    setDraftMessage("Saved evidence. The draft is now stale until regeneration.");
  }

  function handleSelectionSelect(selection: FloorplanSelection) {
    setSelectedSelection((current) =>
      current?.kind === selection.kind && current.id === selection.id
        ? null
        : selection,
    );
    setActiveInspectorTab(tabForSelection(selection.kind));
  }

  function handleRegenerate() {
    const nextSolve = solveFloorplanPuzzle({
      measurements,
      observations: floorplanObservations,
      relationships: floorplanRelationships,
    });
    setGeneratedSolve(nextSolve);
    setDraft({
      status: nextSolve.rooms.length ? "generated" : liveDraft.status,
      title: nextSolve.rooms.length
        ? "Generated CAD review draft"
        : liveDraft.title,
      summary: nextSolve.rooms.length
        ? nextSolve.dataQuality?.summary ??
          "The solver generated a reviewable draft from the evidence graph."
        : liveDraft.summary,
      sourceObservationIds: floorplanObservations.map((observation) => observation.id),
      sourceRelationshipIds: floorplanRelationships.map(
        (relationship) => relationship.id,
      ),
      diagnostics: nextSolve.diagnostics,
    });
    setDraftMessage(
      nextSolve.rooms.length
        ? `Generated a ${nextSolve.status} draft with ${nextSolve.dataQuality?.overall ?? 0}% data quality.`
        : "The solver found missing evidence. Review Conflicts and Gaps before drawing.",
    );
    setActiveInspectorTab("draft");
  }

  function handleTrashDraft() {
    setDraft({
      status: "archived",
      title: "Draft archived",
      summary:
        "Stale solve output was trashed locally. Sources, observations, relationships, and measurements were preserved.",
      sourceObservationIds: floorplanObservations.map((observation) => observation.id),
      sourceRelationshipIds: floorplanRelationships.map(
        (relationship) => relationship.id,
      ),
      diagnostics: [],
    });
    setGeneratedSolve(null);
    setDraftMessage("Draft output removed; evidence graph is still intact.");
    setActiveInspectorTab("draft");
  }

  return (
    <main className="flex h-dvh min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-normal sm:text-xl">
              Floorplans
            </h1>
            <Badge variant="secondary">Evidence Workbench</Badge>
            <Badge variant={moveBacked ? "default" : "outline"}>
              {moveBacked ? "Move-backed" : "Public sample"}
            </Badge>
            {savedPlanSummary ? (
              <Badge variant="outline">{savedPlanSummary.name}</Badge>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {savedPlanSummary
              ? `${savedPlanSummary.levels} levels, ${savedPlanSummary.entities} plan entities, ${savedPlanSummary.placements} placements linked to this move.`
              : "Sources, observations, measurements, relationships, conflicts, and gaps come before any generated draft."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MetricBadge
            icon={FileImage}
            label="sources"
            value={String(floorplanResources.length)}
          />
          <MetricBadge
            icon={ListChecks}
            label="observations"
            value={String(floorplanObservations.length)}
          />
          <MetricBadge
            icon={GitBranch}
            label="relationships"
            value={String(floorplanRelationships.length)}
          />
          <MetricBadge icon={Layers3} label="floor" value="1" />
          {moveBacked ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/moves/${encodeURIComponent(moveId)}/plan`}>
                Layout Studio
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href="/sign-up">
                Create move
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="min-h-0 overflow-y-auto p-3 sm:p-4">
          <EvidenceWorkbenchMain
            draft={draft}
            draftMessage={draftMessage}
            generatedSolve={generatedSolve}
            householdId={householdId}
            mode={mode}
            moveId={moveId}
            onClearSelection={() => setSelectedSelection(null)}
            onRegenerate={handleRegenerate}
            onSelectionSelect={handleSelectionSelect}
            onTrashDraft={handleTrashDraft}
            selectedSelection={selectedSelection}
            targetPlanId={targetPlanId}
          />
        </section>

        <aside className="hidden min-h-0 border-l border-border bg-card/40 lg:flex lg:flex-col">
          <div className="min-h-0 flex-1 p-3">
            <InspectorTabs
              activeTab={activeInspectorTab}
              draft={draft}
              generatedSolve={generatedSolve}
              householdId={householdId}
              measurements={measurements}
              mode={mode}
              moveId={moveId}
              onActiveTabChange={setActiveInspectorTab}
              onMeasurementsRecorded={handleMeasurementsRecorded}
              onRegenerate={handleRegenerate}
              onSelectionSelect={handleSelectionSelect}
              onTrashDraft={handleTrashDraft}
              selectedObservation={selectedObservation}
              selectedRelationship={selectedRelationship}
              selectedResource={selectedResource}
              selectedSelection={selectedSelection}
              selectedSubject={selectedSubject}
              selectedSubjectKey={selectedSubjectKey}
              selectableSubjects={selectableSubjects}
              targetPlanId={targetPlanId}
              areaTargets={areaTargets}
            />
          </div>
        </aside>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card/95 px-3 py-2 lg:hidden">
        <div className="min-w-0 text-xs text-muted-foreground">
          Review sources, observations, measurements, relationships, and gaps before generating a plan.
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm" type="button" variant="outline">
              <PanelRightOpen aria-hidden="true" />
              Inspector
            </Button>
          </SheetTrigger>
          <SheetContent className="h-[90dvh] max-h-[90dvh] sm:max-w-none" side="bottom">
            <SheetHeader>
              <SheetTitle>Floorplans inspector</SheetTitle>
              <SheetDescription>
                Evidence graph, measurements, relationships, conflicts, gaps, and draft generation.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
              <InspectorTabs
                activeTab={activeInspectorTab}
                draft={draft}
                generatedSolve={generatedSolve}
                householdId={householdId}
                measurements={measurements}
                mode={mode}
                moveId={moveId}
                onActiveTabChange={setActiveInspectorTab}
                onMeasurementsRecorded={handleMeasurementsRecorded}
                onRegenerate={handleRegenerate}
                onSelectionSelect={handleSelectionSelect}
                onTrashDraft={handleTrashDraft}
                selectedObservation={selectedObservation}
                selectedRelationship={selectedRelationship}
                selectedResource={selectedResource}
                selectedSelection={selectedSelection}
                selectedSubject={selectedSubject}
                selectedSubjectKey={selectedSubjectKey}
                selectableSubjects={selectableSubjects}
                targetPlanId={targetPlanId}
                areaTargets={areaTargets}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </main>
  );
}

function EvidenceWorkbenchMain({
  draft,
  draftMessage,
  generatedSolve,
  householdId,
  mode,
  moveId,
  onClearSelection,
  onRegenerate,
  onSelectionSelect,
  onTrashDraft,
  selectedSelection,
  targetPlanId,
}: {
  draft: FloorplanDraftState;
  draftMessage: string | null;
  generatedSolve: FloorplanSolveResult | null;
  householdId?: Id<"households"> | null;
  mode: "public" | "move";
  moveId?: Id<"moves"> | null;
  onClearSelection: () => void;
  onRegenerate: () => void;
  onSelectionSelect: (selection: FloorplanSelection) => void;
  onTrashDraft: () => void;
  selectedSelection: FloorplanSelection | null;
  targetPlanId?: Id<"floorPlans"> | null;
}) {
  return (
    <div className="mx-auto grid max-w-[1500px] gap-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <Card className="min-w-0" size="sm">
          <CardHeader>
            <div>
              <CardTitle>Evidence-first workflow</CardTitle>
              <CardDescription>
                AI extracts observations from images and notes. MovingManifest stores the graph and refuses to draw if the graph is not strong enough.
              </CardDescription>
            </div>
            <CardAction>
              <Badge variant={draft.status === "ready" ? "default" : "outline"}>
                {draft.status}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-5">
              <Stage label="1. Sources" value={`${floorplanResources.length} stored`} />
              <Stage label="2. Observations" value={`${floorplanObservations.length} facts`} />
              <Stage label="3. Relationships" value={`${floorplanRelationships.length} links`} />
              <Stage label="4. Constraints" value={`${floorplanMeasurements.length} measurements`} />
              <Stage label="5. Draft" value={draft.status} />
            </div>
            {draftMessage ? (
              <div className="mt-3 rounded-md border border-primary/30 bg-primary/10 p-2 text-sm">
                {draftMessage}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={onRegenerate} size="sm" type="button">
                <Calculator aria-hidden="true" />
                Regenerate layout
              </Button>
              <Button onClick={onTrashDraft} size="sm" type="button" variant="outline">
                <Trash2 aria-hidden="true" />
                Trash draft / start over
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <div>
              <CardTitle>Current product stance</CardTitle>
              <CardDescription>
                The active path no longer displays the old sample drawing as if it were solved.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm leading-6 text-muted-foreground">
            <div>
              The AI should extract every visible detail: text, rooms, walls, openings,
              doorless passages, fixtures, structures, orientation clues, and unknown marks.
            </div>
            <div>
              The app then validates topology, measurements, area targets, exclusions, walls,
              and access paths before generating a CAD-like draft.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="min-h-[560px]">
        <FloorplanViewer
          onClearSelection={onClearSelection}
          onRoomSelect={(roomId) => onSelectionSelect({ kind: "space", id: roomId })}
          onSelectionSelect={onSelectionSelect}
          selectedRoomId={
            selectedSelection?.kind === "space" ? selectedSelection.id : null
          }
          selectedSelection={selectedSelection}
          solve={generatedSolve ?? undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
        <ResourcesUploadPanel
          householdId={householdId}
          mode={mode}
          moveId={moveId}
          onResourceSelect={(resourceId) =>
            onSelectionSelect({ kind: "resource", id: resourceId })
          }
          targetPlanId={targetPlanId}
        />
        <div className="grid gap-4">
          <ObservationsPanel
            onSelectionSelect={onSelectionSelect}
            selectedId={
              selectedSelection?.kind === "observation" ? selectedSelection.id : null
            }
          />
          <RelationshipsPanel
            onSelectionSelect={onSelectionSelect}
            selectedId={
              selectedSelection?.kind === "relationship" ? selectedSelection.id : null
            }
          />
        </div>
      </div>
    </div>
  );
}

function InspectorTabs({
  activeTab,
  areaTargets,
  draft,
  generatedSolve,
  householdId,
  measurements,
  mode,
  moveId,
  onActiveTabChange,
  onMeasurementsRecorded,
  onRegenerate,
  onSelectionSelect,
  onTrashDraft,
  selectedObservation,
  selectedRelationship,
  selectedResource,
  selectedSelection,
  selectedSubject,
  selectedSubjectKey,
  selectableSubjects,
  targetPlanId,
}: {
  activeTab: string;
  areaTargets: FloorplanSolveResult["areaTargets"];
  draft: FloorplanDraftState;
  generatedSolve: FloorplanSolveResult | null;
  householdId?: Id<"households"> | null;
  measurements: FloorplanMeasurement[];
  mode: "public" | "move";
  moveId?: Id<"moves"> | null;
  onActiveTabChange: (value: string) => void;
  onMeasurementsRecorded: (measurements: FloorplanMeasurement[]) => void;
  onRegenerate: () => void;
  onSelectionSelect: (selection: FloorplanSelection) => void;
  onTrashDraft: () => void;
  selectedObservation: FloorplanObservation | null;
  selectedRelationship: FloorplanRelationship | null;
  selectedResource: FloorplanResource | null;
  selectedSelection: FloorplanSelection | null;
  selectedSubject: FloorplanCanonicalSubject | null;
  selectedSubjectKey: string | null;
  selectableSubjects: FloorplanSelectableSubject[];
  targetPlanId?: Id<"floorPlans"> | null;
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  function handleTabChange(value: string) {
    onActiveTabChange(value);
    window.requestAnimationFrame(() => {
      const scroller = scrollContainerRef.current;
      if (!scroller) return;
      if (typeof scroller.scrollTo === "function") {
        scroller.scrollTo({ top: 0 });
      } else {
        scroller.scrollTop = 0;
      }
    });
  }

  return (
    <Tabs
      className="flex h-full min-h-0 flex-col"
      onValueChange={handleTabChange}
      value={activeTab}
    >
      <SelectedGraphPanel
        observation={selectedObservation}
        relationship={selectedRelationship}
        resource={selectedResource}
        selection={selectedSelection}
        solve={generatedSolve}
        subject={selectedSubject}
      />
      <TabsList className="grid !h-auto w-full grid-cols-2 auto-rows-[2.25rem] gap-1 p-1">
        <InspectorTab value="sources">Sources</InspectorTab>
        <InspectorTab value="observations">Observations</InspectorTab>
        <InspectorTab value="measurements">Measurements</InspectorTab>
        <InspectorTab value="relationships">Relationships</InspectorTab>
        <InspectorTab value="subjects">Subjects</InspectorTab>
        <InspectorTab value="conflicts">Conflicts</InspectorTab>
        <InspectorTab value="gaps">Gaps</InspectorTab>
        <InspectorTab value="calculations">Calculations</InspectorTab>
        <InspectorTab value="draft">Draft Preview</InspectorTab>
        <InspectorTab value="areas">Area Targets</InspectorTab>
        <InspectorTab value="truths">Truths</InspectorTab>
        <InspectorTab value="assumptions">Assumptions</InspectorTab>
        <InspectorTab value="key">Key</InspectorTab>
      </TabsList>
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        <TabsContent className="mt-3" value="sources">
          <ResourcesUploadPanel
            householdId={householdId}
            mode={mode}
            moveId={moveId}
            onResourceSelect={(resourceId) =>
              onSelectionSelect({ kind: "resource", id: resourceId })
            }
            targetPlanId={targetPlanId}
          />
        </TabsContent>
        <TabsContent className="mt-3" value="observations">
          <ObservationsPanel
            onSelectionSelect={onSelectionSelect}
            selectedId={
              selectedSelection?.kind === "observation" ? selectedSelection.id : null
            }
          />
        </TabsContent>
        <TabsContent className="mt-3" value="measurements">
          <MeasurementsPanel
            householdId={householdId}
            key={selectedSubjectKey ?? "all-measurements"}
            measurements={measurements}
            mode={mode}
            moveId={moveId}
            onMeasurementsRecorded={onMeasurementsRecorded}
            selectableSubjects={selectableSubjects}
            selectedSubjectKey={selectedSubjectKey}
            targetPlanId={targetPlanId}
          />
        </TabsContent>
        <TabsContent className="mt-3" value="relationships">
          <RelationshipsPanel
            onSelectionSelect={onSelectionSelect}
            selectedId={
              selectedSelection?.kind === "relationship" ? selectedSelection.id : null
            }
          />
        </TabsContent>
        <TabsContent className="mt-3" value="subjects">
          <SubjectsPanel
            onSelectionSelect={onSelectionSelect}
            selectedId={
              selectedSelection?.kind === "subject" ? selectedSelection.id : null
            }
          />
        </TabsContent>
        <TabsContent className="mt-3" value="conflicts">
          <ConflictsPanel />
        </TabsContent>
        <TabsContent className="mt-3" value="gaps">
          <GapPriorityPanel gaps={generatedSolve?.gaps ?? evidenceFirstGapPriorities} />
        </TabsContent>
        <TabsContent className="mt-3" value="calculations">
          {generatedSolve ? (
            <CalculationsPanel
              calculations={generatedSolve.calculations}
              diagnostics={generatedSolve.diagnostics}
              summary={generatedSolve.areaSummary}
            />
          ) : (
            <EvidenceCalculationsPanel />
          )}
        </TabsContent>
        <TabsContent className="mt-3" value="draft">
          <DraftPreviewPanel
            draft={draft}
            onRegenerate={onRegenerate}
            onTrashDraft={onTrashDraft}
            solve={generatedSolve}
          />
        </TabsContent>
        <TabsContent className="mt-3" value="areas">
          <AreaTargetsPanel
            areaTargets={areaTargets}
            householdId={householdId}
            mode={mode}
            moveId={moveId}
            onMeasurementsRecorded={onMeasurementsRecorded}
            targetPlanId={targetPlanId}
          />
        </TabsContent>
        <TabsContent className="mt-3" value="truths">
          <EvidencePanel view="knownTruths" />
        </TabsContent>
        <TabsContent className="mt-3" value="assumptions">
          <AssumptionsPanel />
        </TabsContent>
        <TabsContent className="mt-3" value="key">
          <FloorplanKeyPanel />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function Stage({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/65 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function MetricBadge({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2 text-xs">
      <Icon className="size-3.5 text-primary" aria-hidden="true" />
      <span className="font-semibold">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function InspectorTab({
  children,
  value,
}: {
  children: ReactNode;
  value: string;
}) {
  return (
    <TabsTrigger
      className="h-8 min-w-0 whitespace-nowrap px-2 text-xs sm:text-sm"
      value={value}
    >
      {children}
    </TabsTrigger>
  );
}

function buildSelectableSubjects(
  subjects: FloorplanCanonicalSubject[],
): FloorplanSelectableSubject[] {
  return subjects.map((subject) => ({
    subjectKey: subject.subjectKey,
    subjectLabel: subject.subjectLabel,
    subjectType: subjectTypeForKind(subject.kind),
  }));
}

function subjectTypeForKind(
  kind: FloorplanSubjectKind,
): FloorplanSelectableSubject["subjectType"] {
  if (kind === "fixture") return "fixture";
  if (kind === "opening") return "opening";
  if (kind === "hall") return "path";
  if (kind === "structure") return "structure";
  if (kind === "zone") return "zone";
  if (kind === "lot") return "lot";
  return "room";
}

function tabForSelection(kind: FloorplanSelection["kind"]) {
  if (kind === "resource") return "sources";
  if (kind === "observation") return "observations";
  if (kind === "relationship") return "relationships";
  if (kind === "subject") return "subjects";
  return "measurements";
}

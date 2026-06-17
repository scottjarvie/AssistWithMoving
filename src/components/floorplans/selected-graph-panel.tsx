import { ConfidenceBadge } from "@/components/floorplans/panel-utils";
import { Separator } from "@/components/ui/separator";
import type {
  FloorplanCanonicalSubject,
  FloorplanObservation,
  FloorplanRelationship,
  FloorplanResource,
  FloorplanSelection,
  FloorplanSolveResult,
} from "@/lib/floorplans/types";

export function SelectedGraphPanel({
  observation,
  relationship,
  resource,
  selection,
  solve,
  subject,
}: {
  observation: FloorplanObservation | null;
  relationship: FloorplanRelationship | null;
  resource: FloorplanResource | null;
  selection: FloorplanSelection | null;
  solve: FloorplanSolveResult | null;
  subject: FloorplanCanonicalSubject | null;
}) {
  if (!selection) {
    return (
      <div className="mb-3 rounded-md border border-dashed border-border bg-background/45 p-3 text-sm text-muted-foreground">
        Click a source, observation, relationship, subject, or measurement to
        inspect the evidence behind it.
      </div>
    );
  }

  const selectedRoom =
    selection.kind === "space"
      ? solve?.rooms.find((room) => room.id === selection.id) ?? null
      : null;
  const selectedZone =
    selection.kind === "space"
      ? solve?.zones.find((zone) => zone.id === selection.id) ?? null
      : null;
  const selectedWall =
    selection.kind === "wall"
      ? solve?.walls?.find((wall) => wall.id === selection.id) ?? null
      : null;
  const selectedOpening =
    selection.kind === "opening"
      ? solve?.openings?.find((opening) => opening.id === selection.id) ?? null
      : null;
  const selectedOpeningWall = selectedOpening?.wallId
    ? solve?.walls?.find((wall) => wall.id === selectedOpening.wallId) ?? null
    : null;
  const selectedFixture =
    selection.kind === "fixture"
      ? solve?.fixtures?.find((fixture) => fixture.id === selection.id) ?? null
      : null;
  const selectedUnknown =
    selection.kind === "unknown"
      ? solve?.unresolvedGeometry?.find((entry) => entry.id === selection.id) ??
        null
      : null;

  const title =
    observation?.title ??
    (relationship
      ? `${relationship.fromSubjectLabel} -> ${relationship.toSubjectLabel}`
      : selectedRoom?.label ??
        selectedZone?.label ??
        selectedWall?.label ??
        selectedOpening?.label ??
        selectedFixture?.label ??
        selectedUnknown?.label ??
        subject?.subjectLabel ??
        resource?.title ??
        selection.id);
  const confidence =
    observation?.confidence ??
    relationship?.confidence ??
    selectedRoom?.confidence ??
    selectedZone?.confidence ??
    selectedWall?.confidence ??
    selectedOpening?.confidence ??
    selectedFixture?.confidence ??
    selectedUnknown?.confidence ??
    subject?.confidence ??
    null;

  return (
    <div
      className="mb-3 rounded-md border border-primary/40 bg-primary/10 p-3"
      data-testid="selected-graph-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {selection.kind}
            {resource ? ` · ${resource.status}` : ""}
            {observation ? ` · ${observation.sourceLabel}` : ""}
            {relationship ? ` · ${relationship.relationshipType}` : ""}
            {subject ? ` · ${subject.kind}` : ""}
            {selectedRoom
              ? ` · ${Math.round(selectedRoom.areaSqFt).toLocaleString()} sq ft`
              : ""}
            {selectedZone
              ? ` · ${Math.round(selectedZone.areaSqFt).toLocaleString()} sq ft zone`
              : ""}
            {selectedWall
              ? ` · ${selectedWall.exterior ? "exterior" : "interior"} wall`
              : ""}
            {selectedOpening ? ` · ${selectedOpening.kind}` : ""}
            {selectedFixture ? ` · ${selectedFixture.kind}` : ""}
          </div>
        </div>
        {confidence ? <ConfidenceBadge confidence={confidence} /> : null}
      </div>
      <Separator className="my-3" />
      <div className="grid gap-2 text-xs leading-5 text-muted-foreground">
        {resource ? <div>{resource.description}</div> : null}
        {observation?.rawText ? (
          <div>
            <span className="font-medium text-foreground">Raw text:</span>{" "}
            {observation.rawText}
          </div>
        ) : null}
        {observation?.notes ? <div>{observation.notes}</div> : null}
        {relationship?.notes ? <div>{relationship.notes}</div> : null}
        {selectedRoom ? (
          <div>
            <span className="font-medium text-foreground">Solved size:</span>{" "}
            {selectedRoom.measurementLabel}; clear space{" "}
            {selectedRoom.clearWidthIn
              ? Math.round(selectedRoom.clearWidthIn)
              : "unknown"}{" "}
            in x{" "}
            {selectedRoom.clearDepthIn
              ? Math.round(selectedRoom.clearDepthIn)
              : "unknown"}{" "}
            in.
          </div>
        ) : null}
        {selectedZone ? (
          <div>
            <span className="font-medium text-foreground">Solved zone:</span>{" "}
            {Math.round(selectedZone.widthIn)} in x{" "}
            {Math.round(selectedZone.depthIn)} in; {selectedZone.areaRole} area.
          </div>
        ) : null}
        {selectedWall ? (
          <div>
            <span className="font-medium text-foreground">Wall:</span>{" "}
            {selectedWall.orientation}, {selectedWall.thicknessIn} in thick,
            attached to {selectedWall.roomIds.length} space(s):{" "}
            {selectedWall.roomIds.join(", ")}.
            {selectedWall.sideByRoomId
              ? ` Sides: ${Object.entries(selectedWall.sideByRoomId)
                  .map(([roomId, side]) => `${roomId} ${side}`)
                  .join(", ")}.`
              : ""}
          </div>
        ) : null}
        {selectedOpening ? (
          <div>
            <span className="font-medium text-foreground">Opening:</span>{" "}
            {selectedOpening.kind}, {Math.round(selectedOpening.widthIn)} in
            wide.
            {selectedOpeningWall
              ? ` Wall: ${selectedOpeningWall.label}.`
              : " Wall unresolved."}
          </div>
        ) : null}
        {selectedFixture ? (
          <div>
            <span className="font-medium text-foreground">Fixture:</span>{" "}
            {selectedFixture.kind}, {Math.round(selectedFixture.widthIn)} in x{" "}
            {Math.round(selectedFixture.depthIn)} in.
          </div>
        ) : null}
        {selectedUnknown ? (
          <div>
            <span className="font-medium text-foreground">Why unresolved:</span>{" "}
            {selectedUnknown.reason}
            {selectedUnknown.areaSqFt
              ? ` Estimated size: ${Math.round(
                  selectedUnknown.areaSqFt,
                ).toLocaleString()} sq ft.`
              : ""}
          </div>
        ) : null}
        {subject ? (
          <div>
            {subject.observationIds.length} observations,{" "}
            {subject.relationshipIds.length} relationships,{" "}
            {subject.measurementIds.length} measurements.
          </div>
        ) : null}
      </div>
    </div>
  );
}

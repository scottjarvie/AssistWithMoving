import {
  DimensionLine,
  DoorSwing,
  FireplaceSymbol,
  SinkSymbol,
  StoveSymbol,
  ToiletSymbol,
  TubSymbol,
  WasherDryerSymbol,
  WaterHeaterSymbol,
  WindowMark,
} from "@/components/floorplans/floorplan-symbols";
import type { ReactNode } from "react";
import type {
  FloorplanConfidence,
  FloorplanObjectAdjustment,
  FloorplanSelection,
  FloorplanSolveResult,
  FloorplanSolvedFixture,
  FloorplanSolvedOpening,
  FloorplanSolvedRoom,
  FloorplanSolvedWall,
  FloorplanSolvedZone,
  FloorplanUnresolvedGeometry,
} from "@/lib/floorplans/types";
import { formatInches } from "@/lib/floorplans/solver";

export function FloorplanSvg({
  showDimensions = true,
  compact = false,
  onRoomSelect,
  onSelectionSelect,
  objectAdjustments = {},
  selectedSelection,
  selectedRoomId,
  solve,
}: {
  showDimensions?: boolean;
  compact?: boolean;
  onRoomSelect?: (roomId: string) => void;
  onSelectionSelect?: (selection: FloorplanSelection) => void;
  objectAdjustments?: Record<string, FloorplanObjectAdjustment>;
  selectedSelection?: FloorplanSelection | null;
  selectedRoomId?: string | null;
  solve: FloorplanSolveResult;
}) {
  const labelSize = compact ? 1.55 : 1.95;
  const smallLabelSize = compact ? 0.86 : 1.15;
  const bounds = viewBounds(solve);

  return (
    <svg
      aria-label="Generated floorplan assembled from evidence and solver constraints."
      className="block h-auto w-full"
      role="img"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
    >
      <defs>
        <pattern id={compact ? "floorplans-grid-compact" : "floorplans-grid"} width="2" height="2" patternUnits="userSpaceOnUse">
          <path d="M2 0H0v2" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.12" />
        </pattern>
        <filter id={compact ? "floorplans-shadow-compact" : "floorplans-shadow"} height="140%" width="140%" x="-20%" y="-20%">
          <feDropShadow dx="0" dy="0.7" floodColor="black" floodOpacity="0.28" stdDeviation="0.9" />
        </filter>
      </defs>

      <rect fill="rgb(9 17 15)" height={bounds.height} rx="2" width={bounds.width} x={bounds.x} y={bounds.y} />
      <rect
        fill={`url(#${compact ? "floorplans-grid-compact" : "floorplans-grid"})`}
        height={bounds.height - 2}
        width={bounds.width - 2}
        x={bounds.x + 1}
        y={bounds.y + 1}
      />

      <g data-floorplan-layer="property-zones">
        {solve.zones.map((zone) => (
          <PlanZone
            key={zone.id}
            adjustment={objectAdjustments[zone.id]}
            onRoomSelect={onRoomSelect}
            onSelectionSelect={onSelectionSelect}
            selected={
              isSelectionSelected(selectedSelection, "space", zone.id) ||
              zone.id === selectedRoomId
            }
            showMeasurement={showDimensions}
            smallLabelSize={smallLabelSize}
            zone={zone}
          />
        ))}
      </g>

      <g filter={`url(#${compact ? "floorplans-shadow-compact" : "floorplans-shadow"})`}>
        {solve.rooms.map((room) => (
          <PlanRoom
            key={room.id}
            adjustment={objectAdjustments[room.id]}
            labelSize={labelSize}
            onRoomSelect={onRoomSelect}
            onSelectionSelect={onSelectionSelect}
            room={room}
            selected={
              isSelectionSelected(selectedSelection, "space", room.id) ||
              room.id === selectedRoomId
            }
            showMeasurement={showDimensions}
            smallLabelSize={smallLabelSize}
          />
        ))}
      </g>

      <WallLayer
        objectAdjustments={objectAdjustments}
        onSelectionSelect={onSelectionSelect}
        selectedSelection={selectedSelection}
        walls={solve.walls ?? []}
      />
      <OpeningLayer
        openings={solve.openings ?? []}
        objectAdjustments={objectAdjustments}
        onSelectionSelect={onSelectionSelect}
        selectedSelection={selectedSelection}
      />
      <FixtureLayer
        fixtures={solve.fixtures ?? []}
        objectAdjustments={objectAdjustments}
        onSelectionSelect={onSelectionSelect}
        selectedSelection={selectedSelection}
      />
      {showDimensions ? (
        <DimensionLayer
          objectAdjustments={objectAdjustments}
          onSelectionSelect={onSelectionSelect}
          rooms={solve.rooms}
          selectedSelection={selectedSelection}
        />
      ) : null}
      <UnresolvedLayer
        bounds={bounds}
        onSelectionSelect={onSelectionSelect}
        selectedSelection={selectedSelection}
        unresolved={solve.unresolvedGeometry ?? []}
      />

    </svg>
  );
}

function PlanZone({
  adjustment,
  onRoomSelect,
  onSelectionSelect,
  selected,
  showMeasurement,
  smallLabelSize,
  zone,
}: {
  adjustment?: FloorplanObjectAdjustment;
  onRoomSelect?: (roomId: string) => void;
  onSelectionSelect?: (selection: FloorplanSelection) => void;
  selected: boolean;
  showMeasurement: boolean;
  smallLabelSize: number;
  zone: FloorplanSolvedZone;
}) {
  const x = toFeet(zone.xIn + (adjustment?.dxIn ?? 0));
  const y = toFeet(zone.yIn + (adjustment?.dyIn ?? 0));
  const width = toFeet(zone.widthIn);
  const height = toFeet(zone.depthIn);
  const isLot = zone.kind === "lot";
  const isPool = zone.id === "pool" || zone.label.toLowerCase() === "pool";

  return (
    <g
      aria-label={`Select ${zone.label}`}
      className="cursor-pointer outline-none"
      data-room-id={zone.id}
      data-selectable-id={zone.id}
      data-selectable-kind="space"
      data-zone-kind={zone.kind}
      data-selected={selected ? "true" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectionSelect?.({ kind: "space", id: zone.id });
          onRoomSelect?.(zone.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <rect
        fill={zoneFill(zone)}
        fillOpacity={isLot ? 0.08 : isPool ? 0.28 : 0.34}
        height={height}
        rx={isLot ? "0.2" : isPool ? "2.5" : "0.12"}
        stroke={
          isLot
            ? "rgb(125 211 252)"
            : isPool
              ? "rgb(56 189 248)"
              : "rgb(250 204 21)"
        }
        strokeDasharray={isLot ? "1.2 0.8" : "0.8 0.5"}
        strokeOpacity={isLot ? 0.65 : 0.85}
        strokeWidth={isLot ? "0.22" : "0.28"}
        width={width}
        x={x}
        y={y}
      />
      {selected ? (
        <rect
          fill="none"
          height={height + 0.8}
          pointerEvents="none"
          rx="0.18"
          stroke="rgb(134 239 172)"
          strokeOpacity="0.95"
          strokeWidth="0.5"
          width={width + 0.8}
          x={x - 0.4}
          y={y - 0.4}
        />
      ) : null}
      {!isPool && !isLot ? (
        <>
          <text
            fill={isLot ? "rgb(125 211 252)" : "rgb(250 247 239)"}
            fontSize={isLot ? smallLabelSize : Math.max(1.05, smallLabelSize)}
            fontWeight={isLot ? "500" : "650"}
            letterSpacing="0"
            textAnchor="middle"
            x={x + width / 2}
            y={y + height / 2 - 0.35}
          >
            {zone.label}
          </text>
          {showMeasurement && !isLot ? (
            <text
              fill="rgb(219 211 194)"
              fontSize={smallLabelSize * 0.82}
              letterSpacing="0"
              textAnchor="middle"
              x={x + width / 2}
              y={y + height / 2 + 1.15}
            >
              {Math.round(zone.areaSqFt).toLocaleString()} sq ft {zone.areaRole}
            </text>
          ) : null}
        </>
      ) : null}
    </g>
  );
}

function PlanRoom({
  adjustment,
  labelSize,
  onRoomSelect,
  onSelectionSelect,
  room,
  selected,
  showMeasurement,
  smallLabelSize,
}: {
  adjustment?: FloorplanObjectAdjustment;
  labelSize: number;
  onRoomSelect?: (roomId: string) => void;
  onSelectionSelect?: (selection: FloorplanSelection) => void;
  room: FloorplanSolvedRoom;
  selected: boolean;
  showMeasurement: boolean;
  smallLabelSize: number;
}) {
  const x = toFeet(room.xIn + (adjustment?.dxIn ?? 0));
  const y = toFeet(room.yIn + (adjustment?.dyIn ?? 0));
  const width = toFeet(room.widthIn);
  const height = toFeet(room.depthIn);
  const fill = roomFill(room.confidence, room.kind);
  const wallStrokeWidth = Math.max(0.22, Math.min(0.52, toFeet(room.wallThicknessIn ?? 4.5)));
  const opacity = room.confidence === "low" ? 0.72 : 0.9;
  const safeLabelSize = Math.min(
    labelSize,
    Math.max(0.85, (width / Math.max(room.label.length, 5)) * 1.35),
    Math.max(0.85, height * 0.2),
  );
  const measurement =
    room.measurementLabel ??
    `${formatInches(room.widthIn)} x ${formatInches(room.depthIn)}`;
  const isSmallSpace = width < 7 || height < 6;
  const showRoomMeasurement =
    showMeasurement &&
    !isSmallSpace &&
    room.kind !== "hall" &&
    room.kind !== "closet";
  const labelY = isSmallSpace ? y + height / 2 + safeLabelSize * 0.32 : y + height / 2 - 0.35;
  const isHorizontalCirculation = width >= height;

  return (
    <g
      aria-label={`Select ${room.label}`}
      className="cursor-pointer outline-none"
      data-room-confidence={room.confidence}
      data-room-id={room.id}
      data-selectable-id={room.id}
      data-selectable-kind="space"
      data-selected={selected ? "true" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectionSelect?.({ kind: "space", id: room.id });
          onRoomSelect?.(room.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <rect
        fill={fill}
        fillOpacity={opacity}
        height={height}
        rx="0.08"
        stroke="rgb(231 225 213)"
        strokeOpacity="0.92"
        strokeWidth={wallStrokeWidth}
        width={width}
        x={x}
        y={y}
      />
      {selected ? (
        <rect
          fill="none"
          height={height + 0.7}
          pointerEvents="none"
          rx="0.16"
          stroke="rgb(134 239 172)"
          strokeOpacity="0.95"
          strokeWidth="0.55"
          width={width + 0.7}
          x={x - 0.35}
          y={y - 0.35}
        />
      ) : null}
      {room.kind === "hall" || room.kind === "circulation" ? (
        <path
          d={
            isHorizontalCirculation
              ? `M${x + 1.2} ${y + height / 2}H${x + width - 1.2}`
              : `M${x + width / 2} ${y + 1.2}V${y + height - 1.2}`
          }
          pointerEvents="none"
          stroke="rgb(125 211 252)"
          strokeDasharray="0.5 0.55"
          strokeLinecap="round"
          strokeOpacity="0.7"
          strokeWidth="0.22"
        />
      ) : null}
      <text
        fill="rgb(250 247 239)"
        fontSize={safeLabelSize}
        fontWeight="650"
        letterSpacing="0"
        pointerEvents="none"
        textAnchor="middle"
        x={x + width / 2}
        y={labelY}
      >
        {room.label}
      </text>
      {showRoomMeasurement ? (
        <text
          fill="rgb(219 211 194)"
          fontSize={smallLabelSize}
          letterSpacing="0"
          pointerEvents="none"
          textAnchor="middle"
          x={x + width / 2}
          y={y + height / 2 + 1.6}
        >
          {measurement}
        </text>
      ) : null}
    </g>
  );
}

function WallLayer({
  objectAdjustments,
  onSelectionSelect,
  selectedSelection,
  walls,
}: SelectableLayerProps & { walls: FloorplanSolvedWall[] }) {
  return (
    <g data-floorplan-layer="walls">
      {walls.map((wall) => {
        const x1 = toFeet(wall.x1In);
        const y1 = toFeet(wall.y1In);
        const x2 = toFeet(wall.x2In);
        const y2 = toFeet(wall.y2In);
        const bbox = lineBbox(x1, y1, x2, y2);
        return (
          <SelectableMark
            bbox={bbox}
            key={wall.id}
            label={wall.label}
            objectAdjustments={objectAdjustments}
            onSelectionSelect={onSelectionSelect}
            selectedSelection={selectedSelection}
            selection={{ kind: "wall", id: wall.id }}
          >
            <line
              stroke={wall.exterior ? "rgb(231 225 213)" : "rgb(196 188 173)"}
              strokeDasharray={wall.inferred ? "0.5 0.55" : undefined}
              strokeLinecap="round"
              strokeOpacity={wall.exterior ? 0.42 : 0.28}
              strokeWidth={Math.max(0.08, Math.min(0.22, toFeet(wall.thicknessIn)))}
              x1={x1}
              x2={x2}
              y1={y1}
              y2={y2}
            />
          </SelectableMark>
        );
      })}
    </g>
  );
}

function OpeningLayer({
  objectAdjustments,
  onSelectionSelect,
  openings,
  selectedSelection,
}: SelectableLayerProps & { openings: FloorplanSolvedOpening[] }) {
  return (
    <g data-floorplan-layer="openings">
      {openings.map((opening) => {
        const centerX = toFeet(opening.xIn);
        const centerY = toFeet(opening.yIn);
        const width = toFeet(opening.widthIn);
        const horizontal = opening.orientation === "horizontal";
        const x1 = horizontal ? centerX - width / 2 : centerX;
        const x2 = horizontal ? centerX + width / 2 : centerX;
        const y1 = horizontal ? centerY : centerY - width / 2;
        const y2 = horizontal ? centerY : centerY + width / 2;
        const bbox = lineBbox(x1, y1, x2, y2);
        return (
          <SelectableMark
            bbox={bbox}
            key={opening.id}
            label={opening.label}
            objectAdjustments={objectAdjustments}
            onSelectionSelect={onSelectionSelect}
            selectedSelection={selectedSelection}
            selection={{ kind: "opening", id: opening.id }}
          >
            {opening.kind === "window" ? (
              <WindowMark x1={x1} x2={x2} y1={y1} y2={y2} />
            ) : (
              <PassageMark
                emphasis={opening.kind === "door" ? "door" : "passage"}
                x1={x1}
                x2={x2}
                y1={y1}
                y2={y2}
              />
            )}
            {opening.kind === "door" && opening.swing ? (
              <DoorSwing
                hinge={opening.swing.hinge}
                orientation={opening.swing.orientation}
                width={Math.max(2.4, width)}
                x={centerX}
                y={centerY}
              />
            ) : null}
          </SelectableMark>
        );
      })}
    </g>
  );
}

function PassageMark({
  emphasis = "passage",
  x1,
  x2,
  y1,
  y2,
}: {
  emphasis?: "passage" | "door";
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}) {
  return (
    <g data-floorplan-symbol={emphasis === "door" ? "doorway" : "doorless-passage"} fill="none" strokeLinecap="round">
      <path d={`M${x1} ${y1}L${x2} ${y2}`} stroke="rgb(9 17 15)" strokeWidth="0.95" />
      <path
        d={`M${x1} ${y1}L${x2} ${y2}`}
        stroke={emphasis === "door" ? "rgb(250 204 21)" : "rgb(134 239 172)"}
        strokeDasharray={emphasis === "door" ? undefined : "0.5 0.45"}
        strokeOpacity={emphasis === "door" ? 0.95 : 0.82}
        strokeWidth={emphasis === "door" ? "0.25" : "0.18"}
      />
    </g>
  );
}

function FixtureLayer({
  fixtures,
  objectAdjustments,
  onSelectionSelect,
  selectedSelection,
}: SelectableLayerProps & { fixtures: FloorplanSolvedFixture[] }) {
  return (
    <g data-floorplan-layer="fixtures">
      {fixtures.map((fixture) => {
        const x = toFeet(fixture.xIn);
        const y = toFeet(fixture.yIn);
        const width = Math.max(1.4, toFeet(fixture.widthIn));
        const height = Math.max(1.1, toFeet(fixture.depthIn));
        return (
          <SelectableMark
            bbox={{ x, y, width, height }}
            key={fixture.id}
            label={fixture.label}
            objectAdjustments={objectAdjustments}
            onSelectionSelect={onSelectionSelect}
            selectedSelection={selectedSelection}
            selection={{ kind: "fixture", id: fixture.id }}
          >
            <FixtureSymbol fixture={fixture} height={height} width={width} x={x} y={y} />
          </SelectableMark>
        );
      })}
    </g>
  );
}

function DimensionLayer({
  objectAdjustments,
  onSelectionSelect,
  rooms,
  selectedSelection,
}: SelectableLayerProps & { rooms: FloorplanSolvedRoom[] }) {
  const selectedRoom =
    selectedSelection?.kind === "space"
      ? rooms.find((room) => room.id === selectedSelection.id)
      : undefined;
  const dimensionRooms =
    selectedRoom
      ? [selectedRoom]
      : rooms
          .filter((room) => room.widthIn >= 84 && room.depthIn >= 72)
          .slice(0, 6);

  return (
    <g data-testid="dimension-layer" data-floorplan-layer="dimensions">
      {dimensionRooms.map((room, index) => {
        const x = toFeet(room.xIn);
        const y = toFeet(room.yIn);
        const width = toFeet(room.widthIn);
        const height = toFeet(room.depthIn);
        const offset = 1.5 + (index % 2) * 0.8;
        return (
          <g key={room.id}>
            <SelectableMark bbox={{ x, y: y + height + 0.7, width, height: 1.6 }} label={`${room.label} width dimension`} objectAdjustments={objectAdjustments} onSelectionSelect={onSelectionSelect} selectedSelection={selectedSelection} selection={{ kind: "dimension", id: `${room.id}-width-dimension` }}>
              <DimensionLine label={formatInches(room.widthIn)} x1={x} x2={x + width} y1={y + height + offset} y2={y + height + offset} />
            </SelectableMark>
            <SelectableMark bbox={{ x: x - 2.8, y, width: 2, height }} label={`${room.label} depth dimension`} objectAdjustments={objectAdjustments} onSelectionSelect={onSelectionSelect} selectedSelection={selectedSelection} selection={{ kind: "dimension", id: `${room.id}-depth-dimension` }}>
              <DimensionLine label={formatInches(room.depthIn)} textX={x - 2.1} textY={y + height / 2} vertical x1={x - 1.5} x2={x - 1.5} y1={y} y2={y + height} />
            </SelectableMark>
          </g>
        );
      })}
    </g>
  );
}

function UnresolvedLayer({
  bounds,
  onSelectionSelect,
  selectedSelection,
  unresolved,
}: {
  bounds: { x: number; y: number; width: number; height: number };
  onSelectionSelect?: (selection: FloorplanSelection) => void;
  selectedSelection?: FloorplanSelection | null;
  unresolved: FloorplanUnresolvedGeometry[];
}) {
  if (!unresolved.length) return null;
  const geometric = unresolved.filter(hasUnresolvedGeometry);
  const listed = unresolved.filter((entry) => !hasUnresolvedGeometry(entry));
  const panelX = bounds.x + 1.4;
  const panelY = bounds.y + Math.max(1.4, bounds.height - listed.length * 2.6 - 2);
  return (
    <g data-floorplan-layer="unresolved">
      {geometric.map((entry) => {
        const selected = isSelectionSelected(selectedSelection, "unknown", entry.id);
        const x = toFeet(entry.xIn ?? 0);
        const y = toFeet(entry.yIn ?? 0);
        const width = toFeet(entry.widthIn ?? 96);
        const height = toFeet(entry.depthIn ?? 72);
        return (
          <g
            aria-label={`Select unresolved ${entry.label}`}
            className="cursor-pointer outline-none"
            data-selectable-id={entry.id}
            data-selectable-kind="unknown"
            key={entry.id}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectionSelect?.({ kind: "unknown", id: entry.id });
              }
            }}
            role="button"
            tabIndex={0}
          >
            <rect
              fill={entry.kind === "missingArea" ? "rgb(92 62 38)" : "rgb(36 31 24)"}
              fillOpacity={0.42}
              height={height}
              rx="0.16"
              stroke={selected ? "rgb(134 239 172)" : "rgb(250 204 21)"}
              strokeDasharray="0.7 0.45"
              strokeOpacity={selected ? 0.95 : 0.76}
              strokeWidth="0.22"
              width={width}
              x={x}
              y={y}
            />
            <text
              fill="rgb(250 247 239)"
              fontSize="1"
              fontWeight="650"
              letterSpacing="0"
              textAnchor="middle"
              x={x + width / 2}
              y={y + Math.max(1.5, height / 2)}
            >
              {entry.kind === "missingArea" ? "missing area" : "unresolved"}
            </text>
            {entry.areaSqFt ? (
              <text
                fill="rgb(219 211 194)"
                fontSize="0.82"
                letterSpacing="0"
                textAnchor="middle"
                x={x + width / 2}
                y={y + Math.max(2.7, height / 2 + 1.2)}
              >
                {Math.round(entry.areaSqFt).toLocaleString()} sq ft
              </text>
            ) : null}
          </g>
        );
      })}
      {listed.slice(0, 6).map((entry, index) => {
        const y = panelY + index * 2.35;
        const selected = isSelectionSelected(selectedSelection, "unknown", entry.id);
        return (
          <g
            aria-label={`Select unresolved ${entry.label}`}
            className="cursor-pointer outline-none"
            data-selectable-id={entry.id}
            data-selectable-kind="unknown"
            key={entry.id}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectionSelect?.({ kind: "unknown", id: entry.id });
              }
            }}
            role="button"
            tabIndex={0}
          >
            <rect
              fill="rgb(36 31 24)"
              height="1.9"
              rx="0.24"
              stroke={selected ? "rgb(134 239 172)" : "rgb(250 204 21)"}
              strokeDasharray="0.5 0.45"
              strokeOpacity={selected ? 0.95 : 0.72}
              strokeWidth="0.16"
              width={Math.min(32, bounds.width - 3)}
              x={panelX}
              y={y}
            />
            <text
              fill="rgb(250 247 239)"
              fontSize="0.8"
              fontWeight="650"
              letterSpacing="0"
              x={panelX + 0.7}
              y={y + 1.2}
            >
              unresolved: {entry.label.slice(0, 28)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function hasUnresolvedGeometry(entry: FloorplanUnresolvedGeometry) {
  return (
    typeof entry.xIn === "number" &&
    typeof entry.yIn === "number" &&
    typeof entry.widthIn === "number" &&
    typeof entry.depthIn === "number"
  );
}

type SelectableLayerProps = {
  objectAdjustments: Record<string, FloorplanObjectAdjustment>;
  onSelectionSelect?: (selection: FloorplanSelection) => void;
  selectedSelection?: FloorplanSelection | null;
};

function SelectableMark({
  bbox,
  children,
  label,
  objectAdjustments,
  onSelectionSelect,
  selectedSelection,
  selection,
}: SelectableLayerProps & {
  bbox: { x: number; y: number; width: number; height: number };
  children: ReactNode;
  label: string;
  selection: FloorplanSelection;
}) {
  const adjustment = objectAdjustments[selection.id];
  const selected = isSelectionSelected(selectedSelection, selection.kind, selection.id);
  const translateX = toFeet(adjustment?.dxIn ?? 0);
  const translateY = toFeet(adjustment?.dyIn ?? 0);

  return (
    <g
      aria-label={`Select ${label}`}
      className="cursor-pointer outline-none"
      data-selected={selected ? "true" : undefined}
      data-selectable-id={selection.id}
      data-selectable-kind={selection.kind}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectionSelect?.(selection);
        }
      }}
      role="button"
      tabIndex={0}
      transform={translateX || translateY ? `translate(${translateX} ${translateY})` : undefined}
    >
      <title>{label}</title>
      <rect
        fill="transparent"
        height={bbox.height + 1.2}
        width={bbox.width + 1.2}
        x={bbox.x - 0.6}
        y={bbox.y - 0.6}
      />
      {children}
      {selected ? (
        <rect
          fill="none"
          height={bbox.height + 0.8}
          pointerEvents="none"
          rx="0.18"
          stroke="rgb(134 239 172)"
          strokeDasharray="0.7 0.45"
          strokeOpacity="0.95"
          strokeWidth="0.32"
          width={bbox.width + 0.8}
          x={bbox.x - 0.4}
          y={bbox.y - 0.4}
        />
      ) : null}
    </g>
  );
}

function toFeet(valueIn: number) {
  return valueIn / 12;
}

function lineBbox(x1: number, y1: number, x2: number, y2: number) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(0.4, Math.abs(x2 - x1)),
    height: Math.max(0.4, Math.abs(y2 - y1)),
  };
}

function FixtureSymbol({
  fixture,
  height,
  width,
  x,
  y,
}: {
  fixture: FloorplanSolvedFixture;
  height: number;
  width: number;
  x: number;
  y: number;
}) {
  if (fixture.kind === "sink") return <SinkSymbol height={height} width={width} x={x} y={y} />;
  if (fixture.kind === "toilet") return <ToiletSymbol height={height} width={width} x={x} y={y} />;
  if (fixture.kind === "tub" || fixture.kind === "shower") {
    return <TubSymbol height={height} width={width} x={x} y={y} />;
  }
  if (fixture.kind === "washer") return <WasherDryerSymbol label="W" x={x} y={y} />;
  if (fixture.kind === "dryer") return <WasherDryerSymbol label="D" x={x} y={y} />;
  if (fixture.kind === "stove") return <StoveSymbol height={height} width={width} x={x} y={y} />;
  if (fixture.kind === "fireplace") {
    return <FireplaceSymbol height={height} width={width} x={x} y={y} />;
  }
  if (fixture.kind === "waterHeater") {
    return <WaterHeaterSymbol x={x + width / 2} y={y + height / 2} radius={Math.min(width, height) / 2} />;
  }
  return (
    <g data-floorplan-symbol={fixture.kind}>
      <rect
        fill="rgb(9 17 15)"
        height={height}
        rx="0.22"
        stroke="rgb(231 225 213)"
        strokeWidth="0.22"
        width={width}
        x={x}
        y={y}
      />
      <text
        fill="rgb(231 225 213)"
        fontSize="0.72"
        letterSpacing="0"
        textAnchor="middle"
        x={x + width / 2}
        y={y + height / 2 + 0.25}
      >
        {fixture.label.slice(0, 10)}
      </text>
    </g>
  );
}

function viewBounds(solve: FloorplanSolveResult) {
  const padding = 7;
  return {
    x: toFeet(solve.bounds.minXIn) - padding,
    y: toFeet(solve.bounds.minYIn) - padding,
    width: toFeet(solve.bounds.widthIn) + padding * 2,
    height: toFeet(solve.bounds.depthIn) + padding * 2,
  };
}

function roomFill(
  confidence: FloorplanConfidence,
  kind: FloorplanSolvedRoom["kind"],
) {
  if (kind === "hall" || kind === "circulation") return "rgb(42 69 84)";
  if (kind === "closet") return "rgb(55 62 49)";
  if (kind === "bath" || kind === "utility") return "rgb(58 55 68)";
  if (kind === "garage" || kind === "carport") return "rgb(78 72 57)";
  if (kind === "patio" || kind === "deck" || kind === "porch") return "rgb(62 72 68)";
  if (kind === "shed" || kind === "yard" || kind === "outdoor") return "rgb(48 70 48)";
  if (confidence === "high") return "rgb(31 82 68)";
  if (confidence === "medium") return "rgb(37 73 96)";
  if (confidence === "conflict") return "rgb(127 29 29)";
  return "rgb(63 57 50)";
}

function zoneFill(zone: FloorplanSolvedZone) {
  if (zone.kind === "lot") return "rgb(14 116 144)";
  if (zone.kind === "garage" || zone.kind === "carport") return "rgb(113 83 42)";
  if (zone.kind === "patio" || zone.kind === "deck" || zone.kind === "porch") {
    return "rgb(100 116 139)";
  }
  if (zone.kind === "yard" || zone.kind === "garden") return "rgb(34 94 62)";
  if (zone.kind === "driveway") return "rgb(71 85 105)";
  return "rgb(72 80 58)";
}

function isSelectionSelected(
  selectedSelection: FloorplanSelection | null | undefined,
  kind: FloorplanSelection["kind"],
  id: string,
) {
  return selectedSelection?.kind === kind && selectedSelection.id === id;
}

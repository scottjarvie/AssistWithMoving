"use client";

import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Minimize2,
  Move,
  Ruler,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { FloorplanSvg } from "@/components/floorplans/floorplan-svg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  FloorplanObjectAdjustment,
  FloorplanSelection,
  FloorplanSolveResult,
} from "@/lib/floorplans/types";
import { cn } from "@/lib/utils";

const minScale = 0.35;
const maxScale = 3.5;
const stageWidth = 980;
const stageHeight = 660;

type Point = { x: number; y: number };
type ViewTransform = Point & { scale: number };
const initialView: ViewTransform = { x: 0, y: 0, scale: 0.8 };
type SvgPoint = Point;
type GestureState =
  | { kind: "pan"; point: Point; view: ViewTransform }
  | {
      kind: "pinch";
      distance: number;
      midpoint: Point;
      view: ViewTransform;
    };
type ObjectMoveState = {
  baseAdjustment: FloorplanObjectAdjustment;
  selection: FloorplanSelection;
  startSvgPoint: SvgPoint;
};

export function FloorplanViewer({
  initialShowDimensions = true,
  onClearSelection,
  onObjectAdjustmentChange,
  onRoomSelect,
  onSelectionSelect,
  objectAdjustments = {},
  selectedSelection,
  selectedRoomId,
  solve,
}: {
  initialShowDimensions?: boolean;
  onClearSelection?: () => void;
  onObjectAdjustmentChange?: (
    selection: FloorplanSelection,
    adjustment: FloorplanObjectAdjustment,
  ) => void;
  onRoomSelect?: (roomId: string) => void;
  onSelectionSelect?: (selection: FloorplanSelection) => void;
  objectAdjustments?: Record<string, FloorplanObjectAdjustment>;
  selectedSelection?: FloorplanSelection | null;
  selectedRoomId?: string | null;
  solve?: FloorplanSolveResult;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<GestureState | null>(null);
  const emptyClickCandidateRef = useRef<Point | null>(null);
  const objectMoveRef = useRef<ObjectMoveState | null>(null);
  const selectionClickCandidateRef = useRef<{
    selection: FloorplanSelection;
    start: Point;
  } | null>(null);
  const viewRef = useRef<ViewTransform>(initialView);
  const [view, setView] = useState<ViewTransform>(initialView);
  const [showDimensions, setShowDimensions] = useState(initialShowDimensions);
  const [fullscreenMode, setFullscreenMode] = useState(false);
  const [moveMode, setMoveMode] = useState(false);

  const updateView = useCallback((next: ViewTransform | ((current: ViewTransform) => ViewTransform)) => {
    setView((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      const clamped = {
        x: resolved.x,
        y: resolved.y,
        scale: clamp(resolved.scale, minScale, maxScale),
      };
      viewRef.current = clamped;
      return clamped;
    });
  }, []);

  const fitToScreen = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const bounds = viewport.getBoundingClientRect();
    const nextScale = clamp(
      Math.min((bounds.width - 40) / stageWidth, (bounds.height - 40) / stageHeight),
      minScale,
      1.3,
    );
    updateView({
      scale: nextScale,
      x: Math.max(18, (bounds.width - stageWidth * nextScale) / 2),
      y: Math.max(18, (bounds.height - stageHeight * nextScale) / 2),
    });
  }, [updateView]);

  useEffect(() => {
    fitToScreen();
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => fitToScreen());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitToScreen]);

  useEffect(() => {
    function handleFullscreenChange() {
      if (!shellRef.current) return;
      setFullscreenMode(document.fullscreenElement === shellRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClearSelection?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClearSelection]);

  function zoomBy(delta: number, origin?: Point) {
    const viewport = viewportRef.current;
    const viewportOrigin = origin ?? centerOf(viewport);
    updateView((current) => scaleAroundPoint(current, current.scale * delta, viewportOrigin));
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const origin = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };

    if (event.ctrlKey || event.metaKey || event.altKey) {
      const delta = event.deltaY < 0 ? 1.08 : 0.92;
      zoomBy(delta, origin);
      return;
    }

    updateView((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = eventPoint(event);
    pointersRef.current.set(event.pointerId, point);
    const selection = selectionFromEventTarget(event.target);
    selectionClickCandidateRef.current = selection
      ? {
          selection,
          start: point,
        }
      : null;
    emptyClickCandidateRef.current = selection ? null : point;

    const svgPoint = svgPointFromEvent(event);
    if (
      moveMode &&
      selection &&
      svgPoint &&
      onObjectAdjustmentChange &&
      pointersRef.current.size === 1
    ) {
      objectMoveRef.current = {
        baseAdjustment: objectAdjustments[selection.id] ?? { dxIn: 0, dyIn: 0 },
        selection,
        startSvgPoint: svgPoint,
      };
      gestureRef.current = null;
      return;
    }

    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        kind: "pan",
        point,
        view: viewRef.current,
      };
      return;
    }

    if (pointersRef.current.size === 2) {
      emptyClickCandidateRef.current = null;
      selectionClickCandidateRef.current = null;
      objectMoveRef.current = null;
      const [first, second] = [...pointersRef.current.values()];
      if (first && second) {
        gestureRef.current = {
          kind: "pinch",
          distance: distance(first, second),
          midpoint: midpoint(first, second),
          view: viewRef.current,
        };
      }
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, eventPoint(event));
    const activeMove = objectMoveRef.current;
    if (activeMove && pointersRef.current.size === 1 && onObjectAdjustmentChange) {
      const svgPoint = svgPointFromEvent(event);
      if (!svgPoint) return;
      selectionClickCandidateRef.current = null;
      emptyClickCandidateRef.current = null;
      onObjectAdjustmentChange(activeMove.selection, {
        dxIn:
          activeMove.baseAdjustment.dxIn +
          (svgPoint.x - activeMove.startSvgPoint.x) * 12,
        dyIn:
          activeMove.baseAdjustment.dyIn +
          (svgPoint.y - activeMove.startSvgPoint.y) * 12,
      });
      return;
    }
    const gesture = gestureRef.current;
    if (!gesture) return;
    const candidate = selectionClickCandidateRef.current;
    if (candidate && distance(candidate.start, eventPoint(event)) > 6) {
      selectionClickCandidateRef.current = null;
    }
    const emptyCandidate = emptyClickCandidateRef.current;
    if (emptyCandidate && distance(emptyCandidate, eventPoint(event)) > 6) {
      emptyClickCandidateRef.current = null;
    }

    if (pointersRef.current.size >= 2 && gesture.kind === "pinch") {
      emptyClickCandidateRef.current = null;
      selectionClickCandidateRef.current = null;
      const [first, second] = [...pointersRef.current.values()];
      if (!first || !second) return;
      const nextDistance = distance(first, second);
      const nextMidpoint = midpoint(first, second);
      const nextScale = gesture.view.scale * (nextDistance / gesture.distance);
      updateView(
        scaleAroundPoint(
          {
            ...gesture.view,
            x: gesture.view.x + (nextMidpoint.x - gesture.midpoint.x),
            y: gesture.view.y + (nextMidpoint.y - gesture.midpoint.y),
          },
          nextScale,
          nextMidpoint,
        ),
      );
      return;
    }

    if (pointersRef.current.size === 1 && gesture.kind === "pan") {
      const point = eventPoint(event);
      updateView({
        ...gesture.view,
        x: gesture.view.x + point.x - gesture.point.x,
        y: gesture.view.y + point.y - gesture.point.y,
      });
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const activeMove = objectMoveRef.current;
    if (activeMove) {
      onSelectionSelect?.(activeMove.selection);
      if (activeMove.selection.kind === "space") {
        onRoomSelect?.(activeMove.selection.id);
      }
      objectMoveRef.current = null;
      emptyClickCandidateRef.current = null;
      selectionClickCandidateRef.current = null;
      pointersRef.current.delete(event.pointerId);
      gestureRef.current = null;
      return;
    }

    const candidate = selectionClickCandidateRef.current;
    if (
      candidate &&
      pointersRef.current.size === 1 &&
      distance(candidate.start, eventPoint(event)) <= 6
    ) {
      onSelectionSelect?.(candidate.selection);
      if (candidate.selection.kind === "space") {
        onRoomSelect?.(candidate.selection.id);
      }
    } else if (
      emptyClickCandidateRef.current &&
      pointersRef.current.size === 1 &&
      distance(emptyClickCandidateRef.current, eventPoint(event)) <= 6
    ) {
      onClearSelection?.();
    }
    emptyClickCandidateRef.current = null;
    selectionClickCandidateRef.current = null;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      const [point] = [...pointersRef.current.values()];
      if (point) {
        gestureRef.current = {
          kind: "pan",
          point,
          view: viewRef.current,
        };
      }
      return;
    }
    gestureRef.current = null;
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    emptyClickCandidateRef.current = null;
    selectionClickCandidateRef.current = null;
    objectMoveRef.current = null;
    handlePointerEnd(event);
  }

  async function toggleFullscreen() {
    const shell = shellRef.current;
    if (!shell) return;

    if (fullscreenMode) {
      if (document.fullscreenElement === shell) {
        await document.exitFullscreen();
      }
      setFullscreenMode(false);
      return;
    }

    setFullscreenMode(true);
    try {
      await shell.requestFullscreen();
    } catch {
      // Embedded previews and browser automation can reject native fullscreen.
      // The CSS fixed mode still gives the user the same working viewport.
    }
    window.setTimeout(fitToScreen, 50);
  }

  return (
    <section
      ref={shellRef}
      aria-label="Floorplan viewer"
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card",
        fullscreenMode && "fixed inset-0 z-50 h-dvh rounded-none border-0",
      )}
      data-testid="floorplan-viewer"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/95 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            aria-label="Zoom out"
            disabled={view.scale <= minScale + 0.01}
            onClick={() => zoomBy(0.84)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ZoomOut aria-hidden="true" />
          </Button>
          <Badge
            aria-label="Zoom level"
            className="h-7 min-w-16 justify-center font-mono"
            data-testid="zoom-value"
            variant="outline"
          >
            {Math.round(view.scale * 100)}%
          </Badge>
          <Button
            aria-label="Zoom in"
            disabled={view.scale >= maxScale - 0.01}
            onClick={() => zoomBy(1.18)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ZoomIn aria-hidden="true" />
          </Button>
          <Button onClick={fitToScreen} size="sm" type="button" variant="outline">
            <Move aria-hidden="true" />
            Fit
          </Button>
          <Button
            aria-pressed={moveMode}
            data-testid="floorplan-move-mode-toggle"
            onClick={() => setMoveMode((current) => !current)}
            size="sm"
            type="button"
            variant={moveMode ? "default" : "outline"}
          >
            <Move aria-hidden="true" />
            Move objects
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            aria-pressed={showDimensions}
            data-testid="dimension-toggle"
            onClick={() => setShowDimensions((current) => !current)}
            size="sm"
            type="button"
            variant={showDimensions ? "default" : "outline"}
          >
            <Ruler aria-hidden="true" />
            Dimensions
          </Button>
          <Button
            data-testid="floorplan-fullscreen-toggle"
            onClick={() => void toggleFullscreen()}
            size="sm"
            type="button"
            variant="outline"
          >
            {fullscreenMode ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            {fullscreenMode ? "Exit full screen" : "Full screen"}
          </Button>
        </div>
      </div>

      <div
        ref={viewportRef}
        aria-label="Pan and zoom floorplan canvas"
        className={cn(
          "relative min-h-[480px] flex-1 overflow-hidden bg-[rgb(8_16_14)]",
          moveMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
        )}
        data-testid="floorplan-canvas"
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onWheel={handleWheel}
        style={{ touchAction: "none" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_0,transparent_58%)]" />
        <div
          className="absolute left-0 top-0 rounded-lg border border-border/60 bg-background/30 p-3 shadow-2xl shadow-black/40"
          style={{
            height: stageHeight,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: "0 0",
            width: stageWidth,
          }}
        >
          {solve ? (
            <FloorplanSvg
              objectAdjustments={objectAdjustments}
              onRoomSelect={onRoomSelect}
              onSelectionSelect={onSelectionSelect}
              selectedSelection={selectedSelection}
              selectedRoomId={selectedRoomId}
              showDimensions={showDimensions}
              solve={solve}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border bg-background/70 p-8 text-center text-sm leading-6 text-muted-foreground">
              No generated geometry yet. Add evidence, then regenerate the layout.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function centerOf(element: HTMLElement | null): Point {
  if (!element) {
    return { x: stageWidth / 2, y: stageHeight / 2 };
  }
  const bounds = element.getBoundingClientRect();
  return { x: bounds.width / 2, y: bounds.height / 2 };
}

function scaleAroundPoint(
  view: ViewTransform,
  requestedScale: number,
  origin: Point,
): ViewTransform {
  const nextScale = clamp(requestedScale, minScale, maxScale);
  const ratio = nextScale / view.scale;
  return {
    scale: nextScale,
    x: origin.x - (origin.x - view.x) * ratio,
    y: origin.y - (origin.y - view.y) * ratio,
  };
}

function eventPoint(event: ReactPointerEvent<HTMLDivElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function selectionFromEventTarget(target: EventTarget | null): FloorplanSelection | null {
  if (!(target instanceof Element)) return null;
  const selectable = target.closest("[data-selectable-kind][data-selectable-id]");
  if (!selectable) return null;
  const kind = selectable.getAttribute("data-selectable-kind");
  const id = selectable.getAttribute("data-selectable-id");
  if (!id || !isSelectableKind(kind)) return null;
  return { kind, id };
}

function isSelectableKind(kind: string | null): kind is FloorplanSelection["kind"] {
  return (
    kind === "space" ||
    kind === "wall" ||
    kind === "fixture" ||
    kind === "opening" ||
    kind === "unknown" ||
    kind === "dimension" ||
    kind === "resource"
  );
}

function svgPointFromEvent(
  event: ReactPointerEvent<HTMLDivElement>,
): SvgPoint | null {
  if (!(event.target instanceof Element)) return null;
  const svg = event.target.closest("svg");
  if (!(svg instanceof SVGSVGElement)) return null;
  if (
    typeof svg.getScreenCTM !== "function" ||
    typeof svg.createSVGPoint !== "function"
  ) {
    return null;
  }
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(matrix.inverse());
}

function distance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function midpoint(first: Point, second: Point): Point {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

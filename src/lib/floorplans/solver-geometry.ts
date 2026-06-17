import type { FloorplanSolveResult } from "@/lib/floorplans/types";

export type FloorplanRect = {
  id: string;
  xIn: number;
  yIn: number;
  widthIn: number;
  depthIn: number;
};

export function formatInches(valueIn: number) {
  const sign = valueIn < 0 ? "-" : "";
  const absolute = Math.abs(valueIn);
  const feet = Math.floor(absolute / 12);
  const rawInches = absolute - feet * 12;
  const roundedInches = Math.round(rawInches);
  const inches =
    Math.abs(rawInches - roundedInches) < 0.01
      ? String(roundedInches)
      : rawInches.toFixed(1).replace(/\.0$/, "");
  if (!feet) return `${sign}${inches} in`;
  if (Number(inches) === 0) return `${sign}${feet} ft`;
  return `${sign}${feet} ft ${inches} in`;
}

export function normalizeOrigins<T extends FloorplanRect>(rooms: T[]) {
  if (!rooms.length) return rooms;
  const minXIn = Math.min(...rooms.map((room) => room.xIn));
  const minYIn = Math.min(...rooms.map((room) => room.yIn));
  return rooms.map((room) => ({
    ...room,
    xIn: room.xIn - minXIn,
    yIn: room.yIn - minYIn,
  }));
}

export function floorplanBounds(
  rooms: FloorplanRect[],
): FloorplanSolveResult["bounds"] {
  if (!rooms.length) {
    return {
      minXIn: 0,
      minYIn: 0,
      maxXIn: 0,
      maxYIn: 0,
      widthIn: 0,
      depthIn: 0,
    };
  }
  const minXIn = Math.min(...rooms.map((room) => room.xIn));
  const minYIn = Math.min(...rooms.map((room) => room.yIn));
  const maxXIn = Math.max(...rooms.map((room) => room.xIn + room.widthIn));
  const maxYIn = Math.max(...rooms.map((room) => room.yIn + room.depthIn));
  return {
    minXIn,
    minYIn,
    maxXIn,
    maxYIn,
    widthIn: maxXIn - minXIn,
    depthIn: maxYIn - minYIn,
  };
}

export function rectanglePoints(rect: FloorplanRect) {
  return [
    { x: rect.xIn, y: rect.yIn },
    { x: rect.xIn + rect.widthIn, y: rect.yIn },
    { x: rect.xIn + rect.widthIn, y: rect.yIn + rect.depthIn },
    { x: rect.xIn, y: rect.yIn + rect.depthIn },
  ];
}

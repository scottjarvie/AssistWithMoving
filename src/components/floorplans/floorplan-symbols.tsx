type DoorSwingProps = {
  x: number;
  y: number;
  width: number;
  hinge: "left" | "right";
  orientation: "up" | "down" | "left" | "right";
};

type WindowMarkProps = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type DimensionLineProps = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  textX?: number;
  textY?: number;
  vertical?: boolean;
};

const wallStroke = "var(--floorplan-wall, rgb(231 225 213))";
const fixtureStroke = "var(--floorplan-fixture, rgb(231 225 213))";
const fixtureFill = "var(--floorplan-surface, rgb(13 20 18))";
const dimensionStroke = "var(--floorplan-dimension, rgb(221 213 194))";
const windowStroke = "var(--floorplan-window, rgb(125 211 252))";
const openingStroke = "var(--floorplan-opening, rgb(250 204 21))";

export function DoorSwing({
  x,
  y,
  width,
  hinge,
  orientation,
}: DoorSwingProps) {
  const sign = hinge === "left" ? 1 : -1;
  const vertical = orientation === "left" || orientation === "right";
  const doorLeaf =
    vertical && orientation === "right"
      ? `M${x} ${y}h${width * sign}`
      : vertical
        ? `M${x} ${y}h${width * sign}`
        : orientation === "down"
          ? `M${x} ${y}v${width}`
          : `M${x} ${y}v${-width}`;
  const arcPath = doorArcPath(x, y, width, hinge, orientation);

  return (
    <g data-floorplan-symbol="door" fill="none" strokeLinecap="round">
      <path d={doorLeaf} stroke={wallStroke} strokeWidth="0.45" />
      <path d={arcPath} stroke={openingStroke} strokeWidth="0.28" />
    </g>
  );
}

export function WindowMark({ x1, y1, x2, y2 }: WindowMarkProps) {
  const horizontal = Math.abs(y2 - y1) <= Math.abs(x2 - x1);
  const offset = 0.28;
  const first = horizontal
    ? { x1, y1: y1 - offset, x2, y2: y2 - offset }
    : { x1: x1 - offset, y1, x2: x2 - offset, y2 };
  const second = horizontal
    ? { x1, y1: y1 + offset, x2, y2: y2 + offset }
    : { x1: x1 + offset, y1, x2: x2 + offset, y2 };

  return (
    <g data-floorplan-symbol="window" fill="none" strokeLinecap="round">
      <path d={`M${x1} ${y1}L${x2} ${y2}`} stroke={windowStroke} strokeWidth="0.65" />
      <line {...first} stroke={windowStroke} strokeOpacity="0.72" strokeWidth="0.22" />
      <line {...second} stroke={windowStroke} strokeOpacity="0.72" strokeWidth="0.22" />
    </g>
  );
}

export function DimensionLine({
  x1,
  y1,
  x2,
  y2,
  label,
  textX = (x1 + x2) / 2,
  textY = (y1 + y2) / 2 - 0.7,
  vertical = false,
}: DimensionLineProps) {
  return (
    <g data-testid="floorplan-dimension-line" fill="none" strokeLinecap="round">
      <line x1={x1} x2={x2} y1={y1} y2={y2} stroke={dimensionStroke} strokeWidth="0.18" />
      <path d={dimensionTickPath(x1, y1, vertical)} stroke={dimensionStroke} strokeWidth="0.18" />
      <path d={dimensionTickPath(x2, y2, vertical)} stroke={dimensionStroke} strokeWidth="0.18" />
      <text
        fill={dimensionStroke}
        fontSize="1.2"
        letterSpacing="0"
        textAnchor="middle"
        transform={vertical ? `rotate(90 ${textX} ${textY})` : undefined}
        x={textX}
        y={textY}
      >
        {label}
      </text>
    </g>
  );
}

export function SinkSymbol({ x, y, width = 3.2, height = 2.2 }: SymbolBoxProps) {
  return (
    <g data-floorplan-symbol="sink" fill={fixtureFill} stroke={fixtureStroke} strokeWidth="0.24">
      <rect height={height} rx="0.22" width={width} x={x} y={y} />
      <ellipse cx={x + width / 2} cy={y + height / 2} fill="none" rx={width * 0.32} ry={height * 0.28} />
      <path d={`M${x + width * 0.44} ${y + height * 0.32}h${width * 0.12}`} />
    </g>
  );
}

export function ToiletSymbol({ x, y, width = 2.5, height = 3.1 }: SymbolBoxProps) {
  return (
    <g data-floorplan-symbol="toilet" fill={fixtureFill} stroke={fixtureStroke} strokeWidth="0.24">
      <rect height={height * 0.42} rx="0.18" width={width * 0.62} x={x + width * 0.19} y={y} />
      <ellipse cx={x + width / 2} cy={y + height * 0.68} fill="none" rx={width * 0.36} ry={height * 0.25} />
      <path d={`M${x + width / 2} ${y + height * 0.43}v${height * 0.12}`} />
    </g>
  );
}

export function TubSymbol({ x, y, width = 4.8, height = 2.2 }: SymbolBoxProps) {
  return (
    <g data-floorplan-symbol="tub" fill={fixtureFill} stroke={fixtureStroke} strokeWidth="0.24">
      <rect height={height} rx="0.28" width={width} x={x} y={y} />
      <path d={`M${x + 0.55} ${y + 0.55}h${width - 1.1}v${height - 1.1}h-${width - 1.1}z`} fill="none" />
      <circle cx={x + 0.75} cy={y + height / 2} fill="none" r="0.18" />
    </g>
  );
}

export function WasherDryerSymbol({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label: "W" | "D";
}) {
  return (
    <g data-floorplan-symbol={label === "W" ? "washer" : "dryer"}>
      <rect
        fill={fixtureFill}
        height="2.2"
        rx="0.25"
        stroke={fixtureStroke}
        strokeWidth="0.24"
        width="2.4"
        x={x}
        y={y}
      />
      <circle cx={x + 1.2} cy={y + 1.1} fill="none" r="0.62" stroke={fixtureStroke} strokeWidth="0.18" />
      <text fill={fixtureStroke} fontSize="0.8" fontWeight="700" textAnchor="middle" x={x + 1.2} y={y + 1.38}>
        {label}
      </text>
    </g>
  );
}

export function StoveSymbol({ x, y, width = 3.6, height = 2.1 }: SymbolBoxProps) {
  const burners = [
    [x + width * 0.33, y + height * 0.34],
    [x + width * 0.67, y + height * 0.34],
    [x + width * 0.33, y + height * 0.68],
    [x + width * 0.67, y + height * 0.68],
  ];

  return (
    <g data-floorplan-symbol="stove" fill={fixtureFill} stroke={fixtureStroke} strokeWidth="0.24">
      <rect height={height} rx="0.22" width={width} x={x} y={y} />
      {burners.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} fill="none" r="0.24" />
      ))}
    </g>
  );
}

export function FireplaceSymbol({ x, y, width = 12, height = 1.4 }: SymbolBoxProps) {
  return (
    <g data-floorplan-symbol="fireplace" fill={fixtureFill} stroke={fixtureStroke} strokeWidth="0.24">
      <rect height={height} rx="0.16" width={width} x={x} y={y} />
      <path d={`M${x + 1} ${y + height}c1.8 -1.5 3.6 -1.5 5.4 0M${x + 6.2} ${y + height}c1.8 -1.5 3.6 -1.5 5.4 0`} fill="none" />
    </g>
  );
}

export function WaterHeaterSymbol({ x, y, radius = 1.05 }: { x: number; y: number; radius?: number }) {
  return (
    <g data-floorplan-symbol="water-heater" fill={fixtureFill} stroke={fixtureStroke} strokeWidth="0.24">
      <circle cx={x} cy={y} r={radius} />
      <path d={`M${x - radius * 0.55} ${y}h${radius * 1.1}M${x} ${y - radius * 0.55}v${radius * 1.1}`} />
    </g>
  );
}

type SymbolBoxProps = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

function doorArcPath(
  x: number,
  y: number,
  width: number,
  hinge: DoorSwingProps["hinge"],
  orientation: DoorSwingProps["orientation"],
) {
  const sign = hinge === "left" ? 1 : -1;
  if (orientation === "down") {
    return `M${x} ${y + width}A${width} ${width} 0 0 ${sign > 0 ? 1 : 0} ${x + width * sign} ${y}`;
  }
  if (orientation === "up") {
    return `M${x} ${y - width}A${width} ${width} 0 0 ${sign > 0 ? 0 : 1} ${x + width * sign} ${y}`;
  }
  if (orientation === "right") {
    return `M${x + width * sign} ${y}A${width} ${width} 0 0 ${sign > 0 ? 0 : 1} ${x} ${y + width}`;
  }
  return `M${x + width * sign} ${y}A${width} ${width} 0 0 ${sign > 0 ? 1 : 0} ${x} ${y - width}`;
}

function dimensionTickPath(x: number, y: number, vertical: boolean) {
  if (vertical) {
    return `M${x - 0.38} ${y}l0.76 0`;
  }
  return `M${x} ${y - 0.38}l0 0.76`;
}

import type { SVGProps } from "react";

export type MovingSymbolName = "sun" | "moon" | "system" | "contents" | "box" | "route" | "plan" | "truck" | "calendar" | "queue" | "settings" | "note" | "people" | "source" | "person" | "ai" | "camera" | "table" | "list" | "grid" | "sort" | "density" | "columns";

// Drawn for Moving: square-ended labels, a folded box and a routed line.
// All marks inherit ink from their semantic role; no embedded raster assets.
const strokes: Record<MovingSymbolName, React.ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  moon: <path d="M19.5 14.4A8 8 0 0 1 9.6 4.5 8.1 8.1 0 1 0 19.5 14.4Z" />,
  system: <><rect x="3" y="4" width="18" height="13" rx="1" /><path d="M8 21h8m-4-4v4M3 13h18" /></>,
  contents: <><path d="M9 5h12M9 12h12M9 19h12" /><rect x="3" y="4" width="2" height="2" /><rect x="3" y="11" width="2" height="2" /><rect x="3" y="18" width="2" height="2" /></>,
  box: <><path d="m3 7 9-4 9 4v11l-9 4-9-4ZM3 7l9 4 9-4M12 11v11M8 5l9 4v5" /><path d="m6 15 3 1.3" /></>,
  route: <><circle cx="5" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><path d="M5 7v6a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V7h-5m0 0 3-3m-3 3 3 3" /></>,
  plan: <><path d="M3 3h18v18H3ZM3 12h7m4 0h7M12 3v6m0 6v6M3 6h3m12 12h3" /><path d="m9 15 6-6" /></>,
  truck: <><path d="M2 5h12v12H2Zm12 4h4l4 5v3h-8M18 9v5h4" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M7 3v4m10-4v4M3 10h18m-14 5h3m4 0h3m-10 3h3" /></>,
  queue: <><path d="M4 4h16v16H4ZM4 13h5l2 3h2l2-3h5M8 8h8" /></>,
  settings: <><path d="M3 6h18M3 12h18M3 18h18" /><rect x="7" y="4" width="3" height="4" /><rect x="15" y="10" width="3" height="4" /><rect x="6" y="16" width="3" height="4" /></>,
  camera: <><path d="M3 7h4l2-3h6l2 3h4v14H3Z" /><circle cx="12" cy="13" r="4" /><path d="M18 10h1" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M3 14h18M9 4v16m6-16v16" /></>,
  list: <><path d="M8 5h13M8 12h13M8 19h13M3 5h1m-1 7h1m-1 7h1" /></>,
  grid: <><path d="M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z" /></>,
  sort: <><path d="M7 3v18m-4-4 4 4 4-4M14 5h7m-7 6h5m-5 6h3" /></>,
  density: <><path d="M3 5h18M3 10h18M3 15h18M3 20h18" /></>,
  columns: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M9 4v16m6-16v16" /></>,
  note: <><path d="M5 3h11l4 4v14H5ZM16 3v5h4M8 12h9m-9 4h7" /></>,
  people: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2" /></>,
  source: <><path d="M4 4h7v7H4Zm9 9h7v7h-7ZM11 7h6v6M7 11v6h6" /></>,
  person: <><circle cx="12" cy="7" r="3" fill="currentColor" /><path d="M5 21v-3a7 7 0 0 1 14 0v3" /></>,
  ai: <><path d="M4 5h16v12H9l-5 4ZM8 9h8m-8 4h5" /><path d="m16 2 3 3-3 3" /></>,
};

export function MovingSymbol({ name, ...props }: SVGProps<SVGSVGElement> & { name: MovingSymbolName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-symbol={name} {...props}>{strokes[name]}</svg>;
}

export function MoveIllustration({ kind = "route", className, decorative = false }: { kind?: "route" | "box" | "room" | "truck"; className?: string; decorative?: boolean }) {
  return (
    <svg viewBox="0 0 280 160" className={className} role={decorative ? undefined : "img"} aria-hidden={decorative ? true : undefined} aria-label={decorative ? undefined : `${kind === "route" ? "Home-to-home move" : kind === "room" ? "Room plan" : kind === "truck" ? "Moving truck" : "Packing box"} illustration`} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 138h240M20 22h240M30 16v12m220-12v12" stroke="var(--border)" />
      {kind === "route" ? <>
        <path d="M26 90 65 54l39 36M36 82v49h58V82M59 131v-28h16v28" stroke="var(--primary)" />
        <path d="m176 73 36-31 36 31m-63-8v66h54V65m-36 66v-26h17v26M199 78h8m12 0h8" stroke="var(--primary)" />
        <path d="M106 118h18q15 0 15-16V88q0-15 15-15h15m-6-5 6 5-6 5" stroke="var(--evidence)" strokeDasharray="4 5" />
        <path d="m113 43 16-7 16 7v20l-16 7-16-7Zm0 0 16 7 16-7m-16 7v20" stroke="var(--accent)" />
      </> : kind === "box" ? <>
        <path d="m71 65 69-29 69 29-69 29Zm0 0v51l69 29 69-29V65m-69 29v51" fill="var(--muted)" stroke="var(--primary)" />
        <path d="m71 65-20-25 60-23 29 19 29-19 60 23-20 25M112 47l56 24v27" stroke="var(--primary)" />
        <path d="m87 101 30 13v15l-30-13Z" fill="var(--background)" stroke="var(--border)" /><path d="m92 110 16 7" stroke="var(--evidence)" />
      </> : kind === "room" ? <>
        <path d="M57 38h166v94H57ZM139 38v34m0 25v35M57 86h42m24 0h100M139 97a25 25 0 0 0-25-25" stroke="var(--primary)" />
        <path d="M71 49h49v23H71Zm86 48h49v23h-49Z" fill="var(--muted)" stroke="var(--primary)" /><path d="M159 53h40v25h-40Zm-12 89h65m-65-4v8m65-8v8" stroke="var(--evidence)" />
      </> : <>
        <path d="M40 54h129v68H40Zm129 24h38l29 28v16h-67m38-44v29h29M52 65h104m-104 8h104" stroke="var(--primary)" fill="var(--muted)" /><circle cx="73" cy="124" r="13" fill="var(--background)" stroke="var(--primary)" /><circle cx="209" cy="124" r="13" fill="var(--background)" stroke="var(--primary)" /><path d="M96 111h47m-7-6 7 6-7 6" stroke="var(--accent)" />
      </>}
    </svg>
  );
}

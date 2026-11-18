import { useId } from "react";

const star =
  "M0-22C5-10 10-5 22 0 10 5 5 10 0 22-5 10-10 5-22 0-10-5-5-10 0-22Z";
export function Spark({
  x = 0,
  y = 0,
  outline = false,
}: {
  x?: number;
  y?: number;
  outline?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d={star}
        fill={outline ? "none" : "var(--draw-ai-fill)"}
        stroke="var(--draw-ai)"
        strokeDasharray={outline ? "4 5" : undefined}
      />
      <circle cx="-5" cy="-1" r="1.5" fill="var(--draw-ai)" stroke="none" />
      <circle cx="5" cy="-1" r="1.5" fill="var(--draw-ai)" stroke="none" />
      <path d="M-4 5q4 4 8 0" stroke="var(--draw-ai)" fill="none" />
    </g>
  );
}
const pictures = [
  "M30 80V40l30-23 30 23v40ZM52 80V56h16v24M104 28h38v54h-38ZM112 42h22m-22 12h16m-16 12h22",
  "M30 25h60v60H30ZM30 42h60M60 25v17M105 38h30v47h-30ZM112 50h16m-16 12h12",
  "M28 40l45-20 45 20v45H28ZM28 40h90M73 20v20M65 40v20h16V40M42 68h25m-25 8h17M130 30v50m-7-44h14m-14 10h14m-14 10h14m-14 10h14",
  "M22 35h83v42H22ZM105 49h24l15 16v12h-39ZM113 54h12l9 11h-21ZM46 77a8 8 0 1 0 1 0m73 0a8 8 0 1 0 1 0",
  "M27 25h87v60H27ZM38 72l20-23 17 15 15-14 15 22M49 39a5 5 0 1 0 1 0M127 29v52m-7-42h14m-14 10h14m-14 10h14",
  "M30 35h96v50H30ZM30 35l48 31 48-31M48 28V16h60v12M60 24h36M45 75h22",
  "M35 24h80v64H35ZM47 40h10v10H47Zm20 4h34M47 60h10v10H47Zm20 4h26M125 40q20 8 3 32m-5-10 5 10 10-4",
];
export function MovingDrawing({
  kind = "hero",
}: {
  kind?: "hero" | "connect" | number;
}) {
  const filter = `moving-rough-${useId().replaceAll(":", "")}`;
  return (
    <svg
      className={`moving-drawing moving-drawing-${typeof kind === "number" ? "part" : kind}`}
      viewBox={typeof kind === "number" ? "0 0 170 110" : "0 0 340 230"}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id={filter} x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".045"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="2.6"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
      <g
        filter={`url(#${filter})`}
        stroke="var(--draw-ink)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {typeof kind === "number" ? (
          <>
            <path
              d={pictures[kind]}
              transform="translate(3 3)"
              stroke="none"
              fill="var(--draw-wash)"
            />
            <path d={pictures[kind]} fill="none" />
            <Spark x={145} y={22} />
          </>
        ) : kind === "hero" ? (
          <>
            <path
              d="M140 90h30V76h40v14h84v72H140Z"
              transform="translate(3 3)"
              fill="var(--draw-paper)"
            />
            <path d="M140 90h30V76h40v14h84v72H140Z" fill="none" />
            <path d="M130 112h65V99h40v13h65v57H130Z" fill="var(--draw-wash)" />
            <path
              d="M120 143h190l-9 65H129Z"
              transform="translate(3 3)"
              fill="var(--draw-accent)"
            />
            <path d="M120 143h190l-9 65H129Z" fill="none" />
            <rect
              x="173"
              y="156"
              width="87"
              height="36"
              rx="4"
              fill="var(--draw-paper)"
            />
            <path d="M183 180v-12l7-6 7 6v12Zm24-12h39m-39 10h29" fill="none" />
            <Spark x={64} y={65} />
            <path
              d="M105 62q72-45 118 9m-13-3 15 5-1-16"
              fill="none"
              stroke="var(--draw-ai)"
              strokeDasharray="4 6"
            />
            <path
              d="M112 81h48v35h-48ZM120 93h31m-31 10h20"
              fill="var(--draw-paper)"
            />
          </>
        ) : (
          <>
            <Spark x={65} y={99} />
            <path
              d="M89 109C135 160 159 49 204 106m0-8h18v18h-18m18-14h10m-10 10h10"
              fill="none"
            />
            <rect
              x="244"
              y="74"
              width="64"
              height="64"
              rx="6"
              fill="var(--draw-paper)"
            />
            <image
              href="/brand/site-mark-2026-11.svg"
              x="250"
              y="80"
              width="52"
              height="52"
            />
          </>
        )}
      </g>
    </svg>
  );
}
export function MovingAccount() {
  return (
    <div className="moving-account">
      <div className="moving-ai-row">
        {["Your AI today", "A newer model", "A different app"].map(
          (label, i) => (
            <div key={label}>
              <svg
                viewBox="-32 -32 64 104"
                aria-hidden="true"
                focusable="false"
                strokeWidth="2.2"
              >
                <Spark outline={i > 0} />
                <path
                  d="M0 30q-8 20 0 38"
                  fill="none"
                  stroke="var(--draw-ai)"
                  strokeDasharray={i > 0 ? "4 5" : undefined}
                />
              </svg>
              <span>{label}</span>
            </div>
          ),
        )}
      </div>
      <div className="moving-account-tabs">
        {["Moves", "Items", "Boxes", "Evidence"].map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
      <div className="moving-account-box">
        {/* Existing approved artwork, never redrawn. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/site-mark-2026-11.svg" width="44" height="44" alt="" />
        <strong>Assist With Moving</strong>
        <small>Your account · everything you save</small>
      </div>
    </div>
  );
}

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
import { PanelIntro } from "@/components/floorplans/panel-utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { floorplanSymbolKey } from "@/lib/floorplans/sample-data";
import type { FloorplanSymbolKeyItem } from "@/lib/floorplans/types";
import { cn } from "@/lib/utils";

const confidenceSwatches = {
  high: "bg-emerald-900/90",
  medium: "bg-sky-950/90",
  low: "bg-stone-800/90",
  conflict: "bg-destructive/40",
};

export function FloorplanKeyPanel() {
  return (
    <div className="space-y-3" data-testid="floorplan-key-panel">
      <PanelIntro
        title="Key"
        description="Colors show confidence. Drafting marks show walls, windows, openings, dimensions, and fixed fixtures."
      />
      <div className="grid gap-2">
        {floorplanSymbolKey.map((item) => (
          <Card key={item.id} size="sm">
            <CardHeader>
              <div>
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <SymbolPreview item={item} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SymbolPreview({ item }: { item: FloorplanSymbolKeyItem }) {
  if (item.kind === "confidence" && item.confidence) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span
          className={cn(
            "size-8 rounded-md border border-border",
            confidenceSwatches[item.confidence],
          )}
        />
        <span className="text-muted-foreground">Room fill and ledger badge use the same confidence level.</span>
      </div>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="h-16 w-full rounded-md border border-border bg-[rgb(9_17_15)] text-foreground"
      viewBox="0 0 34 18"
    >
      {item.kind === "wall" ? (
        <g fill="none" stroke="rgb(231 225 213)" strokeLinecap="round" strokeWidth="0.75">
          <path d="M3 4H29V14H3Z" />
          <path d="M14 4H19" stroke="rgb(9 17 15)" strokeWidth="1.8" />
        </g>
      ) : null}
      {item.kind === "opening" ? <DoorSwing hinge="left" orientation="down" width={7} x={11} y={5} /> : null}
      {item.kind === "window" ? <WindowMark x1={7} x2={27} y1={9} y2={9} /> : null}
      {item.kind === "dimension" ? <DimensionLine label="12 ft" x1={6} x2={28} y1={10} y2={10} /> : null}
      {item.kind === "fixture" ? (
        <g transform="translate(1 1) scale(0.88)">
          <SinkSymbol x={0.5} y={2} />
          <ToiletSymbol x={5} y={1.5} />
          <TubSymbol x={9} y={2} />
          <WasherDryerSymbol label="W" x={15} y={2} />
          <StoveSymbol x={18.5} y={2} />
          <FireplaceSymbol height={1.1} width={5.5} x={23} y={2} />
          <WaterHeaterSymbol radius={0.85} x={30.5} y={3.1} />
        </g>
      ) : null}
    </svg>
  );
}

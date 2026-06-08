import { Boxes } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/12 text-primary">
        <Boxes className="size-5" aria-hidden="true" />
      </div>
      <span className="text-base font-semibold tracking-tight">
        MovingManifest
      </span>
    </div>
  );
}

import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  compactOnMobile = false,
}: {
  className?: string;
  compactOnMobile?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex size-9 items-center justify-center overflow-hidden rounded-md border border-primary/20 bg-card">
        <Image src="/icon.svg" width={36} height={36} alt="" aria-hidden="true" />
      </div>
      <span
        className={cn(
          "text-base font-semibold tracking-tight",
          compactOnMobile && "hidden sm:inline",
        )}
      >
        Assist With Moving
      </span>
    </div>
  );
}

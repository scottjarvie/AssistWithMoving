import { cn } from "@/lib/utils";

// The site's app-icon artwork (Nov 2026), served as one local file so every
// header that shows the wordmark uses the same mark.
export const BRAND_MARK_SRC = "/brand/site-mark-2026-11.svg";

export function BrandMark({
  className,
  compactOnMobile = false,
}: {
  className?: string;
  compactOnMobile?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND_MARK_SRC}
        alt=""
        width={36}
        height={36}
        className="size-9 shrink-0 rounded-lg border border-border"
      />
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

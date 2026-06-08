import { SlidersHorizontal } from "lucide-react";

export function FeatureUnavailable({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-border p-4 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </div>
      <p className="mt-2 leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

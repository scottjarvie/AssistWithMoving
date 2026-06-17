import { CheckCircle2, FileImage, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  formatFileSize,
  type PendingBlueprint,
} from "@/lib/floorplans/upload-helpers";

export function PendingBlueprintList({
  onContextChange,
  onRemove,
  onToggleUseForAi,
  onUseAll,
  onUseNone,
  pending,
  saving,
}: {
  onContextChange: (id: string, contextNote: string) => void;
  onRemove: (id: string) => void;
  onToggleUseForAi: (id: string) => void;
  onUseAll: () => void;
  onUseNone: () => void;
  pending: PendingBlueprint[];
  saving: boolean;
}) {
  const selectedForAiCount = pending.filter((entry) => entry.useForAi).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">
          Pending images
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {selectedForAiCount} of {pending.length} marked for AI review
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button
            disabled={saving}
            onClick={onUseAll}
            size="sm"
            type="button"
            variant="outline"
          >
            Use all
          </Button>
          <Button
            disabled={saving}
            onClick={onUseNone}
            size="sm"
            type="button"
            variant="outline"
          >
            Use none
          </Button>
        </div>
      </div>
      <ul aria-label="Pending floorplan images" className="space-y-2">
        {pending.map((entry) => (
          <li
            className="grid gap-2 rounded-md border border-border bg-background/65 p-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto]"
            key={entry.id}
          >
            <div className="min-w-0 space-y-2">
              <span className="flex min-w-0 items-center gap-2">
                <FileImage
                  className="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {entry.file.name}
                  </span>
                  <span className="text-muted-foreground">
                    {formatFileSize(entry.file.size)}
                    {entry.width && entry.height
                      ? `, ${entry.width}x${entry.height}`
                      : ""}
                  </span>
                </span>
              </span>
              <Textarea
                aria-label={`Context for ${entry.file.name}`}
                className="min-h-16 text-xs"
                disabled={saving}
                onChange={(event) =>
                  onContextChange(entry.id, event.target.value)
                }
                placeholder="What should the AI know? Example: This is the kitchen; use it for cabinet and hallway clues."
                value={entry.contextNote}
              />
            </div>
            <span className="flex shrink-0 items-start justify-between gap-1.5 sm:justify-end">
              <Button
                aria-pressed={entry.useForAi}
                className="gap-1.5"
                disabled={saving}
                onClick={() => onToggleUseForAi(entry.id)}
                size="sm"
                type="button"
                variant={entry.useForAi ? "default" : "outline"}
              >
                {entry.useForAi ? (
                  <CheckCircle2 aria-hidden="true" />
                ) : (
                  <FileImage aria-hidden="true" />
                )}
                Use for AI
              </Button>
              <Button
                aria-label={`Remove ${entry.file.name}`}
                disabled={saving}
                onClick={() => onRemove(entry.id)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

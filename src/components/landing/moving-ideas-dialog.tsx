"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { movingParts } from "./moving-content";
export default function MovingIdeasDialog({
  open,
  part,
  onOpenChange,
  returnFocus,
}: {
  open: boolean;
  part?: number;
  onOpenChange: (open: boolean) => void;
  returnFocus: () => void;
}) {
  const order = movingParts
    .map((p, i) => ({ ...p, index: i }))
    .sort((a, b) => Number(b.index === part) - Number(a.index === part));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {part === undefined
              ? `All ${movingParts.length} moving ideas`
              : `${movingParts[part].name} · 1 of ${movingParts.length} ideas`}
          </DialogTitle>
          <DialogDescription>
            Ways to use the moving record, from the existing workflow and
            features.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-4 pb-4">
          {order.map((p) => (
            <details
              key={p.name}
              open={part === undefined || part === p.index}
              className="border-b border-border py-3"
            >
              <summary className="min-h-11 cursor-pointer py-3 font-medium">
                {p.name}
              </summary>
              <p className="py-3 leading-7">{p.idea}</p>
            </details>
          ))}
        </div>
        <DialogClose className="m-4 min-h-11 rounded-md border border-border px-4">
          Close ideas
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

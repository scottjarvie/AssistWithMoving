import { toast } from "sonner";

import { toastError, toastSaved } from "@/lib/toast";

export function toastWithUndo({
  message,
  onUndo,
}: {
  message: string;
  onUndo: () => Promise<void> | void;
}) {
  let done = false;

  toast(message, {
    duration: 6000,
    action: {
      label: "Undo",
      onClick: async () => {
        if (done) return;
        done = true;
        try {
          await onUndo();
          toastSaved("Restored.");
        } catch {
          toastError("Could not undo that action.");
        }
      },
    },
  });
}


import { toast } from "sonner";

// Centralized save feedback. The app's #1 UX complaint was that saves were
// silent (no toast library existed), so users re-clicked Save thinking nothing
// happened. Route every successful write through toastSaved and every failed
// write through toastError so the signal is consistent everywhere.
//
// Use these for COMMITTED writes (a Save button, a destructive action, a
// committed field). Live inline edits whose adjacent UI already re-renders to
// the new value (a status badge, a price field) are self-confirming and do not
// need a toast — adding one there is noise.

export function toastSaved(message = "Saved") {
  toast.success(message);
}

export function toastError(message = "Could not save — please try again") {
  toast.error(message);
}

// Re-export for ad-hoc toasts (loading/info/promise) without a second import.
export { toast };

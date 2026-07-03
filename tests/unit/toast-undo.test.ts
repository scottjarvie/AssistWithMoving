import { beforeEach, describe, expect, it, vi } from "vitest";

const sonnerMock = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: sonnerMock.toast,
}));

import { toastWithUndo } from "@/lib/toast-undo";

describe("toastWithUndo", () => {
  beforeEach(() => {
    sonnerMock.toast.mockClear();
    sonnerMock.toast.success.mockClear();
    sonnerMock.toast.error.mockClear();
  });

  it("passes an Undo action that invokes the inverse callback once", async () => {
    const onUndo = vi.fn().mockResolvedValue(undefined);

    toastWithUndo({ message: "Capture discarded", onUndo });

    expect(sonnerMock.toast).toHaveBeenCalledWith(
      "Capture discarded",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
        duration: 6000,
      }),
    );

    const action = sonnerMock.toast.mock.calls[0]?.[1]?.action;
    await action.onClick();
    await action.onClick();

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(sonnerMock.toast.success).toHaveBeenCalledWith("Restored.");
  });

  it("uses the standard error toast when undo fails", async () => {
    const onUndo = vi.fn().mockRejectedValue(new Error("offline"));

    toastWithUndo({ message: "Marked resolved", onUndo });

    const action = sonnerMock.toast.mock.calls[0]?.[1]?.action;
    await action.onClick();

    expect(sonnerMock.toast.error).toHaveBeenCalledWith(
      "Could not undo that action.",
    );
  });

  it("keeps Undo retryable after a failed inverse, and latches after success", async () => {
    const onUndo = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);

    toastWithUndo({ message: "Capture discarded", onUndo });

    const action = sonnerMock.toast.mock.calls[0]?.[1]?.action;
    await action.onClick();
    expect(sonnerMock.toast.error).toHaveBeenCalledTimes(1);

    // The failure must not deaden the button — the retry goes through.
    await action.onClick();
    expect(onUndo).toHaveBeenCalledTimes(2);
    expect(sonnerMock.toast.success).toHaveBeenCalledWith("Restored.");

    // After a successful undo the guard latches: no third invocation.
    await action.onClick();
    expect(onUndo).toHaveBeenCalledTimes(2);
  });
});


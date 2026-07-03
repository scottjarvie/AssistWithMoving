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
});


import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import RootError from "@/app/error";

describe("RootError", () => {
  it("offers reachable recovery without exposing raw errors or internal trackers", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(
      <RootError
        error={
          Object.assign(new Error("Sensitive provider detail"), {
            digest: "move-help-123",
          }) as Error & { digest?: string }
        }
        reset={reset}
      />,
    );

    expect(screen.getByText("move-help-123")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to moves" })).toHaveAttribute(
      "href",
      "/app/moves",
    );
    expect(screen.getByRole("link", { name: "Get help" })).toHaveAttribute(
      "href",
      "/faq",
    );
    expect(document.body.textContent).not.toMatch(/Linear|Sensitive provider detail/);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

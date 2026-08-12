import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QueueRouteError } from "@/components/queue-route-error";

describe("QueueRouteError", () => {
  it("keeps denied Queue access isolated without exposing raw errors", () => {
    render(
      <QueueRouteError
        error={new Error("Queue item not available to this actor: internal detail")}
        reset={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "This Queue is not available to you" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/explicitly shared with them/)).toBeInTheDocument();
    expect(screen.queryByText(/internal detail/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry Queue" })).not.toBeInTheDocument();
  });

  it("offers a bounded retry for ordinary load failures", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<QueueRouteError error={new Error("network exploded")} reset={reset} />);

    expect(
      screen.getByRole("heading", { name: "The Queue could not be loaded" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/network exploded/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry Queue" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});

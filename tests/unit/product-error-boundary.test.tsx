import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ProductError from "@/app/(product)/error";

describe("ProductError", () => {
  it("renders recovery actions without leaking raw error details", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(
      <ProductError
        error={
          Object.assign(new Error("Sensitive database stack exploded"), {
            digest: "digest-123",
          }) as Error & { digest?: string }
        }
        reset={reset}
      />,
    );

    expect(
      screen.getByText("Something went wrong loading this workspace"),
    ).toBeInTheDocument();
    expect(screen.getByText("digest-123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to moves" })).toHaveAttribute(
      "href",
      "/app/moves",
    );
    expect(
      screen.queryByText("Sensitive database stack exploded"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});

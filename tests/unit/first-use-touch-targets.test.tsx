import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("first-use touch targets", () => {
  it("provides reusable 44px text and icon button foundations", () => {
    render(
      <>
        <Button size="touch">Continue</Button>
        <Button size="icon-touch" aria-label="Open menu">+</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveClass("size-11");
  });
});

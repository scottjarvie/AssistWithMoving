import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { FirstMoveJourney } from "@/components/first-move-journey";

describe("FirstMoveJourney", () => {
  it("connects route context, Queue handoff, and saved work in one move path", () => {
    render(
      <FirstMoveJourney
        moveId={"move_first" as Id<"moves">}
        hasRoute
      />,
    );

    expect(screen.getByText("Route noted")).toBeVisible();
    expect(screen.getByRole("link", { name: "Review route" })).toHaveAttribute(
      "href",
      "/app/moves/move_first/configure#start",
    );
    expect(
      screen.getByRole("link", { name: "Open this move’s Queue" }),
    ).toHaveAttribute("href", "/app/moves/move_first/queue");
    expect(
      screen.getByRole("link", { name: "See saved move work" }),
    ).toHaveAttribute("href", "/app/moves/move_first/overview#planning-results");
    expect(screen.getByText(/does not start an AI or expand its access/)).toBeVisible();
  });
});

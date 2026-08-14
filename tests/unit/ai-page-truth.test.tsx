import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AiAssistantPage from "@/app/(marketing)/ai/page";

describe("AI guidance truth", () => {
  it("separates hosted OAuth planning from scoped Queue actions", () => {
    render(<AiAssistantPage />);

    expect(
      screen.getByRole("heading", {
        name: "Give your chosen AI the right move context.",
      }),
    ).toBeVisible();
    expect(screen.getByText("Hosted MCP OAuth")).toBeVisible();
    expect(screen.getByText("Scoped helper key")).toBeVisible();
    expect(screen.getByText("Queue through hosted OAuth")).toBeVisible();
    expect(
      screen.getByText(/It cannot claim or complete Queue work yet/),
    ).toBeVisible();
    expect(
      screen.getByText(/A Queue note records intent. It does not start an AI/),
    ).toBeInTheDocument();
  });
});

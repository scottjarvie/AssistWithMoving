import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AiAssistantPage from "@/app/(marketing)/ai/page";
import AiStartPage from "@/app/(marketing)/ai/start/page";

describe("AI guidance truth", () => {
  it("leads with the grant rather than the sign-in", () => {
    render(<AiAssistantPage />);

    expect(
      screen.getByRole("heading", {
        name: "Give your chosen AI the right move context.",
      }),
    ).toBeVisible();
    expect(screen.getByText("A grant, not a sign-in")).toBeVisible();
    expect(
      screen.getByText(/Signing in proves who you are\. A separate approval/),
    ).toBeVisible();
    expect(
      screen.getByText(/revoking it refuses the very next call/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /A Queue note records intent\. It does not start an AI, and it never widens/,
      ),
    ).toBeInTheDocument();
  });

  it("labels the whole connection Partial while the grant screen is Current", () => {
    render(<AiAssistantPage />);

    expect(screen.getByText("Bring your AI")).toBeVisible();
    expect(screen.getByText("Partial")).toBeVisible();
    expect(screen.getByText("The grant screen")).toBeVisible();
    expect(
      screen.getByText(/is where you approve a grant, choose all moves/),
    ).toBeVisible();
    expect(
      screen.getByText(/No AI product has yet completed a full connect/),
    ).toBeVisible();
    // The requirement, never a product name.
    expect(
      screen.getAllByText(
        /remote Streamable HTTP MCP with compatible OAuth/,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("shows the always-available tool and the never-permitted ceiling", () => {
    render(<AiAssistantPage />);

    expect(screen.getAllByText(/describe_connection/).length).toBeGreaterThan(0);
    expect(
      screen.getByText("What this connection can never do"),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Permanently delete anything, or delete your account/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Archive a whole move\./),
    ).toBeInTheDocument();
  });

  it("names the four doors without implying one shared catalog", () => {
    render(<AiAssistantPage />);

    expect(
      screen.getAllByText("https://movingmanifest.com/mcp").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("https://movingmanifest.com/mcp/connect"),
    ).toBeVisible();
    expect(
      screen.getByText("https://movingmanifest.com/api/mcp"),
    ).toBeVisible();
    expect(screen.getByText("assistwithmoving-mcp")).toBeVisible();
    expect(
      screen.getByText(/A different and larger catalog/),
    ).toBeInTheDocument();
  });

  it("offers the manual Queue handoff as a real fallback", () => {
    render(<AiAssistantPage />);

    expect(
      screen.getByText(
        "No connection? Hand the work over by copy and paste",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(/paste the result back into the\s+same Queue item/i),
    ).toBeInTheDocument();
  });

  it("keeps the setup page honest about permission and the endpoint", () => {
    render(<AiStartPage />);

    expect(
      screen.getByRole("heading", {
        name: "Your chosen AI can help after you sign in and approve a grant.",
      }),
    ).toBeVisible();
    expect(
      screen.getByText("https://movingmanifest.com/mcp"),
    ).toBeVisible();
    expect(
      screen.getByText(/none has completed a\s+full run yet, so the connection is Partial/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You do not need a connection at all to hand work over/),
    ).toBeInTheDocument();
  });
});

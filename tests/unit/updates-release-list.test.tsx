import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { UpdatesReleaseList } from "@/components/updates-release-list";
import { publicReleaseEntries } from "@/lib/release-notes";

describe("UpdatesReleaseList", () => {
  it("renders semantic, compact release sections with accessible controls", () => {
    const { container } = render(
      <UpdatesReleaseList entries={publicReleaseEntries} />,
    );
    const latestArticle = container.querySelector("#release-0-4-0-2026-08-12");

    expect(latestArticle).not.toBeNull();
    expect(screen.getByRole("button", { name: "Quick read" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Learn the changes" }),
    ).toHaveAttribute("aria-pressed", "false");

    const latest = within(latestArticle as HTMLElement);
    expect(latest.getByRole("heading", { name: /Created 2/ })).toBeVisible();
    expect(latest.getByRole("heading", { name: /Fixed 0/ })).toBeVisible();
    expect(latest.getByRole("heading", { name: /Upgraded 0/ })).toBeVisible();
    expect(
      latest.getByText(
        "A chosen AI can now do bounded move-planning work and save a complete, readable result back into the move workspace.",
      ),
    ).toBeVisible();
    expect(
      latest.getByText(
        "The Queue now shows Needs you, Working, Waiting for your AI, and Done as one clear, attributable handoff flow.",
      ),
    ).toBeVisible();
  });

  it("expands categories independently and preserves the reading mode", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <UpdatesReleaseList entries={publicReleaseEntries} />,
    );
    const latest = within(
      container.querySelector("#release-0-3-0-2026-07-27") as HTMLElement,
    );
    const createdExpansion = latest.getByRole("button", {
      name: "Show all 8 Created changes in v0.3.0",
    });
    const fixedExpansion = latest.getByRole("button", {
      name: "Show all 5 Fixed changes in v0.3.0",
    });

    await user.click(createdExpansion);

    expect(createdExpansion).toHaveAttribute("aria-expanded", "true");
    expect(createdExpansion).toHaveTextContent("Show only top 3");
    expect(fixedExpansion).toHaveAttribute("aria-expanded", "false");
    expect(
      latest
        .getByText(
          "Public guidance now explains the real product and the direct remote-assistant connection path without fabricated examples.",
        )
        .closest("li"),
    ).not.toHaveAttribute("hidden");

    await user.click(screen.getByRole("button", { name: "Learn the changes" }));

    expect(
      screen.getByRole("button", { name: "Learn the changes" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(createdExpansion).toHaveAttribute("aria-expanded", "true");
    expect(fixedExpansion).toHaveAttribute("aria-expanded", "false");
    expect(
      latest.getByText(
        /The hosted OAuth connection now provides purpose-built tools/,
      ),
    ).toBeVisible();
  });

  it("keeps educational copy in the markup during Quick read", () => {
    const { container } = render(
      <UpdatesReleaseList entries={publicReleaseEntries} />,
    );
    const latest = within(
      container.querySelector("#release-0-3-0-2026-07-27") as HTMLElement,
    );
    const educationalCopy = latest.getByText(
      /The hosted OAuth connection now provides purpose-built tools/,
    );

    expect(educationalCopy).toBeInTheDocument();
    expect(educationalCopy.parentElement).toHaveAttribute("hidden");
  });
});

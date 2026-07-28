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
    const latestArticle = container.querySelector("#release-0-3-0-2026-07-27");

    expect(latestArticle).not.toBeNull();
    expect(screen.getByRole("button", { name: "Quick read" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Learn the changes" }),
    ).toHaveAttribute("aria-pressed", "false");

    const latest = within(latestArticle as HTMLElement);
    expect(latest.getByRole("heading", { name: /Created 8/ })).toBeVisible();
    expect(latest.getByRole("heading", { name: /Fixed 5/ })).toBeVisible();
    expect(latest.getByRole("heading", { name: /Upgraded 4/ })).toBeVisible();
    expect(
      latest.getByRole("button", {
        name: "Show all 8 Created changes in v0.3.0",
      }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      latest.getByText(
        "AI assistants can connect directly and complete real capture, inventory, box, image, transport, and queue workflows.",
      ),
    ).toBeVisible();
    expect(
      latest
        .getByText(
          "Public guidance now explains the real product and the direct remote-assistant connection path without fabricated examples.",
        )
        .closest("li"),
    ).toHaveAttribute("hidden");
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

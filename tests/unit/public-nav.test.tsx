import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PublicMobileNav } from "@/components/public-nav";

describe("PublicMobileNav", () => {
  it("labels the mobile trigger and exposes expanded state", async () => {
    const user = userEvent.setup();

    render(
      <PublicMobileNav
        primary={[{ href: "/features", label: "Features" }]}
        secondary={[{ href: "/faq", label: "FAQ" }]}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Open navigation menu",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});


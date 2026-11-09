import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SuggestionPanel } from "@/components/queue-suggestions";
import type { ComponentProps } from "react";
const item = {
  queueItemId: "synthetic",
  directive: "Compare mover quotes",
  addedBy: "ai_suggestion",
  addedByLabel: "Synthetic AI",
  suggestionStatus: "open",
  suggestionReason: "The coverage limits differ",
  suggestionOptions: ["Compare coverage", "Compare costs"],
  suggestionEvidence: "Two synthetic quotes",
  fromRecord: { type: "item", id: "one", label: "Piano" },
  fromRecordHref: "/app/moves/one/inventory?record=one",
  dismissReason: null,
} as unknown as ComponentProps<typeof SuggestionPanel>["items"][number];
describe("Queue suggestion decisions", () => {
  it("keeps ideas hidden until selected and exposes an exact count", async () => {
    const onActive = vi.fn();
    render(
      <SuggestionPanel
        items={[item]}
        count={106}
        active={false}
        archived={false}
        onActive={onActive}
        onArchived={vi.fn()}
        onReview={vi.fn()}
      />,
    );
    expect(screen.queryByText(item.directive)).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "AI suggestions 106" }),
    );
    expect(onActive).toHaveBeenCalledWith(true);
  });
  it("offers lettered options, Edit first and the source link before accepting", async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    render(
      <SuggestionPanel
        items={[item]}
        count={1}
        active
        archived={false}
        onActive={vi.fn()}
        onArchived={vi.fn()}
        onReview={onReview}
      />,
    );
    expect(
      screen.getByText("AI suggestion · Synthetic AI"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Piano" })).toHaveAttribute(
      "href",
      item.fromRecordHref,
    );
    await userEvent.click(screen.getByRole("button", { name: "Choose b" }));
    expect(screen.getByLabelText("Edit suggestion wording")).toHaveValue(
      "Compare costs",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Accept edited work" }),
    );
    expect(onReview).toHaveBeenCalledWith(
      item,
      "accept",
      "Compare costs",
      undefined,
    );
  });
  it("preserves dismissal wording and offers restore in the archive", async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <SuggestionPanel
        items={[item]}
        count={1}
        active
        archived={false}
        onActive={vi.fn()}
        onArchived={vi.fn()}
        onReview={onReview}
      />,
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Dismiss reason (optional)" }),
      "  Already done.  ",
    );
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onReview).toHaveBeenCalledWith(
      item,
      "dismiss",
      undefined,
      "  Already done.  ",
    );
    rerender(
      <SuggestionPanel
        items={[
          {
            ...item,
            suggestionStatus: "dismissed",
            dismissReason: "  Already done.  ",
          },
        ]}
        count={0}
        active
        archived
        onActive={vi.fn()}
        onArchived={vi.fn()}
        onReview={onReview}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onReview).toHaveBeenCalledWith(
      expect.objectContaining({ suggestionStatus: "dismissed" }),
      "restore",
      undefined,
      undefined,
    );
  });
});

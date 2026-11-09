import { expect, it, vi } from "vitest";
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));
import Suggestions from "../../src/app/(product)/suggestions/page";
import QueueSuggestions from "../../src/app/(product)/app/queue/suggestions/page";
it("redirects both suggestion aliases to the Queue with its filter on", () => {
  for (const Page of [Suggestions, QueueSuggestions])
    expect(() => Page()).toThrow("redirect:/app/queue?suggestions=1");
  expect(redirect).toHaveBeenCalledTimes(2);
});

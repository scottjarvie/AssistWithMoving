import { renderToString } from "react-dom/server";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "@/lib/use-media-query";

function MediaQueryServerProbe() {
  const matches = useMediaQuery("(min-width: 768px)");
  return <span data-media-state={matches === undefined ? "pending" : "ready"} />;
}

function SharedMediaQueryProbe() {
  const matches = useMediaQuery("(min-width: 999px)");
  return <span data-media-state={matches ? "matching" : "not-matching"} />;
}

describe("useMediaQuery", () => {
  it("uses a pending server snapshot so hydration starts from stable markup", () => {
    expect(renderToString(<MediaQueryServerProbe />)).toContain(
      'data-media-state="pending"',
    );
  });

  it("shares one MediaQueryList construction across components with the same query", () => {
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    render(
      <>
        <SharedMediaQueryProbe />
        <SharedMediaQueryProbe />
      </>,
    );

    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(matchMedia).toHaveBeenCalledWith("(min-width: 999px)");
  });
});

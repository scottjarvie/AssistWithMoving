import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useMediaQuery } from "@/lib/use-media-query";

function MediaQueryServerProbe() {
  const matches = useMediaQuery("(min-width: 768px)");
  return <span data-media-state={matches === undefined ? "pending" : "ready"} />;
}

describe("useMediaQuery", () => {
  it("uses a pending server snapshot so hydration starts from stable markup", () => {
    expect(renderToString(<MediaQueryServerProbe />)).toContain(
      'data-media-state="pending"',
    );
  });
});

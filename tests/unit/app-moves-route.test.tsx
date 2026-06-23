import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import MovesIndexRedirect from "../../src/app/(product)/app/moves/page";
import AppIndexRedirect from "../../src/app/(product)/app/page";

describe("workspace index routes", () => {
  it("redirects the app index to the workspace dashboard", () => {
    AppIndexRedirect();

    expect(redirectMock).toHaveBeenCalledWith("/app/dashboard");
  });

  it("redirects the moves index to the workspace dashboard", () => {
    MovesIndexRedirect();

    expect(redirectMock).toHaveBeenCalledWith("/app/dashboard");
  });
});

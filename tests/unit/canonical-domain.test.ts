import { describe, expect, it } from "vitest";

import {
  authenticatedCompatibilityHost,
  getCompatibilityRedirectUrl,
} from "@/lib/canonical-domain";

describe("Assist With Moving entry domain", () => {
  it.each(["assistwithmoving.com", "www.assistwithmoving.com"])(
    "preserves the path and query while redirecting %s to the authenticated host",
    (host) => {
      const redirect = getCompatibilityRedirectUrl(
        `https://${host}/sign-in?redirect_url=%2Fapp%2Fqueue`,
      );

      expect(redirect?.toString()).toBe(
        `https://${authenticatedCompatibilityHost}/sign-in?redirect_url=%2Fapp%2Fqueue`,
      );
    },
  );

  it("does not redirect the authenticated compatibility host", () => {
    expect(
      getCompatibilityRedirectUrl("https://movingmanifest.com/sign-in"),
    ).toBeNull();
  });

  it("does not affect local or preview hosts", () => {
    expect(getCompatibilityRedirectUrl("http://localhost:3827/sign-in")).toBeNull();
    expect(
      getCompatibilityRedirectUrl(
        "https://movingmanifest-git-example.vercel.app/sign-in",
      ),
    ).toBeNull();
  });

  it("honors the exact incoming Host header behind a platform proxy", () => {
    expect(
      getCompatibilityRedirectUrl(
        "http://127.0.0.1:3827/sign-in?redirect_url=%2Fapp%2Fqueue",
        "assistwithmoving.com",
      )?.toString(),
    ).toBe(
      "https://movingmanifest.com/sign-in?redirect_url=%2Fapp%2Fqueue",
    );
  });
});

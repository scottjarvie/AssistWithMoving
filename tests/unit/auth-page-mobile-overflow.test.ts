import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const authPages = ["sign-in", "sign-up"];

describe("auth page mobile sizing", () => {
  it.each(authPages)("allows the hydrated Clerk card on %s to shrink inside the viewport", (page) => {
    const source = readFileSync(
      join(process.cwd(), `src/app/(auth)/${page}/[[...${page}]]/page.tsx`),
      "utf8",
    );

    expect(source).toContain(
      'className="w-full min-w-0 max-w-sm rounded-lg border border-border bg-card p-6"',
    );
    expect(source).toContain('rootBox: "w-full"');
    expect(source).toContain('cardBox: "w-full max-w-full"');
    expect(source).toContain('card: "w-full max-w-full"');
  });
});

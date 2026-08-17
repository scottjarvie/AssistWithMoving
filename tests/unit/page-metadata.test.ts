import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const metadataPages = [
  {
    path: "src/app/(auth)/sign-in/[[...sign-in]]/page.tsx",
    title: "Sign in",
    description: true,
  },
  {
    path: "src/app/(auth)/sign-up/[[...sign-up]]/page.tsx",
    title: "Create account",
    description: true,
  },
  { path: "src/app/(product)/app/moves/page.tsx", title: "Moves" },
  { path: "src/app/(product)/app/items/page.tsx", title: "Items" },
  {
    path: "src/app/(product)/app/movable-units/page.tsx",
    title: "Movable units",
  },
  {
    path: "src/app/(product)/app/spaces-transport/page.tsx",
    title: "Spaces & transport",
  },
  { path: "src/app/(product)/app/queue/page.tsx", title: "Queue" },
  { path: "src/app/(product)/settings/page.tsx", title: "Settings" },
  {
    // `/settings/ai` is canonical; `/settings/ai-connections` only redirects.
    path: "src/app/(product)/settings/ai/page.tsx",
    title: "AI connections",
  },
  {
    path: "src/app/(product)/app/claim-packet/page.tsx",
    title: "Claim packet",
  },
  {
    path: "src/app/(product)/app/mover-packet/page.tsx",
    title: "Mover packet",
  },
  {
    path: "src/app/(product)/app/employer-packet/page.tsx",
    title: "Employer packet",
  },
  {
    path: "src/app/(product)/app/pcs-packet/page.tsx",
    title: "PCS packet",
  },
  {
    path: "src/app/(product)/app/load-plan-packet/page.tsx",
    title: "Load plan packet",
  },
  {
    path: "src/app/(product)/app/sub-manifest/page.tsx",
    title: "Sub-manifest",
  },
  {
    path: "src/app/(product)/app/box-labels/page.tsx",
    title: "Box labels",
  },
  {
    path: "src/app/(product)/app/boxes/[boxId]/page.tsx",
    title: "Box details",
  },
  { path: "src/app/(product)/admin/page.tsx", title: "Admin" },
];

describe("page metadata", () => {
  it.each(metadataPages)("$path exports the expected static title", (page) => {
    const source = readFileSync(join(process.cwd(), page.path), "utf8");

    expect(source).toContain("export const metadata");
    expect(source).toContain(`title: "${page.title}"`);
    expect(source).toMatch(/import type \{ Metadata \} from "next"/);
    if (page.description) {
      expect(source).toMatch(/description: "[^"]+"/);
    } else {
      expect(source).not.toMatch(/description:/);
    }
    // A client component exporting metadata is a Next build error — the
    // combination this suite exists to prevent.
    expect(source).not.toMatch(/^\s*["']use client["']/m);
  });
});

import packageJson from "../../package.json";

export type ReleaseEntry = {
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  created: string[];
  fixed: string[];
  upgraded: string[];
};

export const appVersion = packageJson.version;

export const releaseEntries: ReleaseEntry[] = [
  {
    version: "0.1.0",
    releasedAt: "2026-06-19T13:05:05.000Z",
    title: "Initial release-log baseline",
    summary:
      "MovingManifest now has a standard What's New page for tracking product-visible changes without exposing private move records, helper keys, internal proof, or account data.",
    created: [
      "Added the /updates release log as the canonical place to read what changed in MovingManifest.",
      "Established a user-safe baseline for the current move workspace, AI assistant setup, API, MCP, floor-plan, inventory, photo evidence, load-planning, and packet surfaces.",
      "Linked release notes from the public footer so the page is findable without crowding the main navigation.",
    ],
    fixed: [
      "Replaced the previous missing /updates route with a working What's New page.",
      "Kept release-note copy at the product-boundary level so private moves, credentials, and internal agent handoff details stay out of public notes.",
    ],
    upgraded: [
      "Uses the app package version as the visible release version source for future release-loop passes.",
      "Adds a small typed release-note data contract with Created, Fixed, and Upgraded sections for future entries.",
      "Includes /updates in the sitemap so the standard release log is discoverable.",
    ],
  },
];

export const latestRelease = releaseEntries[0];

export function formatReleaseTimestamp(releasedAt: string) {
  const date = new Date(releasedAt);
  const dateText = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(date);
  const timeText = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);

  return `${dateText}, ${timeText}`;
}

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
    version: "0.2.0",
    releasedAt: "2026-06-19T21:02:00.000Z",
    title: "MCP OAuth discovery preservation",
    summary:
      "MovingManifest's production MCP connection contract is now preserved and proven so AI helpers can discover the protected resource metadata while the actual MCP endpoint still requires authorization.",
    created: [
      "Added production proof coverage for the public OAuth protected-resource discovery document at /.well-known/oauth-protected-resource/api/mcp.",
      "Captured the expected protected MCP behavior so unauthenticated requests to /api/mcp continue to receive an authorization challenge instead of exposing move data.",
    ],
    fixed: [
      "Prevented the MCP OAuth discovery contract from regressing during deployment cleanup and release verification.",
      "Kept public discovery metadata available without loosening access to private move, inventory, box, photo, API-key, or household data.",
    ],
    upgraded: [
      "Bumped the visible application version to v0.2.0 for the production MCP/OAuth preservation release.",
      "Improved the release trail for agent-facing integrations by tying the public discovery URL, protected MCP endpoint, and production proof into one user-visible update.",
    ],
  },
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

export const product = {
  name: "MovingManifest",
  domain: "movingmanifest.com",
  localUrl: "http://localhost:3827",
  description:
    "Inventory, box manifests, photo evidence, load plans, and scoped documentation packets for moves.",
} as const;

export const buildPhases = [
  "Foundation",
  "Auth and tenancy",
  "Move setup",
  "Inventory and boxes",
  "Photos and evidence",
  "Load planner",
  "AI assistance",
  "Documentation packets",
  "API and MCP",
  "Operations",
  "Launch hardening",
] as const;

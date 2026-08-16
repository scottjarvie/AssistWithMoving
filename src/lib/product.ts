export const product = {
  name: "Assist With Moving",
  technicalName: "AssistWithMoving",
  domain: "movingmanifest.com",
  entryDomain: "assistwithmoving.com",
  localUrl: "http://localhost:3827",
  description:
    "A durable move-planning workspace shared by you and your chosen AI.",
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

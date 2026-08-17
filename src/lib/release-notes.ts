import packageJson from "../../package.json";

import type {
  PublicReleaseEntry,
  ReleaseEntry,
} from "@/lib/release-note-contract";

export {
  formatReleaseTimestamp,
  getReleaseItems,
  impactTiers,
  releaseCategories,
} from "@/lib/release-note-contract";
export type {
  ImpactTier,
  PublicReleaseEntry,
  PublicReleaseItem,
  ReleaseCategory,
  ReleaseEntry,
  ReleaseItem,
} from "@/lib/release-note-contract";

const connectedAgentSources = [
  "pr-31",
  "pr-32",
  "pr-35",
  "pr-42",
  "pr-44",
  "pr-45",
  "pr-46",
  "pr-52",
  "pr-53",
  "pr-54",
  "pr-59",
  "pr-61",
  "pr-84",
  "pr-99",
  "pr-100",
  "commit-db51e35c2107",
];

const inventoryControlSources = [
  "pr-28",
  "pr-36",
  "pr-37",
  "pr-40",
  "pr-41",
  "pr-75",
  "pr-79",
  "pr-81",
  "pr-82",
  "pr-83",
  "pr-87",
  "pr-88",
  "pr-89",
  "pr-91",
  "pr-93",
  "pr-105",
  "pr-107",
  "pr-108",
  "pr-112",
  "pr-116",
  "pr-138",
];

export const appVersion = packageJson.version;

export const releaseEntries: ReleaseEntry[] = [
  {
    version: "0.7.0",
    releasedAt: "2026-08-17T15:31:49.223Z",
    timezone: "America/Phoenix",
    title: "Hand your chosen AI exactly what you choose, and take it back",
    summary:
      "You can now connect one AI to one private move with narrow authority you approve yourself, watch what it does, and end the connection so the very next thing it tries is refused.",
    items: [
      {
        id: "chosen-ai-scoped-connection",
        category: "created",
        impactTier: "major",
        impactRank: 1,
        short:
          "Approve exactly which moves an AI may reach and what it may do, see every use, and revoke it instantly.",
        long: {
          what:
            "Settings → AI connections is a real grant manager. You choose the moves, then approve up to five separate permissions — read move context, read private evidence, save move work, work the Queue, and archive records — each with a published boundary saying what it does not imply. The connection shows its client, registration method, approval, expiry, last use and use count, plus an append-only trail of both uses and refusals. Revoking takes effect on the very next call, because the grant is re-read from the database on every discovery and every tool call rather than trusted from the access token. A connected AI can also work the Queue under that grant: list only actionable work, claim it, ask the smallest clarifying question, and finish it in one saved result. Signing in proves who you are; it never decides what the AI may do.",
          why:
            "Signing in with OAuth proved identity and nothing else. Without a product-level grant, connecting an AI meant handing it whatever the sign-in could reach, with no screen that showed the connection, no narrow choice, and no way to end it yourself.",
          where:
            "Settings → AI connections, after connecting an AI to https://movingmanifest.com/mcp.",
        },
        sourceRefs: ["pr-196", "pr-197"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "connected-ai-move-photos",
        category: "created",
        impactTier: "meaningful",
        impactRank: 1,
        short:
          "A connected AI can see your move photos, and says plainly when a picture cannot be delivered.",
        long: {
          what:
            "Private photos reach a connected AI as real image bytes, fetched server-side so no storage link ever leaves Assist With Moving. Each image and each batch has a size ceiling, and an oversized photo automatically steps down to a smaller version before it is ever dropped. Anything still left out comes back with a ranked, plain-language reason.",
          why:
            "Moving's inventory is made of photographs, and asking for a batch of full-size ones could exceed the response limit and fail the whole call — so an AI asking for eight pictures got none instead of six. A photo that could not be delivered also vanished silently, so 'this belonging has no photo', 'the photo is still processing', and 'you asked for too much' were indistinguishable.",
          where:
            "Ask a connected AI about belongings that have photos, with read-private-evidence approved.",
        },
        sourceRefs: ["pr-198"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "oauth-scope-advertisement",
        category: "fixed",
        impactTier: "meaningful",
        impactRank: 1,
        short:
          "Connecting an AI no longer fails because Assist With Moving asked for permissions the sign-in provider cannot issue.",
        long: {
          what:
            "Discovery now advertises only the identity scopes the authorization server can actually grant, and carries the five Moving product permissions in a separate vendor block alongside the grant-manager address. Authority still comes from your approved grant, never from a token scope.",
          why:
            "Advertising product permissions as OAuth scopes made well-behaved clients request something the provider could not issue, which failed the connection outright before a person ever reached the approval screen.",
          where:
            "Point any compatible AI client at https://movingmanifest.com/mcp.",
        },
        sourceRefs: ["pr-199"],
        audiences: ["agent"],
      },
      {
        id: "oauth-consent-product-name",
        category: "fixed",
        impactTier: "meaningful",
        impactRank: 2,
        short:
          "The approval screen now names Assist With Moving instead of a bare address.",
        long: {
          what:
            "The protected-resource document publishes the product's real display name, so the consent screen a person sees while connecting their AI says Assist With Moving.",
          why:
            "Being asked to approve access for an unnamed host is exactly the moment a person should be able to tell what they are approving.",
        },
        sourceRefs: ["pr-193"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "support-path",
        category: "fixed",
        impactTier: "meaningful",
        impactRank: 3,
        short: "Every page that offers help now points somewhere that works.",
        long: {
          what:
            "One shared support path replaces the missing contact address referenced across the marketing, about, FAQ, privacy, and agent-facing pages.",
          why:
            "Pages invited people to get in touch and then gave them nowhere to go.",
          where: "The footer, About, FAQ, and Privacy pages.",
        },
        sourceRefs: ["pr-194"],
        audiences: ["public", "signed-in"],
      },
      {
        id: "stdio-package-identity",
        category: "upgraded",
        impactTier: "supporting",
        impactRank: 1,
        short:
          "The local helper package is now named assistwithmoving-mcp, matching the product.",
        long: {
          what:
            "The bundled local MCP command and its package were renamed from movingmanifest-mcp to assistwithmoving-mcp, along with the project's internal technical identity.",
          why:
            "The old technical name predated the product name, so desktop AI configuration files referred to something a person could not recognize.",
          where:
            "Local stdio setup, for people who run the helper package with an mmk_ key.",
        },
        sourceRefs: ["pr-192"],
        audiences: ["agent"],
      },
    ],
  },
  {
    version: "0.6.0",
    releasedAt: "2026-08-14T15:48:49.000Z",
    timezone: "America/Phoenix",
    title: "A private move that starts with the person",
    summary:
      "A first visit now starts one private move directly, then keeps the path to Queue and AI-saved move work clear without requiring setup ceremony.",
    backfillNote:
      "The product source after the completed v0.5.1 record through the verified private-first onboarding deployment is classified in the v0.6.0 completeness ledger.",
    items: [
      {
        id: "private-first-move-journey",
        category: "upgraded",
        impactTier: "major",
        impactRank: 1,
        short:
          "New people can create a private move in one short form and follow its Queue-to-saved-work loop.",
        long: {
          what:
            "The empty workspace now creates its private boundary and first move together, optional route context stays optional, the Move overview explains the durable Queue and saved-work path, failure recovery stays inside the product, and AI guidance distinguishes hosted OAuth, helper-key tools, and the Partial Queue boundary.",
          why:
            "The previous first visit exposed an internal household step and advanced setup language before a person had a useful move to return to, while AI setup could imply every connection door had the same tools.",
          where:
            "Sign in, create the first private move from Your moves, then use the First useful loop on the Move overview.",
        },
        sourceRefs: ["pr-190"],
        audiences: ["signed-in", "agent"],
      },
    ],
  },
  {
    version: "0.5.0",
    releasedAt: "2026-08-13T21:56:23.554Z",
    timezone: "America/Phoenix",
    title: "A working Assist With Moving first run",
    summary:
      "Assist With Moving now opens as one coherent product: the public entry reaches a usable sign-in, the empty workspace explains the move clearly, and chosen-AI setup starts with secure hosted OAuth.",
    backfillNote:
      "Every first-parent source after the v0.4.1 product cutoff through the verified Assist With Moving first-run deployment was classified in the v0.5.0 completeness ledger.",
    items: [
      {
        id: "assist-moving-first-run",
        category: "fixed",
        impactTier: "major",
        impactRank: 1,
        short:
          "The Assist With Moving entry now reaches a usable sign-in and carries one current identity through the workspace, Queue, and chosen-AI setup.",
        long: {
          what:
            "The public Assist domain now preserves the requested path while entering through the production Clerk-approved host. Public pages, auth framing, the signed-in shell, Queue guidance, packets, metadata, API/MCP copy, and agent guides use Assist With Moving; AI Connections recommends hosted OAuth before fallback API keys.",
          why:
            "An ordinary visit to the Assist-domain sign-in previously showed only a legacy title and no usable control because the production identity rejected that origin. Mixed identity and key-first setup also made the first visit harder to understand.",
          where:
            "Begin at assistwithmoving.com, continue into the empty workspace or Queue, and open AI Connections to copy the hosted movingmanifest.com/mcp endpoint.",
        },
        sourceRefs: ["pr-184"],
        audiences: ["public", "signed-in", "agent"],
      },
    ],
  },
  {
    version: "0.4.1",
    releasedAt: "2026-08-13T02:29:04.000Z",
    timezone: "America/Phoenix",
    title: "Reliable sign-in for chosen AI connections",
    summary:
      "Chosen AI connections can now complete real Moving sign-in and keep useful, source-backed work in the move workspace through the recommended OAuth MCP connection.",
    backfillNote:
      "Every first-parent source after the v0.4.0 product release marker through the verified OAuth repair deployment was classified in the v0.4.1 completeness ledger.",
    items: [
      {
        id: "production-mcp-oauth",
        category: "fixed",
        impactTier: "major",
        impactRank: 1,
        short:
          "Chosen AI connections can now finish browser sign-in and save durable move work through the recommended MCP endpoint.",
        long: {
          what:
            "Moving now accepts the signed production OAuth access-token shape issued during browser consent while retaining issuer, signature, expiry, token-type, subject, client, and supplied-audience checks.",
          why:
            "The first live connection exposed a mismatch between the released verifier and the token actually issued after consent, so a valid chosen AI could sign in but could not reach any move tool.",
          where:
            "Connect a chosen AI with movingmanifest.com/mcp, then review its returned decisions, estimates, plans, and source checks in the move Overview under Saved work.",
        },
        sourceRefs: ["pr-182"],
        audiences: ["signed-in", "agent"],
      },
    ],
  },
  {
    version: "0.4.0",
    releasedAt: "2026-08-12T23:46:53.000Z",
    timezone: "America/Phoenix",
    title: "AI work that stays with the move",
    summary:
      "Assist With Moving now gives each person a clearer handoff desk and a durable chosen-AI workflow: Queue work stays attributable, and finished plans, estimates, decisions, inventory, locations, evidence, and source checks return to the move workspace instead of disappearing in chat.",
    backfillNote:
      "Every first-parent source after the v0.3.0 release-record marker through the verified August 12 production deployment was classified in the v0.4.0 completeness ledger.",
    items: [
      {
        id: "durable-ai-move-work",
        category: "created",
        impactTier: "major",
        impactRank: 1,
        short:
          "A chosen AI can now do bounded move-planning work and save a complete, readable result back into the move workspace.",
        long: {
          what:
            "The canonical OAuth MCP provides eight focused tools to brief and search a move, read selected records and private evidence, save move context and inventory, correct planning records, and preserve one complete result with decisions, estimates, plan sections, and honest source checks.",
          why:
            "Useful AI work should become part of the durable move record, with provenance, replay protection, tenant boundaries, and human-visible results rather than remaining an unauditable chat answer.",
          where:
            "Connect from AI Connections or the AI setup guide, then inspect returned work in a moves Overview under Saved work.",
        },
        sourceRefs: ["pr-180"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "four-state-ai-queue",
        category: "created",
        impactTier: "major",
        impactRank: 2,
        short:
          "The Queue now shows Needs you, Working, Waiting for your AI, and Done as one clear, attributable handoff flow.",
        long: {
          what:
            "Moving gained durable Queue records, bounded AI claims, exact ownership and delegation rules, readable activity and results, and responsive global and move-specific Queue workspaces while retaining compatible capture history.",
          why:
            "A person needs to know what requires their answer, what an AI is doing, what is waiting to be picked up, and what finished without confusing operational retries or leases for extra product states.",
          where:
            "Open Queue globally or inside a move; capture and specialized review paths remain available beside the canonical handoff flow.",
        },
        sourceRefs: ["pr-175", "pr-177"],
        audiences: ["signed-in", "agent"],
      },
    ],
  },
  {
    version: "0.3.0",
    releasedAt: "2026-07-27T17:08:59.000Z",
    timezone: "America/Phoenix",
    title: "A complete moving workspace for people and their agents",
    summary:
      "Assist With Moving grew from a basic inventory into a coordinated moving workspace: people and their AI assistants can capture evidence, organize belongings, plan spaces and transport, collaborate safely, and keep large moves understandable on any screen.",
    backfillNote:
      "Every shipped source since the previous release marker was classified against the verified July 27 production deployment.",
    items: [
      {
        id: "connected-agent-workflows",
        category: "created",
        impactTier: "major",
        impactRank: 1,
        short:
          "AI assistants can connect directly and complete real capture, inventory, box, image, transport, and queue workflows.",
        long: {
          what:
            "The hosted OAuth connection now provides purpose-built tools for reviewing captures, editing items and boxes, working with images, configuring moves, and planning transport. The local API-key connection remains a separate supported door.",
          why:
            "A connected assistant can now help finish a move workflow instead of stopping after discovery or requiring a person to translate every step into manual edits.",
          where:
            "Connect an assistant from AI Connections, then use the Queue, Inventory, Movable Units, Spaces, and Transport workflows.",
        },
        sourceRefs: connectedAgentSources,
        audiences: ["signed-in", "agent"],
      },
      {
        id: "move-workspace",
        category: "created",
        impactTier: "major",
        impactRank: 2,
        short:
          "Moves now open into a focused workspace with clear paths to inventory, movable units, operations, planning, and results.",
        long: {
          what:
            "The product navigation was rebuilt around Moves, Movable Units, and Items, with move-specific work grouped inside the selected move and a useful overview replacing empty setup forms.",
          why:
            "The structure follows how people think about a move: choose the move, understand its current state, then act on the belongings or operation that needs attention.",
          where:
            "The change spans the signed-in home, move directory, move overview, workspace navigation, and movable-unit detail.",
        },
        sourceRefs: [
          "pr-20",
          "pr-22",
          "pr-24",
          "pr-33",
          "pr-38",
          "pr-96",
          "commit-c03075778226",
        ],
        audiences: ["signed-in"],
      },
      {
        id: "shared-moving-team",
        category: "created",
        impactTier: "major",
        impactRank: 3,
        short:
          "Move owners can invite participants and deliberately share queue work with the right people and assistants.",
        long: {
          what:
            "Assist With Moving now understands move participants, durable invitation claims, per-person queues, agent provenance, and explicit delegation consent.",
          why:
            "A household move is rarely a one-person job. These boundaries let several people contribute without making every capture or assistant connection visible to everyone by default.",
          where:
            "Manage collaboration from the move Participants experience and each participant's Queue.",
        },
        sourceRefs: ["pr-62", "pr-64", "pr-65", "pr-66", "pr-118", "pr-123"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "spaces-transport-planning",
        category: "created",
        impactTier: "meaningful",
        impactRank: 4,
        short:
          "Spaces and Transport turn room capacity, vehicle capacity, placement, and trip planning into one visual planning workflow.",
        long: {
          what:
            "People can define present and destination spaces, describe transport resources, calculate usable cargo volume, review capacity, and place belongings into the plan.",
          why:
            "Inventory becomes operational when it answers where belongings are now, where they are going, and whether the available rooms and vehicles can hold them.",
          where:
            "Open Spaces & Transport inside a move; connected assistants can work with the same planning concepts.",
        },
        sourceRefs: ["pr-23", "pr-68", "pr-71", "pr-76", "pr-77", "pr-80", "pr-90"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "capture-evidence-workflow",
        category: "created",
        impactTier: "meaningful",
        impactRank: 5,
        short:
          "Photo and document captures now move through a clear, reviewable queue and stay attached to the inventory they create.",
        long: {
          what:
            "Capture supports move switching, background uploads, structured item details, reusable photos, entry detail views, and automatic evidence attachment after processing.",
          why:
            "Evidence is useful only when people can see what is waiting, understand what an assistant produced, and trace the result back to its original photos or document.",
          where:
            "Use Add to Queue, the move Queue, item detail, and the Photos workflow.",
        },
        sourceRefs: [
          "pr-25",
          "pr-26",
          "pr-29",
          "pr-34",
          "pr-58",
          "pr-69",
          "pr-92",
          "pr-95",
          "pr-97",
          "pr-101",
        ],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "inventory-controls",
        category: "created",
        impactTier: "meaningful",
        impactRank: 6,
        short:
          "Items, boxes, totes, and other movable units gained practical controls for naming, classification, placement, sale, conversion, and removal.",
        long: {
          what:
            "Inventory records now have stable codes, thumbnails, editable names and descriptions, clearer measurements, item-to-box conversion, disposition actions, manual creation, and focused detail views.",
          why:
            "Real inventories change while packing. These controls let people correct what something is and what should happen to it without rebuilding the record.",
          where:
            "The controls appear across Items, Movable Units, item detail, box or tote detail, Sell, and admin cleanup.",
        },
        sourceRefs: inventoryControlSources,
        audiences: ["signed-in", "admin", "agent"],
      },
      {
        id: "mobile-install",
        category: "created",
        impactTier: "supporting",
        impactRank: 7,
        short:
          "Assist With Moving can be installed on a phone for faster access during packing and move-day work.",
        long: {
          what:
            "The public app metadata and install experience now support adding Assist With Moving to a mobile home screen.",
          why:
            "Packing work happens away from a desk, so quick app-like access reduces friction when capturing or checking belongings in place.",
          where:
            "Use the browser's install or Add to Home Screen path on a supported mobile device.",
        },
        sourceRefs: ["pr-55"],
        audiences: ["public", "signed-in"],
      },
      {
        id: "public-guidance",
        category: "created",
        impactTier: "supporting",
        impactRank: 8,
        short:
          "Public guidance now explains the real product and the direct remote-assistant connection path without fabricated examples.",
        long: {
          what:
            "The public site gained honest product panels, About and FAQ pages, and corrected AI connection guidance that distinguishes the supported remote path from local tools.",
          why:
            "People should understand what the product actually does and choose a connection method that works before they create an account or configure an assistant.",
          where:
            "Review the public home, About, FAQ, AI, and MCP guide pages.",
        },
        sourceRefs: ["pr-39", "pr-148", "pr-150"],
        audiences: ["public", "agent"],
      },
      {
        id: "privacy-access-boundaries",
        category: "fixed",
        impactTier: "major",
        impactRank: 1,
        short:
          "Private move data, assistant credentials, media inputs, and administrative controls now stay behind stricter access boundaries.",
        long: {
          what:
            "Authorization checks were tightened across API keys, agent connections, media retrieval, route guards, administrative setup, and permanent data operations.",
          why:
            "A moving inventory can contain addresses, valuables, documents, and household relationships. The product must reject ambiguous or outdated access instead of assuming it is safe.",
          where:
            "The protections cover signed-in routes, REST and MCP access, media tools, API-key lifecycle, and production configuration.",
        },
        sourceRefs: [
          "pr-30",
          "pr-48",
          "pr-63",
          "pr-120",
          "commit-a728daff3813",
          "commit-2ba97bff3947",
          "commit-2f2d9d571d2d",
          "pr-146",
          "pr-147",
          "pr-149",
          "pr-156",
          "pr-157",
        ],
        audiences: ["signed-in", "admin", "agent"],
      },
      {
        id: "media-reliability",
        category: "fixed",
        impactTier: "major",
        impactRank: 2,
        short:
          "Photo uploads, previews, and assistant image delivery recover cleanly instead of failing silently or leaving captures stuck.",
        long: {
          what:
            "The media path now handles gateway responses, authenticated display URLs, image dimensions, retries, aborts, storage signing, and failed-upload state more reliably.",
          why:
            "Photos are the evidence layer for inventory and claims. A failed upload must be visible and recoverable, and a successful upload must remain connected to the right record.",
          where:
            "The fixes protect Add to Queue, Photos, item and box evidence, and image tools used by connected assistants.",
        },
        sourceRefs: [
          "pr-43",
          "pr-47",
          "pr-49",
          "pr-50",
          "pr-60",
          "pr-70",
          "pr-78",
          "pr-102",
          "pr-103",
          "pr-106",
          "pr-110",
          "pr-121",
        ],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "agent-error-recovery",
        category: "fixed",
        impactTier: "major",
        impactRank: 3,
        short:
          "People and assistants now receive useful, safe errors when a tool, record, or backend dependency cannot complete the request.",
        long: {
          what:
            "Tool failures and mutation errors are translated into actionable product messages, missing records degrade safely, and the app shell remains honest when its backend is unavailable.",
          why:
            "A generic failure invites repeated actions and accidental damage. A clear boundary tells a person or assistant what can be corrected and what must wait.",
          where:
            "This applies to agent tools, inventory saves, missing box records, signed-in error states, and provider-safe loading fallbacks.",
        },
        sourceRefs: [
          "pr-51",
          "pr-67",
          "pr-111",
          "commit-baf692fcb47d",
          "pr-140",
          "pr-151",
        ],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "inventory-data-integrity",
        category: "fixed",
        impactTier: "meaningful",
        impactRank: 4,
        short:
          "Inventory measurements, conversions, deletion cascades, sale values, and cleared move notes now remain internally consistent.",
        long: {
          what:
            "Derived volume fills missing measurements, item-to-box conversion handles assigned heavy units, hard deletion cleans dependent records, and nullable updates preserve intentional clearing.",
          why:
            "Plans and packets are trustworthy only when related records agree after an edit or removal, including less-visible dependent data.",
          where:
            "The fixes protect movable-unit conversion, inventory deletion, sale details, measurements, and assistant-driven move updates.",
        },
        sourceRefs: ["pr-56", "pr-85", "pr-124", "commit-684e7c496778"],
        audiences: ["signed-in", "admin", "agent"],
      },
      {
        id: "collaboration-permissions",
        category: "fixed",
        impactTier: "meaningful",
        impactRank: 5,
        short:
          "A move manager's assistant can work an explicitly shared participant queue without being blocked by the manager relationship.",
        long: {
          what:
            "Queue authorization now follows the move's delegated access rules instead of treating a manager's connected assistant as unrelated.",
          why:
            "Explicit sharing should work consistently for both the manager and the assistant acting on the manager's behalf, while unshared queues remain private.",
          where:
            "The fix applies when a move manager delegates work from the Participants and Queue workflows.",
        },
        sourceRefs: ["pr-119"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "responsive-adaptive-interface",
        category: "upgraded",
        impactTier: "major",
        impactRank: 1,
        short:
          "Core move, inventory, load-planning, sign-in, and navigation surfaces now adapt cleanly from phones to wide desktops.",
        long: {
          what:
            "Navigation shifts by screen size, dense tables become focused mobile cards, hidden desktop trees no longer mount on small screens, and headers and sign-in cards stay inside the viewport.",
          why:
            "Moving work happens on phones in rooms and trucks as well as on desktop planning screens. Each device should get one usable interface, not overlapping layouts.",
          where:
            "The upgrades span the app shell, Inventory, Load Planner, workspace header, AI setup, and authentication pages.",
        },
        sourceRefs: [
          "pr-72",
          "pr-74",
          "pr-86",
          "pr-137",
          "pr-153",
          "pr-154",
          "pr-155",
          "pr-160",
        ],
        audiences: ["public", "signed-in"],
      },
      {
        id: "large-move-discovery",
        category: "upgraded",
        impactTier: "major",
        impactRank: 2,
        short:
          "Search, sorting, pagination, density context, and stable return positions make large moves faster to scan and manage.",
        long: {
          what:
            "Move and inventory lists gained search and richer sorting, the load planner pages through large result sets, and returning from detail keeps a person's place.",
          why:
            "A workflow that feels fine with ten belongings can become unusable with hundreds. Discovery and position memory keep the interface predictable as a move grows.",
          where:
            "Use the move directory, move switcher, Inventory, Movable Units, Spaces & Transport, and Load Planner.",
        },
        sourceRefs: [
          "pr-57",
          "pr-104",
          "pr-109",
          "pr-117",
          "commit-285f4fe1a628",
          "pr-139",
          "pr-158",
          "pr-159",
        ],
        audiences: ["signed-in"],
      },
      {
        id: "trustworthy-workflow-feedback",
        category: "upgraded",
        impactTier: "meaningful",
        impactRank: 3,
        short:
          "Loading, saving, navigation, empty states, undo, and status language now give clearer feedback without losing a person's context.",
        long: {
          what:
            "The interface added consistent skeletons and empty states, save confirmation, double-submit guards, section-preserving navigation, truthful counts and labels, Escape behavior, and hardened undo.",
          why:
            "Good feedback answers three questions during a busy workflow: did the action happen, what can I do next, and can I safely recover from a mistake?",
          where:
            "These refinements appear throughout move setup, inventory detail, queues, load planning, launchpad, and product error boundaries.",
        },
        sourceRefs: [
          "pr-21",
          "pr-73",
          "pr-98",
          "pr-113",
          "pr-114",
          "pr-115",
          "commit-59b1ea590b2e",
          "pr-136",
          "commit-67da3ec473ee",
          "commit-a38769122acf",
          "pr-141",
          "pr-142",
        ],
        audiences: ["signed-in"],
      },
      {
        id: "release-safety",
        category: "upgraded",
        impactTier: "supporting",
        impactRank: 4,
        short:
          "A required production check now catches lint, type, build, and critical contract failures before main can ship.",
        long: {
          what:
            "The repository gained a focused required CI gate aligned with the fact that every merge to main deploys production.",
          why:
            "Automated release checks make routine improvements safer by stopping known classes of broken builds before they reach customers.",
          where:
            "This protects every production deployment even though the checks themselves run behind the scenes.",
        },
        sourceRefs: ["pr-152"],
        audiences: ["admin"],
      },
    ],
  },
  {
    version: "0.2.0",
    releasedAt: "2026-06-20T15:54:20.000Z",
    timezone: "America/Phoenix",
    title: "Item detail Other Photos gallery",
    summary:
      "The item detail Evidence tab shows extra uploaded photos alongside the main item image.",
    backfillNote:
      "Added after the gallery shipped. This release-note-only addition did not create or silently renumber a second v0.2.0 release.",
    items: [
      {
        id: "other-photos-gallery",
        category: "created",
        impactTier: "meaningful",
        impactRank: 1,
        short:
          "Item evidence includes an Other Photos gallery with a clear empty state and upload guidance.",
        long: {
          what:
            "Additional item photos appear together below the primary image, while an empty state explains how to add the first extra photo.",
          why:
            "A person reviewing condition or ownership evidence can find the full visual record without guessing whether more photos exist.",
          where: "Open an item's Evidence tab.",
        },
        sourceRefs: ["pr-17", "pr-19"],
        audiences: ["signed-in"],
      },
      {
        id: "other-photos-deduplication",
        category: "fixed",
        impactTier: "supporting",
        impactRank: 1,
        short:
          "The main item image no longer repeats inside the Other Photos list.",
        long: {
          what:
            "The evidence strip filters out the image already used as the primary thumbnail.",
          why:
            "Each visible image now represents distinct evidence instead of inflating the apparent photo count.",
          where: "Open an item's Evidence tab.",
        },
        sourceRefs: ["pr-17", "pr-19"],
        audiences: ["signed-in"],
      },
      {
        id: "other-photos-review",
        category: "upgraded",
        impactTier: "supporting",
        impactRank: 1,
        short:
          "Item evidence review keeps the primary image and supporting photos in one understandable view.",
        long: {
          what:
            "The evidence layout distinguishes the representative image from its supporting gallery.",
          why:
            "That hierarchy makes quick review easier while preserving all uploaded evidence.",
          where: "Open an item's Evidence tab.",
        },
        sourceRefs: ["pr-17", "pr-19"],
        audiences: ["signed-in"],
      },
    ],
  },
  {
    version: "0.2.0",
    releasedAt: "2026-06-19T21:02:00.000Z",
    timezone: "America/Phoenix",
    title: "MCP OAuth discovery preservation",
    summary:
      "The production AI connection contract remains discoverable while private MCP requests still require authorization.",
    items: [
      {
        id: "oauth-discovery-proof",
        category: "created",
        impactTier: "meaningful",
        impactRank: 1,
        short:
          "Public OAuth discovery metadata tells compatible AI assistants how to begin a protected connection.",
        long: {
          what:
            "Assist With Moving publishes the standards-based protected-resource document needed to identify its authorization boundary.",
          why:
            "Discovery lets an assistant find the correct sign-in flow without making private move data public.",
          where: "This powers compatible remote MCP connection setup.",
        },
        sourceRefs: ["commit-e077b8f", "commit-69c41e8"],
        audiences: ["public", "agent"],
      },
      {
        id: "oauth-protected-endpoint",
        category: "fixed",
        impactTier: "major",
        impactRank: 1,
        short:
          "Unauthenticated MCP requests receive an authorization challenge instead of access to move data.",
        long: {
          what:
            "The public discovery document and the protected tool endpoint retain separate access behavior.",
          why:
            "An assistant needs enough public information to connect, but inventory, photos, credentials, and household records must remain private.",
          where: "This protects the production MCP endpoint.",
        },
        sourceRefs: ["commit-69c41e8"],
        audiences: ["signed-in", "agent"],
      },
      {
        id: "oauth-release-trail",
        category: "upgraded",
        impactTier: "supporting",
        impactRank: 1,
        short:
          "The visible version and release trail now preserve the expected assistant-connection contract.",
        long: {
          what:
            "The release record ties the public discovery behavior and protected endpoint to a visible application version.",
          why:
            "A durable record makes future connection changes easier to compare and verify.",
          where: "Review the What's New page and AI connection documentation.",
        },
        sourceRefs: ["commit-202b6cd"],
        audiences: ["public", "agent"],
      },
    ],
  },
  {
    version: "0.1.0",
    releasedAt: "2026-06-19T13:05:05.000Z",
    timezone: "America/Phoenix",
    title: "Initial release-log baseline",
    summary:
      "Assist With Moving established a public, privacy-safe record of product-visible changes.",
    items: [
      {
        id: "updates-baseline",
        category: "created",
        impactTier: "meaningful",
        impactRank: 1,
        short:
          "The /updates page became the canonical place to understand product changes.",
        long: {
          what:
            "The first release record established coverage for the move workspace, inventory, photos, planning, packets, API, and assistant surfaces.",
          why:
            "A single findable history helps customers and collaborators understand how the product is evolving.",
          where: "Use the public footer or visit /updates.",
        },
        sourceRefs: ["commit-16a4877"],
        audiences: ["public"],
      },
      {
        id: "updates-privacy-boundary",
        category: "fixed",
        impactTier: "supporting",
        impactRank: 1,
        short:
          "Release notes describe product outcomes without exposing private moves, credentials, or internal handoff details.",
        long: {
          what:
            "The public record stays at the capability and user-outcome level.",
          why:
            "Transparency about product changes should not disclose the personal data the product is designed to protect.",
          where: "This boundary applies to every public release entry.",
        },
        sourceRefs: ["commit-16a4877"],
        audiences: ["public"],
      },
      {
        id: "updates-version-source",
        category: "upgraded",
        impactTier: "supporting",
        impactRank: 1,
        short:
          "Release entries use the application package version as their visible version source.",
        long: {
          what:
            "The page, typed release data, sitemap, and package version were connected into one release-note foundation.",
          why:
            "One version source reduces drift between what the code reports and what customers see.",
          where: "The current application version appears at the top of /updates.",
        },
        sourceRefs: ["commit-16a4877"],
        audiences: ["public"],
      },
    ],
  },
];

export const latestRelease = releaseEntries[0];

export function toPublicReleaseEntry(entry: ReleaseEntry): PublicReleaseEntry {
  return {
    version: entry.version,
    releasedAt: entry.releasedAt,
    timezone: entry.timezone,
    title: entry.title,
    summary: entry.summary,
    ...(entry.backfillNote ? { backfillNote: entry.backfillNote } : {}),
    items: entry.items.map(
      ({ id, category, impactTier, impactRank, short, long }) => ({
        id,
        category,
        impactTier,
        impactRank,
        short,
        long,
      }),
    ),
  };
}

export const publicReleaseEntries = releaseEntries.map(toPublicReleaseEntry);

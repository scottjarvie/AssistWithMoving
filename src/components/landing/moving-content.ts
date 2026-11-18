// Parts follow the current moving loop; examples come from the existing
// HowItWorksPanel and /features. Moving has no separate ideas catalogue.
export const movingParts = [
  {
    name: "Start the move",
    tags: "Moves · Places",
    ai: "Helps frame where, when and why.",
    kept: "Move context, places and saved planning results.",
    idea: "Capture where, when, why, and the decisions that shape everything else.",
  },
  {
    name: "Know what goes",
    tags: "Items · Rooms",
    ai: "Helps organize belongings and estimates.",
    kept: "Rooms, owners, disposition, values and review flags.",
    idea: "Find unboxed items before load day.",
  },
  {
    name: "Pack and label",
    tags: "Boxes · Items",
    ai: "Suggests box contents and spots duplicates.",
    kept: "Box codes, contents and printable QR labels.",
    idea: "Create short box codes, add contents, print QR labels, and open a secure lookup route when a mystery box appears.",
  },
  {
    name: "Plan the load",
    tags: "Loads · Boxes",
    ai: "Helps think through assignments and capacity.",
    kept: "Transport resources, trips, assignments and capacity warnings.",
    idea: "Keep personal transport and first-night items visible.",
  },
  {
    name: "Keep the proof",
    tags: "Evidence · Items",
    ai: "Helps organize photos and source checks.",
    kept: "Private photos, condition notes and supporting evidence.",
    idea: "Track claim evidence while packing normally.",
  },
  {
    name: "Prepare a handoff",
    tags: "Packets · Evidence",
    ai: "Helps prepare documentation for the right recipient.",
    kept: "Scoped documentation profiles and packet exports.",
    idea: "Export mover-safe packets without private values.",
  },
  {
    name: "Pick up again",
    tags: "Moves · Queue",
    ai: "Returns to the context you have saved.",
    kept: "Questions, Queue work and saved results.",
    idea: "Review decisions, estimates, plans, source checks, evidence, and scoped packets later.",
  },
] as const;
export const movingKeeps = [
  ["Moves", "The dates, places and context for one move."],
  [
    "Places",
    "Origins, destinations and the spaces your belongings pass through.",
  ],
  ["Items", "Belongings with owners, disposition, values and evidence."],
  ["Boxes", "Short codes, contents and QR labels for packed belongings."],
  ["Loads", "Transport resources, trips and box assignments."],
  ["Evidence", "Private photos and source records connected to your move."],
  ["Packets", "Documentation scoped to the person receiving it."],
] as const;

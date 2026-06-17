import type {
  FloorplanAssumption,
  FloorplanConflict,
  FloorplanGapCategory,
  FloorplanGapPriority,
  FloorplanInteractiveObject,
} from "@/lib/floorplans/types";

export const floorplanAssumptions: FloorplanAssumption[] = [
  {
    id: "truth-supersedes-assumption",
    premise:
      "If a user supplies an official/listed property fact, it outranks older sample assumptions and weak agent guesses for the same subject.",
    inference:
      "Use 2013 sq ft and 9540 sq ft as active targets; keep the old 1800 sq ft and 0.25 acre values only as superseded history.",
    confidence: "high",
    risk:
      "Low. This prevents the solver from clinging to outdated placeholders after better evidence arrives.",
    sourceIds: ["user-area-facts"],
  },
  {
    id: "measurement-precedence",
    premise:
      "If an area appears in both a whole-house sketch and a measured detail sketch, the measured detail is more reliable.",
    inference:
      "Scale the bonus room, front living room, and laundry from detail sketches, then use the overview for adjacency.",
    confidence: "high",
    risk: "Low. This is the normal evidence rule for mixed sketch quality.",
    sourceIds: ["overview", "bonus-detail", "front-kitchen-detail", "laundry-detail"],
  },
  {
    id: "passage-breaks",
    premise:
      "If a wall break is drawn without a clear door swing, the evidence only proves a connection.",
    inference:
      "Treat uncertain breaks as open passages until a door photo, swing mark, or user note confirms a door.",
    confidence: "medium",
    risk: "Door clearance for mover paths may be overestimated.",
    sourceIds: ["overview", "front-kitchen-detail"],
  },
  {
    id: "right-wing-scale",
    premise:
      "The right bedroom wing exists in the overview but has no strong dimensions.",
    inference:
      "Draw Room 2, Room 3, baths, closets, and hall as low-confidence topology blocks.",
    confidence: "low",
    risk: "Furniture placement and label destinations can be directionally useful but not dimensionally precise.",
    sourceIds: ["overview"],
  },
  {
    id: "missing-area-creates-candidates",
    premise:
      "If measured rooms do not reach the official conditioned area and the sketch visibly contains an omitted room, the solver should add the omitted room before stretching measured spaces.",
    inference:
      "Room 1 is modeled as a medium-confidence derived room because it is visible in the overview and explains the 2013 sq ft reconciliation.",
    confidence: "medium",
    risk:
      "Room 1 still needs direct measurements, but this is a better assumption than enlarging the bonus room, front living room, or laundry against written measurements.",
    sourceIds: ["overview", "user-area-facts"],
  },
  {
    id: "excluded-property-zones",
    premise:
      "If satellite/user evidence identifies patios, carports, sheds, or workshops outside the conditioned house area, they remain in the property layout but are excluded from house square footage.",
    inference:
      "Draw carport, rear patio/pool deck, workshop, and shed as property zones with excluded/outdoor area roles.",
    confidence: "high",
    risk:
      "Their exact dimensions remain estimates until a survey, tape measurement, or stronger satellite scale is recorded.",
    sourceIds: ["satellite-property", "user-area-facts"],
  },
  {
    id: "walls-and-clear-space",
    premise:
      "Walls exist even when a sketch only gives room rectangles, and a written room dimension may describe clear interior space rather than the full structural footprint.",
    inference:
      "Reserve an assumed 4.5 in wall band and keep clear-space versus footprint assumptions visible until a wall or doorway measurement confirms the construction.",
    confidence: "medium",
    risk: "If the house uses unusually thick walls, room-to-room fit and mover clearance could shift by several inches per partition.",
    sourceIds: ["overview", "front-kitchen-detail", "bonus-detail"],
  },
  {
    id: "circulation-is-space",
    premise:
      "A person or mover gets from room to room through another room, a hall, a passage, or a door; circulation is not empty whitespace.",
    inference:
      "Treat the hall and major through-room paths as destination/circulation spaces so they consume area and can be checked for mover clearance.",
    confidence: "high",
    risk: "Low for topology, medium for exact widths until the hall is measured.",
    sourceIds: ["overview", "front-kitchen-detail", "hall-crop"],
  },
  {
    id: "single-hall-orientation",
    premise:
      "The user-supplied hall crop and living/kitchen detail both show the bedroom-wing hall as a left-to-right run.",
    inference:
      "Supersede the older vertical hall draft and solve the right wing around a horizontal hall that rooms, baths, and closets open onto.",
    confidence: "high",
    risk:
      "The hall length is still approximate, but the orientation and circulation role are now stronger evidence than the initial solver sketch.",
    sourceIds: ["hall-crop", "living-kitchen-hall-detail"],
  },
  {
    id: "right-bathroom-wall",
    premise:
      "The right-wing bathroom crop shows an enclosed bathroom outline, not just a fixture in a bedroom wing.",
    inference:
      "Reserve a complete bathroom block and do not let Room 3 or floating symbols consume that space.",
    confidence: "high",
    risk: "Exact bathroom dimensions still need a tape measurement.",
    sourceIds: ["right-bathroom-crop", "overview"],
  },
  {
    id: "laundry-clearance",
    premise:
      "Laundry fixture order and water heater position are explicit in the detail sketch.",
    inference:
      "Reserve appliance/water-heater zones from large-item placement even before exact depths are known.",
    confidence: "medium",
    risk: "Depths could change clearance calculations.",
    sourceIds: ["laundry-detail"],
  },
];

export const floorplanConflicts: FloorplanConflict[] = [
  {
    id: "placeholder-area-superseded",
    title: "Placeholder area assumptions superseded",
    status: "resolved",
    impact: "Prevents the solver from targeting the wrong house and lot size.",
    rule:
      "The user-provided 2013 sq ft house area and 9540 sq ft lot area replace the previous 1800 sq ft and 0.25 acre sample assumptions.",
    evidenceIds: ["official-area-and-exclusions"],
  },
  {
    id: "garage-vs-carport",
    title: "Garage assumption vs satellite carport",
    status: "resolved",
    impact: "Corrects the property model and excluded-area labels.",
    rule:
      "Remove the sample garage assumption. The satellite/user correction identifies a bottom-left carport plus detached workshop/shed structures.",
    evidenceIds: ["official-area-and-exclusions", "satellite-property-zones"],
  },
  {
    id: "overview-vs-detail-scale",
    title: "Overview proportions vs measured detail",
    status: "resolved",
    impact: "Prevents distorted room scale.",
    rule:
      "Explicit measurements override sketch proportions; overview controls only adjacency when details are silent.",
    evidenceIds: ["overview-topology", "bonus-measurements", "front-living-measurements"],
  },
  {
    id: "kitchen-outer-bounds",
    title: "Kitchen fixture layout vs room bounds",
    status: "open",
    impact: "Could shift the kitchen east/west and change hallway clearance.",
    rule:
      "Keep fixture order as medium confidence, but mark kitchen outer walls as inferred until one wall run is measured.",
    evidenceIds: ["kitchen-fixtures"],
  },
  {
    id: "bedroom-wing-scale",
    title: "Right bedroom wing scale",
    status: "open",
    impact: "Affects Room 2, Room 3, both bathrooms, closets, and the hall.",
    rule:
      "Topology is usable for destination naming, but dimensions stay low confidence until the wing is measured.",
    evidenceIds: ["overview-topology"],
  },
  {
    id: "room-1-derived-scale",
    title: "Room 1 derived dimensions",
    status: "review",
    impact: "Room 1 brings the solved conditioned area close to the listed 2013 sq ft target.",
    rule:
      "Keep Room 1 as a medium-confidence derived room until direct width/depth measurements are supplied.",
    evidenceIds: ["overview-topology", "official-area-and-exclusions"],
  },
  {
    id: "door-vs-passage",
    title: "Door swing vs passage break",
    status: "review",
    impact: "Mostly affects mover-path clearance and door-swing accuracy.",
    rule:
      "Draw known doors with swing arcs; keep unclear breaks as passages so the conflict is visible.",
    evidenceIds: ["overview-topology", "front-living-measurements"],
  },
  {
    id: "vertical-hall-superseded",
    title: "Vertical hall draft superseded",
    status: "resolved",
    impact: "Corrects the bedroom-wing layout and removes an impossible circulation shape.",
    rule:
      "The supplied hall crop shows one left-to-right hall. The solver should model it as horizontal and treat unknown wall breaks as passages until a swing is confirmed.",
    evidenceIds: ["single-horizontal-hall", "living-kitchen-hall-orientation"],
  },
  {
    id: "floating-symbols-removed",
    title: "Unsupported floating symbols removed",
    status: "resolved",
    impact: "Prevents users from clicking marks that are not tied to a room, wall, fixture, or measurement.",
    rule:
      "Windows must attach to a wall; ambiguous dark bars are not drawn unless evidence identifies the object.",
    evidenceIds: ["right-bathroom-walled-room", "living-kitchen-hall-orientation"],
  },
  {
    id: "wall-thickness-model",
    title: "Wall thickness and clear dimensions",
    status: "review",
    impact: "Affects every room footprint and whether small closets/baths fit in the right wing.",
    rule:
      "Keep wall thickness explicit. If missing, use a visible assumption and avoid treating clear room dimensions as if walls take no space.",
    evidenceIds: ["overview-topology", "front-living-measurements", "bonus-measurements"],
  },
  {
    id: "hidden-small-spaces",
    title: "Closets and small rooms may consume unlabeled area",
    status: "open",
    impact: "Could reduce Room 2/Room 3 usable area and change destination labels for boxes.",
    rule:
      "If a sketch hints at closets/baths without dimensions, keep those spaces explicit and low-confidence instead of folding them into neighboring bedrooms.",
    evidenceIds: ["overview-topology"],
  },
];

export const floorplanGaps: FloorplanGapPriority[] = [
  {
    id: "room-1-dimensions",
    question: "Room 1 exact width and depth",
    category: "scale-largest-unknown",
    impactScore: 100,
    whyItHelps:
      "Room 1 is the visible omitted interior space that reconciles the layout to the 2013 sq ft listed house area.",
    answerFormat: "Two numbers, for example: 20 ft 6 in wide by 18 ft 3 in deep.",
  },
  {
    id: "room-2-dimensions",
    question: "Room 2 width and depth",
    category: "scale-largest-unknown",
    impactScore: 98,
    whyItHelps:
      "Anchors the largest unknown room in the right wing and helps scale the shared bath/closet wall.",
    answerFormat: "Two numbers, for example: 15 ft 8 in wide by 13 ft deep.",
  },
  {
    id: "room-3-dimensions",
    question: "Room 3 width and depth",
    category: "scale-largest-unknown",
    impactScore: 95,
    whyItHelps:
      "Locks the upper right wing and checks whether the hall and bathroom block are proportioned correctly.",
    answerFormat: "Two numbers or a quick sketch with a tape-measure note.",
  },
  {
    id: "hall-run",
    question: "Hallway width and total hall length",
    category: "mover-path",
    impactScore: 86,
    whyItHelps:
      "Improves mover path accuracy from the kitchen into rooms, baths, and closets.",
    answerFormat: "Width plus length, or a photo with a known doorway width.",
  },
  {
    id: "wall-thickness",
    question: "Interior wall thickness or a doorway jamb measurement",
    category: "resolve-conflicts",
    impactScore: 82,
    whyItHelps:
      "Tells the solver how much space walls consume so clear room dimensions and structural footprints do not get mixed together.",
    answerFormat: "One number, for example: interior walls are about 4.5 in thick.",
  },
  {
    id: "circulation-path",
    question: "Confirm the path from the front door to Room 2 and Room 3",
    category: "mover-path",
    impactScore: 80,
    whyItHelps:
      "Verifies whether access goes front living -> kitchen -> hall, or through another space that should be modeled.",
    answerFormat: "A short note or arrows on the sketch showing the route.",
  },
  {
    id: "kitchen-outer-wall",
    question: "Kitchen outside wall run and opening to hall",
    category: "resolve-conflicts",
    impactScore: 78,
    whyItHelps:
      "Resolves the remaining kitchen rectangle conflict while preserving the fixture evidence.",
    answerFormat: "One measured wall run plus the opening width.",
  },
  {
    id: "bath-closet-widths",
    question: "Bathroom and closet widths in the right wing",
    category: "resolve-conflicts",
    impactScore: 66,
    whyItHelps:
      "Turns utility spaces from topology-only into measured destination rooms.",
    answerFormat: "Widths are enough for v1; depths can be inferred from neighboring room dimensions.",
  },
  {
    id: "excluded-structure-dimensions",
    question: "Carport, workshop, shed, and patio dimensions",
    category: "resolve-conflicts",
    impactScore: 64,
    whyItHelps:
      "These structures are excluded from house square footage but affect lot coverage, pathways, and property layout accuracy.",
    answerFormat:
      "Approximate footprint for each excluded zone, for example: carport 12 ft x 24 ft.",
  },
  {
    id: "lot-frontage-depth",
    question: "Lot frontage and depth",
    category: "resolve-conflicts",
    impactScore: 58,
    whyItHelps:
      "The lot area is known as 9540 sq ft, but frontage/depth turns that area into a more accurate property frame.",
    answerFormat: "Two numbers or a survey screenshot, for example: 90 ft frontage by 106 ft depth.",
  },
  {
    id: "door-swings",
    question: "Which openings need real door-swing direction?",
    category: "nice-to-have",
    impactScore: 42,
    whyItHelps:
      "Useful for precise clearance planning, but not required for destination sync or first-pass room layout.",
    answerFormat: "Mark only the doors that matter for moving large furniture.",
  },
];

export const floorplanInteractiveObjects: FloorplanInteractiveObject[] = [
  {
    id: "fireplace",
    kind: "fixture",
    subjectKey: "fireplace",
    subjectLabel: "Bonus room fireplace",
    subjectType: "fixture",
    label: "Bonus room fireplace",
    typeLabel: "Fixture",
    confidence: "high",
    description:
      "Fireplace on the top wall of the measured bonus room. Its exact width can become fixture evidence if measured.",
    defaultMeasurementLabel: "Shown on Image #2 bonus-room sketch",
    sourceIds: ["bonus-detail"],
    editableMeasurementTypes: ["width", "depth", "fixtureOffset"],
  },
  {
    id: "kitchen-stove",
    kind: "fixture",
    subjectKey: "kitchen-stove",
    subjectLabel: "Kitchen stove",
    subjectType: "fixture",
    label: "Kitchen stove",
    typeLabel: "Fixture",
    confidence: "medium",
    description:
      "Stove on the upper kitchen run near the window. Position is fixture evidence, exact offset is still inferred.",
    defaultMeasurementLabel: "Kitchen upper run, exact offset unknown",
    sourceIds: ["front-kitchen-detail", "overview"],
    editableMeasurementTypes: ["width", "depth", "fixtureOffset"],
  },
  {
    id: "kitchen-sink",
    kind: "fixture",
    subjectKey: "kitchen-sink",
    subjectLabel: "Kitchen sink",
    subjectType: "fixture",
    label: "Kitchen sink",
    typeLabel: "Fixture",
    confidence: "medium",
    description:
      "Sink on the right kitchen/counter run. This helps orient the hall side of the kitchen.",
    defaultMeasurementLabel: "Counter run measured in sections",
    sourceIds: ["front-kitchen-detail", "overview"],
    editableMeasurementTypes: ["width", "depth", "fixtureOffset"],
  },
  {
    id: "kitchen-island",
    kind: "fixture",
    subjectKey: "kitchen-island",
    subjectLabel: "Kitchen island / cabinet run",
    subjectType: "fixture",
    label: "Kitchen island / cabinet run",
    typeLabel: "Cabinet fixture",
    confidence: "medium",
    description:
      "Long island or cabinet run inside the kitchen. Its width and clearance affect mover paths.",
    defaultMeasurementLabel: "Sketch shows run but not exact finished size",
    sourceIds: ["front-kitchen-detail", "overview"],
    editableMeasurementTypes: ["width", "depth", "clearance"],
  },
  {
    id: "washer",
    kind: "fixture",
    subjectKey: "washer",
    subjectLabel: "Laundry washer",
    subjectType: "fixture",
    label: "Laundry washer",
    typeLabel: "Appliance",
    confidence: "high",
    description:
      "Washer position is visible in the laundry sketch and should reserve appliance footprint.",
    defaultMeasurementLabel: "Typical appliance footprint unless measured",
    sourceIds: ["laundry-detail", "overview"],
    editableMeasurementTypes: ["width", "depth"],
  },
  {
    id: "dryer",
    kind: "fixture",
    subjectKey: "dryer",
    subjectLabel: "Laundry dryer",
    subjectType: "fixture",
    label: "Laundry dryer",
    typeLabel: "Appliance",
    confidence: "high",
    description:
      "Dryer position is visible in the laundry sketch and should reserve appliance footprint.",
    defaultMeasurementLabel: "Typical appliance footprint unless measured",
    sourceIds: ["laundry-detail", "overview"],
    editableMeasurementTypes: ["width", "depth"],
  },
  {
    id: "laundry-sink",
    kind: "fixture",
    subjectKey: "laundry-sink",
    subjectLabel: "Laundry sink",
    subjectType: "fixture",
    label: "Laundry sink",
    typeLabel: "Fixture",
    confidence: "high",
    description:
      "Laundry sink sits on the appliance wall between washer/dryer and water heater zone.",
    defaultMeasurementLabel: "Shown in Image #4 laundry sketch",
    sourceIds: ["laundry-detail", "overview"],
    editableMeasurementTypes: ["width", "depth"],
  },
  {
    id: "water-heater",
    kind: "fixture",
    subjectKey: "water-heater",
    subjectLabel: "Laundry water heater",
    subjectType: "fixture",
    label: "Laundry water heater",
    typeLabel: "Fixture",
    confidence: "high",
    description:
      "Water heater is called out on the laundry sketch and affects usable clearance.",
    defaultMeasurementLabel: "6 ft side run context, exact tank diameter unknown",
    sourceIds: ["laundry-detail"],
    editableMeasurementTypes: ["width", "depth", "clearance"],
  },
  {
    id: "bath-1-toilet",
    kind: "fixture",
    subjectKey: "bath-1-toilet",
    subjectLabel: "Bath 1 toilet",
    subjectType: "fixture",
    label: "Bath 1 toilet",
    typeLabel: "Fixture",
    confidence: "low",
    description:
      "Toilet fixture inferred from the overview. Exact bath dimensions still need evidence.",
    defaultMeasurementLabel: "Overview only; needs confirmation",
    sourceIds: ["overview"],
    editableMeasurementTypes: ["width", "depth", "fixtureOffset"],
  },
  {
    id: "bath-2-toilet",
    kind: "fixture",
    subjectKey: "bath-2-toilet",
    subjectLabel: "Bath 2 toilet",
    subjectType: "fixture",
    label: "Bath 2 toilet",
    typeLabel: "Fixture",
    confidence: "low",
    description:
      "Toilet fixture inferred from the right-wing overview. Exact bath dimensions still need evidence.",
    defaultMeasurementLabel: "Overview only; needs confirmation",
    sourceIds: ["overview"],
    editableMeasurementTypes: ["width", "depth", "fixtureOffset"],
  },
  {
    id: "bath-2-tub",
    kind: "fixture",
    subjectKey: "bath-2-tub",
    subjectLabel: "Bath 2 tub / shower",
    subjectType: "fixture",
    label: "Bath 2 tub / shower",
    typeLabel: "Fixture",
    confidence: "low",
    description:
      "Tub or shower fixture inferred in the right-wing bath. Its size affects the bathroom rectangle.",
    defaultMeasurementLabel: "Overview only; needs confirmation",
    sourceIds: ["overview"],
    editableMeasurementTypes: ["width", "depth"],
  },
  {
    id: "front-door",
    kind: "opening",
    subjectKey: "front-door",
    subjectLabel: "Front door",
    subjectType: "opening",
    label: "Front door",
    typeLabel: "Door opening",
    confidence: "high",
    description:
      "Front door is shown at the lower edge of the front living room. Door swing direction is still reviewable.",
    defaultMeasurementLabel: "Likely 36 in door unless measured",
    sourceIds: ["overview", "front-kitchen-detail"],
    editableMeasurementTypes: ["openingWidth", "clearance"],
  },
  {
    id: "bonus-backyard-doors",
    kind: "opening",
    subjectKey: "bonus-backyard-doors",
    subjectLabel: "Bonus room backyard doors",
    subjectType: "opening",
    label: "Bonus room backyard doors",
    typeLabel: "Exterior opening",
    confidence: "high",
    description:
      "Yellow exterior opening mark for the backyard doors called out in the bonus-room sketch.",
    defaultMeasurementLabel: "Width not measured yet",
    sourceIds: ["bonus-detail", "overview"],
    editableMeasurementTypes: ["openingWidth", "clearance"],
  },
  {
    id: "kitchen-window",
    kind: "opening",
    subjectKey: "kitchen-window",
    subjectLabel: "Kitchen window",
    subjectType: "opening",
    label: "Kitchen window",
    typeLabel: "Window",
    confidence: "medium",
    description:
      "Blue wall-break mark for the kitchen window along the upper kitchen run.",
    defaultMeasurementLabel: "Window width estimated from sketch proportion",
    sourceIds: ["front-kitchen-detail", "overview"],
    editableMeasurementTypes: ["openingWidth"],
  },
  {
    id: "bonus-laundry-door",
    kind: "opening",
    subjectKey: "bonus-laundry-door",
    subjectLabel: "Bonus room to laundry passage",
    subjectType: "opening",
    label: "Bonus room to laundry passage",
    typeLabel: "Doorless/unknown passage",
    confidence: "medium",
    description:
      "Wall break between the bonus/laundry area. It proves access, but the evidence does not confirm a swinging door.",
    defaultMeasurementLabel: "Opening width not measured",
    sourceIds: ["overview", "bonus-detail"],
    editableMeasurementTypes: ["openingWidth", "clearance"],
  },
  {
    id: "bonus-kitchen-door",
    kind: "opening",
    subjectKey: "bonus-kitchen-door",
    subjectLabel: "Bonus room to kitchen passage",
    subjectType: "opening",
    label: "Bonus room to kitchen passage",
    typeLabel: "Doorless/unknown passage",
    confidence: "high",
    description:
      "Measured 66 in entry context between the bonus room and kitchen side. A passage is proven; a door swing is not.",
    defaultMeasurementLabel: "66 in entry context",
    sourceIds: ["bonus-detail", "living-kitchen-hall-detail"],
    editableMeasurementTypes: ["openingWidth", "clearance"],
  },
  {
    id: "kitchen-hall-opening",
    kind: "opening",
    subjectKey: "kitchen-hall-opening",
    subjectLabel: "Kitchen to hall passage",
    subjectType: "opening",
    label: "Kitchen to hall passage",
    typeLabel: "Doorless/unknown passage",
    confidence: "medium",
    description:
      "The living/kitchen detail and hall crop show circulation continuing rightward from the kitchen side.",
    defaultMeasurementLabel: "Opening width not measured",
    sourceIds: ["living-kitchen-hall-detail", "hall-crop"],
    editableMeasurementTypes: ["openingWidth", "clearance"],
  },
  {
    id: "room-3-door",
    kind: "opening",
    subjectKey: "room-3-door",
    subjectLabel: "Hall to Room 3 passage",
    subjectType: "opening",
    label: "Hall to Room 3 passage",
    typeLabel: "Doorless/unknown passage",
    confidence: "low",
    description:
      "Access from the hall to Room 3 is required by the circulation model, but the swing and exact opening are not measured.",
    defaultMeasurementLabel: "Opening placement inferred",
    sourceIds: ["overview", "hall-crop"],
    editableMeasurementTypes: ["openingWidth", "clearance"],
  },
  {
    id: "room-2-door",
    kind: "opening",
    subjectKey: "room-2-door",
    subjectLabel: "Hall to Room 2 passage",
    subjectType: "opening",
    label: "Hall to Room 2 passage",
    typeLabel: "Doorless/unknown passage",
    confidence: "low",
    description:
      "Access from the hall to Room 2 is required, but the detailed door or passage shape is still unresolved.",
    defaultMeasurementLabel: "Opening placement inferred",
    sourceIds: ["overview", "hall-crop"],
    editableMeasurementTypes: ["openingWidth", "clearance"],
  },
  {
    id: "bath-2-door",
    kind: "opening",
    subjectKey: "bath-2-door",
    subjectLabel: "Hall to Bath 2 passage",
    subjectType: "opening",
    label: "Hall to Bath 2 passage",
    typeLabel: "Doorless/unknown passage",
    confidence: "low",
    description:
      "Right-wing bath access is modeled as a passage until a door photo or swing mark confirms the exact door.",
    defaultMeasurementLabel: "Opening placement inferred",
    sourceIds: ["overview", "right-bathroom-crop", "hall-crop"],
    editableMeasurementTypes: ["openingWidth", "clearance"],
  },
  {
    id: "laundry-side-opening",
    kind: "opening",
    subjectKey: "laundry-side-opening",
    subjectLabel: "Laundry side passage",
    subjectType: "opening",
    label: "Laundry side passage",
    typeLabel: "Doorless/unknown passage",
    confidence: "medium",
    description:
      "Laundry-side wall break is visible in the sketches, but a swinging door is not confirmed.",
    defaultMeasurementLabel: "Opening width not measured",
    sourceIds: ["overview", "laundry-detail"],
    editableMeasurementTypes: ["openingWidth", "clearance"],
  },
  {
    id: "bonus-width-dimension",
    kind: "dimension",
    subjectKey: "bonus-room",
    subjectLabel: "Bonus room width",
    subjectType: "room",
    label: "Bonus room width",
    typeLabel: "Dimension line",
    confidence: "high",
    description:
      "Measured 25 ft span from the bonus-room sketch. This is a hard scale anchor.",
    defaultMeasurementLabel: "25 ft",
    sourceIds: ["bonus-detail"],
    editableMeasurementTypes: ["width"],
  },
  {
    id: "bonus-depth-dimension",
    kind: "dimension",
    subjectKey: "bonus-room",
    subjectLabel: "Bonus room depth",
    subjectType: "room",
    label: "Bonus room depth",
    typeLabel: "Dimension line",
    confidence: "high",
    description:
      "Measured 13 ft depth from the bonus-room sketch. This constrains the room rectangle.",
    defaultMeasurementLabel: "13 ft",
    sourceIds: ["bonus-detail"],
    editableMeasurementTypes: ["depth"],
  },
  {
    id: "front-width-dimension",
    kind: "dimension",
    subjectKey: "front-living",
    subjectLabel: "Front living width",
    subjectType: "room",
    label: "Front living width",
    typeLabel: "Dimension line",
    confidence: "high",
    description:
      "Measured 24 ft front living room width. This anchors the lower-left house scale.",
    defaultMeasurementLabel: "24 ft",
    sourceIds: ["front-kitchen-detail"],
    editableMeasurementTypes: ["width"],
  },
  {
    id: "front-depth-dimension",
    kind: "dimension",
    subjectKey: "front-living",
    subjectLabel: "Front living depth",
    subjectType: "room",
    label: "Front living depth",
    typeLabel: "Dimension line",
    confidence: "high",
    description:
      "Measured 17.5 ft front living room depth. User correction can refine this if the note is interpreted differently.",
    defaultMeasurementLabel: "17.5 ft",
    sourceIds: ["front-kitchen-detail"],
    editableMeasurementTypes: ["depth"],
  },
  {
    id: "laundry-width-dimension",
    kind: "dimension",
    subjectKey: "laundry",
    subjectLabel: "Laundry width",
    subjectType: "room",
    label: "Laundry width",
    typeLabel: "Dimension line",
    confidence: "high",
    description:
      "Measured 10 ft laundry width from the laundry sketch and overview.",
    defaultMeasurementLabel: "10 ft",
    sourceIds: ["laundry-detail", "overview"],
    editableMeasurementTypes: ["width"],
  },
  {
    id: "kitchen-entry-dimension",
    kind: "dimension",
    subjectKey: "kitchen-entry",
    subjectLabel: "Kitchen entry opening",
    subjectType: "opening",
    label: "Kitchen entry opening",
    typeLabel: "Dimension line",
    confidence: "high",
    description:
      "66 in entry width shown between bonus room and kitchen context.",
    defaultMeasurementLabel: "66 in",
    sourceIds: ["bonus-detail", "front-kitchen-detail"],
    editableMeasurementTypes: ["openingWidth"],
  },
];

const gapCategoryRank: Record<FloorplanGapCategory, number> = {
  "scale-largest-unknown": 4,
  "resolve-conflicts": 3,
  "mover-path": 2,
  "nice-to-have": 1,
};

export function sortedGapPriorities(
  gaps: FloorplanGapPriority[] = floorplanGaps,
) {
  return [...gaps].sort((a, b) => {
    if (b.impactScore !== a.impactScore) {
      return b.impactScore - a.impactScore;
    }
    return gapCategoryRank[b.category] - gapCategoryRank[a.category];
  });
}

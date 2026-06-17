import type {
  FloorplanEvidence,
  FloorplanKnownFact,
  FloorplanResource,
} from "@/lib/floorplans/types";

export const floorplanResources: FloorplanResource[] = [
  {
    id: "overview",
    title: "Whole-house overview sketch",
    kind: "image",
    status: "sample",
    fileName: "whole-house-overview.jpg",
    imageSrc: "/floorplans/sample/whole-house-overview.png",
    dimensionsLabel: "2048 x 1152",
    capturedAtLabel: "sample evidence",
    description:
      "One-page sketch showing the full main-floor topology, front door, kitchen, laundry, bonus room, bedroom wing, bathrooms, closets, and room labels.",
    proves: [
      "All spaces belong to one floor.",
      "Front living, kitchen, laundry, bonus room, and bedroom wing are connected.",
      "Room 2, Room 3, two bath areas, and closet zones sit in the right wing.",
    ],
  },
  {
    id: "bonus-detail",
    title: "Bonus room measured sketch",
    kind: "image",
    status: "sample",
    fileName: "bonus-room-detail.jpg",
    imageSrc: "/floorplans/sample/bonus-room-detail.png",
    dimensionsLabel: "2048 x 1152",
    capturedAtLabel: "sample evidence",
    description:
      "Measured detail with 25 ft by 13 ft bounds, 9 ft ceiling note, fireplace, backyard doors, cabinets, and entries toward laundry and kitchen.",
    proves: [
      "Bonus room is 25 ft wide and 13 ft deep.",
      "Backyard doors are on the exterior side of the bonus room.",
      "Kitchen entrance is about 66 in wide.",
    ],
  },
  {
    id: "front-kitchen-detail",
    title: "Front living and kitchen sketch",
    kind: "image",
    status: "sample",
    fileName: "front-kitchen-detail.jpg",
    imageSrc: "/floorplans/sample/front-kitchen-detail.png",
    dimensionsLabel: "2048 x 1152",
    capturedAtLabel: "sample evidence",
    description:
      "Measured front living room and partial kitchen/counter layout with stove, window, sink wall, hall direction, and front door.",
    proves: [
      "Front living room is 24 ft wide with a 17.5 ft depth note.",
      "Front door is on the lower edge of the front living room.",
      "Kitchen has a stove/window run and a sink/counter run.",
    ],
  },
  {
    id: "laundry-detail",
    title: "Laundry room measured sketch",
    kind: "image",
    status: "sample",
    fileName: "laundry-detail.jpg",
    imageSrc: "/floorplans/sample/laundry-detail.png",
    dimensionsLabel: "2048 x 1152",
    capturedAtLabel: "sample evidence",
    description:
      "Laundry detail with 10 ft width, 6 ft side run, dryer, washer, sink, water heater, shelves, and cabinet/counter runs.",
    proves: [
      "Laundry room is 10 ft wide.",
      "Washer, dryer, sink, and water heater locations are fixed features.",
      "Laundry connects to the bonus-room closet/entry area.",
    ],
  },
  {
    id: "satellite-property",
    title: "Satellite property view",
    kind: "image",
    status: "sample",
    fileName: "satellite-property-view.png",
    imageSrc: "/floorplans/sample/satellite-property.png",
    dimensionsLabel: "1084 x 1662",
    capturedAtLabel: "user-provided satellite evidence",
    description:
      "Overhead satellite view showing the real property envelope, front approach, bottom-left carport, large rear patio/pool area, and two detached top-left structures.",
    proves: [
      "The property layout extends beyond the conditioned house footprint.",
      "The bottom-left carport is attached/outdoor coverage and should not count toward conditioned square footage.",
      "Two top-left detached structures are a workshop and a shed, not counted in the 2013 sq ft house area.",
      "Most of the bright rear hardscape around the pool is patio/outdoor area, not house square footage.",
    ],
  },
  {
    id: "right-bathroom-crop",
    title: "Right-wing bathroom crop",
    kind: "image",
    status: "sample",
    fileName: "right-bathroom-crop.png",
    imageSrc: "/floorplans/sample/right-bathroom-crop.png",
    dimensionsLabel: "498 x 450",
    capturedAtLabel: "user-provided evidence crop",
    description:
      "Close crop from the whole-house sketch showing the right-wing bathroom as a complete walled room with a small closet/utility box next to it.",
    proves: [
      "The right-wing bathroom should be modeled as a walled room, not just a loose fixture.",
      "A small neighboring closet/utility box consumes space next to the bathroom.",
      "The bathroom wall must constrain any adjacent bedroom or hall assumptions.",
    ],
  },
  {
    id: "hall-crop",
    title: "Single hall crop",
    kind: "image",
    status: "sample",
    fileName: "hall-crop.png",
    imageSrc: "/floorplans/sample/hall-crop.png",
    dimensionsLabel: "1126 x 306",
    capturedAtLabel: "user-provided evidence crop",
    description:
      "Close crop from the overview sketch showing the one hall run as a left-to-right circulation path through the bedroom wing.",
    proves: [
      "There is one hall in this part of the house.",
      "The hall run is horizontal in the sketch, not a vertical room block.",
      "Rooms and bathrooms should connect to this hall or to another room, not to empty space.",
    ],
  },
  {
    id: "living-kitchen-hall-detail",
    title: "Living, kitchen, and hall detail",
    kind: "image",
    status: "sample",
    fileName: "living-kitchen-hall-detail.png",
    imageSrc: "/floorplans/sample/living-kitchen-hall-detail.png",
    dimensionsLabel: "1587 x 1152",
    capturedAtLabel: "user-provided evidence image",
    description:
      "Measured detail for front living room and kitchen showing the 24 ft living span, 17.5 ft depth note, kitchen fixture run, bonus-room entry, and hall direction.",
    proves: [
      "The front living room remains the scale anchor at 24 ft wide and about 17.5 ft deep.",
      "The kitchen and hall relationship is east/right of the living room.",
      "The hall direction arrow points right from the kitchen side.",
    ],
  },
  {
    id: "user-area-facts",
    title: "User-provided official property facts",
    kind: "text",
    status: "sample",
    capturedAtLabel: "current user correction",
    description:
      "Authoritative user text: listed house area is 2013 sq ft, lot size is 9540 sq ft, and patio/workshop/shed/carport are excluded from the house square footage.",
    proves: [
      "Conditioned house square footage target is 2013 sq ft.",
      "Lot size target is 9540 sq ft.",
      "Patio, workshop, shed, and carport should be visible property zones but excluded from conditioned sqft.",
    ],
  },
];

export const floorplanEvidence: FloorplanEvidence[] = [
  {
    id: "overview-topology",
    sourceId: "overview",
    sourceTitle: "Whole-house overview sketch",
    confidence: "medium",
    summary:
      "The overview establishes adjacency and one-floor topology, but most right-wing dimensions are not measured.",
    facts: [
      "Level count is one.",
      "Front living room connects toward kitchen and hall.",
      "Bedroom wing is right of the kitchen/hall path.",
    ],
  },
  {
    id: "bonus-measurements",
    sourceId: "bonus-detail",
    sourceTitle: "Bonus room measured sketch",
    confidence: "high",
    summary:
      "The bonus room carries the strongest room-scale evidence because both principal dimensions are written.",
    facts: [
      "Bonus room is 25 ft by 13 ft.",
      "Ceiling height is noted at 9 ft.",
      "Backyard doors and fireplace are fixed on exterior walls.",
    ],
  },
  {
    id: "front-living-measurements",
    sourceId: "front-kitchen-detail",
    sourceTitle: "Front living and kitchen sketch",
    confidence: "high",
    summary:
      "Front living room has direct dimensions and anchors the lower-left portion of the plan.",
    facts: [
      "Front living room span is 24 ft.",
      "Depth note is 17.5 ft.",
      "Front door sits on the lower edge of the room.",
    ],
  },
  {
    id: "laundry-fixtures",
    sourceId: "laundry-detail",
    sourceTitle: "Laundry room measured sketch",
    confidence: "high",
    summary:
      "Laundry room dimensions and fixtures are explicit enough to reserve fixed appliance zones.",
    facts: [
      "Laundry room width is 10 ft.",
      "The right-side run is 6 ft.",
      "Water heater should reserve the right wall area.",
    ],
  },
  {
    id: "kitchen-fixtures",
    sourceId: "front-kitchen-detail",
    sourceTitle: "Front living and kitchen sketch",
    confidence: "medium",
    summary:
      "Kitchen fixture order is usable, while the exact room rectangle remains partly inferred.",
    facts: [
      "Stove is on the upper counter run near a window.",
      "Sink is on the right counter run.",
      "Central cabinet/counter run is shown but not fully dimensioned.",
    ],
  },
  {
    id: "official-area-and-exclusions",
    sourceId: "user-area-facts",
    sourceTitle: "User-provided official property facts",
    confidence: "high",
    summary:
      "The user corrected the area target and exclusion rules. These facts supersede the previous sample-only lot and garage assumptions.",
    facts: [
      "Listed conditioned house area is 2013 sq ft.",
      "Lot size is 9540 sq ft.",
      "Patio, workshop, shed, and carport are excluded from house square footage.",
    ],
  },
  {
    id: "satellite-property-zones",
    sourceId: "satellite-property",
    sourceTitle: "Satellite property view",
    confidence: "medium",
    summary:
      "The satellite image identifies outdoor/excluded structures and gives the solver a better property layout frame than the sketch alone.",
    facts: [
      "Large rear patio/pool area sits north/back of the house.",
      "Workshop and shed sit at the top-left of the property.",
      "Carport sits at the bottom-left/front-left of the house.",
    ],
  },
  {
    id: "right-bathroom-walled-room",
    sourceId: "right-bathroom-crop",
    sourceTitle: "Right-wing bathroom crop",
    confidence: "high",
    summary:
      "The crop clarifies that the right-wing bathroom is a complete walled room. It should not be treated as a floating fixture or annotation.",
    facts: [
      "The bathroom has its own boundary walls.",
      "A small closet/utility box sits next to the bathroom.",
      "The bathroom block constrains Room 3 and the hall edge.",
    ],
  },
  {
    id: "single-horizontal-hall",
    sourceId: "hall-crop",
    sourceTitle: "Single hall crop",
    confidence: "high",
    summary:
      "The crop and user correction establish one hall running left-to-right through the bedroom wing.",
    facts: [
      "The hall should be horizontal in the solver draft.",
      "Bedroom-wing rooms connect to a circulation path, not unmodeled whitespace.",
      "Doorless openings remain possible until a swing is confirmed.",
    ],
  },
  {
    id: "living-kitchen-hall-orientation",
    sourceId: "living-kitchen-hall-detail",
    sourceTitle: "Living, kitchen, and hall detail",
    confidence: "high",
    summary:
      "The detailed image confirms the living-room scale and shows the hall direction relative to the kitchen.",
    facts: [
      "Front living room is 24 ft wide with a 17.5 ft depth note.",
      "Kitchen fixture run and hall arrow belong to the same right-side circulation system.",
      "The bonus-room entry and kitchen window evidence should attach to actual walls.",
    ],
  },
];

export const floorplanKnownFacts: FloorplanKnownFact[] = [
  {
    id: "one-floor",
    label: "One-floor plan",
    confidence: "high",
    sourceIds: ["overview"],
    statement:
      "All supplied sketches describe one floor; no stair, split-level, or second-floor marker is present.",
  },
  {
    id: "bonus-size",
    label: "Bonus room size",
    confidence: "high",
    sourceIds: ["bonus-detail"],
    statement: "Bonus room is 25 ft by 13 ft with a 9 ft ceiling note.",
  },
  {
    id: "front-living-size",
    label: "Front living room size",
    confidence: "high",
    sourceIds: ["front-kitchen-detail"],
    statement: "Front living room is 24 ft wide with a 17.5 ft depth note.",
  },
  {
    id: "laundry-size",
    label: "Laundry room size",
    confidence: "high",
    sourceIds: ["laundry-detail"],
    statement: "Laundry room is 10 ft wide with a 6 ft side run.",
  },
  {
    id: "bedroom-wing-topology",
    label: "Bedroom wing topology",
    confidence: "low",
    sourceIds: ["overview"],
    statement:
      "Room 2, Room 3, baths, closets, and hallway are present, but their dimensions are topology-only.",
  },
  {
    id: "listed-conditioned-area",
    label: "Listed conditioned area",
    confidence: "high",
    sourceIds: ["user-area-facts"],
    statement:
      "The house is listed as 2013 sq ft; patio, carport, workshop, and shed are excluded from that number.",
  },
  {
    id: "listed-lot-area",
    label: "Listed lot area",
    confidence: "high",
    sourceIds: ["user-area-facts"],
    statement: "The lot is listed as 9540 sq ft.",
  },
  {
    id: "satellite-excluded-zones",
    label: "Satellite excluded zones",
    confidence: "medium",
    sourceIds: ["satellite-property", "user-area-facts"],
    statement:
      "The satellite view shows a bottom-left carport, rear patio/pool area, and two top-left detached structures that must not be counted as conditioned house area.",
  },
  {
    id: "room-1-exists",
    label: "Room 1 exists",
    confidence: "medium",
    sourceIds: ["overview", "user-area-facts"],
    statement:
      "The overview sketch labels Room 1 below the kitchen; adding it explains the missing conditioned area without stretching measured rooms.",
  },
  {
    id: "single-horizontal-hall",
    label: "One horizontal hall",
    confidence: "high",
    sourceIds: ["hall-crop", "living-kitchen-hall-detail"],
    statement:
      "The bedroom-wing hall is a single left-to-right circulation path; the previous vertical hall interpretation is superseded.",
  },
  {
    id: "right-bath-is-walled",
    label: "Right bathroom is walled",
    confidence: "high",
    sourceIds: ["right-bathroom-crop", "overview"],
    statement:
      "The right-wing bathroom is a complete walled bathroom block and must constrain adjacent room geometry.",
  },
  {
    id: "openings-may-be-doorless",
    label: "Doorless passages exist",
    confidence: "medium",
    sourceIds: ["overview", "hall-crop", "living-kitchen-hall-detail"],
    statement:
      "A wall break proves access, but only a clear door/swing mark or user note proves a swinging door.",
  },
];

export const imageProvenance = {
  overview: {
    id: "prov-overview",
    sourceType: "image" as const,
    sourceId: "overview",
    sourceLabel: "Image #1: Whole-house overview sketch",
    imageNumber: 1,
    recordedAtLabel: "sample evidence",
  },
  bonus: {
    id: "prov-bonus",
    sourceType: "image" as const,
    sourceId: "bonus-detail",
    sourceLabel: "Image #2: Bonus room measured sketch",
    imageNumber: 2,
    recordedAtLabel: "sample evidence",
  },
  frontKitchen: {
    id: "prov-front-kitchen",
    sourceType: "image" as const,
    sourceId: "front-kitchen-detail",
    sourceLabel: "Image #3: Front living and kitchen sketch",
    imageNumber: 3,
    recordedAtLabel: "sample evidence",
  },
  laundry: {
    id: "prov-laundry",
    sourceType: "image" as const,
    sourceId: "laundry-detail",
    sourceLabel: "Image #4: Laundry room measured sketch",
    imageNumber: 4,
    recordedAtLabel: "sample evidence",
  },
  satellite: {
    id: "prov-satellite",
    sourceType: "image" as const,
    sourceId: "satellite-property",
    sourceLabel: "Satellite view: property, patio, pool, carport, workshop, shed",
    imageNumber: 5,
    recordedAtLabel: "user-provided satellite evidence",
  },
  rightBathroomCrop: {
    id: "prov-right-bathroom-crop",
    sourceType: "image" as const,
    sourceId: "right-bathroom-crop",
    sourceLabel: "Image #6: right-wing bathroom crop",
    imageNumber: 6,
    recordedAtLabel: "user-provided evidence crop",
  },
  hallCrop: {
    id: "prov-hall-crop",
    sourceType: "image" as const,
    sourceId: "hall-crop",
    sourceLabel: "Image #7: single hall crop",
    imageNumber: 7,
    recordedAtLabel: "user-provided evidence crop",
  },
  livingKitchenHall: {
    id: "prov-living-kitchen-hall-detail",
    sourceType: "image" as const,
    sourceId: "living-kitchen-hall-detail",
    sourceLabel: "Image #8: living, kitchen, and hall detail",
    imageNumber: 8,
    recordedAtLabel: "user-provided evidence image",
  },
  userFacts: {
    id: "prov-user-area-facts",
    sourceType: "textNote" as const,
    sourceId: "user-area-facts",
    sourceLabel: "User-provided official property facts",
    recordedAtLabel: "current user correction",
  },
};

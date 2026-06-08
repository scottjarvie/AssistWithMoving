import type {
  documentationProfileTypes,
  itemDispositions,
  itemFragilities,
  itemStatuses,
  moveTypes,
  pcsBranches,
  pcsDependentStatuses,
  pcsShipmentTypes,
  planningDefaultKeys,
  transportResourcePresetKeys,
} from "./moveFields";

type DocumentationProfileType = (typeof documentationProfileTypes)[number];
type ItemDisposition = (typeof itemDispositions)[number];
type ItemFragility = (typeof itemFragilities)[number];
type ItemStatus = (typeof itemStatuses)[number];
type MoveType = (typeof moveTypes)[number];
type PcsBranch = (typeof pcsBranches)[number];
type PcsDependentStatus = (typeof pcsDependentStatuses)[number];
type PcsShipmentType = (typeof pcsShipmentTypes)[number];
type PlanningDefaultKey = (typeof planningDefaultKeys)[number];
type TransportResourcePresetKey = (typeof transportResourcePresetKeys)[number];

export const demoHouseholdName = "MovingManifest Demo Household";

export type DemoSeedItem = {
  name: string;
  room: string;
  destinationRoom?: string;
  category: string;
  disposition: ItemDisposition;
  status?: ItemStatus;
  condition?: "unknown" | "new" | "excellent" | "good" | "fair" | "poor" | "damaged";
  quantity?: number;
  estimatedWeightLb?: number;
  estimatedVolumeCuFt?: number;
  valueCents?: number;
  replacementValueCents?: number;
  serialNumber?: string;
  modelNumber?: string;
  fragility?: ItemFragility;
  highValue?: boolean;
  requiresPersonalTransport?: boolean;
  planningDefaultKeys?: PlanningDefaultKey[];
  privateNotes?: string;
  reviewFlags?: string[];
  boxCode?: string;
  photoTypes?: ("item" | "serialNumber" | "condition" | "damage" | "boxContents" | "receipt")[];
};

export type DemoSeedBox = {
  code: string;
  label: string;
  room: string;
  destinationRoom?: string;
  status?: "open" | "packing" | "sealed" | "staged" | "loaded" | "delivered" | "missing" | "damaged";
  estimatedWeightLb?: number;
  estimatedVolumeCuFt?: number;
  presetKey?: TransportResourcePresetKey;
};

export type DemoSeedScenario = {
  key: string;
  title: string;
  type: MoveType;
  origin?: string;
  destination?: string;
  dateStart?: string;
  dateEnd?: string;
  documentationProfileTypes: DocumentationProfileType[];
  notes: string;
  pcs?: {
    branch: PcsBranch;
    rankPayGrade: string;
    dependentStatus: PcsDependentStatus;
    shipmentType: PcsShipmentType;
    ordersNumber: string;
    weightAllowanceLb: number;
    allowanceNotes: string;
    transportationOfficeNotes: string;
    restrictedItemsNotes: string;
    proGearNotes: string;
  };
  transportPresets: TransportResourcePresetKey[];
  boxes: DemoSeedBox[];
  items: DemoSeedItem[];
};

export const demoSeedScenarios = [
  {
    key: "pcs-mixed",
    title: "Demo PCS mixed move",
    type: "pcs",
    origin: "Fort Liberty, NC",
    destination: "Joint Base Lewis-McChord, WA",
    dateStart: "2026-07-15",
    dateEnd: "2026-07-29",
    documentationProfileTypes: ["pcsMove", "movingCompany", "loadCrew", "insuranceClaim"],
    notes:
      "Mixed HHG and partial PPM scenario for PCS packet, pro gear, first-night, and claim workflows.",
    pcs: {
      branch: "army",
      rankPayGrade: "E-6",
      dependentStatus: "withDependents",
      shipmentType: "mixed",
      ordersNumber: "PCS-DEMO-2026-001",
      weightAllowanceLb: 11000,
      allowanceNotes: "HHG plus partial PPM. Track pro gear separately.",
      transportationOfficeNotes:
        "Export PCS packet before counseling appointment and keep serial-number evidence private.",
      restrictedItemsNotes:
        "Lithium batteries, cleaning supplies, and personally-carried documents need review.",
      proGearNotes: "Two pro-gear totes in office closet, estimated 180 lb.",
    },
    transportPresets: ["militaryMovers", "personalVehicle", "storageUnit"],
    boxes: [
      {
        code: "PCS-001",
        label: "First night and uniforms",
        room: "Bedroom",
        destinationRoom: "Main bedroom",
        status: "sealed",
        estimatedWeightLb: 42,
        estimatedVolumeCuFt: 5,
        presetKey: "personalVehicle",
      },
      {
        code: "PCS-002",
        label: "Office pro gear",
        room: "Office",
        destinationRoom: "Garage",
        status: "staged",
        estimatedWeightLb: 86,
        estimatedVolumeCuFt: 7,
        presetKey: "militaryMovers",
      },
    ],
    items: [
      {
        name: "Orders binder with passports",
        room: "Office",
        destinationRoom: "Personal carry",
        category: "Documents",
        disposition: "personalTransport",
        estimatedWeightLb: 4,
        estimatedVolumeCuFt: 0.3,
        valueCents: 0,
        fragility: "medium",
        requiresPersonalTransport: true,
        planningDefaultKeys: ["documents", "doNotLetMoversTouch", "sensitive"],
        privateNotes: "Contains private IDs. Never share in mover packet.",
        boxCode: "PCS-001",
        photoTypes: ["item", "condition"],
      },
      {
        name: "Government laptop",
        room: "Office",
        destinationRoom: "Personal carry",
        category: "Electronics",
        disposition: "personalTransport",
        estimatedWeightLb: 6,
        estimatedVolumeCuFt: 0.5,
        replacementValueCents: 180000,
        serialNumber: "DEMO-GOV-LT-001",
        fragility: "high",
        highValue: true,
        requiresPersonalTransport: true,
        planningDefaultKeys: ["electronics", "highValue", "sensitive"],
        boxCode: "PCS-001",
        photoTypes: ["serialNumber", "condition"],
      },
      {
        name: "Pro gear field manuals",
        room: "Office",
        destinationRoom: "Garage",
        category: "Pro gear",
        disposition: "mover",
        quantity: 2,
        estimatedWeightLb: 58,
        estimatedVolumeCuFt: 3.5,
        planningDefaultKeys: ["documents"],
        reviewFlags: ["pro gear"],
        boxCode: "PCS-002",
        photoTypes: ["boxContents"],
      },
    ],
  },
  {
    key: "household",
    title: "Demo normal household move",
    type: "longDistance",
    origin: "Provo, UT",
    destination: "Boise, ID",
    dateStart: "2026-08-08",
    documentationProfileTypes: ["movingCompany", "loadCrew", "personalFullRecord"],
    notes:
      "Standard household move with mover-facing packet, load crew labels, high-value review, and essentials.",
    transportPresets: ["boxTruck", "personalVehicle", "donate"],
    boxes: [
      {
        code: "HH-001",
        label: "Kitchen fragile",
        room: "Kitchen",
        destinationRoom: "Kitchen",
        status: "packing",
        estimatedWeightLb: 34,
        estimatedVolumeCuFt: 4,
        presetKey: "boxTruck",
      },
      {
        code: "HH-002",
        label: "Kids first week",
        room: "Kids room",
        destinationRoom: "Kids room",
        status: "open",
        estimatedWeightLb: 28,
        estimatedVolumeCuFt: 4,
        presetKey: "personalVehicle",
      },
    ],
    items: [
      {
        name: "Wedding china set",
        room: "Dining room",
        destinationRoom: "Dining room",
        category: "Kitchen",
        disposition: "mover",
        condition: "excellent",
        estimatedWeightLb: 22,
        estimatedVolumeCuFt: 2.2,
        replacementValueCents: 95000,
        fragility: "high",
        highValue: true,
        planningDefaultKeys: ["fragile", "highValue"],
        boxCode: "HH-001",
        photoTypes: ["condition", "boxContents"],
      },
      {
        name: "Medication lockbox",
        room: "Bathroom",
        destinationRoom: "Personal carry",
        category: "Medical",
        disposition: "personalTransport",
        estimatedWeightLb: 3,
        estimatedVolumeCuFt: 0.4,
        requiresPersonalTransport: true,
        planningDefaultKeys: ["medication", "doNotLetMoversTouch", "firstNight"],
        boxCode: "HH-002",
        photoTypes: ["item"],
      },
    ],
  },
  {
    key: "storage",
    title: "Demo storage unit manifest",
    type: "storage",
    origin: "Basement storage",
    destination: "10x15 climate-controlled unit",
    documentationProfileTypes: ["storageInventory", "movingCompany", "personalFullRecord"],
    notes:
      "Storage manifest scenario for unit contents, long-term condition photos, and retrieval planning.",
    transportPresets: ["storageUnit", "pickupTruck"],
    boxes: [
      {
        code: "ST-001",
        label: "Holiday decorations",
        room: "Storage",
        destinationRoom: "Storage unit",
        status: "delivered",
        estimatedWeightLb: 30,
        estimatedVolumeCuFt: 6,
        presetKey: "storageUnit",
      },
    ],
    items: [
      {
        name: "Holiday ornament bins",
        room: "Storage",
        destinationRoom: "Storage unit",
        category: "Seasonal",
        disposition: "storage",
        quantity: 4,
        estimatedWeightLb: 24,
        estimatedVolumeCuFt: 5,
        fragility: "medium",
        boxCode: "ST-001",
        photoTypes: ["boxContents", "condition"],
      },
      {
        name: "Grandmother cedar chest",
        room: "Guest room",
        destinationRoom: "Storage unit",
        category: "Furniture",
        disposition: "storage",
        estimatedWeightLb: 55,
        estimatedVolumeCuFt: 8,
        replacementValueCents: 60000,
        fragility: "medium",
        highValue: true,
        planningDefaultKeys: ["irreplaceable", "highValue"],
        photoTypes: ["condition"],
      },
    ],
  },
  {
    key: "donation",
    title: "Demo donation and giveaway sort",
    type: "decluttering",
    origin: "Current home",
    destination: "Donation pickup and porch giveaway",
    documentationProfileTypes: ["donationPickup", "sellOrGiveaway", "personalFullRecord"],
    notes:
      "Decluttering scenario for donation pickup lists, free/giveaway items, and value notes.",
    transportPresets: ["donate", "freeGiveaway", "dump"],
    boxes: [
      {
        code: "DN-001",
        label: "Donation pickup",
        room: "Garage",
        destinationRoom: "Donation",
        status: "staged",
        estimatedWeightLb: 38,
        estimatedVolumeCuFt: 7,
        presetKey: "donate",
      },
    ],
    items: [
      {
        name: "Bookshelf",
        room: "Office",
        destinationRoom: "Donation",
        category: "Furniture",
        disposition: "donate",
        condition: "good",
        estimatedWeightLb: 42,
        estimatedVolumeCuFt: 12,
        valueCents: 4500,
        boxCode: "DN-001",
        photoTypes: ["item"],
      },
      {
        name: "Kids bike with flat tire",
        room: "Garage",
        destinationRoom: "Porch pickup",
        category: "Sports",
        disposition: "free",
        condition: "fair",
        estimatedWeightLb: 18,
        estimatedVolumeCuFt: 5,
        reviewFlags: ["needs tire note"],
        photoTypes: ["condition"],
      },
    ],
  },
  {
    key: "claim",
    title: "Demo insurance claim evidence",
    type: "claimsInventory",
    origin: "Delivery inspection",
    destination: "Claims packet",
    documentationProfileTypes: ["insuranceClaim", "personalFullRecord"],
    notes:
      "Claim packet scenario with damaged and missing items, values, serial numbers, and report-visible evidence.",
    transportPresets: ["professionalMovers"],
    boxes: [
      {
        code: "CL-001",
        label: "Claim review",
        room: "Living room",
        destinationRoom: "Claims",
        status: "damaged",
        estimatedWeightLb: 20,
        estimatedVolumeCuFt: 3,
        presetKey: "professionalMovers",
      },
    ],
    items: [
      {
        name: "Cracked framed print",
        room: "Living room",
        destinationRoom: "Claims",
        category: "Art",
        disposition: "mover",
        status: "damaged",
        condition: "damaged",
        estimatedWeightLb: 8,
        estimatedVolumeCuFt: 1.5,
        valueCents: 35000,
        replacementValueCents: 45000,
        fragility: "high",
        highValue: true,
        planningDefaultKeys: ["fragile", "highValue"],
        reviewFlags: ["damage claim"],
        boxCode: "CL-001",
        photoTypes: ["damage", "receipt"],
      },
      {
        name: "Missing cordless drill",
        room: "Garage",
        destinationRoom: "Claims",
        category: "Tools",
        disposition: "mover",
        status: "missing",
        condition: "good",
        estimatedWeightLb: 5,
        estimatedVolumeCuFt: 0.8,
        valueCents: 12900,
        replacementValueCents: 15900,
        serialNumber: "DEMO-DRILL-042",
        reviewFlags: ["missing item"],
        photoTypes: ["serialNumber", "receipt"],
      },
    ],
  },
] satisfies DemoSeedScenario[];

export function demoSeedScenarioSummary() {
  return {
    scenarioCount: demoSeedScenarios.length,
    moveTypes: Array.from(new Set(demoSeedScenarios.map((scenario) => scenario.type))),
    documentationProfileTypes: Array.from(
      new Set(demoSeedScenarios.flatMap((scenario) => scenario.documentationProfileTypes))
    ),
    itemCount: demoSeedScenarios.reduce(
      (sum, scenario) => sum + scenario.items.length,
      0
    ),
    boxCount: demoSeedScenarios.reduce(
      (sum, scenario) => sum + scenario.boxes.length,
      0
    ),
  };
}

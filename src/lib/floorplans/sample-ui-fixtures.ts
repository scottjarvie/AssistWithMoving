import type {
  FloorplanRoomLedgerRow,
  FloorplanSymbolKeyItem,
} from "@/lib/floorplans/types";

export const floorplanSymbolKey: FloorplanSymbolKeyItem[] = [
  {
    id: "high-confidence",
    label: "High-confidence room",
    description: "Directly measured room or feature.",
    kind: "confidence",
    confidence: "high",
  },
  {
    id: "medium-confidence",
    label: "Medium-confidence room",
    description: "Fixture-backed or partly measured geometry.",
    kind: "confidence",
    confidence: "medium",
  },
  {
    id: "low-confidence",
    label: "Low-confidence room",
    description: "Known topology without reliable dimensions.",
    kind: "confidence",
    confidence: "low",
  },
  {
    id: "walls",
    label: "Walls",
    description:
      "Heavy continuous outlines with breaks for openings; wall thickness is tracked as its own assumption/evidence.",
    kind: "wall",
  },
  {
    id: "door-swing",
    label: "Door and swing arc",
    description: "Wall gap plus an arc showing the likely swing direction.",
    kind: "opening",
  },
  {
    id: "doorless-passage",
    label: "Doorless or unconfirmed passage",
    description:
      "Wall gap with green dashed center mark. It proves access, but no swinging door is confirmed yet.",
    kind: "opening",
  },
  {
    id: "window",
    label: "Window",
    description: "Wall break with parallel blue drafting marks.",
    kind: "window",
  },
  {
    id: "dimensions",
    label: "Dimension line",
    description: "Measured spans with ticks and labels.",
    kind: "dimension",
  },
  {
    id: "fixtures",
    label: "Fixtures and appliances",
    description:
      "Sink, toilet, tub/shower, washer/dryer, stove, fireplace, and water heater marks.",
    kind: "fixture",
  },
];

export const floorplanRoomLedger: FloorplanRoomLedgerRow[] = [
  {
    id: "area-target",
    room: "Whole house target",
    measurement:
      "2013 sq ft listed conditioned area; patio, carport, workshop, shed excluded",
    confidence: "high",
  },
  {
    id: "lot-target",
    room: "Property lot",
    measurement: "9540 sq ft listed lot area",
    confidence: "high",
  },
  {
    id: "front-living",
    room: "Front living room",
    measurement: "24 ft wide, 17.5 ft noted depth",
    confidence: "high",
  },
  {
    id: "bonus-room",
    room: "Bonus room",
    measurement: "25 ft by 13 ft, 9 ft ceiling",
    confidence: "high",
  },
  {
    id: "laundry",
    room: "Laundry / washery",
    measurement: "10 ft wide, 6 ft side run",
    confidence: "high",
  },
  {
    id: "room-1",
    room: "Room 1",
    measurement: "Derived from overview plus 2013 sq ft reconciliation",
    confidence: "medium",
  },
  {
    id: "kitchen",
    room: "Kitchen",
    measurement: "Fixture layout measured in sections",
    confidence: "medium",
  },
  {
    id: "excluded-zones",
    room: "Excluded property zones",
    measurement:
      "Carport, rear patio/pool deck, workshop, and shed are visible but excluded",
    confidence: "medium",
  },
  {
    id: "bedroom-wing",
    room: "Bedroom wing",
    measurement: "Room 2, Room 3, walled bathroom, closets, one horizontal hall",
    confidence: "low",
  },
  {
    id: "hall",
    room: "Hall",
    measurement: "One left-to-right hall; width/length still approximate",
    confidence: "medium",
  },
];

export const transportResourcePresetKeys = [
  "boxTruck",
  "pickupTruck",
  "trailer7x16",
  "personalVehicle",
  "professionalMovers",
  "militaryMovers",
  "storageUnit",
  "sell",
  "donate",
  "dump",
  "freeGiveaway",
  "unknown",
] as const;

export type TransportResourcePresetKey =
  (typeof transportResourcePresetKeys)[number];

type CapacityPreset = {
  maxWeightLb?: number;
  maxVolumeCuFt?: number;
  dimensions?: {
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
  };
  weightIsUnlimited?: boolean;
  volumeIsUnlimited?: boolean;
};

type TransportResourcePreset = {
  key: TransportResourcePresetKey;
  type:
    | "truck"
    | "trailer"
    | "personalVehicle"
    | "professionalMovers"
    | "militaryMovers"
    | "storage"
    | "dump"
    | "sell"
    | "donate"
    | "freeGiveaway"
    | "unknown";
  name: string;
  description: string;
  capacity: CapacityPreset;
  rules: string[];
  zones: {
    name: string;
    description?: string;
    preferredTags?: string[];
  }[];
};

export const transportResourcePresets: Record<
  TransportResourcePresetKey,
  TransportResourcePreset
> = {
  boxTruck: {
    key: "boxTruck",
    type: "truck",
    name: "Box truck",
    description: "Rental or owned moving truck with cab and cargo box.",
    capacity: { maxWeightLb: 10000, maxVolumeCuFt: 1200 },
    rules: ["heavy low", "fragile protected", "no hazardous items"],
    zones: [
      { name: "Cab", preferredTags: ["documents", "first night"] },
      { name: "Box front", preferredTags: ["heavy", "furniture"] },
      { name: "Box middle", preferredTags: ["boxes"] },
      { name: "Box rear", preferredTags: ["first off", "fragile"] },
    ],
  },
  pickupTruck: {
    key: "pickupTruck",
    type: "truck",
    name: "Pickup truck",
    description: "Personal or rented pickup used for self-move loads.",
    capacity: { maxWeightLb: 1500, maxVolumeCuFt: 80 },
    rules: ["weather sensitive covered", "secure loose items"],
    zones: [
      { name: "Cab", preferredTags: ["documents", "high value"] },
      { name: "Back seat", preferredTags: ["fragile", "first night"] },
      { name: "Bed front", preferredTags: ["heavy"] },
      { name: "Bed rear", preferredTags: ["first off"] },
    ],
  },
  trailer7x16: {
    key: "trailer7x16",
    type: "trailer",
    name: "7x16 trailer",
    description: "Common enclosed trailer size for mixed household goods.",
    capacity: {
      maxWeightLb: 3500,
      maxVolumeCuFt: 746,
      dimensions: { lengthIn: 192, widthIn: 84, heightIn: 80 },
    },
    rules: ["balance weight", "heavy low", "fragile top"],
    zones: [
      { name: "Front left", preferredTags: ["heavy"] },
      { name: "Front right", preferredTags: ["heavy"] },
      { name: "Center", preferredTags: ["boxes"] },
      { name: "Rear", preferredTags: ["first off"] },
      { name: "Fragile top", preferredTags: ["fragile"] },
    ],
  },
  personalVehicle: {
    key: "personalVehicle",
    type: "personalVehicle",
    name: "Personal vehicle",
    description: "Car, SUV, or van carrying sensitive or first-night items.",
    capacity: { maxWeightLb: 600, maxVolumeCuFt: 45 },
    rules: ["good for documents", "good for high value", "avoid bulky items"],
    zones: [
      { name: "Front cabin", preferredTags: ["documents"] },
      { name: "Back seat", preferredTags: ["first night", "fragile"] },
      { name: "Cargo area", preferredTags: ["electronics"] },
    ],
  },
  professionalMovers: {
    key: "professionalMovers",
    type: "professionalMovers",
    name: "Professional movers",
    description: "Mover-handled shipment with app-level mover restrictions.",
    capacity: { weightIsUnlimited: true, volumeIsUnlimited: true },
    rules: ["no private documents", "no valuables unless explicitly approved"],
    zones: [
      { name: "Furniture", preferredTags: ["furniture"] },
      { name: "General boxes", preferredTags: ["boxes"] },
      { name: "Fragile", preferredTags: ["fragile"] },
      { name: "High-value review", preferredTags: ["high value"] },
    ],
  },
  militaryMovers: {
    key: "militaryMovers",
    type: "militaryMovers",
    name: "Military movers / HHG",
    description: "PCS HHG or military-arranged mover channel.",
    capacity: { weightIsUnlimited: true, volumeIsUnlimited: true },
    rules: [
      "verify official restrictions",
      "no hazardous items",
      "high value needs evidence",
    ],
    zones: [
      { name: "HHG furniture", preferredTags: ["furniture"] },
      { name: "HHG boxes", preferredTags: ["boxes"] },
      { name: "Pro gear review", preferredTags: ["pro gear"] },
      { name: "Restricted review", preferredTags: ["restricted"] },
    ],
  },
  storageUnit: {
    key: "storageUnit",
    type: "storage",
    name: "Storage unit",
    description: "Short- or long-term storage destination.",
    capacity: { volumeIsUnlimited: true },
    rules: ["label access priority", "avoid perishables"],
    zones: [
      { name: "Back wall", preferredTags: ["long term"] },
      { name: "Middle", preferredTags: ["boxes"] },
      { name: "Door area", preferredTags: ["access soon"] },
    ],
  },
  sell: {
    key: "sell",
    type: "sell",
    name: "Sell",
    description: "Items planned for sale before or during the move.",
    capacity: { weightIsUnlimited: true, volumeIsUnlimited: true },
    rules: ["hide private notes from buyers", "confirm pickup status"],
    zones: [{ name: "For sale" }, { name: "Sold / waiting pickup" }],
  },
  donate: {
    key: "donate",
    type: "donate",
    name: "Donate",
    description: "Donation pickup or drop-off manifest.",
    capacity: { weightIsUnlimited: true, volumeIsUnlimited: true },
    rules: ["confirm donation acceptance", "keep receipt notes"],
    zones: [{ name: "Donation pickup" }, { name: "Donation drop-off" }],
  },
  dump: {
    key: "dump",
    type: "dump",
    name: "Dump run",
    description: "Trash, disposal, or landfill route.",
    capacity: { weightIsUnlimited: true, volumeIsUnlimited: true },
    rules: ["verify hazardous disposal rules", "separate e-waste"],
    zones: [{ name: "Dump load" }, { name: "Special disposal" }],
  },
  freeGiveaway: {
    key: "freeGiveaway",
    type: "freeGiveaway",
    name: "Free giveaway",
    description: "Free pickup list with private fields hidden.",
    capacity: { weightIsUnlimited: true, volumeIsUnlimited: true },
    rules: ["hide private notes from recipients", "confirm pickup window"],
    zones: [{ name: "Available" }, { name: "Claimed / waiting pickup" }],
  },
  unknown: {
    key: "unknown",
    type: "unknown",
    name: "Unknown / unassigned",
    description: "Holding area for items that need a destination decision.",
    capacity: { weightIsUnlimited: true, volumeIsUnlimited: true },
    rules: ["review before final load plan"],
    zones: [{ name: "Needs decision" }, { name: "Needs measurement" }],
  },
};

export function getTransportResourcePreset(key: TransportResourcePresetKey) {
  return transportResourcePresets[key];
}

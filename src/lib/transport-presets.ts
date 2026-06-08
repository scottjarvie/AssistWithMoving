export const transportResourcePresetOptions = [
  [
    "boxTruck",
    "Box truck",
    "Cab, box front, box middle, box rear",
  ],
  [
    "pickupTruck",
    "Pickup truck",
    "Cab, back seat, bed front, bed rear",
  ],
  [
    "trailer7x16",
    "7x16 trailer",
    "Front left/right, center, rear, fragile top",
  ],
  [
    "personalVehicle",
    "Personal vehicle",
    "Front cabin, back seat, cargo area",
  ],
  [
    "professionalMovers",
    "Professional movers",
    "Furniture, boxes, fragile, high-value review",
  ],
  [
    "militaryMovers",
    "Military movers / HHG",
    "HHG furniture, boxes, pro gear, restricted review",
  ],
  ["storageUnit", "Storage unit", "Back wall, middle, door area"],
  ["sell", "Sell", "For sale, sold / waiting pickup"],
  ["donate", "Donate", "Pickup, drop-off"],
  ["dump", "Dump run", "Dump load, special disposal"],
  ["freeGiveaway", "Free giveaway", "Available, claimed / waiting pickup"],
  ["unknown", "Unknown / unassigned", "Needs decision, needs measurement"],
] as const;

export type TransportResourcePresetKey =
  (typeof transportResourcePresetOptions)[number][0];

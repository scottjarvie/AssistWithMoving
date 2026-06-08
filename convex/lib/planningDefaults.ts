import type {
  documentationProfileTypes,
  planningDefaultHandlings,
  planningDefaultKeys,
  transportResourceTypes,
} from "./moveFields";

export type PlanningDefaultKey = (typeof planningDefaultKeys)[number];
export type PlanningDefaultHandling =
  (typeof planningDefaultHandlings)[number];
export type PlanningDefault = {
  key: PlanningDefaultKey;
  label: string;
  description: string;
  handling: PlanningDefaultHandling;
  sensitiveByDefault: boolean;
  recommendedResourceTypes: (typeof transportResourceTypes)[number][];
  documentationProfileTypes: (typeof documentationProfileTypes)[number][];
};

export const movePlanningDefaultPresets: PlanningDefault[] = [
  {
    key: "firstNight",
    label: "First-night essentials",
    description:
      "Toiletries, bedding, chargers, clothes, pet supplies, snacks, and basic tools needed immediately after arrival.",
    handling: "keepAccessible",
    sensitiveByDefault: false,
    recommendedResourceTypes: ["personalVehicle", "truck"],
    documentationProfileTypes: ["loadCrew", "movingCompany"],
  },
  {
    key: "doNotLetMoversTouch",
    label: "Do not let movers touch",
    description:
      "Items the owner wants in personal transport unless explicitly overridden.",
    handling: "personalTransport",
    sensitiveByDefault: true,
    recommendedResourceTypes: ["personalVehicle"],
    documentationProfileTypes: ["pcsMove", "movingCompany", "loadCrew"],
  },
  {
    key: "highValue",
    label: "High value",
    description:
      "Valuables that should have values, serials, photos, and condition notes before loading.",
    handling: "evidenceRequired",
    sensitiveByDefault: true,
    recommendedResourceTypes: ["personalVehicle", "militaryMovers"],
    documentationProfileTypes: ["pcsMove", "insuranceClaim"],
  },
  {
    key: "documents",
    label: "Documents",
    description:
      "Passports, birth certificates, orders, legal papers, receipts, and other paperwork.",
    handling: "personalTransport",
    sensitiveByDefault: true,
    recommendedResourceTypes: ["personalVehicle"],
    documentationProfileTypes: ["pcsMove", "employerRelocation"],
  },
  {
    key: "medication",
    label: "Medication",
    description:
      "Medication, medical devices, prescriptions, and health-related supplies that should stay accessible.",
    handling: "personalTransport",
    sensitiveByDefault: true,
    recommendedResourceTypes: ["personalVehicle"],
    documentationProfileTypes: ["personalFullRecord"],
  },
  {
    key: "electronics",
    label: "Electronics",
    description:
      "Laptops, drives, cameras, chargers, network gear, and sensitive electronics.",
    handling: "personalTransport",
    sensitiveByDefault: true,
    recommendedResourceTypes: ["personalVehicle", "truck"],
    documentationProfileTypes: ["insuranceClaim", "pcsMove"],
  },
  {
    key: "sensitive",
    label: "Sensitive / private",
    description:
      "Private items whose values, serials, notes, or photos should be hidden from helper and mover views by default.",
    handling: "personalTransport",
    sensitiveByDefault: true,
    recommendedResourceTypes: ["personalVehicle"],
    documentationProfileTypes: ["personalFullRecord"],
  },
  {
    key: "fragile",
    label: "Fragile",
    description:
      "Breakable items needing careful packing, top-load treatment, or photo evidence.",
    handling: "moverAllowedWithReview",
    sensitiveByDefault: false,
    recommendedResourceTypes: ["truck", "trailer", "professionalMovers"],
    documentationProfileTypes: ["movingCompany", "loadCrew", "insuranceClaim"],
  },
  {
    key: "irreplaceable",
    label: "Irreplaceable",
    description:
      "Keepsakes, originals, heirlooms, or one-of-one items where loss would matter more than replacement value.",
    handling: "personalTransport",
    sensitiveByDefault: true,
    recommendedResourceTypes: ["personalVehicle"],
    documentationProfileTypes: ["personalFullRecord", "insuranceClaim"],
  },
  {
    key: "restrictedReview",
    label: "Restricted item review",
    description:
      "Hazardous, prohibited, perishable, fuel, chemical, or mover-restricted items needing verification.",
    handling: "restrictedReview",
    sensitiveByDefault: false,
    recommendedResourceTypes: ["unknown", "dump"],
    documentationProfileTypes: ["pcsMove", "movingCompany", "loadCrew"],
  },
];

export function getMovePlanningDefaults() {
  return movePlanningDefaultPresets;
}

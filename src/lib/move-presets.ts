export const moveTypeOptions = [
  ["pcs", "Military PCS"],
  ["local", "Local move"],
  ["longDistance", "Long-distance"],
  ["storage", "Storage inventory"],
  ["estate", "Estate / cleanout"],
  ["decluttering", "Decluttering"],
  ["claimsInventory", "Claims inventory"],
  ["other", "Other"],
] as const;

export const documentationProfileOptions = [
  ["personalFullRecord", "Personal full record"],
  ["pcsMove", "PCS / HHG / PPM support"],
  ["movingCompany", "Moving company"],
  ["employerRelocation", "Employer relocation"],
  ["insuranceClaim", "Insurance / claims"],
  ["donationPickup", "Donation pickup"],
  ["sellOrGiveaway", "Sell / giveaway"],
  ["storageInventory", "Storage manifest"],
  ["loadCrew", "Load crew"],
] as const;

export const pcsBranchOptions = [
  ["army", "Army"],
  ["navy", "Navy"],
  ["airForce", "Air Force"],
  ["marineCorps", "Marine Corps"],
  ["coastGuard", "Coast Guard"],
  ["spaceForce", "Space Force"],
  ["noaa", "NOAA Corps"],
  ["publicHealthService", "Public Health Service"],
  ["other", "Other"],
] as const;

export const pcsShipmentTypeOptions = [
  ["hhg", "HHG"],
  ["ppm", "PPM"],
  ["partialPpm", "Partial PPM"],
  ["storage", "Storage"],
  ["mixed", "Mixed"],
  ["other", "Other"],
] as const;

export const pcsDependentStatusOptions = [
  ["unknown", "Unknown / not set"],
  ["withDependents", "With dependents"],
  ["withoutDependents", "Without dependents"],
] as const;

export type MoveType = (typeof moveTypeOptions)[number][0];
export type DocumentationProfileType =
  (typeof documentationProfileOptions)[number][0];
export type PcsBranch = (typeof pcsBranchOptions)[number][0];
export type PcsShipmentType = (typeof pcsShipmentTypeOptions)[number][0];
export type PcsDependentStatus =
  (typeof pcsDependentStatusOptions)[number][0];

export function defaultDocumentationProfilesForMoveType(
  type: MoveType
): DocumentationProfileType[] {
  switch (type) {
    case "pcs":
      return ["pcsMove", "movingCompany", "loadCrew"];
    case "local":
    case "longDistance":
      return ["movingCompany", "loadCrew"];
    case "storage":
      return ["storageInventory", "movingCompany"];
    case "estate":
      return ["donationPickup", "sellOrGiveaway", "storageInventory"];
    case "decluttering":
      return ["donationPickup", "sellOrGiveaway"];
    case "claimsInventory":
      return ["insuranceClaim", "personalFullRecord"];
    case "other":
      return ["personalFullRecord"];
  }
}

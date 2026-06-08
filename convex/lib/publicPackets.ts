export const publicPacketProfileTypes = [
  "pcsMove",
  "movingCompany",
  "loadCrew",
  "employerRelocation",
  "insuranceClaim",
] as const;

export type PublicPacketProfileType = (typeof publicPacketProfileTypes)[number];
export type PublicDocumentationPacketKind =
  | "pcs"
  | "movingCompany"
  | "loadCrew"
  | "employer"
  | "claim";

export function publicPacketKindForProfileType(profileType: string) {
  switch (profileType) {
    case "pcsMove":
      return "pcs";
    case "movingCompany":
      return "movingCompany";
    case "loadCrew":
      return "loadCrew";
    case "employerRelocation":
      return "employer";
    case "insuranceClaim":
      return "claim";
    default:
      return null;
  }
}

export function publicPacketTitleForProfileType(profileType: string) {
  switch (profileType) {
    case "pcsMove":
      return "PCS support packet";
    case "movingCompany":
      return "Moving company packet";
    case "loadCrew":
      return "Load crew packet";
    case "employerRelocation":
      return "Employer relocation packet";
    case "insuranceClaim":
      return "Insurance / claims packet";
    default:
      return "Documentation packet";
  }
}

export function publicPacketDisclosure(profileType: string) {
  if (profileType === "insuranceClaim") {
    return {
      valuesHidden: false,
      serialsHidden: false,
      reason:
        "Claim packets can include values and serial/model fields because those are core evidence fields for the selected recipient.",
    };
  }

  return {
    valuesHidden: true,
    serialsHidden: true,
    reason:
      "Recipient packet hides owner-only values, serial/model fields, private notes, raw storage references, and unrelated household data.",
  };
}

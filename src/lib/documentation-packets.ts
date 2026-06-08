export const documentationFieldOptions = [
  ["moveSummary", "Move summary"],
  ["pcsFields", "PCS fields"],
  ["rooms", "Rooms"],
  ["items", "Items"],
  ["boxes", "Boxes"],
  ["loadAssignments", "Load assignments"],
  ["photos", "Photos"],
  ["estimatedValues", "Estimated values"],
  ["purchaseValues", "Purchase values"],
  ["serialNumbers", "Serial/model numbers"],
  ["privateNotes", "Private notes"],
  ["conditionAndDamage", "Condition/damage"],
  ["auditSummary", "Audit summary"],
] as const;

export const documentationImageRuleOptions = [
  ["none", "No photos"],
  ["thumbsOnly", "Thumbnails"],
  ["reviewedEvidence", "Reviewed evidence"],
  ["allAllowed", "All allowed"],
] as const;

export const shareLinkActionOptions = [
  ["view", "View"],
  ["download", "Download"],
  ["statusUpdate", "Status updates"],
  ["comment", "Comment"],
  ["uploadEvidence", "Upload evidence"],
] as const;

export const shareLinkRoleOptions = [
  ["viewer", "Viewer"],
  ["guest", "Guest"],
  ["packer", "Packer"],
  ["editor", "Editor"],
  ["admin", "Admin"],
] as const;

export type DocumentationFieldKey =
  (typeof documentationFieldOptions)[number][0];
export type DocumentationImageRule =
  (typeof documentationImageRuleOptions)[number][0];
export type ShareLinkAction = (typeof shareLinkActionOptions)[number][0];
export type ShareLinkRole = (typeof shareLinkRoleOptions)[number][0];

const fieldLabels = new Map(documentationFieldOptions);
const imageRuleLabels = new Map(documentationImageRuleOptions);
const actionLabels = new Map(shareLinkActionOptions);
const sensitiveFields = new Set<DocumentationFieldKey>([
  "estimatedValues",
  "purchaseValues",
  "serialNumbers",
  "privateNotes",
]);

export type DocumentationProfilePreview = {
  type: string;
  includedFields: string[];
  imageRule: string;
  filters?: {
    dispositions?: string[];
    statuses?: string[];
    planningDefaultKeys?: string[];
    room?: string;
    destinationRoom?: string;
  };
  allowedActions: string[];
};

export function summarizeDocumentationProfile(
  profile: DocumentationProfilePreview
) {
  const includedFieldLabels = profile.includedFields.map((field) =>
    fieldLabels.get(field as DocumentationFieldKey) ?? field
  );
  const hiddenSensitiveFields = Array.from(sensitiveFields)
    .filter((field) => !profile.includedFields.includes(field))
    .map((field) => fieldLabels.get(field) ?? field);
  const filterSummary = summarizeFilters(profile.filters);
  const warnings = evidenceWarnings(profile);

  return {
    includedFieldLabels,
    hiddenSensitiveFields,
    imageRuleLabel:
      imageRuleLabels.get(profile.imageRule as DocumentationImageRule) ??
      profile.imageRule,
    actionLabels: profile.allowedActions.map(
      (action) => actionLabels.get(action as ShareLinkAction) ?? action
    ),
    filterSummary,
    warnings,
  };
}

function summarizeFilters(filters: DocumentationProfilePreview["filters"]) {
  if (!filters) return [];
  const rows = [];
  if (filters.dispositions?.length) {
    rows.push(`Disposition: ${filters.dispositions.join(", ")}`);
  }
  if (filters.statuses?.length) {
    rows.push(`Status: ${filters.statuses.join(", ")}`);
  }
  if (filters.planningDefaultKeys?.length) {
    rows.push(`Tags: ${filters.planningDefaultKeys.join(", ")}`);
  }
  if (filters.room) {
    rows.push(`Room: ${filters.room}`);
  }
  if (filters.destinationRoom) {
    rows.push(`Destination: ${filters.destinationRoom}`);
  }
  return rows;
}

function evidenceWarnings(profile: DocumentationProfilePreview) {
  const warnings = [];
  if (profile.type === "pcsMove" && !profile.includedFields.includes("pcsFields")) {
    warnings.push("PCS packet is missing PCS fields.");
  }
  if (
    (profile.type === "insuranceClaim" || profile.type === "pcsMove") &&
    !profile.includedFields.includes("conditionAndDamage")
  ) {
    warnings.push("Evidence packet is missing condition/damage fields.");
  }
  if (profile.imageRule === "none" && profile.includedFields.includes("photos")) {
    warnings.push("Photo field is included but image rule hides photos.");
  }
  if (profile.type === "movingCompany") {
    const exposedSensitive = profile.includedFields.filter((field) =>
      sensitiveFields.has(field as DocumentationFieldKey)
    );
    if (exposedSensitive.length) {
      warnings.push("Moving company packet includes sensitive private fields.");
    }
  }
  return warnings;
}

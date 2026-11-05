// Fictional records for the actual client components. No account or network.
import { MOVING_SCOPES, NEVER_EXPOSED, NEVER_PERMITTED } from "../../convex/lib/aiGrants";
const moment = Date.UTC(2026, 10, 5, 12);
const scopes = MOVING_SCOPES;
const grants = ["active", "expired", "revoked"].map((status, index) => ({
  grantId: `synthetic-grant-${status}`, label: `[synthetic] ${["Workshop assistant", "Earlier planning connection", "Retired connection"][index]}`,
  status, scopes: index === 0 ? scopes.map(scope => scope.scope) : [scopes[0].scope], moveScope: "selectedMoves", moveIds: ["synthetic-move"],
  observedClientName: "Synthetic client", registrationMethodLabel: "Dynamic registration", consentSnapshot: scopes.filter((_, scopeIndex) => index === 0 || scopeIndex === 0),
  approvedAt: moment - 86400000 * 30, expiresAt: moment + (status === "expired" ? -1 : 30) * 86400000,
  lastUsedAt: moment - 3600000, lastToolName: "get_move_brief", useCount: index === 0 ? 12 : 1,
  revokedAt: status === "revoked" ? moment - 86400000 : null, revokedReason: null, note: "Fictional offline design evidence.", version: 1,
}));
export const items = ["Workshop table", "Reading lamp", "Bookcase", "Blue tools case", "Folding chairs", "Kitchen shelf", "Desk with a long name and a carefully recorded packing note", "Garden bench", "Floor mirror", "Cotton blankets", "Ceramic bowl", "Spare cabinet"].map((name, index) => ({
  _id: `synthetic-item-${index}`, _creationTime: moment - index * 86400000, householdId: "synthetic-household", moveId: "synthetic-move",
  name: `[synthetic] ${name}`, description: "Recorded for the fictional move. Keep the small fittings with the item.", room: index % 2 ? "Workshop" : "Reading room", category: index % 3 ? "Furniture" : "Household",
  ownerContact: null, condition: "good", weightConfidence: "low", volumeConfidence: "medium", status: "active", disposition: index % 4 === 0 ? "donate" : "mover",
  needsReview: index % 3 === 0, highValue: index === 8, requiresPersonalTransport: index === 8, planningDefaultKeys: [],
  actualWeightLb: 18 + index, estimatedVolumeCuFt: 3 + index / 2, dimensionsIn: { lengthIn: 30, widthIn: 20, heightIn: 18 }, dimensionsConfidence: "actual", quantity: 1,
  valueCents: 12000, privateNotes: "Fictional private note: keep the screws in a labelled envelope.",
  signals: { photoCount: 0, evidencePhotoCount: 0, boxCount: 0, assignedBoxCount: 0, assignmentCount: 0, boxCodes: [], assignedResourceNames: [], assignedZoneNames: [] },
}));
const disposition = Object.fromEntries(["mover", "donate"].map(key => [key, items.filter(item => item.disposition === key).length]));
const activity = [0, 1, 2, 3, 4, 5].map(index => ({ _id: `synthetic-event-${index}`, action: index % 2 ? "item.updated" : "item.created", category: "inventory", actorType: index === 1 ? "agent" : "user", createdAt: moment - index * 86400000, metadata: { changedKeys: ["description", "room"] } }));

export function fixtureQuery(query: string, args: unknown) {
  if (args === "skip") return undefined;
  switch (query) {
    case "aiGrants.listMine": return { boundaryVersion: "synthetic-offline", scopes, neverExposed: NEVER_EXPOSED, neverPermitted: NEVER_PERMITTED, grants, activeCount: 1, maxActive: 8 };
    case "aiGrants.listActivity": return { activity: [{ grantId: grants[0].grantId, type: "refused", scope: null, toolName: "synthetic_unapproved_action", clientLabel: "Synthetic client", message: "Synthetic refused request: the grant does not approve this action.", outcome: "refused", createdAt: moment }] };
    case "households.listMine": return [{ household: { _id: "synthetic-household", name: "[synthetic] Example household" }, role: "owner" }];
    case "households.summaryStats": return { moves: [{ moveId: "synthetic-move", title: "[synthetic] Workshop to a new home", status: "active" }], moveCount: 1, archivedMoveCount: 0, itemCount: items.length, boxCount: 0, activeApiKeyCount: 0, activeMemberCount: 1, pendingInvitationCount: 0 };
    case "items.facetedListForMove": return { items, facets: { disposition, total: items.length, moving: disposition.mover, sell: 0, trash: 0, donate: disposition.donate } };
    case "audit.listForObject": return activity;
    case "saleListings.getForItem": return null;
    case "photos.listForMove":
    case "photos.listForItem":
    case "apiKeys.listForHousehold":
    case "movePeople.listForMove":
    case "moveSpaces.listForMove":
    case "transportResources.listForMoveWithZones": return [];
    default: {
      const fixtureWindow = window as Window & { __fixtureUnknownQueries?: string[] };
      fixtureWindow.__fixtureUnknownQueries ??= [];
      if (!fixtureWindow.__fixtureUnknownQueries.includes(query)) fixtureWindow.__fixtureUnknownQueries.push(query);
      return undefined;
    }
  }
}

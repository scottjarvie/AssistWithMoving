/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountPrivacy from "../accountPrivacy.js";
import type * as admin from "../admin.js";
import type * as aiJobs from "../aiJobs.js";
import type * as aiPhotoIntake from "../aiPhotoIntake.js";
import type * as aiPlanningSuggestions from "../aiPlanningSuggestions.js";
import type * as aiTextIntake from "../aiTextIntake.js";
import type * as aiUsage from "../aiUsage.js";
import type * as apiKeys from "../apiKeys.js";
import type * as audit from "../audit.js";
import type * as billing from "../billing.js";
import type * as boxes from "../boxes.js";
import type * as claimCenter from "../claimCenter.js";
import type * as claimPackets from "../claimPackets.js";
import type * as clerkIdentity from "../clerkIdentity.js";
import type * as clerkUsers from "../clerkUsers.js";
import type * as dispositionPipelines from "../dispositionPipelines.js";
import type * as documentationProfiles from "../documentationProfiles.js";
import type * as employerPackets from "../employerPackets.js";
import type * as estimates from "../estimates.js";
import type * as evidenceDensity from "../evidenceDensity.js";
import type * as exports from "../exports.js";
import type * as featureFlags from "../featureFlags.js";
import type * as floorPlans from "../floorPlans.js";
import type * as health from "../health.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as imageDerivatives from "../imageDerivatives.js";
import type * as ingestionQueue from "../ingestionQueue.js";
import type * as inventoryDuplicates from "../inventoryDuplicates.js";
import type * as items from "../items.js";
import type * as lib_accountPrivacy from "../lib/accountPrivacy.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_adminSummaries from "../lib/adminSummaries.js";
import type * as lib_aiPlanningSuggestionWorkflow from "../lib/aiPlanningSuggestionWorkflow.js";
import type * as lib_aiProvider from "../lib/aiProvider.js";
import type * as lib_aiUsage from "../lib/aiUsage.js";
import type * as lib_apiKeyAuth from "../lib/apiKeyAuth.js";
import type * as lib_apiKeys from "../lib/apiKeys.js";
import type * as lib_assignmentValidation from "../lib/assignmentValidation.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_batchAssign from "../lib/batchAssign.js";
import type * as lib_billing from "../lib/billing.js";
import type * as lib_boxWeight from "../lib/boxWeight.js";
import type * as lib_claimCenter from "../lib/claimCenter.js";
import type * as lib_claimPacket from "../lib/claimPacket.js";
import type * as lib_clerk from "../lib/clerk.js";
import type * as lib_demoSeed from "../lib/demoSeed.js";
import type * as lib_dispositionPipelines from "../lib/dispositionPipelines.js";
import type * as lib_documentation from "../lib/documentation.js";
import type * as lib_employerPacket from "../lib/employerPacket.js";
import type * as lib_estimateEngine from "../lib/estimateEngine.js";
import type * as lib_evidenceDensity from "../lib/evidenceDensity.js";
import type * as lib_exportRows from "../lib/exportRows.js";
import type * as lib_featureFlags from "../lib/featureFlags.js";
import type * as lib_householdInvitations from "../lib/householdInvitations.js";
import type * as lib_householdMembers from "../lib/householdMembers.js";
import type * as lib_imageDerivatives from "../lib/imageDerivatives.js";
import type * as lib_ingestionQueue from "../lib/ingestionQueue.js";
import type * as lib_inventoryDuplicates from "../lib/inventoryDuplicates.js";
import type * as lib_mcpIdentity from "../lib/mcpIdentity.js";
import type * as lib_mediaStorage from "../lib/mediaStorage.js";
import type * as lib_moveAccess from "../lib/moveAccess.js";
import type * as lib_moveDayChecklist from "../lib/moveDayChecklist.js";
import type * as lib_moveFields from "../lib/moveFields.js";
import type * as lib_moveParticipantClaim from "../lib/moveParticipantClaim.js";
import type * as lib_moveParticipantWrite from "../lib/moveParticipantWrite.js";
import type * as lib_moveQuestionDocuments from "../lib/moveQuestionDocuments.js";
import type * as lib_moveQuestions from "../lib/moveQuestions.js";
import type * as lib_moverPacket from "../lib/moverPacket.js";
import type * as lib_observability from "../lib/observability.js";
import type * as lib_packingDebt from "../lib/packingDebt.js";
import type * as lib_participants from "../lib/participants.js";
import type * as lib_pcsPacket from "../lib/pcsPacket.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_photoCleanup from "../lib/photoCleanup.js";
import type * as lib_photoDelivery from "../lib/photoDelivery.js";
import type * as lib_photoIntake from "../lib/photoIntake.js";
import type * as lib_photoVisibility from "../lib/photoVisibility.js";
import type * as lib_planValidators from "../lib/planValidators.js";
import type * as lib_planningDefaults from "../lib/planningDefaults.js";
import type * as lib_planningSuggestions from "../lib/planningSuggestions.js";
import type * as lib_publicPackets from "../lib/publicPackets.js";
import type * as lib_publicPlanView from "../lib/publicPlanView.js";
import type * as lib_publicShareComments from "../lib/publicShareComments.js";
import type * as lib_publicShareStatus from "../lib/publicShareStatus.js";
import type * as lib_queueAccess from "../lib/queueAccess.js";
import type * as lib_restApi from "../lib/restApi.js";
import type * as lib_restUploadBody from "../lib/restUploadBody.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_shareLinks from "../lib/shareLinks.js";
import type * as lib_subManifest from "../lib/subManifest.js";
import type * as lib_textIntakeParser from "../lib/textIntakeParser.js";
import type * as lib_transportPresets from "../lib/transportPresets.js";
import type * as mcp from "../mcp.js";
import type * as mcpSetup from "../mcpSetup.js";
import type * as mcpTools from "../mcpTools.js";
import type * as mcpToolsImages from "../mcpToolsImages.js";
import type * as mcpToolsQueue from "../mcpToolsQueue.js";
import type * as mcpToolsSetup from "../mcpToolsSetup.js";
import type * as mcpToolsWrite from "../mcpToolsWrite.js";
import type * as movableUnits from "../movableUnits.js";
import type * as moveParticipants from "../moveParticipants.js";
import type * as movePeople from "../movePeople.js";
import type * as movePlanningDefaults from "../movePlanningDefaults.js";
import type * as moveQuestions from "../moveQuestions.js";
import type * as moveSpaces from "../moveSpaces.js";
import type * as moverPackets from "../moverPackets.js";
import type * as moves from "../moves.js";
import type * as observability from "../observability.js";
import type * as packingDebt from "../packingDebt.js";
import type * as pcsPackets from "../pcsPackets.js";
import type * as photos from "../photos.js";
import type * as planOps from "../planOps.js";
import type * as plannedItems from "../plannedItems.js";
import type * as publicPackets from "../publicPackets.js";
import type * as restApi from "../restApi.js";
import type * as restApiActions from "../restApiActions.js";
import type * as rest_documentationProfiles from "../rest/documentationProfiles.js";
import type * as saleListings from "../saleListings.js";
import type * as seed from "../seed.js";
import type * as shareLinks from "../shareLinks.js";
import type * as subManifests from "../subManifests.js";
import type * as testSupport from "../testSupport.js";
import type * as transportResources from "../transportResources.js";
import type * as transportTrips from "../transportTrips.js";
import type * as transportZones from "../transportZones.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountPrivacy: typeof accountPrivacy;
  admin: typeof admin;
  aiJobs: typeof aiJobs;
  aiPhotoIntake: typeof aiPhotoIntake;
  aiPlanningSuggestions: typeof aiPlanningSuggestions;
  aiTextIntake: typeof aiTextIntake;
  aiUsage: typeof aiUsage;
  apiKeys: typeof apiKeys;
  audit: typeof audit;
  billing: typeof billing;
  boxes: typeof boxes;
  claimCenter: typeof claimCenter;
  claimPackets: typeof claimPackets;
  clerkIdentity: typeof clerkIdentity;
  clerkUsers: typeof clerkUsers;
  dispositionPipelines: typeof dispositionPipelines;
  documentationProfiles: typeof documentationProfiles;
  employerPackets: typeof employerPackets;
  estimates: typeof estimates;
  evidenceDensity: typeof evidenceDensity;
  exports: typeof exports;
  featureFlags: typeof featureFlags;
  floorPlans: typeof floorPlans;
  health: typeof health;
  households: typeof households;
  http: typeof http;
  imageDerivatives: typeof imageDerivatives;
  ingestionQueue: typeof ingestionQueue;
  inventoryDuplicates: typeof inventoryDuplicates;
  items: typeof items;
  "lib/accountPrivacy": typeof lib_accountPrivacy;
  "lib/admin": typeof lib_admin;
  "lib/adminSummaries": typeof lib_adminSummaries;
  "lib/aiPlanningSuggestionWorkflow": typeof lib_aiPlanningSuggestionWorkflow;
  "lib/aiProvider": typeof lib_aiProvider;
  "lib/aiUsage": typeof lib_aiUsage;
  "lib/apiKeyAuth": typeof lib_apiKeyAuth;
  "lib/apiKeys": typeof lib_apiKeys;
  "lib/assignmentValidation": typeof lib_assignmentValidation;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/batchAssign": typeof lib_batchAssign;
  "lib/billing": typeof lib_billing;
  "lib/boxWeight": typeof lib_boxWeight;
  "lib/claimCenter": typeof lib_claimCenter;
  "lib/claimPacket": typeof lib_claimPacket;
  "lib/clerk": typeof lib_clerk;
  "lib/demoSeed": typeof lib_demoSeed;
  "lib/dispositionPipelines": typeof lib_dispositionPipelines;
  "lib/documentation": typeof lib_documentation;
  "lib/employerPacket": typeof lib_employerPacket;
  "lib/estimateEngine": typeof lib_estimateEngine;
  "lib/evidenceDensity": typeof lib_evidenceDensity;
  "lib/exportRows": typeof lib_exportRows;
  "lib/featureFlags": typeof lib_featureFlags;
  "lib/householdInvitations": typeof lib_householdInvitations;
  "lib/householdMembers": typeof lib_householdMembers;
  "lib/imageDerivatives": typeof lib_imageDerivatives;
  "lib/ingestionQueue": typeof lib_ingestionQueue;
  "lib/inventoryDuplicates": typeof lib_inventoryDuplicates;
  "lib/mcpIdentity": typeof lib_mcpIdentity;
  "lib/mediaStorage": typeof lib_mediaStorage;
  "lib/moveAccess": typeof lib_moveAccess;
  "lib/moveDayChecklist": typeof lib_moveDayChecklist;
  "lib/moveFields": typeof lib_moveFields;
  "lib/moveParticipantClaim": typeof lib_moveParticipantClaim;
  "lib/moveParticipantWrite": typeof lib_moveParticipantWrite;
  "lib/moveQuestionDocuments": typeof lib_moveQuestionDocuments;
  "lib/moveQuestions": typeof lib_moveQuestions;
  "lib/moverPacket": typeof lib_moverPacket;
  "lib/observability": typeof lib_observability;
  "lib/packingDebt": typeof lib_packingDebt;
  "lib/participants": typeof lib_participants;
  "lib/pcsPacket": typeof lib_pcsPacket;
  "lib/permissions": typeof lib_permissions;
  "lib/photoCleanup": typeof lib_photoCleanup;
  "lib/photoDelivery": typeof lib_photoDelivery;
  "lib/photoIntake": typeof lib_photoIntake;
  "lib/photoVisibility": typeof lib_photoVisibility;
  "lib/planValidators": typeof lib_planValidators;
  "lib/planningDefaults": typeof lib_planningDefaults;
  "lib/planningSuggestions": typeof lib_planningSuggestions;
  "lib/publicPackets": typeof lib_publicPackets;
  "lib/publicPlanView": typeof lib_publicPlanView;
  "lib/publicShareComments": typeof lib_publicShareComments;
  "lib/publicShareStatus": typeof lib_publicShareStatus;
  "lib/queueAccess": typeof lib_queueAccess;
  "lib/restApi": typeof lib_restApi;
  "lib/restUploadBody": typeof lib_restUploadBody;
  "lib/roles": typeof lib_roles;
  "lib/shareLinks": typeof lib_shareLinks;
  "lib/subManifest": typeof lib_subManifest;
  "lib/textIntakeParser": typeof lib_textIntakeParser;
  "lib/transportPresets": typeof lib_transportPresets;
  mcp: typeof mcp;
  mcpSetup: typeof mcpSetup;
  mcpTools: typeof mcpTools;
  mcpToolsImages: typeof mcpToolsImages;
  mcpToolsQueue: typeof mcpToolsQueue;
  mcpToolsSetup: typeof mcpToolsSetup;
  mcpToolsWrite: typeof mcpToolsWrite;
  movableUnits: typeof movableUnits;
  moveParticipants: typeof moveParticipants;
  movePeople: typeof movePeople;
  movePlanningDefaults: typeof movePlanningDefaults;
  moveQuestions: typeof moveQuestions;
  moveSpaces: typeof moveSpaces;
  moverPackets: typeof moverPackets;
  moves: typeof moves;
  observability: typeof observability;
  packingDebt: typeof packingDebt;
  pcsPackets: typeof pcsPackets;
  photos: typeof photos;
  planOps: typeof planOps;
  plannedItems: typeof plannedItems;
  publicPackets: typeof publicPackets;
  restApi: typeof restApi;
  restApiActions: typeof restApiActions;
  "rest/documentationProfiles": typeof rest_documentationProfiles;
  saleListings: typeof saleListings;
  seed: typeof seed;
  shareLinks: typeof shareLinks;
  subManifests: typeof subManifests;
  testSupport: typeof testSupport;
  transportResources: typeof transportResources;
  transportTrips: typeof transportTrips;
  transportZones: typeof transportZones;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  mcpGateway: import("convex-mcp-gateway/_generated/component.js").ComponentApi<"mcpGateway">;
};

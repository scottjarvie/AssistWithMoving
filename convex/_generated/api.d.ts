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
import type * as claimPackets from "../claimPackets.js";
import type * as clerkUsers from "../clerkUsers.js";
import type * as documentationProfiles from "../documentationProfiles.js";
import type * as employerPackets from "../employerPackets.js";
import type * as estimates from "../estimates.js";
import type * as exports from "../exports.js";
import type * as featureFlags from "../featureFlags.js";
import type * as health from "../health.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as lib_accountPrivacy from "../lib/accountPrivacy.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_adminSummaries from "../lib/adminSummaries.js";
import type * as lib_aiProvider from "../lib/aiProvider.js";
import type * as lib_aiUsage from "../lib/aiUsage.js";
import type * as lib_apiKeyAuth from "../lib/apiKeyAuth.js";
import type * as lib_apiKeys from "../lib/apiKeys.js";
import type * as lib_assignmentValidation from "../lib/assignmentValidation.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_billing from "../lib/billing.js";
import type * as lib_claimPacket from "../lib/claimPacket.js";
import type * as lib_clerk from "../lib/clerk.js";
import type * as lib_documentation from "../lib/documentation.js";
import type * as lib_employerPacket from "../lib/employerPacket.js";
import type * as lib_estimateEngine from "../lib/estimateEngine.js";
import type * as lib_exportRows from "../lib/exportRows.js";
import type * as lib_featureFlags from "../lib/featureFlags.js";
import type * as lib_moveFields from "../lib/moveFields.js";
import type * as lib_moverPacket from "../lib/moverPacket.js";
import type * as lib_observability from "../lib/observability.js";
import type * as lib_pcsPacket from "../lib/pcsPacket.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_photoDelivery from "../lib/photoDelivery.js";
import type * as lib_photoIntake from "../lib/photoIntake.js";
import type * as lib_photoVisibility from "../lib/photoVisibility.js";
import type * as lib_planningDefaults from "../lib/planningDefaults.js";
import type * as lib_planningSuggestions from "../lib/planningSuggestions.js";
import type * as lib_restApi from "../lib/restApi.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_subManifest from "../lib/subManifest.js";
import type * as lib_textIntakeParser from "../lib/textIntakeParser.js";
import type * as lib_transportPresets from "../lib/transportPresets.js";
import type * as movePeople from "../movePeople.js";
import type * as movePlanningDefaults from "../movePlanningDefaults.js";
import type * as moverPackets from "../moverPackets.js";
import type * as moves from "../moves.js";
import type * as observability from "../observability.js";
import type * as pcsPackets from "../pcsPackets.js";
import type * as photos from "../photos.js";
import type * as restApi from "../restApi.js";
import type * as restApiActions from "../restApiActions.js";
import type * as shareLinks from "../shareLinks.js";
import type * as subManifests from "../subManifests.js";
import type * as transportResources from "../transportResources.js";
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
  claimPackets: typeof claimPackets;
  clerkUsers: typeof clerkUsers;
  documentationProfiles: typeof documentationProfiles;
  employerPackets: typeof employerPackets;
  estimates: typeof estimates;
  exports: typeof exports;
  featureFlags: typeof featureFlags;
  health: typeof health;
  households: typeof households;
  http: typeof http;
  items: typeof items;
  "lib/accountPrivacy": typeof lib_accountPrivacy;
  "lib/admin": typeof lib_admin;
  "lib/adminSummaries": typeof lib_adminSummaries;
  "lib/aiProvider": typeof lib_aiProvider;
  "lib/aiUsage": typeof lib_aiUsage;
  "lib/apiKeyAuth": typeof lib_apiKeyAuth;
  "lib/apiKeys": typeof lib_apiKeys;
  "lib/assignmentValidation": typeof lib_assignmentValidation;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/billing": typeof lib_billing;
  "lib/claimPacket": typeof lib_claimPacket;
  "lib/clerk": typeof lib_clerk;
  "lib/documentation": typeof lib_documentation;
  "lib/employerPacket": typeof lib_employerPacket;
  "lib/estimateEngine": typeof lib_estimateEngine;
  "lib/exportRows": typeof lib_exportRows;
  "lib/featureFlags": typeof lib_featureFlags;
  "lib/moveFields": typeof lib_moveFields;
  "lib/moverPacket": typeof lib_moverPacket;
  "lib/observability": typeof lib_observability;
  "lib/pcsPacket": typeof lib_pcsPacket;
  "lib/permissions": typeof lib_permissions;
  "lib/photoDelivery": typeof lib_photoDelivery;
  "lib/photoIntake": typeof lib_photoIntake;
  "lib/photoVisibility": typeof lib_photoVisibility;
  "lib/planningDefaults": typeof lib_planningDefaults;
  "lib/planningSuggestions": typeof lib_planningSuggestions;
  "lib/restApi": typeof lib_restApi;
  "lib/roles": typeof lib_roles;
  "lib/subManifest": typeof lib_subManifest;
  "lib/textIntakeParser": typeof lib_textIntakeParser;
  "lib/transportPresets": typeof lib_transportPresets;
  movePeople: typeof movePeople;
  movePlanningDefaults: typeof movePlanningDefaults;
  moverPackets: typeof moverPackets;
  moves: typeof moves;
  observability: typeof observability;
  pcsPackets: typeof pcsPackets;
  photos: typeof photos;
  restApi: typeof restApi;
  restApiActions: typeof restApiActions;
  shareLinks: typeof shareLinks;
  subManifests: typeof subManifests;
  transportResources: typeof transportResources;
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

export declare const components: {};

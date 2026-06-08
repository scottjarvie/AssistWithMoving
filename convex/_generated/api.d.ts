/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as clerkUsers from "../clerkUsers.js";
import type * as health from "../health.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_clerk from "../lib/clerk.js";
import type * as lib_moveFields from "../lib/moveFields.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_planningDefaults from "../lib/planningDefaults.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_transportPresets from "../lib/transportPresets.js";
import type * as movePeople from "../movePeople.js";
import type * as movePlanningDefaults from "../movePlanningDefaults.js";
import type * as moves from "../moves.js";
import type * as transportResources from "../transportResources.js";
import type * as transportZones from "../transportZones.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  clerkUsers: typeof clerkUsers;
  health: typeof health;
  households: typeof households;
  http: typeof http;
  items: typeof items;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/clerk": typeof lib_clerk;
  "lib/moveFields": typeof lib_moveFields;
  "lib/permissions": typeof lib_permissions;
  "lib/planningDefaults": typeof lib_planningDefaults;
  "lib/roles": typeof lib_roles;
  "lib/transportPresets": typeof lib_transportPresets;
  movePeople: typeof movePeople;
  movePlanningDefaults: typeof movePlanningDefaults;
  moves: typeof moves;
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

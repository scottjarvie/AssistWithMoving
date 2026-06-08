#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  addItemsToBox,
  applyAssignments,
  batchUpsertItems,
  attachPhoto,
  archiveDocumentationProfile,
  createApiConfig,
  createBox,
  createDocumentationProfile,
  createExport,
  createItem,
  createMove,
  createTransportResource,
  createTransportZone,
  deleteItem,
  downloadExport,
  getApiContext,
  getCapacityReport,
  getMoveSummary,
  listDocumentationProfiles,
  listExports,
  listMoves,
  listShareLinks,
  listTransportResources,
  removeItemFromBox,
  revokeShareLink,
  searchInventory,
  startPhotoUpload,
  suggestAssignments,
  textResult,
  toolErrorResult,
  updateDocumentationProfile,
  updateTransportResource,
  updateTransportZone,
  updateItem,
  createShareLink,
} from "./movingmanifest-api.mjs";

const capacityInputSchema = z.object({
  maxWeightLb: z.number().nonnegative().optional(),
  maxVolumeCuFt: z.number().nonnegative().optional(),
  maxItemCount: z.number().int().nonnegative().optional(),
  dimensions: z
    .object({
      lengthIn: z.number().nonnegative().optional(),
      widthIn: z.number().nonnegative().optional(),
      heightIn: z.number().nonnegative().optional(),
    })
    .optional(),
  weightIsUnlimited: z.boolean().optional(),
  volumeIsUnlimited: z.boolean().optional(),
});

const documentationProfileTypeSchema = z.enum([
  "personalFullRecord",
  "pcsMove",
  "movingCompany",
  "employerRelocation",
  "insuranceClaim",
  "donationPickup",
  "sellOrGiveaway",
  "storageInventory",
  "loadCrew",
]);

const documentationFieldSchema = z.enum([
  "moveSummary",
  "pcsFields",
  "rooms",
  "items",
  "boxes",
  "loadAssignments",
  "photos",
  "estimatedValues",
  "purchaseValues",
  "serialNumbers",
  "privateNotes",
  "conditionAndDamage",
  "auditSummary",
]);

const documentationImageRuleSchema = z.enum([
  "none",
  "thumbsOnly",
  "reviewedEvidence",
  "allAllowed",
]);

const documentationStatusSchema = z.enum(["draft", "active", "archived"]);

const shareLinkActionSchema = z.enum([
  "view",
  "download",
  "statusUpdate",
  "comment",
  "uploadEvidence",
]);

const documentationFiltersSchema = z.object({
  dispositions: z
    .array(
      z.enum([
        "undecided",
        "take",
        "sell",
        "donate",
        "dump",
        "free",
        "storage",
        "mover",
        "personalTransport",
      ])
    )
    .optional(),
  statuses: z
    .array(
      z.enum([
        "draft",
        "active",
        "packed",
        "staged",
        "loaded",
        "delivered",
        "missing",
        "damaged",
        "archived",
      ])
    )
    .optional(),
  planningDefaultKeys: z
    .array(
      z.enum([
        "firstNight",
        "doNotLetMoversTouch",
        "highValue",
        "documents",
        "medication",
        "electronics",
        "sensitive",
        "fragile",
        "irreplaceable",
        "restrictedReview",
      ])
    )
    .optional(),
  room: z.string().optional(),
  destinationRoom: z.string().optional(),
});

export function createMovingManifestMcpServer(apiConfig) {
  const target = new McpServer({
    name: "movingmanifest",
    version: "0.1.0",
    websiteUrl: "https://movingmanifest.com",
  });
  registerTools(target, apiConfig);
  return target;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const config = createApiConfig();
  const server = createMovingManifestMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function registerTools(target, apiConfig) {
  registerTool(target, "get_api_context", {
    title: "Get API context",
    description:
      "Inspect the current MovingManifest API key context, including scopes and any move restriction.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: () => getApiContext(apiConfig),
  });

  registerTool(target, "list_moves", {
    title: "List moves",
    description:
      "List accessible MovingManifest moves. Requires an API key with moves/read scope.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listMoves(apiConfig, input),
  });

  registerTool(target, "create_move", {
    title: "Create move",
    description:
      "Create a move using a household-scoped API key with moves/write. Set dryRun true to preview the request without writing.",
    inputSchema: {
      title: z.string().min(1),
      type: z.string().optional(),
      origin: z.string().optional(),
      destination: z.string().optional(),
      dateStart: z.string().optional(),
      dateEnd: z.string().optional(),
      unitSystem: z.enum(["imperial", "metric"]).optional(),
      documentationProfileTypes: z.array(z.string()).optional(),
      moveLevelWeightAllowanceLb: z.number().positive().optional(),
      pcsBranch: z.string().optional(),
      pcsRankPayGrade: z.string().optional(),
      pcsDependentStatus: z.string().optional(),
      pcsShipmentType: z.string().optional(),
      pcsOrdersNumber: z.string().optional(),
      pcsAllowanceNotes: z.string().optional(),
      pcsTransportationOfficeNotes: z.string().optional(),
      pcsRestrictedItemsNotes: z.string().optional(),
      proGearNotes: z.string().optional(),
      notes: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createMove(apiConfig, input),
  });

  registerTool(target, "get_move_summary", {
    title: "Get move summary",
    description:
      "Fetch a compact move summary with resources, zones, inventory, boxes, assignments, and photo metadata.",
    inputSchema: {
      moveId: z.string().describe("MovingManifest move id."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => getMoveSummary(apiConfig, input),
  });

  registerTool(target, "search_inventory", {
    title: "Search inventory",
    description:
      "Search inventory by text after applying optional API-side status/disposition filters.",
    inputSchema: {
      moveId: z.string(),
      query: z.string().optional(),
      status: z.string().optional(),
      disposition: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => searchInventory(apiConfig, input),
  });

  registerTool(target, "create_item", {
    title: "Create item",
    description:
      "Create one inventory item. Set dryRun true to preview the API request without writing.",
    inputSchema: {
      moveId: z.string(),
      name: z.string().min(1),
      externalSource: z.string().optional(),
      externalId: z.string().optional(),
      description: z.string().optional(),
      room: z.string().optional(),
      destinationRoom: z.string().optional(),
      category: z.string().optional(),
      disposition: z.string().optional(),
      status: z.string().optional(),
      quantity: z.number().positive().optional(),
      condition: z.string().optional(),
      valueCents: z.number().int().nonnegative().optional(),
      replacementValueCents: z.number().int().nonnegative().optional(),
      serialNumber: z.string().optional(),
      modelNumber: z.string().optional(),
      highValue: z.boolean().optional(),
      needsReview: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createItem(apiConfig, input),
  });

  registerTool(target, "batch_upsert_items", {
    title: "Batch upsert items",
    description:
      "Create or update up to 100 inventory items. Rows with itemId update existing items; rows without itemId create new items. Set dryRun true to validate without writing.",
    inputSchema: {
      moveId: z.string(),
      items: z
        .array(
          z.object({
            itemId: z.string().optional(),
            externalSource: z.string().optional(),
            externalId: z.string().optional(),
            name: z.string().optional(),
            description: z.string().optional(),
            room: z.string().optional(),
            destinationRoom: z.string().optional(),
            category: z.string().optional(),
            subcategory: z.string().optional(),
            disposition: z.string().optional(),
            status: z.string().optional(),
            quantity: z.number().positive().optional(),
            condition: z.string().optional(),
            valueCents: z.number().int().nonnegative().optional(),
            replacementValueCents: z.number().int().nonnegative().optional(),
            serialNumber: z.string().optional(),
            modelNumber: z.string().optional(),
            estimatedWeightLb: z.number().nonnegative().optional(),
            actualWeightLb: z.number().nonnegative().optional(),
            estimatedVolumeCuFt: z.number().nonnegative().optional(),
            highValue: z.boolean().optional(),
            needsReview: z.boolean().optional(),
          })
        )
        .min(1)
        .max(100),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => batchUpsertItems(apiConfig, input),
  });

  registerTool(target, "update_item", {
    title: "Update item",
    description:
      "Update selected item fields. Set dryRun true to preview the API request without writing.",
    inputSchema: {
      moveId: z.string(),
      itemId: z.string(),
      externalSource: z.string().optional(),
      externalId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      room: z.string().optional(),
      destinationRoom: z.string().optional(),
      category: z.string().optional(),
      disposition: z.string().optional(),
      status: z.string().optional(),
      quantity: z.number().positive().optional(),
      condition: z.string().optional(),
      valueCents: z.number().int().nonnegative().optional(),
      replacementValueCents: z.number().int().nonnegative().optional(),
      serialNumber: z.string().optional(),
      modelNumber: z.string().optional(),
      highValue: z.boolean().optional(),
      needsReview: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => updateItem(apiConfig, input),
  });

  registerTool(target, "delete_item", {
    title: "Delete item",
    description:
      "Soft-delete one inventory item. Set dryRun true to preview the request without writing.",
    inputSchema: {
      moveId: z.string(),
      itemId: z.string(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (input) => deleteItem(apiConfig, input),
  });

  registerTool(target, "create_box", {
    title: "Create box",
    description:
      "Create one box/container record. Set dryRun true to preview the API request without writing.",
    inputSchema: {
      moveId: z.string(),
      code: z.string().optional(),
      label: z.string().optional(),
      room: z.string().optional(),
      destinationRoom: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      estimatedWeightLb: z.number().nonnegative().optional(),
      actualWeightLb: z.number().nonnegative().optional(),
      estimatedVolumeCuFt: z.number().nonnegative().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createBox(apiConfig, input),
  });

  registerTool(target, "add_items_to_box", {
    title: "Add items to box",
    description:
      "Assign multiple items to a box. Set dryRun true to preview the assignments without writing.",
    inputSchema: {
      moveId: z.string(),
      boxId: z.string(),
      items: z.array(
        z.object({
          itemId: z.string(),
          quantity: z.number().positive().optional(),
          notes: z.string().optional(),
        })
      ),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => addItemsToBox(apiConfig, input),
  });

  registerTool(target, "remove_item_from_box", {
    title: "Remove item from box",
    description:
      "Remove one item-to-box assignment without deleting the inventory item. Set dryRun true to preview the request without writing.",
    inputSchema: {
      moveId: z.string(),
      boxId: z.string(),
      itemId: z.string(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (input) => removeItemFromBox(apiConfig, input),
  });

  registerTool(target, "suggest_assignments", {
    title: "Suggest assignments",
    description:
      "Generate deterministic box-to-resource/zone assignment suggestions using MovingManifest load planner validation. This does not write changes.",
    inputSchema: {
      moveId: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => suggestAssignments(apiConfig, input),
  });

  registerTool(target, "apply_assignments", {
    title: "Apply assignments",
    description:
      "Apply explicit box-to-resource/zone assignments. Use dryRun true first to validate warnings, hard blocks, and locked boxes without writing.",
    inputSchema: {
      moveId: z.string(),
      assignments: z
        .array(
          z.object({
            boxId: z.string(),
            assignedResourceId: z.string(),
            assignedZoneId: z.string().optional(),
            overrideReason: z.string().optional(),
          })
        )
        .min(1)
        .max(100),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => applyAssignments(apiConfig, input),
  });

  registerTool(target, "start_photo_upload", {
    title: "Start photo upload",
    description:
      "Create a presigned photo upload session. The client must PUT the file to the returned URL and then call the REST finalize endpoint.",
    inputSchema: {
      moveId: z.string(),
      itemId: z.string().optional(),
      boxId: z.string().optional(),
      room: z.string().optional(),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    handler: (input) => startPhotoUpload(apiConfig, input),
  });

  registerTool(target, "attach_photo", {
    title: "Attach photo",
    description:
      "Attach or update photo evidence metadata after upload finalization. Supports item, box, room, caption, privacy, documentation profile, and review fields.",
    inputSchema: {
      moveId: z.string(),
      photoId: z.string(),
      itemId: z.string().optional(),
      boxId: z.string().optional(),
      room: z.string().optional(),
      claimId: z.string().optional(),
      documentationProfileTypes: z.array(z.string()).optional(),
      caption: z.string().optional(),
      photoType: z.string().optional(),
      privacyLevel: z.string().optional(),
      visibilityScope: z.string().optional(),
      source: z.string().optional(),
      exifHandlingStatus: z.string().optional(),
      confidence: z.string().optional(),
      notes: z.string().optional(),
      verificationStatus: z.string().optional(),
      aiProcessed: z.boolean().optional(),
      capturedAt: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => attachPhoto(apiConfig, input),
  });

  registerTool(target, "list_transport_resources", {
    title: "List transport resources",
    description: "List transport resources and zones for load planning.",
    inputSchema: {
      moveId: z.string(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listTransportResources(apiConfig, input),
  });

  registerTool(target, "create_transport_resource", {
    title: "Create transport resource",
    description:
      "Create a truck, trailer, mover channel, storage unit, disposal, sale, donation, or custom transport resource. Use presetKey for built-in resource templates.",
    inputSchema: {
      moveId: z.string(),
      presetKey: z.string().optional(),
      type: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      capacity: capacityInputSchema.optional(),
      rules: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createTransportResource(apiConfig, input),
  });

  registerTool(target, "update_transport_resource", {
    title: "Update transport resource",
    description:
      "Update a transport resource's name, description, type, capacity, rules, or sort order.",
    inputSchema: {
      moveId: z.string(),
      resourceId: z.string(),
      type: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      capacity: capacityInputSchema.optional(),
      rules: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => updateTransportResource(apiConfig, input),
  });

  registerTool(target, "create_transport_zone", {
    title: "Create transport zone",
    description:
      "Create a zone inside a transport resource, such as cab, trailer front, storage doorway, donation pickup, or claimed giveaway.",
    inputSchema: {
      moveId: z.string(),
      resourceId: z.string(),
      name: z.string(),
      description: z.string().optional(),
      capacity: capacityInputSchema.optional(),
      preferredTags: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createTransportZone(apiConfig, input),
  });

  registerTool(target, "update_transport_zone", {
    title: "Update transport zone",
    description:
      "Update a transport zone's resource, name, description, capacity, preferred tags, or sort order.",
    inputSchema: {
      moveId: z.string(),
      zoneId: z.string(),
      resourceId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      capacity: capacityInputSchema.optional(),
      preferredTags: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => updateTransportZone(apiConfig, input),
  });

  registerTool(target, "get_capacity_report", {
    title: "Get capacity report",
    description:
      "Fetch move-level weight/volume estimates, box reports, resource capacity usage, zone usage, and missing-estimate counts.",
    inputSchema: {
      moveId: z.string(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => getCapacityReport(apiConfig, input),
  });

  registerTool(target, "list_documentation_profiles", {
    title: "List documentation profiles",
    description: "List scoped documentation profiles for a move.",
    inputSchema: {
      moveId: z.string(),
      status: documentationStatusSchema.optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listDocumentationProfiles(apiConfig, input),
  });

  registerTool(target, "create_documentation_profile", {
    title: "Create documentation profile",
    description:
      "Create a scoped packet profile for PCS, movers, employers, claims, donation, sell/free, storage, or load crew workflows.",
    inputSchema: {
      moveId: z.string(),
      type: documentationProfileTypeSchema,
      status: z.enum(["draft", "active"]).optional(),
      name: z.string().optional(),
      includedFields: z.array(documentationFieldSchema).optional(),
      imageRule: documentationImageRuleSchema.optional(),
      filters: documentationFiltersSchema.optional(),
      allowedActions: z.array(shareLinkActionSchema).optional(),
      disclaimer: z.string().optional(),
      ownerNotes: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createDocumentationProfile(apiConfig, input),
  });

  registerTool(target, "update_documentation_profile", {
    title: "Update documentation profile",
    description:
      "Update selected documentation profile settings such as fields, filters, image rules, status, or allowed share-link actions.",
    inputSchema: {
      moveId: z.string(),
      documentationProfileId: z.string(),
      type: documentationProfileTypeSchema.optional(),
      status: documentationStatusSchema.optional(),
      name: z.string().optional(),
      includedFields: z.array(documentationFieldSchema).optional(),
      imageRule: documentationImageRuleSchema.optional(),
      filters: documentationFiltersSchema.optional(),
      allowedActions: z.array(shareLinkActionSchema).optional(),
      disclaimer: z.string().optional(),
      ownerNotes: z.string().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => updateDocumentationProfile(apiConfig, input),
  });

  registerTool(target, "archive_documentation_profile", {
    title: "Archive documentation profile",
    description: "Archive a documentation profile so it is hidden from default lists.",
    inputSchema: {
      moveId: z.string(),
      documentationProfileId: z.string(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (input) => archiveDocumentationProfile(apiConfig, input),
  });

  registerTool(target, "create_export", {
    title: "Create export",
    description:
      "Create a CSV export for inventory, boxes, assignments, or a documentation profile.",
    inputSchema: {
      moveId: z.string(),
      type: z.enum(["inventory", "boxes", "assignments", "documentationProfile"]),
      documentationProfileId: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createExport(apiConfig, input),
  });

  registerTool(target, "list_exports", {
    title: "List exports",
    description: "List server-generated exports for a move.",
    inputSchema: {
      moveId: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listExports(apiConfig, input),
  });

  registerTool(target, "download_export", {
    title: "Download export",
    description: "Return an unexpired export artifact as text.",
    inputSchema: {
      moveId: z.string(),
      exportJobId: z.string(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => downloadExport(apiConfig, input),
  });

  registerTool(target, "list_share_links", {
    title: "List share links",
    description:
      "List safe metadata for documentation share links. Raw tokens are never returned from this list.",
    inputSchema: {
      moveId: z.string(),
      status: z.enum(["active", "revoked"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listShareLinks(apiConfig, input),
  });

  registerTool(target, "create_share_link", {
    title: "Create share link",
    description:
      "Create a scoped documentation share link. The raw token is returned only once in the create response; store it carefully.",
    inputSchema: {
      moveId: z.string(),
      documentationProfileId: z.string().optional(),
      scope: z.enum(["move", "profile"]).optional(),
      label: z.string().optional(),
      role: z
        .enum(["owner", "admin", "editor", "packer", "viewer", "guest"])
        .optional(),
      allowedActions: z
        .array(
          z.enum(["view", "download", "statusUpdate", "comment", "uploadEvidence"])
        )
        .optional(),
      expiresAt: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (input) => createShareLink(apiConfig, input),
  });

  registerTool(target, "revoke_share_link", {
    title: "Revoke share link",
    description:
      "Revoke a documentation share link so the public token can no longer be used.",
    inputSchema: {
      moveId: z.string(),
      shareLinkId: z.string(),
      dryRun: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (input) => revokeShareLink(apiConfig, input),
  });
}

function registerTool(target, name, config) {
  target.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: config.annotations,
    },
    async (input) => {
      try {
        return textResult(await config.handler(input));
      } catch (error) {
        return toolErrorResult(error);
      }
    }
  );
}

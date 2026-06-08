#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  addItemsToBox,
  batchUpsertItems,
  createApiConfig,
  createBox,
  createExport,
  createItem,
  createTransportResource,
  createTransportZone,
  downloadExport,
  getCapacityReport,
  getMoveSummary,
  listDocumentationProfiles,
  listExports,
  listMoves,
  listTransportResources,
  searchInventory,
  startPhotoUpload,
  textResult,
  toolErrorResult,
  updateTransportResource,
  updateTransportZone,
  updateItem,
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
    description: "List active scoped documentation profiles for a move.",
    inputSchema: {
      moveId: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (input) => listDocumentationProfiles(apiConfig, input),
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

import type {
  Doc,
  Id,
} from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
import { getAiProviderStatus } from "../lib/aiProvider";
import {
  aiUsageLimits,
  assertAiUsageAllowed,
  inputBytesFromText,
} from "../lib/aiUsage";
import {
  itemFragilities,
  normalizeBoxCode,
  normalizeItemName,
  normalizeOptionalText,
  normalizedSearchName,
  planningDefaultKeys,
} from "../lib/moveFields";
import {
  approvePlanningSuggestions,
  createPlanningSuggestionsForMove,
  rejectPlanningSuggestions,
} from "../lib/aiPlanningSuggestionWorkflow";
import { suggestFromPhotoIntake } from "../lib/photoIntake";
import { canUsePhotoDerivativeForAi } from "../lib/photoVisibility";
import { parseTextIntakeSuggestions } from "../lib/textIntakeParser";
import {
  bodyRecord as bodyObject,
  paginate,
  restError,
  restOk,
  type RestRequestInput,
} from "../lib/rest/core";
import { requireApiPhotoById } from "../lib/rest/require";
import {
  safePlanningSuggestion,
  safeAiJob,
  safeAiTextSuggestion,
  safeAiPhotoSuggestion,
} from "../lib/rest/safe";
import { auditApiWrite } from "../lib/rest/audit";
import {
  positiveNumber,
  asString,
  optionalString,
  parseDisposition,
  parsePlanningSuggestionStatus,
  parseAiJobStatus,
  parseAiSuggestionStatus,
  parseLiteralArray,
  parseIdArray,
  removeUndefined,
  includesLiteral,
} from "../lib/rest/parse";
import { parsePlanningApprovals } from "../lib/rest/patch";

export async function routePlanningSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  suggestionIdSegment?: string,
  actionSegment?: string
) {
  if (args.method === "GET") {
    const suggestions = await ctx.db
      .query("aiPlanningSuggestions")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    const status = parsePlanningSuggestionStatus(args.query.status);
    const visibleSuggestions = suggestions.filter(
      (suggestion) =>
        suggestion.householdId === auth.householdId &&
        (status ? suggestion.status === status : true)
    );
    if (suggestionIdSegment && !actionSegment) {
      const suggestion = visibleSuggestions.find(
        (entry) => entry._id === suggestionIdSegment
      );
      if (!suggestion) {
        throw new Error("AI planning suggestion not found.");
      }
      return restOk({ data: safePlanningSuggestion(suggestion) });
    }
    if (!suggestionIdSegment) {
      return restOk(
        paginate(visibleSuggestions.map((entry) => safePlanningSuggestion(entry)), args.query)
      );
    }
  }

  if (
    args.method === "POST" &&
    suggestionIdSegment === "generate" &&
    !actionSegment
  ) {
    const result = await createPlanningSuggestionsForMove(ctx, {
      householdId: auth.householdId,
      moveId,
      actor: {
        type: "apiKey",
        userId: auth.createdByUserId,
        apiKeyId: auth.apiKeyId,
      },
    });
    const suggestions = await Promise.all(
      result.suggestionIds.map((suggestionId) => ctx.db.get(suggestionId))
    );
    return restOk(
      {
        data: {
          aiJobId: result.aiJobId,
          suggestionIds: result.suggestionIds,
          suggestions: suggestions
            .filter((entry): entry is Doc<"aiPlanningSuggestions"> => Boolean(entry))
            .map((entry) => safePlanningSuggestion(entry)),
        },
      },
      201
    );
  }

  if (
    args.method === "POST" &&
    suggestionIdSegment === "approve" &&
    !actionSegment
  ) {
    const approvals = parsePlanningApprovals(args.body);
    const result = await approvePlanningSuggestions(ctx, {
      householdId: auth.householdId,
      moveId,
      actor: {
        type: "apiKey",
        userId: auth.createdByUserId,
        apiKeyId: auth.apiKeyId,
      },
      approvals,
    });
    return restOk({ data: result });
  }

  if (
    args.method === "POST" &&
    suggestionIdSegment === "reject" &&
    !actionSegment
  ) {
    const body = bodyObject(args.body);
    const suggestionIds = parseIdArray(body.suggestionIds).map(
      (suggestionId) => suggestionId as Id<"aiPlanningSuggestions">
    );
    if (!suggestionIds.length) {
      return restError({
        status: 400,
        code: "invalid_suggestions",
        message: "suggestionIds must include at least one suggestion ID.",
      });
    }
    const result = await rejectPlanningSuggestions(ctx, {
      householdId: auth.householdId,
      moveId,
      actor: {
        type: "apiKey",
        userId: auth.createdByUserId,
        apiKeyId: auth.apiKeyId,
      },
      suggestionIds,
    });
    return restOk({ data: result });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Planning suggestion route not found.",
  });
}

export async function routeAiJobs(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  aiJobIdSegment?: string
) {
  if (args.method !== "GET") {
    return restError({
      status: 404,
      code: "not_found",
      message: "AI job route not found.",
    });
  }

  if (aiJobIdSegment === "provider-status") {
    return restOk({
      data: {
        ...getAiProviderStatus(),
        generatedAt: Date.now(),
      },
    });
  }

  const jobs = await ctx.db
    .query("aiJobs")
    .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
    .order("desc")
    .collect();
  const status = parseAiJobStatus(args.query.status);
  const visibleJobs = jobs.filter(
    (job) =>
      job.householdId === auth.householdId &&
      (status ? job.status === status : true)
  );

  if (aiJobIdSegment) {
    const job = visibleJobs.find((entry) => entry._id === aiJobIdSegment);
    if (!job) {
      throw new Error("AI job not found.");
    }
    return restOk({ data: safeAiJob(job) });
  }

  return restOk(paginate(visibleJobs.map((job) => safeAiJob(job)), args.query));
}

export async function routeAiTextSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  suggestionIdSegment?: string
) {
  if (args.method === "POST" && suggestionIdSegment === "generate") {
    return await routeGenerateAiTextSuggestions(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && suggestionIdSegment === "approve") {
    return await routeApproveAiTextSuggestions(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && suggestionIdSegment === "reject") {
    return await routeRejectAiTextSuggestions(ctx, args, auth, moveId);
  }

  if (args.method !== "GET") {
    return restError({
      status: 404,
      code: "not_found",
      message: "AI text suggestion route not found.",
    });
  }

  const suggestions = await ctx.db
    .query("aiTextSuggestions")
    .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
    .order("desc")
    .collect();
  const status = parseAiSuggestionStatus(args.query.status);
  const visibleSuggestions = suggestions.filter(
    (suggestion) =>
      suggestion.householdId === auth.householdId &&
      (status ? suggestion.status === status : true)
  );

  if (suggestionIdSegment) {
    const suggestion = visibleSuggestions.find(
      (entry) => entry._id === suggestionIdSegment
    );
    if (!suggestion) {
      throw new Error("AI text suggestion not found.");
    }
    return restOk({ data: safeAiTextSuggestion(suggestion) });
  }

  return restOk(
    paginate(
      visibleSuggestions.map((suggestion) => safeAiTextSuggestion(suggestion)),
      args.query
    )
  );
}

export async function routeAiPhotoSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  suggestionIdSegment?: string
) {
  if (args.method === "POST" && suggestionIdSegment === "generate") {
    return await routeGenerateAiPhotoSuggestions(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && suggestionIdSegment === "approve") {
    return await routeApproveAiPhotoSuggestions(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && suggestionIdSegment === "reject") {
    return await routeRejectAiPhotoSuggestions(ctx, args, auth, moveId);
  }

  if (args.method !== "GET") {
    return restError({
      status: 404,
      code: "not_found",
      message: "AI photo suggestion route not found.",
    });
  }

  const suggestions = await ctx.db
    .query("aiPhotoSuggestions")
    .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
    .order("desc")
    .collect();
  const status = parseAiSuggestionStatus(args.query.status);
  const visibleSuggestions = suggestions.filter(
    (suggestion) =>
      suggestion.householdId === auth.householdId &&
      (status ? suggestion.status === status : true)
  );

  if (suggestionIdSegment) {
    const suggestion = visibleSuggestions.find(
      (entry) => entry._id === suggestionIdSegment
    );
    if (!suggestion) {
      throw new Error("AI photo suggestion not found.");
    }
    return restOk({ data: safeAiPhotoSuggestion(suggestion) });
  }

  return restOk(
    paginate(
      visibleSuggestions.map((suggestion) => safeAiPhotoSuggestion(suggestion)),
      args.query
    )
  );
}

type RestAiTextItemDraft = NonNullable<Doc<"aiTextSuggestions">["itemDraft"]>;

type RestAiTextBoxDraft = NonNullable<Doc<"aiTextSuggestions">["boxDraft"]>;

type RestAiPhotoItemDraft = NonNullable<Doc<"aiPhotoSuggestions">["itemDraft"]>;

type RestAiPhotoBoxDraft = NonNullable<Doc<"aiPhotoSuggestions">["boxDraft"]>;

type RestAiTextApproval = {
  suggestionId: Id<"aiTextSuggestions">;
  itemDraft?: RestAiTextItemDraft;
  boxDraft?: RestAiTextBoxDraft;
};

type RestAiPhotoApproval = {
  suggestionId: Id<"aiPhotoSuggestions">;
  itemDraft?: RestAiPhotoItemDraft;
  boxDraft?: RestAiPhotoBoxDraft;
};

async function routeGenerateAiTextSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const sourceText = parseAiTextGenerationSource(args.body);
  await assertAiUsageAllowed(ctx, {
    householdId: auth.householdId,
    moveId,
    userId: auth.createdByUserId,
    inputSizeBytes: inputBytesFromText(sourceText),
    estimatedCents: 0,
  });

  const parsed = parseTextIntakeSuggestions(sourceText).slice(0, 80);
  if (!parsed.length) {
    throw new Error("No inventory suggestions could be found in that text.");
  }

  const now = Date.now();
  const aiJobId = await ctx.db.insert("aiJobs", {
    householdId: auth.householdId,
    moveId,
    type: "inventoryExtraction",
    status: "succeeded",
    modality: "text",
    provider: "mock",
    model: "text-intake-parser-v1",
    inputRef: { source: "apiAiTextIntake", sourceText },
    inputSummary: sourceText.slice(0, 500),
    outputRef: {
      suggestionCount: parsed.length,
      itemCount: parsed.filter((suggestion) => suggestion.type === "item")
        .length,
      boxCount: parsed.filter((suggestion) => suggestion.type === "box").length,
    },
    outputSummary: `${parsed.length} text intake suggestions created.`,
    confidence: "medium",
    reviewStatus: "unreviewed",
    tokenUsage: {
      inputTokens: Math.max(32, Math.ceil(sourceText.length / 4)),
      outputTokens: parsed.length * 32,
      totalTokens:
        Math.max(32, Math.ceil(sourceText.length / 4)) + parsed.length * 32,
    },
    cost: {
      estimatedCents: 0,
      actualCents: 0,
      currency: "USD",
    },
    retryCount: 0,
    maxRetries: 0,
    createdByUserId: auth.createdByUserId,
    createdByApiKeyId: auth.apiKeyId,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const suggestionIds: Id<"aiTextSuggestions">[] = [];
  for (const suggestion of parsed) {
    const suggestionId = await ctx.db.insert("aiTextSuggestions", {
      householdId: auth.householdId,
      moveId,
      aiJobId,
      type: suggestion.type,
      status: "pending",
      sourceText,
      sourceLine: suggestion.sourceLine,
      sourceIndex: suggestion.sourceIndex,
      confidence: suggestion.confidence,
      reasoning: suggestion.reasoning,
      itemDraft: suggestion.itemDraft
        ? normalizeApiAiTextItemDraft(suggestion.itemDraft)
        : undefined,
      boxDraft: suggestion.boxDraft
        ? normalizeApiAiTextBoxDraft(suggestion.boxDraft)
        : undefined,
      createdByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    suggestionIds.push(suggestionId);
  }

  await auditApiWrite(
    ctx,
    auth,
    moveId,
    "ai_text_intake.api_created",
    "aiJobs",
    aiJobId,
    { suggestionCount: suggestionIds.length }
  );

  const suggestions = await Promise.all(
    suggestionIds.map((suggestionId) => ctx.db.get(suggestionId))
  );
  return restOk(
    {
      data: {
        aiJobId,
        suggestionIds,
        suggestions: suggestions
          .filter((entry): entry is Doc<"aiTextSuggestions"> => Boolean(entry))
          .map((entry) => safeAiTextSuggestion(entry)),
      },
    },
    201
  );
}

async function routeGenerateAiPhotoSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const photoIds = parseAiPhotoGenerationIds(args.body);
  const results = [];
  const createdAiJobIds: Id<"aiJobs">[] = [];
  const allSuggestionIds: Id<"aiPhotoSuggestions">[] = [];

  for (const photoId of photoIds) {
    const photo = await requireApiPhotoById(ctx, auth.householdId, photoId);
    if (photo.moveId !== moveId) {
      throw new Error("Photo not found.");
    }
    if (!canUsePhotoDerivativeForAi(photo)) {
      throw new Error(
        "Photo privacy or derivative status does not allow AI intake."
      );
    }
    if (photo.sizeBytes > aiUsageLimits.maxPhotoInputBytes) {
      throw new Error("Photo is too large for AI intake.");
    }

    const existingPending = await ctx.db
      .query("aiPhotoSuggestions")
      .withIndex("by_photo_status", (q) =>
        q.eq("photoId", photo._id).eq("status", "pending")
      )
      .collect();
    if (existingPending.length) {
      const suggestionIds = existingPending.map((suggestion) => suggestion._id);
      allSuggestionIds.push(...suggestionIds);
      results.push({
        photoId: photo._id,
        aiJobId: existingPending[0].aiJobId,
        suggestionIds,
        reusedPending: true,
      });
      continue;
    }

    await assertAiUsageAllowed(ctx, {
      householdId: auth.householdId,
      moveId,
      userId: auth.createdByUserId,
      inputSizeBytes: photo.sizeBytes,
      estimatedCents: 0,
    });

    const duplicatePhotoIds = await duplicatePhotoIdsForApiMove(ctx, photo);
    const suggestions = suggestFromPhotoIntake({
      photoId: photo._id,
      caption: photo.caption,
      room: photo.room,
      photoType: photo.photoType,
      privacyLevel: photo.privacyLevel,
      width: photo.width,
      height: photo.height,
      duplicatePhotoIds,
    }).slice(0, 12);

    const now = Date.now();
    const aiJobId = await ctx.db.insert("aiJobs", {
      householdId: auth.householdId,
      moveId,
      type: "photoIntake",
      status: "succeeded",
      modality: "vision",
      provider: "mock",
      model: "photo-intake-parser-v1",
      inputRef: {
        source: "apiAiPhotoIntake",
        photoId: photo._id,
        derivativeVariant: "card",
      },
      inputSummary:
        photo.width && photo.height
          ? `${photo.photoType} photo ${photo.width}x${photo.height}`
          : `${photo.photoType} photo`,
      outputRef: {
        suggestionCount: suggestions.length,
        duplicatePhotoIds,
      },
      outputSummary: `${suggestions.length} photo intake suggestions created.`,
      confidence: "medium",
      reviewStatus: "unreviewed",
      tokenUsage: {
        inputTokens: 512,
        outputTokens: suggestions.length * 48,
        totalTokens: 512 + suggestions.length * 48,
      },
      cost: {
        estimatedCents: 0,
        actualCents: 0,
        currency: "USD",
      },
      retryCount: 0,
      maxRetries: 0,
      createdByUserId: auth.createdByUserId,
      createdByApiKeyId: auth.apiKeyId,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const suggestionIds: Id<"aiPhotoSuggestions">[] = [];
    for (const suggestion of suggestions) {
      const suggestionId = await ctx.db.insert("aiPhotoSuggestions", {
        householdId: auth.householdId,
        moveId,
        photoId: photo._id,
        aiJobId,
        type: suggestion.type,
        status: "pending",
        sourceDerivativeVariant: suggestion.sourceDerivativeVariant,
        sourceSummary: suggestion.sourceSummary,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning,
        itemDraft: suggestion.itemDraft
          ? normalizeApiAiPhotoItemDraft(suggestion.itemDraft)
          : undefined,
        boxDraft: suggestion.boxDraft
          ? normalizeApiAiPhotoBoxDraft(suggestion.boxDraft)
          : undefined,
        duplicatePhotoIds: suggestion.duplicatePhotoIds as
          | Id<"itemPhotos">[]
          | undefined,
        createdByUserId: auth.createdByUserId,
        createdAt: now,
        updatedAt: now,
      });
      suggestionIds.push(suggestionId);
    }

    await ctx.db.patch(photo._id, {
      aiProcessed: true,
      verificationStatus: "needsReview",
      updatedAt: now,
    });

    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "ai_photo_intake.api_created",
      "aiJobs",
      aiJobId,
      { photoId: photo._id, suggestionCount: suggestionIds.length }
    );

    createdAiJobIds.push(aiJobId);
    allSuggestionIds.push(...suggestionIds);
    results.push({
      photoId: photo._id,
      aiJobId,
      suggestionIds,
      reusedPending: false,
    });
  }

  const suggestions = await Promise.all(
    allSuggestionIds.map((suggestionId) => ctx.db.get(suggestionId))
  );
  return restOk(
    {
      data: {
        aiJobIds: createdAiJobIds,
        suggestionIds: allSuggestionIds,
        results,
        suggestions: suggestions
          .filter((entry): entry is Doc<"aiPhotoSuggestions"> => Boolean(entry))
          .map((entry) => safeAiPhotoSuggestion(entry)),
      },
    },
    createdAiJobIds.length ? 201 : 200
  );
}

async function routeApproveAiTextSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const { dryRun, approvals } = parseAiTextApprovals(args.body);
  const loaded = await loadPendingApiAiTextSuggestions(
    ctx,
    auth.householdId,
    moveId,
    approvals
  );
  const now = Date.now();
  const boxIdsByLabel = new Map<string, Id<"boxes">>();
  const createdItemIds: Id<"items">[] = [];
  const createdBoxIds: Id<"boxes">[] = [];
  const assignmentIds: Id<"boxItems">[] = [];
  const results = [];

  for (const { suggestion, approval } of loaded.filter(
    (entry) => entry.suggestion.type === "box"
  )) {
    const draft =
      approval.boxDraft ?? normalizeApiAiTextBoxDraft(suggestion.boxDraft);
    if (!draft) {
      results.push({
        suggestionId: suggestion._id,
        type: suggestion.type,
        action: "skipped",
        reason: "Suggestion has no box draft.",
        dryRun,
      });
      continue;
    }
    const action = approval.boxDraft ? "edit" : "approve";
    if (dryRun) {
      results.push({
        suggestionId: suggestion._id,
        type: suggestion.type,
        action,
        plannedBoxLabel: draft.label,
        plannedBoxCode: draft.code,
        dryRun,
      });
      continue;
    }

    const { boxId, created } = await ensureApiBoxFromAiTextDraft(ctx, {
      auth,
      moveId,
      draft,
      now,
    });
    boxIdsByLabel.set(normalizeApiAiBoxLabelKey(draft.label), boxId);
    if (created) pushUniqueId(createdBoxIds, boxId);
    await ctx.db.patch(suggestion._id, {
      status: action === "edit" ? "edited" : "approved",
      approvedBoxId: boxId,
      reviewedByUserId: auth.createdByUserId,
      reviewedAt: now,
      updatedAt: now,
    });
    results.push({
      suggestionId: suggestion._id,
      type: suggestion.type,
      action,
      approvedBoxId: boxId,
      createdBox: created,
      dryRun,
    });
  }

  for (const { suggestion, approval } of loaded.filter(
    (entry) => entry.suggestion.type === "item"
  )) {
    const draft =
      approval.itemDraft ?? normalizeApiAiTextItemDraft(suggestion.itemDraft);
    if (!draft) {
      results.push({
        suggestionId: suggestion._id,
        type: suggestion.type,
        action: "skipped",
        reason: "Suggestion has no item draft.",
        dryRun,
      });
      continue;
    }
    const action = approval.itemDraft ? "edit" : "approve";
    if (dryRun) {
      const existingBox = draft.suggestedBoxLabel
        ? await findApiAiBoxByLabel(ctx, moveId, draft.suggestedBoxLabel)
        : null;
      results.push({
        suggestionId: suggestion._id,
        type: suggestion.type,
        action,
        plannedItemName: draft.name,
        plannedBoxLabel: draft.suggestedBoxLabel,
        wouldUseExistingBox: Boolean(existingBox),
        dryRun,
      });
      continue;
    }

    const itemId = await createApiItemFromAiTextDraft(ctx, {
      auth,
      moveId,
      draft,
      now,
    });
    createdItemIds.push(itemId);
    let approvedBoxId: Id<"boxes"> | undefined;
    let assignmentId: Id<"boxItems"> | undefined;

    if (draft.suggestedBoxLabel) {
      const labelKey = normalizeApiAiBoxLabelKey(draft.suggestedBoxLabel);
      approvedBoxId = boxIdsByLabel.get(labelKey);
      if (!approvedBoxId) {
        const createdBox = await ensureApiBoxFromAiTextDraft(ctx, {
          auth,
          moveId,
          draft: {
            label: draft.suggestedBoxLabel,
            room: draft.room,
            destinationRoom: draft.destinationRoom,
            description: "Created from approved AI text intake contents.",
          },
          now,
        });
        approvedBoxId = createdBox.boxId;
        boxIdsByLabel.set(labelKey, approvedBoxId);
        if (createdBox.created) pushUniqueId(createdBoxIds, approvedBoxId);
      }
      assignmentId = await addApiAiTextItemToBox(ctx, {
        auth,
        moveId,
        boxId: approvedBoxId,
        itemId,
        quantity: draft.quantity,
        now,
      });
      assignmentIds.push(assignmentId);
    }

    await ctx.db.patch(suggestion._id, {
      status: action === "edit" ? "edited" : "approved",
      approvedItemId: itemId,
      approvedBoxId,
      reviewedByUserId: auth.createdByUserId,
      reviewedAt: now,
      updatedAt: now,
    });
    results.push({
      suggestionId: suggestion._id,
      type: suggestion.type,
      action,
      approvedItemId: itemId,
      approvedBoxId,
      assignmentId,
      dryRun,
    });
  }

  if (!dryRun) {
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "ai_text_intake.api_approved",
      "aiTextSuggestions",
      moveId,
      {
        suggestionIds: loaded.map((entry) => entry.suggestion._id),
        createdItemIds,
        createdBoxIds,
        assignmentIds,
      }
    );
  }

  return restOk({
    data: {
      dryRun,
      reviewedSuggestionIds: loaded.map((entry) => entry.suggestion._id),
      createdItemIds,
      createdBoxIds,
      assignmentIds,
      results,
    },
  });
}

async function routeRejectAiTextSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const suggestionIds = parseAiSuggestionIds(
    bodyObject(args.body).suggestionIds,
    "suggestionIds"
  ) as Id<"aiTextSuggestions">[];
  const loaded = await loadPendingApiAiTextSuggestions(
    ctx,
    auth.householdId,
    moveId,
    suggestionIds.map((suggestionId) => ({ suggestionId }))
  );
  const now = Date.now();
  for (const { suggestion } of loaded) {
    await ctx.db.patch(suggestion._id, {
      status: "rejected",
      reviewedByUserId: auth.createdByUserId,
      reviewedAt: now,
      updatedAt: now,
    });
  }
  await auditApiWrite(
    ctx,
    auth,
    moveId,
    "ai_text_intake.api_rejected",
    "aiTextSuggestions",
    moveId,
    { suggestionIds }
  );
  return restOk({ data: { rejectedSuggestionIds: suggestionIds } });
}

async function routeApproveAiPhotoSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const { dryRun, approvals } = parseAiPhotoApprovals(args.body);
  const loaded = await loadPendingApiAiPhotoSuggestions(
    ctx,
    auth.householdId,
    moveId,
    approvals
  );
  const now = Date.now();
  const createdItemIds: Id<"items">[] = [];
  const createdBoxIds: Id<"boxes">[] = [];
  const results = [];

  for (const { suggestion, approval } of loaded) {
    const itemDraft =
      approval.itemDraft ?? normalizeApiAiPhotoItemDraft(suggestion.itemDraft);
    const boxDraft =
      approval.boxDraft ?? normalizeApiAiPhotoBoxDraft(suggestion.boxDraft);
    const action = approval.itemDraft || approval.boxDraft ? "edit" : "approve";

    if (dryRun) {
      results.push({
        suggestionId: suggestion._id,
        type: suggestion.type,
        action,
        plannedItemName: itemDraft?.name,
        plannedBoxLabel: boxDraft?.label,
        dryRun,
      });
      continue;
    }

    let approvedItemId: Id<"items"> | undefined;
    let approvedBoxId: Id<"boxes"> | undefined;

    if (boxDraft) {
      approvedBoxId = await createApiBoxFromAiPhotoDraft(ctx, {
        auth,
        moveId,
        draft: boxDraft,
        now,
      });
      createdBoxIds.push(approvedBoxId);
      await ctx.db.patch(suggestion.photoId, {
        boxId: approvedBoxId,
        verificationStatus: "verified",
        reviewedByUserId: auth.createdByUserId,
        reviewedAt: now,
        updatedAt: now,
      });
    }

    if (itemDraft) {
      approvedItemId = await createApiItemFromAiPhotoDraft(ctx, {
        auth,
        moveId,
        draft: itemDraft,
        photoId: suggestion.photoId,
        now,
      });
      createdItemIds.push(approvedItemId);
      await ctx.db.patch(suggestion.photoId, {
        itemId: approvedItemId,
        verificationStatus: "verified",
        reviewedByUserId: auth.createdByUserId,
        reviewedAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(suggestion._id, {
      status: action === "edit" ? "edited" : "approved",
      approvedItemId,
      approvedBoxId,
      reviewedByUserId: auth.createdByUserId,
      reviewedAt: now,
      updatedAt: now,
    });
    results.push({
      suggestionId: suggestion._id,
      type: suggestion.type,
      action,
      approvedItemId,
      approvedBoxId,
      dryRun,
    });
  }

  if (!dryRun) {
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "ai_photo_intake.api_approved",
      "aiPhotoSuggestions",
      moveId,
      {
        suggestionIds: loaded.map((entry) => entry.suggestion._id),
        createdItemIds,
        createdBoxIds,
      }
    );
  }

  return restOk({
    data: {
      dryRun,
      reviewedSuggestionIds: loaded.map((entry) => entry.suggestion._id),
      createdItemIds,
      createdBoxIds,
      results,
    },
  });
}

async function routeRejectAiPhotoSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const suggestionIds = parseAiSuggestionIds(
    bodyObject(args.body).suggestionIds,
    "suggestionIds"
  ) as Id<"aiPhotoSuggestions">[];
  const loaded = await loadPendingApiAiPhotoSuggestions(
    ctx,
    auth.householdId,
    moveId,
    suggestionIds.map((suggestionId) => ({ suggestionId }))
  );
  const now = Date.now();
  for (const { suggestion } of loaded) {
    await ctx.db.patch(suggestion._id, {
      status: "rejected",
      reviewedByUserId: auth.createdByUserId,
      reviewedAt: now,
      updatedAt: now,
    });
  }
  await auditApiWrite(
    ctx,
    auth,
    moveId,
    "ai_photo_intake.api_rejected",
    "aiPhotoSuggestions",
    moveId,
    { suggestionIds }
  );
  return restOk({ data: { rejectedSuggestionIds: suggestionIds } });
}

async function loadPendingApiAiTextSuggestions(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  approvals: RestAiTextApproval[]
) {
  const loaded: {
    suggestion: Doc<"aiTextSuggestions">;
    approval: RestAiTextApproval;
  }[] = [];
  for (const approval of approvals) {
    const suggestion = await ctx.db.get(approval.suggestionId);
    if (
      !suggestion ||
      suggestion.householdId !== householdId ||
      suggestion.moveId !== moveId
    ) {
      throw new Error("AI text suggestion not found.");
    }
    if (suggestion.status !== "pending") {
      throw new Error("Only pending AI text suggestions can be reviewed.");
    }
    loaded.push({ suggestion, approval });
  }
  return loaded;
}

async function loadPendingApiAiPhotoSuggestions(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  approvals: RestAiPhotoApproval[]
) {
  const loaded: {
    suggestion: Doc<"aiPhotoSuggestions">;
    approval: RestAiPhotoApproval;
  }[] = [];
  for (const approval of approvals) {
    const suggestion = await ctx.db.get(approval.suggestionId);
    if (
      !suggestion ||
      suggestion.householdId !== householdId ||
      suggestion.moveId !== moveId
    ) {
      throw new Error("AI photo suggestion not found.");
    }
    if (suggestion.status !== "pending") {
      throw new Error("Only pending AI photo suggestions can be reviewed.");
    }
    loaded.push({ suggestion, approval });
  }
  return loaded;
}

async function createApiItemFromAiTextDraft(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    draft: RestAiTextItemDraft;
    now: number;
  }
) {
  const name = normalizeItemName(args.draft.name);
  const itemId = await ctx.db.insert("items", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    name,
    normalizedName: normalizedSearchName(name),
    description: normalizeOptionalText(args.draft.description),
    room: normalizeOptionalText(args.draft.room),
    destinationRoom: normalizeOptionalText(args.draft.destinationRoom),
    category: normalizeOptionalText(args.draft.category),
    disposition: args.draft.disposition,
    status: "active",
    quantity: positiveNumber(args.draft.quantity) ?? 1,
    condition: "unknown",
    dimensionsConfidence: "none",
    weightConfidence: "none",
    volumeConfidence: "none",
    fragility: args.draft.fragility ?? "low",
    stackable: true,
    hazardousFlag: false,
    highValue: args.draft.highValue ?? false,
    requiresPersonalTransport:
      args.draft.disposition === "personalTransport" ||
      args.draft.planningDefaultKeys?.includes("sensitive") === true,
    planningDefaultKeys: args.draft.planningDefaultKeys ?? [],
    needsReview: false,
    reviewFlags: [],
    aiSummary: `Approved from text intake: ${args.draft.suggestedBoxLabel ?? args.draft.room ?? "move notes"}.`,
    aiTags: ["textIntake"],
    createdVia: "textAI",
    reviewedAt: args.now,
    createdByUserId: args.auth.createdByUserId,
    updatedByUserId: args.auth.createdByUserId,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await auditApiWrite(
    ctx,
    args.auth,
    args.moveId,
    "item.api_created_from_ai_text",
    "items",
    itemId,
    { name, disposition: args.draft.disposition }
  );
  return itemId;
}

async function ensureApiBoxFromAiTextDraft(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    draft: RestAiTextBoxDraft;
    now: number;
  }
) {
  const label = normalizeOptionalText(args.draft.label) ?? "AI text intake box";
  const existing = await findApiAiBoxByLabel(ctx, args.moveId, label);
  if (existing) return { boxId: existing._id, created: false };

  const code = await uniqueApiAiBoxCode(
    ctx,
    args.moveId,
    args.draft.code ?? label,
    "AI-BOX"
  );
  const boxId = await ctx.db.insert("boxes", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    code,
    label,
    room: normalizeOptionalText(args.draft.room),
    destinationRoom: normalizeOptionalText(args.draft.destinationRoom),
    description: normalizeOptionalText(args.draft.description),
    status: "open",
    assignmentLocked: false,
    assignmentWarnings: [],
    assignmentHardBlocks: [],
    assignmentValidatedAt: args.now,
    createdByUserId: args.auth.createdByUserId,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await auditApiWrite(
    ctx,
    args.auth,
    args.moveId,
    "box.api_created_from_ai_text",
    "boxes",
    boxId,
    { code, label }
  );
  return { boxId, created: true };
}

async function addApiAiTextItemToBox(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    boxId: Id<"boxes">;
    itemId: Id<"items">;
    quantity: number;
    now: number;
  }
) {
  const assignmentId = await ctx.db.insert("boxItems", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    boxId: args.boxId,
    itemId: args.itemId,
    quantity: positiveNumber(args.quantity) ?? 1,
    notes: "Approved from AI text intake.",
    createdAt: args.now,
    updatedAt: args.now,
  });
  await ctx.db.patch(args.itemId, {
    status: "packed",
    updatedAt: args.now,
  });
  await ctx.db.patch(args.boxId, {
    status: "packing",
    updatedAt: args.now,
  });
  await auditApiWrite(
    ctx,
    args.auth,
    args.moveId,
    "assignment.api_created_from_ai_text",
    "boxItems",
    assignmentId,
    { boxId: args.boxId, itemId: args.itemId }
  );
  return assignmentId;
}

async function createApiItemFromAiPhotoDraft(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    draft: RestAiPhotoItemDraft;
    photoId: Id<"itemPhotos">;
    now: number;
  }
) {
  const name = normalizeItemName(args.draft.name);
  const itemId = await ctx.db.insert("items", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    name,
    normalizedName: normalizedSearchName(name),
    description: normalizeOptionalText(args.draft.description),
    room: normalizeOptionalText(args.draft.room),
    category: normalizeOptionalText(args.draft.category),
    disposition: args.draft.disposition,
    status: "active",
    quantity: positiveNumber(args.draft.quantity) ?? 1,
    condition: "unknown",
    dimensionsConfidence: "none",
    weightConfidence: "none",
    volumeConfidence: "none",
    fragility: args.draft.fragility ?? "low",
    stackable: true,
    hazardousFlag: false,
    highValue: args.draft.highValue ?? false,
    requiresPersonalTransport:
      args.draft.disposition === "personalTransport" ||
      args.draft.planningDefaultKeys?.includes("sensitive") === true,
    planningDefaultKeys: args.draft.planningDefaultKeys ?? [],
    needsReview: false,
    reviewFlags: [],
    aiSummary: `Approved from photo intake ${args.photoId}.`,
    aiTags: ["photoIntake"],
    createdVia: "photoAI",
    reviewedAt: args.now,
    createdByUserId: args.auth.createdByUserId,
    updatedByUserId: args.auth.createdByUserId,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await auditApiWrite(
    ctx,
    args.auth,
    args.moveId,
    "item.api_created_from_ai_photo",
    "items",
    itemId,
    { photoId: args.photoId, name }
  );
  return itemId;
}

async function createApiBoxFromAiPhotoDraft(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    draft: RestAiPhotoBoxDraft;
    now: number;
  }
) {
  const label = normalizeOptionalText(args.draft.label) ?? "AI photo box";
  const code = await uniqueApiAiBoxCode(
    ctx,
    args.moveId,
    args.draft.code ?? label,
    "AI-PHOTO-BOX"
  );
  const boxId = await ctx.db.insert("boxes", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    code,
    label,
    room: normalizeOptionalText(args.draft.room),
    description: normalizeOptionalText(args.draft.description),
    status: "open",
    assignmentLocked: false,
    assignmentWarnings: [],
    assignmentHardBlocks: [],
    assignmentValidatedAt: args.now,
    createdByUserId: args.auth.createdByUserId,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await auditApiWrite(
    ctx,
    args.auth,
    args.moveId,
    "box.api_created_from_ai_photo",
    "boxes",
    boxId,
    { code, label }
  );
  return boxId;
}

async function findApiAiBoxByLabel(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  label: string
) {
  const normalizedLabel = normalizeApiAiBoxLabelKey(label);
  const boxes = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId))
    .collect();
  return (
    boxes.find(
      (box) =>
        !box.archivedAt &&
        (normalizeApiAiBoxLabelKey(box.label ?? "") === normalizedLabel ||
          normalizeApiAiBoxLabelKey(box.code) === normalizedLabel)
    ) ?? null
  );
}

async function uniqueApiAiBoxCode(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  label: string,
  fallback: string
) {
  const base = normalizeBoxCode(label) || fallback;
  const boxes = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId))
    .collect();
  const codes = new Set(boxes.map((box) => box.code));
  if (!codes.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const code = normalizeBoxCode(`${base}-${index}`);
    if (code && !codes.has(code)) return code;
  }
  throw new Error("Could not create a unique box code.");
}

function parseAiTextApprovals(body: unknown) {
  const input = bodyObject(body);
  const rows = Array.isArray(input.approvals) ? input.approvals : [];
  assertAiReviewBatchSize(rows, "AI text suggestion approvals");
  const approvals = rows.map((row) => {
    const approval = bodyObject(row);
    const suggestionId = optionalString(approval.suggestionId);
    if (!suggestionId) {
      throw new Error("approval.suggestionId is required.");
    }
    return {
      suggestionId: suggestionId as Id<"aiTextSuggestions">,
      itemDraft: parseApiAiTextItemDraft(approval.itemDraft, "approval.itemDraft"),
      boxDraft: parseApiAiTextBoxDraft(approval.boxDraft, "approval.boxDraft"),
    };
  });
  assertUniqueReviewIds(
    approvals.map((approval) => approval.suggestionId),
    "Duplicate AI text suggestion approval."
  );
  return { dryRun: Boolean(input.dryRun), approvals };
}

function parseAiPhotoApprovals(body: unknown) {
  const input = bodyObject(body);
  const rows = Array.isArray(input.approvals) ? input.approvals : [];
  assertAiReviewBatchSize(rows, "AI photo suggestion approvals");
  const approvals = rows.map((row) => {
    const approval = bodyObject(row);
    const suggestionId = optionalString(approval.suggestionId);
    if (!suggestionId) {
      throw new Error("approval.suggestionId is required.");
    }
    return {
      suggestionId: suggestionId as Id<"aiPhotoSuggestions">,
      itemDraft: parseApiAiPhotoItemDraft(approval.itemDraft, "approval.itemDraft"),
      boxDraft: parseApiAiPhotoBoxDraft(approval.boxDraft, "approval.boxDraft"),
    };
  });
  assertUniqueReviewIds(
    approvals.map((approval) => approval.suggestionId),
    "Duplicate AI photo suggestion approval."
  );
  return { dryRun: Boolean(input.dryRun), approvals };
}

function parseAiSuggestionIds(value: unknown, label: string) {
  const ids = parseIdArray(value);
  assertAiReviewBatchSize(ids, label);
  assertUniqueReviewIds(ids, `Duplicate ${label} value.`);
  return ids;
}

function assertAiReviewBatchSize(rows: unknown[], label: string) {
  if (!rows.length) {
    throw new Error(`${label} must include at least one suggestion.`);
  }
  if (rows.length > 100) {
    throw new Error(`${label} are limited to 100 suggestions.`);
  }
}

function assertUniqueReviewIds(ids: string[], message: string) {
  if (new Set(ids).size !== ids.length) {
    throw new Error(message);
  }
}

function parseApiAiTextItemDraft(value: unknown, label: string) {
  if (value === undefined) return undefined;
  return parseApiAiItemDraft(value, label, true) as RestAiTextItemDraft;
}

function parseApiAiPhotoItemDraft(value: unknown, label: string) {
  if (value === undefined) return undefined;
  return parseApiAiItemDraft(value, label, false) as RestAiPhotoItemDraft;
}

function parseApiAiItemDraft(
  value: unknown,
  label: string,
  includeDestinationRoom: boolean
) {
  const input = bodyObject(value);
  const name = normalizeItemName(String(input.name ?? ""));
  if (!name) {
    throw new Error(`${label}.name is required.`);
  }
  const disposition = parseDisposition(input.disposition) ?? "undecided";
  return removeUndefined({
    name,
    room: normalizeOptionalText(asString(input.room)),
    destinationRoom: includeDestinationRoom
      ? normalizeOptionalText(asString(input.destinationRoom))
      : undefined,
    category: normalizeOptionalText(asString(input.category)),
    disposition,
    quantity: positiveNumber(input.quantity) ?? 1,
    description: normalizeOptionalText(asString(input.description)),
    suggestedBoxLabel: normalizeOptionalText(asString(input.suggestedBoxLabel)),
    fragility: parseItemFragility(input.fragility, `${label}.fragility`),
    highValue:
      input.highValue === undefined ? undefined : Boolean(input.highValue),
    planningDefaultKeys:
      parseLiteralArray(
        input.planningDefaultKeys,
        planningDefaultKeys,
        `${label}.planningDefaultKeys`
      ) ?? [],
  });
}

function parseApiAiTextBoxDraft(value: unknown, label: string) {
  if (value === undefined) return undefined;
  const draft = parseApiAiBoxDraft(value, label, true);
  return draft as RestAiTextBoxDraft;
}

function parseApiAiPhotoBoxDraft(value: unknown, label: string) {
  if (value === undefined) return undefined;
  const draft = parseApiAiBoxDraft(value, label, false);
  return draft as RestAiPhotoBoxDraft;
}

function parseApiAiBoxDraft(
  value: unknown,
  label: string,
  includeDestinationRoom: boolean
) {
  const input = bodyObject(value);
  const draftLabel = normalizeOptionalText(asString(input.label));
  if (!draftLabel) {
    throw new Error(`${label}.label is required.`);
  }
  return removeUndefined({
    code:
      input.code === undefined
        ? undefined
        : normalizeBoxCode(String(input.code)) || undefined,
    label: draftLabel,
    room: normalizeOptionalText(asString(input.room)),
    destinationRoom: includeDestinationRoom
      ? normalizeOptionalText(asString(input.destinationRoom))
      : undefined,
    description: normalizeOptionalText(asString(input.description)),
  });
}

function normalizeApiAiTextItemDraft(
  draft: RestAiTextItemDraft | undefined
): RestAiTextItemDraft | undefined {
  if (!draft?.name.trim()) return undefined;
  return {
    name: normalizeItemName(draft.name),
    room: normalizeOptionalText(draft.room),
    destinationRoom: normalizeOptionalText(draft.destinationRoom),
    category: normalizeOptionalText(draft.category),
    disposition: draft.disposition,
    quantity: positiveNumber(draft.quantity) ?? 1,
    description: normalizeOptionalText(draft.description),
    suggestedBoxLabel: normalizeOptionalText(draft.suggestedBoxLabel),
    fragility: draft.fragility,
    highValue: draft.highValue,
    planningDefaultKeys: draft.planningDefaultKeys ?? [],
  };
}

function normalizeApiAiTextBoxDraft(
  draft: RestAiTextBoxDraft | undefined
): RestAiTextBoxDraft | undefined {
  if (!draft?.label.trim()) return undefined;
  return {
    code: draft.code ? normalizeBoxCode(draft.code) : undefined,
    label: normalizeOptionalText(draft.label) ?? "AI text intake box",
    room: normalizeOptionalText(draft.room),
    destinationRoom: normalizeOptionalText(draft.destinationRoom),
    description: normalizeOptionalText(draft.description),
  };
}

function normalizeApiAiPhotoItemDraft(
  draft: RestAiPhotoItemDraft | undefined
): RestAiPhotoItemDraft | undefined {
  if (!draft?.name.trim()) return undefined;
  return {
    name: normalizeItemName(draft.name),
    room: normalizeOptionalText(draft.room),
    category: normalizeOptionalText(draft.category),
    disposition: draft.disposition,
    quantity: positiveNumber(draft.quantity) ?? 1,
    description: normalizeOptionalText(draft.description),
    suggestedBoxLabel: normalizeOptionalText(draft.suggestedBoxLabel),
    fragility: draft.fragility,
    highValue: draft.highValue,
    planningDefaultKeys: draft.planningDefaultKeys ?? [],
  };
}

function normalizeApiAiPhotoBoxDraft(
  draft: RestAiPhotoBoxDraft | undefined
): RestAiPhotoBoxDraft | undefined {
  if (!draft?.label.trim()) return undefined;
  return {
    code: draft.code ? normalizeBoxCode(draft.code) : undefined,
    label: normalizeOptionalText(draft.label) ?? "AI photo box",
    room: normalizeOptionalText(draft.room),
    description: normalizeOptionalText(draft.description),
  };
}

function parseItemFragility(value: unknown, label: string) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(itemFragilities, value)) {
    throw new Error(`Unsupported ${label}.`);
  }
  return value as RestAiTextItemDraft["fragility"];
}

function normalizeApiAiBoxLabelKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function pushUniqueId<TId extends string>(ids: TId[], id: TId) {
  if (!ids.includes(id)) ids.push(id);
}

function parseAiTextGenerationSource(body: unknown) {
  const sourceText = asString(bodyObject(body).sourceText)?.trim().slice(0, 12000);
  if (!sourceText) {
    throw new Error("Text intake needs sourceText.");
  }
  return sourceText;
}

function parseAiPhotoGenerationIds(body: unknown) {
  const input = bodyObject(body);
  const photoIds =
    input.photoId !== undefined
      ? [optionalString(input.photoId)].filter((entry): entry is string =>
          Boolean(entry)
        )
      : parseIdArray(input.photoIds);
  if (!photoIds.length) {
    throw new Error("photoIds must include at least one photo ID.");
  }
  if (photoIds.length > 50) {
    throw new Error("photoIds are limited to 50 photos.");
  }
  assertUniqueReviewIds(photoIds, "Duplicate photoId value.");
  return photoIds as Id<"itemPhotos">[];
}

async function duplicatePhotoIdsForApiMove(
  ctx: MutationCtx,
  photo: Doc<"itemPhotos">
) {
  if (!photo.originalHash) return [];
  const photos = await ctx.db
    .query("itemPhotos")
    .withIndex("by_move_created", (q) => q.eq("moveId", photo.moveId))
    .collect();
  return photos
    .filter(
      (candidate) =>
        candidate._id !== photo._id &&
        !candidate.archivedAt &&
        candidate.originalHash === photo.originalHash
    )
    .map((candidate) => candidate._id);
}

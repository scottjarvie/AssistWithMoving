export type AiModality = "text" | "vision" | "structured";
export type AiConfidence = "none" | "low" | "medium" | "high" | "manual" | "actual";

export type AiProviderRequest = {
  jobId: string;
  type: string;
  modality: AiModality;
  provider: string;
  model: string;
  inputRef?: unknown;
  inputSummary?: string;
  maxOutputTokens?: number;
  maxCostCents?: number;
};

export type AiProviderResult = {
  outputRef?: unknown;
  outputSummary?: string;
  confidence: AiConfidence;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  cost?: {
    estimatedCents?: number;
    actualCents?: number;
    currency: string;
  };
  providerMetadata?: unknown;
};

export type AiProvider = {
  name: string;
  supports: AiModality[];
  run(request: AiProviderRequest): Promise<AiProviderResult>;
};

export type AiProviderStatus = {
  defaultProvider: "mock" | "openai";
  defaultModel: string;
  openai: {
    configured: boolean;
    defaultModel: string;
  };
};

const defaultOpenAiModel = "gpt-5-mini";

const openAiStructuredResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "confidence", "questions", "risks", "recommendedActions"],
  properties: {
    summary: {
      type: "string",
      description: "Concise review summary for the move planner.",
    },
    confidence: {
      type: "string",
      enum: ["none", "low", "medium", "high"],
    },
    questions: {
      type: "array",
      items: { type: "string" },
      description: "Important questions the user should answer before trusting the result.",
    },
    risks: {
      type: "array",
      items: { type: "string" },
      description: "Potential planning, evidence, privacy, or load-plan risks.",
    },
    recommendedActions: {
      type: "array",
      items: { type: "string" },
      description: "Human-reviewable next actions. Do not claim official PCS, legal, or insurance authority.",
    },
  },
} as const;

export function estimateTokenCostCents({
  inputTokens = 0,
  outputTokens = 0,
  inputCentsPerMillion = 0,
  outputCentsPerMillion = 0,
}: {
  inputTokens?: number;
  outputTokens?: number;
  inputCentsPerMillion?: number;
  outputCentsPerMillion?: number;
}) {
  return roundCostCents(
    (inputTokens / 1_000_000) * inputCentsPerMillion +
      (outputTokens / 1_000_000) * outputCentsPerMillion
  );
}

export function enforceAiCostGuardrails({
  estimatedCents,
  maxCostCents,
}: {
  estimatedCents?: number;
  maxCostCents?: number;
}) {
  if (
    typeof estimatedCents === "number" &&
    typeof maxCostCents === "number" &&
    estimatedCents > maxCostCents
  ) {
    throw new Error("AI job exceeds the configured cost guardrail.");
  }
}

export function selectAiProvider(providerName: string): AiProvider {
  if (providerName === mockAiProvider.name) {
    return mockAiProvider;
  }
  if (providerName === openAiProvider.name) {
    return openAiProvider;
  }

  throw new Error(`AI provider is not configured: ${providerName}`);
}

export function isKnownAiProvider(providerName: string) {
  return providerName === mockAiProvider.name || providerName === openAiProvider.name;
}

export function getAiProviderStatus(): AiProviderStatus {
  const defaultProvider = normalizeKnownProvider(
    process.env.AI_DEFAULT_PROVIDER
  );
  const openAiModel = normalizeText(process.env.OPENAI_MODEL) ?? defaultOpenAiModel;

  return {
    defaultProvider,
    defaultModel: defaultProvider === "openai" ? openAiModel : "mock-model",
    openai: {
      configured: Boolean(normalizeText(process.env.OPENAI_API_KEY)),
      defaultModel: openAiModel,
    },
  };
}

export async function runAiProvider(request: AiProviderRequest) {
  const provider = selectAiProvider(request.provider);
  if (!provider.supports.includes(request.modality)) {
    throw new Error(
      `AI provider ${provider.name} does not support ${request.modality} jobs.`
    );
  }

  const estimate = estimateDeterministicUsage(request);
  enforceAiCostGuardrails({
    estimatedCents: estimate.cost.estimatedCents,
    maxCostCents: request.maxCostCents,
  });

  const result = await provider.run(request);
  const estimatedCents =
    result.cost?.estimatedCents ?? estimate.cost.estimatedCents;
  enforceAiCostGuardrails({ estimatedCents, maxCostCents: request.maxCostCents });

  return {
    ...result,
    tokenUsage: result.tokenUsage ?? estimate.tokenUsage,
    cost: {
      ...estimate.cost,
      ...result.cost,
      currency: result.cost?.currency ?? estimate.cost.currency,
    },
  };
}

export const mockAiProvider: AiProvider = {
  name: "mock",
  supports: ["text", "vision", "structured"],
  async run(request) {
    const summary =
      request.inputSummary ??
      `${request.modality} ${request.type} job ${request.jobId}`;
    return {
      outputRef: {
        provider: "mock",
        type: request.type,
        summary,
      },
      outputSummary: `Mock ${request.type} result: ${summary}`,
      confidence: "low",
      providerMetadata: {
        deterministic: true,
        model: request.model,
      },
    };
  },
};

export const openAiProvider: AiProvider = {
  name: "openai",
  supports: ["text", "structured"],
  async run(request) {
    const apiKey = normalizeText(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      throw new Error("OpenAI provider is not configured.");
    }

    const model =
      request.model === "mock-model"
        ? normalizeText(process.env.OPENAI_MODEL) ?? defaultOpenAiModel
        : request.model;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text:
                  "You are MovingManifest's auditable move-planning review engine. " +
                  "Flag uncertainty, ask for human review, and never claim official PCS, legal, insurance, or mover authority.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  jobId: request.jobId,
                  type: request.type,
                  modality: request.modality,
                  inputSummary: request.inputSummary,
                  inputRef: request.inputRef,
                }),
              },
            ],
          },
        ],
        max_output_tokens: request.maxOutputTokens ?? 512,
        text: {
          format: {
            type: "json_schema",
            name: "movingmanifest_ai_job_result",
            strict: true,
            schema: openAiStructuredResultSchema,
          },
        },
        metadata: {
          product: "movingmanifest",
          ai_job_id: request.jobId,
          job_type: request.type,
        },
      }),
    });

    const body = await safeJson(response);
    if (!response.ok) {
      throw new Error(openAiErrorMessage(response.status, body));
    }

    const refusal = extractOpenAiRefusal(body);
    if (refusal) {
      throw new Error(`OpenAI refused the AI job: ${refusal}`);
    }

    const outputText = extractOpenAiOutputText(body);
    if (!outputText) {
      throw new Error("OpenAI response did not include output text.");
    }

    const structured = parseStructuredResult(outputText);
    const tokenUsage = openAiTokenUsage(body);
    const estimatedCents = tokenUsage
      ? estimateTokenCostCents({
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          ...openAiRatesCentsPerMillion(),
        })
      : undefined;

    return {
      outputRef: {
        provider: "openai",
        model,
        structured,
      },
      outputSummary: structured.summary,
      confidence: structured.confidence,
      tokenUsage,
      cost: {
        estimatedCents,
        currency: "USD",
      },
      providerMetadata: {
        responseId: stringValue(body, "id"),
        status: stringValue(body, "status"),
        model: stringValue(body, "model") ?? model,
      },
    };
  },
};

function estimateDeterministicUsage(request: AiProviderRequest) {
  const summaryTokens = Math.ceil((request.inputSummary?.length ?? 0) / 4);
  const inputTokens = Math.max(32, summaryTokens);
  const outputTokens = request.maxOutputTokens ?? 256;
  const estimatedCents = estimateTokenCostCents({
    inputTokens,
    outputTokens,
    inputCentsPerMillion: 15,
    outputCentsPerMillion: 60,
  });

  return {
    tokenUsage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
    cost: {
      estimatedCents,
      currency: "USD",
    },
  };
}

function roundCostCents(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeKnownProvider(value: string | undefined): "mock" | "openai" {
  return value === "openai" ? "openai" : "mock";
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

async function safeJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

function openAiErrorMessage(status: number, body: unknown) {
  if (isRecord(body)) {
    const error = body.error;
    if (isRecord(error)) {
      const message = normalizeText(error.message);
      if (message) {
        return `OpenAI request failed with HTTP ${status}: ${message}`;
      }
    }
  }
  return `OpenAI request failed with HTTP ${status}.`;
}

function extractOpenAiOutputText(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  const direct = normalizeText(body.output_text);
  if (direct) return direct;

  const output = Array.isArray(body.output) ? body.output : [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (!isRecord(part)) continue;
      const text = normalizeText(part.text);
      if (text) return text;
    }
  }

  return undefined;
}

function extractOpenAiRefusal(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  const output = Array.isArray(body.output) ? body.output : [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (!isRecord(part)) continue;
      const refusal = normalizeText(part.refusal);
      if (refusal) return refusal;
    }
  }
  return undefined;
}

function parseStructuredResult(outputText: string) {
  const parsed = JSON.parse(outputText) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("OpenAI structured result was not an object.");
  }

  const summary = normalizeText(parsed.summary);
  const confidence = normalizeConfidence(parsed.confidence);
  if (!summary || !confidence) {
    throw new Error("OpenAI structured result is missing required fields.");
  }

  return {
    summary,
    confidence,
    questions: stringArray(parsed.questions),
    risks: stringArray(parsed.risks),
    recommendedActions: stringArray(parsed.recommendedActions),
  };
}

function normalizeConfidence(value: unknown): AiConfidence | undefined {
  return value === "none" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
    ? value
    : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => normalizeText(entry)).filter(isPresent)
    : [];
}

function openAiTokenUsage(body: unknown) {
  if (!isRecord(body) || !isRecord(body.usage)) return undefined;
  const inputTokens = numberValue(body.usage, "input_tokens");
  const outputTokens = numberValue(body.usage, "output_tokens");
  const totalTokens = numberValue(body.usage, "total_tokens");
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      totalTokens ??
      (typeof inputTokens === "number" && typeof outputTokens === "number"
        ? inputTokens + outputTokens
        : undefined),
  };
}

function openAiRatesCentsPerMillion() {
  return {
    inputCentsPerMillion:
      numberFromEnv("OPENAI_INPUT_CENTS_PER_MILLION") ?? 25,
    outputCentsPerMillion:
      numberFromEnv("OPENAI_OUTPUT_CENTS_PER_MILLION") ?? 200,
  };
}

function numberFromEnv(key: string) {
  const value = process.env[key];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function numberValue(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "number" ? record[key] : undefined;
}

function stringValue(record: unknown, key: string) {
  return isRecord(record) ? normalizeText(record[key]) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

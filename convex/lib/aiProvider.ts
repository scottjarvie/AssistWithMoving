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

  throw new Error(`AI provider is not configured: ${providerName}`);
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

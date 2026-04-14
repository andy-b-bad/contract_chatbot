type UsageLike = {
  inputTokens?: number | undefined;
  inputTokenDetails?: {
    noCacheTokens?: number | undefined;
    cacheReadTokens?: number | undefined;
  };
  outputTokens?: number | undefined;
  outputTokenDetails?: {
    reasoningTokens?: number | undefined;
  };
  totalTokens?: number | undefined;
  reasoningTokens?: number | undefined;
  raw?: unknown;
};

type UsageAndCostSource = {
  model?: {
    provider?: string | undefined;
    modelId?: string | undefined;
  };
  response?: {
    id?: string | undefined;
    modelId?: string | undefined;
  };
  totalUsage?: UsageLike;
};

export type UsageCostFields = {
  provider: string | null;
  model: string | null;
  providerRequestId: string | null;
  providerResponseId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  promptCacheHitTokens: number | null;
  promptCacheMissTokens: number | null;
  reasoningTokens: number | null;
  providerUsageJson: unknown | null;
  estimatedCostUsd: number;
  pricingVersion: "deepseek_v1";
};

function asNullableInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function mapUsageAndCost(result: UsageAndCostSource): UsageCostFields {
  const promptTokens = asNullableInteger(result.totalUsage?.inputTokens);
  const completionTokens = asNullableInteger(result.totalUsage?.outputTokens);
  const totalTokens = asNullableInteger(result.totalUsage?.totalTokens);
  const promptCacheHitTokens = asNullableInteger(
    result.totalUsage?.inputTokenDetails?.cacheReadTokens,
  );
  const promptCacheMissTokens = asNullableInteger(
    result.totalUsage?.inputTokenDetails?.noCacheTokens,
  );
  const reasoningTokens =
    asNullableInteger(result.totalUsage?.outputTokenDetails?.reasoningTokens) ??
    asNullableInteger(result.totalUsage?.reasoningTokens);
  const normalizedPromptCacheHitTokens = promptCacheHitTokens ?? 0;
  const normalizedPromptCacheMissTokens = promptCacheMissTokens ?? 0;
  const normalizedCompletionTokens = completionTokens ?? 0;

  return {
    provider: asOptionalString(result.model?.provider),
    model:
      asOptionalString(result.response?.modelId) ??
      asOptionalString(result.model?.modelId),
    providerRequestId: null,
    providerResponseId: asOptionalString(result.response?.id),
    promptTokens,
    completionTokens,
    totalTokens,
    promptCacheHitTokens,
    promptCacheMissTokens,
    reasoningTokens,
    providerUsageJson: result.totalUsage?.raw ?? null,
    estimatedCostUsd:
      (normalizedPromptCacheHitTokens / 1_000_000) * 0.07 +
      (normalizedPromptCacheMissTokens / 1_000_000) * 0.27 +
      (normalizedCompletionTokens / 1_000_000) * 1.1,
    pricingVersion: "deepseek_v1",
  };
}

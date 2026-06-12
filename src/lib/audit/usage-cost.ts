export type UsageLike = {
  inputTokens?: number | undefined;
  inputTokenDetails?: {
    noCacheTokens?: number | undefined;
    cacheReadTokens?: number | undefined;
    cacheWriteTokens?: number | undefined;
  };
  outputTokens?: number | undefined;
  outputTokenDetails?: {
    textTokens?: number | undefined;
    reasoningTokens?: number | undefined;
  };
  totalTokens?: number | undefined;
  reasoningTokens?: number | undefined;
  raw?: unknown;
};

export type UsageAndCostSource = {
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

export type UsageTokenClassPresence = {
  inputCacheWriteTokens: number | null;
  outputTextTokens: number | null;
  outputReasoningTokens: number | null;
};

export type ObservedCostFields = {
  currency: "USD";
  amount: string | null;
  pricingVersion: string | null;
  calculatedAt: string;
  pricedTokenClasses: string[];
  notSeparatelyPricedTokenClasses: string[];
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

function decimalString(value: number) {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (value === 0) {
    return "0";
  }

  return value.toFixed(18).replace(/0+$/, "").replace(/\.$/, "");
}

export function getObservedCostFields(
  usageFields: UsageCostFields,
  tokenClassPresence: UsageTokenClassPresence,
  calculatedAt: string,
): ObservedCostFields {
  const pricedTokenClasses =
    usageFields.pricingVersion === "deepseek_v1"
      ? ["input_cache_read", "input_no_cache", "output_total"]
      : [];
  const notSeparatelyPricedTokenClasses: string[] = [];

  if (tokenClassPresence.inputCacheWriteTokens != null) {
    notSeparatelyPricedTokenClasses.push("input_cache_write");
  }

  if (tokenClassPresence.outputTextTokens != null) {
    notSeparatelyPricedTokenClasses.push("output_text");
  }

  if (tokenClassPresence.outputReasoningTokens != null) {
    notSeparatelyPricedTokenClasses.push("output_reasoning");
  }

  return {
    currency: "USD",
    amount: decimalString(usageFields.estimatedCostUsd),
    pricingVersion: usageFields.pricingVersion,
    calculatedAt,
    pricedTokenClasses,
    notSeparatelyPricedTokenClasses,
  };
}

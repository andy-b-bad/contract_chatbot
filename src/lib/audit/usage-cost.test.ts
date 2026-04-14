import assert from "node:assert/strict";
import test from "node:test";
import { mapUsageAndCost } from "./usage-cost";

test("mapUsageAndCost maps available fields and computes cost", () => {
  const payload = mapUsageAndCost({
    model: {
      provider: "deepseek.chat",
      modelId: "deepseek-chat",
    },
    response: {
      id: "resp_123",
      modelId: "deepseek-chat",
    },
    totalUsage: {
      inputTokens: 1200,
      inputTokenDetails: {
        cacheReadTokens: 200,
        noCacheTokens: 1000,
      },
      outputTokens: 300,
      outputTokenDetails: {
        reasoningTokens: 40,
      },
      totalTokens: 1500,
      raw: {
        prompt_tokens: 1200,
        prompt_cache_hit_tokens: 200,
        prompt_cache_miss_tokens: 1000,
        completion_tokens: 300,
      },
    },
  });

  assert.deepEqual(payload, {
    provider: "deepseek.chat",
    model: "deepseek-chat",
    providerRequestId: null,
    providerResponseId: "resp_123",
    promptTokens: 1200,
    completionTokens: 300,
    totalTokens: 1500,
    promptCacheHitTokens: 200,
    promptCacheMissTokens: 1000,
    reasoningTokens: 40,
    providerUsageJson: {
      prompt_tokens: 1200,
      prompt_cache_hit_tokens: 200,
      prompt_cache_miss_tokens: 1000,
      completion_tokens: 300,
    },
    estimatedCostUsd:
      (200 / 1_000_000) * 0.07 +
      (1000 / 1_000_000) * 0.27 +
      (300 / 1_000_000) * 1.1,
    pricingVersion: "deepseek_v1",
  });
});

test("mapUsageAndCost leaves unavailable identifiers null and still computes cost", () => {
  const payload = mapUsageAndCost({
    model: {
      provider: "deepseek.chat",
      modelId: "deepseek-chat",
    },
    totalUsage: {
      raw: null,
    },
  });

  assert.deepEqual(payload, {
    provider: "deepseek.chat",
    model: "deepseek-chat",
    providerRequestId: null,
    providerResponseId: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    promptCacheHitTokens: null,
    promptCacheMissTokens: null,
    reasoningTokens: null,
    providerUsageJson: null,
    estimatedCostUsd: 0,
    pricingVersion: "deepseek_v1",
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLocalAnswerTracePayload,
  getLocalTraceCaptureEndpoint,
  getObservedCostForTrace,
  isLocalTraceCaptureEnabled,
  mapLocalTraceUsage,
  sanitizeTraceValue,
  sendLocalAnswerTrace,
} from "./local-answer-trace";
import { mapUsageAndCost } from "@/lib/audit/usage-cost";
import type { CanonicalEvidenceItem } from "./canonical-evidence";

const canonicalEvidenceItems: CanonicalEvidenceItem[] = [
  {
    scope: "pact-cinema",
    toolName: "get_page_content",
    documentName: "PACT_Cinema_Summary.pdf",
    pageRef: "1",
    pageNumber: 1,
    requestedPages: "1",
    rawText: "Overtime | Stunt Coordinators and Stunt Performers | 1/7 daily/hr",
  },
];

const validation = {
  status: "validated",
  definiteDefects: [],
  possibleDefects: [],
  representedSources: [],
  omittedSources: [],
} as const;

test("local trace capture gates require both explicit flags", () => {
  assert.equal(isLocalTraceCaptureEnabled({}), false);
  assert.equal(
    isLocalTraceCaptureEnabled({
      ENABLE_LOCAL_TRACE_CAPTURE: "true",
    }),
    false,
  );
  assert.equal(
    isLocalTraceCaptureEnabled({
      ENABLE_LOCAL_TRACE_CAPTURE: "true",
      LOCAL_TRACE_CAPTURE_ALLOWED: "true",
    }),
    true,
  );
});

test("local trace endpoint configuration accepts only explicit localhost endpoints", () => {
  assert.equal(
    getLocalTraceCaptureEndpoint({
      LOCAL_TRACE_CAPTURE_ENDPOINT: "http://127.0.0.1:3000/api/local-traces",
    }),
    "http://127.0.0.1:3000/api/local-traces",
  );
  assert.equal(
    getLocalTraceCaptureEndpoint({
      LOCAL_TRACE_CAPTURE_ENDPOINT: "http://localhost:3000/api/local-traces",
    }),
    "http://localhost:3000/api/local-traces",
  );
  assert.equal(
    getLocalTraceCaptureEndpoint({
      LOCAL_TRACE_CAPTURE_ENDPOINT: "http://[::1]:3000/api/local-traces",
    }),
    "http://[::1]:3000/api/local-traces",
  );
});

test("local trace endpoint configuration rejects unsafe destinations", () => {
  const invalidEndpoints = [
    undefined,
    "https://127.0.0.1:3000/api/local-traces",
    "http://example.com:3000/api/local-traces",
    "http://127.0.0.1/api/local-traces",
    "http://127.0.0.1:3000/other",
    "http://user:pass@127.0.0.1:3000/api/local-traces",
    "http://127.0.0.1:3000/api/local-traces?x=1",
    "http://127.0.0.1:3000/api/local-traces#frag",
  ];

  for (const endpoint of invalidEndpoints) {
    assert.equal(
      getLocalTraceCaptureEndpoint({
        LOCAL_TRACE_CAPTURE_ENDPOINT: endpoint,
      }),
      null,
    );
  }
});

test("maps all explicit SDK usage fields without raw provider usage", () => {
  const source = {
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
        noCacheTokens: 1000,
        cacheReadTokens: 200,
        cacheWriteTokens: 50,
      },
      outputTokens: 300,
      outputTokenDetails: {
        textTokens: 260,
        reasoningTokens: 40,
      },
      totalTokens: 1500,
      raw: {
        provider_only: true,
      },
    },
  };
  const usageCostFields = mapUsageAndCost(source);

  assert.deepEqual(mapLocalTraceUsage(source, usageCostFields), {
    provider: "deepseek.chat",
    model: "deepseek-chat",
    providerResponseId: "resp_123",
    inputTokens: 1200,
    inputNoCacheTokens: 1000,
    inputCacheReadTokens: 200,
    inputCacheWriteTokens: 50,
    outputTokens: 300,
    outputTextTokens: 260,
    outputReasoningTokens: 40,
    totalTokens: 1500,
  });
});

test("missing SDK usage fields become null", () => {
  const source = {
    model: {
      provider: "deepseek.chat",
      modelId: "deepseek-chat",
    },
    totalUsage: {},
  };
  const usageCostFields = mapUsageAndCost(source);

  assert.deepEqual(mapLocalTraceUsage(source, usageCostFields), {
    provider: "deepseek.chat",
    model: "deepseek-chat",
    providerResponseId: null,
    inputTokens: null,
    inputNoCacheTokens: null,
    inputCacheReadTokens: null,
    inputCacheWriteTokens: null,
    outputTokens: null,
    outputTextTokens: null,
    outputReasoningTokens: null,
    totalTokens: null,
  });
});

test("observed cost reuses mapUsageAndCost output as a decimal string", () => {
  const source = {
    model: {
      provider: "deepseek.chat",
      modelId: "deepseek-chat",
    },
    totalUsage: {
      inputTokens: 1200,
      inputTokenDetails: {
        noCacheTokens: 1000,
        cacheReadTokens: 200,
        cacheWriteTokens: 50,
      },
      outputTokens: 300,
      outputTokenDetails: {
        textTokens: 260,
        reasoningTokens: 40,
      },
      totalTokens: 1500,
    },
  };
  const usageCostFields = mapUsageAndCost(source);
  const usage = mapLocalTraceUsage(source, usageCostFields);

  assert.deepEqual(
    getObservedCostForTrace({
      usageCostFields,
      usage,
      calculatedAt: "2026-06-12T12:00:00.000Z",
    }),
    {
      currency: "USD",
      amount: "0.000614",
      pricingVersion: "deepseek_v1",
      calculatedAt: "2026-06-12T12:00:00.000Z",
      pricedTokenClasses: [
        "input_cache_read",
        "input_no_cache",
        "output_total",
      ],
      notSeparatelyPricedTokenClasses: [
        "input_cache_write",
        "output_text",
        "output_reasoning",
      ],
    },
  );
});

test("trace payload skips empty answer and empty evidence", () => {
  const usage = {
    provider: null,
    model: null,
    providerResponseId: null,
    inputTokens: null,
    inputNoCacheTokens: null,
    inputCacheReadTokens: null,
    inputCacheWriteTokens: null,
    outputTokens: null,
    outputTextTokens: null,
    outputReasoningTokens: null,
    totalTokens: null,
  };
  const observedCost = {
    currency: "USD",
    amount: "0",
    pricingVersion: "deepseek_v1",
    calculatedAt: "2026-06-12T12:00:00.000Z",
    pricedTokenClasses: [],
    notSeparatelyPricedTokenClasses: [],
  } as const;

  assert.equal(
    buildLocalAnswerTracePayload({
      selectedScope: "pact-cinema",
      userQuery: "How much is overtime?",
      finalAnswer: " ",
      canonicalEvidenceItems,
      validation,
      usage,
      observedCost,
      toolCalls: [],
    }),
    null,
  );
  assert.equal(
    buildLocalAnswerTracePayload({
      selectedScope: "pact-cinema",
      userQuery: "How much is overtime?",
      finalAnswer: "Overtime is 1/7 daily/hr.",
      canonicalEvidenceItems: [],
      validation,
      usage,
      observedCost,
      toolCalls: [],
    }),
    null,
  );
});

test("trace payload preserves raw evaluation question and answer", () => {
  const usage = {
    provider: null,
    model: null,
    providerResponseId: null,
    inputTokens: null,
    inputNoCacheTokens: null,
    inputCacheReadTokens: null,
    inputCacheWriteTokens: null,
    outputTokens: null,
    outputTextTokens: null,
    outputReasoningTokens: null,
    totalTokens: null,
  };
  const observedCost = {
    currency: "USD",
    amount: "0",
    pricingVersion: "deepseek_v1",
    calculatedAt: "2026-06-12T12:00:00.000Z",
    pricedTokenClasses: [],
    notSeparatelyPricedTokenClasses: [],
  } as const;
  const userQuery = "Email person@example.com asked: how much is overtime?";
  const finalAnswer = "Send the answer to person@example.com: overtime is 1/7 daily/hr.";
  const payload = buildLocalAnswerTracePayload({
    selectedScope: "pact-cinema",
    userQuery,
    finalAnswer,
    canonicalEvidenceItems,
    validation,
    usage,
    observedCost,
    toolCalls: [],
  });

  assert.equal(payload?.request.userQuery, userQuery);
  assert.equal(payload?.response.finalAnswer, finalAnswer);
});

test("trace sanitisation redacts sensitive keys and email addresses", () => {
  assert.deepEqual(
    sanitizeTraceValue({
      doc_name: "PACT_Cinema_Summary.pdf",
      Authorization: "Bearer secret",
      nested: {
        user_id: "user-123",
        contact: "person@example.com",
      },
    }),
    {
      doc_name: "PACT_Cinema_Summary.pdf",
      Authorization: "[redacted]",
      nested: {
        user_id: "[redacted]",
        contact: "[redacted-email]",
      },
    },
  );
});

test("local trace sender failures do not escape when caller catches them", async () => {
  await assert.rejects(
    sendLocalAnswerTrace({
      payload: {
        request: {
          selectedScope: "pact-cinema",
          userQuery: "How much is overtime?",
        },
        response: {
          finalAnswer: "Overtime is 1/7 daily/hr.",
        },
        evidence: {
          canonicalEvidenceItems,
        },
        validation,
        usage: {
          provider: null,
          model: null,
          providerResponseId: null,
          inputTokens: null,
          inputNoCacheTokens: null,
          inputCacheReadTokens: null,
          inputCacheWriteTokens: null,
          outputTokens: null,
          outputTextTokens: null,
          outputReasoningTokens: null,
          totalTokens: null,
        },
        observedCost: {
          currency: "USD",
          amount: "0",
          pricingVersion: "deepseek_v1",
          calculatedAt: "2026-06-12T12:00:00.000Z",
          pricedTokenClasses: [],
          notSeparatelyPricedTokenClasses: [],
        },
      },
      env: {
        ENABLE_LOCAL_TRACE_CAPTURE: "true",
        LOCAL_TRACE_CAPTURE_ALLOWED: "true",
        LOCAL_TRACE_CAPTURE_ENDPOINT: "http://127.0.0.1:3000/api/local-traces",
      },
      fetchImpl: async () => new Response("nope", { status: 500 }),
      timeoutMs: 10,
    }),
  );
});

test("missing local trace endpoint skips safely without fetching", async () => {
  const logs: string[] = [];
  const result = await sendLocalAnswerTrace({
    payload: {
      request: {
        selectedScope: "pact-cinema",
        userQuery: "How much is overtime?",
      },
      response: {
        finalAnswer: "Overtime is 1/7 daily/hr.",
      },
      evidence: {
        canonicalEvidenceItems,
      },
      validation,
      usage: {
        provider: null,
        model: null,
        providerResponseId: null,
        inputTokens: null,
        inputNoCacheTokens: null,
        inputCacheReadTokens: null,
        inputCacheWriteTokens: null,
        outputTokens: null,
        outputTextTokens: null,
        outputReasoningTokens: null,
        totalTokens: null,
      },
      observedCost: {
        currency: "USD",
        amount: "0",
        pricingVersion: "deepseek_v1",
        calculatedAt: "2026-06-12T12:00:00.000Z",
        pricedTokenClasses: [],
        notSeparatelyPricedTokenClasses: [],
      },
    },
    env: {
      ENABLE_LOCAL_TRACE_CAPTURE: "true",
      LOCAL_TRACE_CAPTURE_ALLOWED: "true",
    },
    fetchImpl: async () => {
      throw new Error("fetch should not run");
    },
    log: (message) => logs.push(message),
  });

  assert.deepEqual(result, { status: "skipped", reason: "invalid_endpoint" });
  assert.deepEqual(logs, [
    "[chat] local-trace-capture:skipped invalid-endpoint-config",
  ]);
});

test("sender uses only trusted endpoint env and never a request-derived origin", async () => {
  const urls: string[] = [];
  const result = await sendLocalAnswerTrace({
    payload: {
      request: {
        selectedScope: "pact-cinema",
        userQuery: "How much is overtime?",
      },
      response: {
        finalAnswer: "Overtime is 1/7 daily/hr.",
      },
      evidence: {
        canonicalEvidenceItems,
      },
      validation,
      usage: {
        provider: null,
        model: null,
        providerResponseId: null,
        inputTokens: null,
        inputNoCacheTokens: null,
        inputCacheReadTokens: null,
        inputCacheWriteTokens: null,
        outputTokens: null,
        outputTextTokens: null,
        outputReasoningTokens: null,
        totalTokens: null,
      },
      observedCost: {
        currency: "USD",
        amount: "0",
        pricingVersion: "deepseek_v1",
        calculatedAt: "2026-06-12T12:00:00.000Z",
        pricedTokenClasses: [],
        notSeparatelyPricedTokenClasses: [],
      },
    },
    env: {
      ENABLE_LOCAL_TRACE_CAPTURE: "true",
      LOCAL_TRACE_CAPTURE_ALLOWED: "true",
      LOCAL_TRACE_CAPTURE_ENDPOINT: "http://localhost:3000/api/local-traces",
    },
    fetchImpl: async (input) => {
      urls.push(String(input));

      return new Response("ok", { status: 200 });
    },
  });

  assert.deepEqual(result, { status: "sent" });
  assert.deepEqual(urls, ["http://localhost:3000/api/local-traces"]);
});

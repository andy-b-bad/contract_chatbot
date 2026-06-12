import type { ContractScope } from "@/app/contracts";
import type { CanonicalEvidenceItem } from "./canonical-evidence";
import type {
  CompactAnswerValidationReport,
} from "./answer-validation-logging";
import {
  getObservedCostFields,
  type ObservedCostFields,
  type UsageAndCostSource,
  type UsageCostFields,
} from "@/lib/audit/usage-cost";

const LOCAL_TRACE_SENDER_TIMEOUT_MS = 1200;
const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|api[-_]?key|token|secret|password|user[-_]?id|thread[-_]?id|chat[-_]?id|email)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export type LocalTraceUsage = {
  provider: string | null;
  model: string | null;
  providerResponseId: string | null;
  inputTokens: number | null;
  inputNoCacheTokens: number | null;
  inputCacheReadTokens: number | null;
  inputCacheWriteTokens: number | null;
  outputTokens: number | null;
  outputTextTokens: number | null;
  outputReasoningTokens: number | null;
  totalTokens: number | null;
};

export type LocalTraceToolCall = {
  toolName: string;
  input: unknown;
};

export type RawLocalAnswerTrace = {
  schemaVersion: 1;
  capturedAt: string;
  git: {
    branch: string | null;
    commit: string | null;
  };
  request: {
    selectedScope: ContractScope;
    userQuery: string;
  };
  response: {
    finalAnswer: string;
  };
  evidence: {
    canonicalEvidenceItems: CanonicalEvidenceItem[];
  };
  validation:
    | CompactAnswerValidationReport
    | {
        status: "skipped";
        reason: string;
      };
  usage: LocalTraceUsage;
  observedCost: ObservedCostFields;
  retrieval?: {
    retrievedSources?: Array<{
      documentName: string;
      pages: string[];
    }>;
    toolCalls?: LocalTraceToolCall[];
  };
};

export type RawLocalAnswerTracePayload = Omit<
  RawLocalAnswerTrace,
  "schemaVersion" | "capturedAt" | "git"
> & {
  schemaVersion?: never;
  capturedAt?: never;
  git?: never;
};

type LocalTraceEnv = {
  ENABLE_LOCAL_TRACE_CAPTURE?: string;
  LOCAL_TRACE_CAPTURE_ALLOWED?: string;
  LOCAL_TRACE_CAPTURE_ENDPOINT?: string;
};

function asNullableInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function isLocalTraceCaptureEnabled(env?: LocalTraceEnv) {
  return (
    (env?.ENABLE_LOCAL_TRACE_CAPTURE ??
      process.env.ENABLE_LOCAL_TRACE_CAPTURE) === "true" &&
    (env?.LOCAL_TRACE_CAPTURE_ALLOWED ??
      process.env.LOCAL_TRACE_CAPTURE_ALLOWED) === "true"
  );
}

export function getLocalTraceCaptureEndpoint(env?: LocalTraceEnv) {
  const rawEndpoint =
    env?.LOCAL_TRACE_CAPTURE_ENDPOINT ??
    process.env.LOCAL_TRACE_CAPTURE_ENDPOINT;

  if (rawEndpoint == null || rawEndpoint.trim().length === 0) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(rawEndpoint);
  } catch {
    return null;
  }

  if (
    url.protocol !== "http:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== "/api/local-traces" ||
    url.port === ""
  ) {
    return null;
  }

  if (
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "localhost" &&
    url.hostname !== "[::1]" &&
    url.hostname !== "::1"
  ) {
    return null;
  }

  return url.toString();
}

export function sanitizeTraceValue(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return "[redacted-depth-limit]";
  }

  if (typeof value === "string") {
    return value.replace(EMAIL_PATTERN, "[redacted-email]");
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value == null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeTraceValue(item, depth + 1));
  }

  if (typeof value !== "object") {
    return String(value);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? "[redacted]"
        : sanitizeTraceValue(nestedValue, depth + 1),
    ]),
  );
}

export function mapLocalTraceUsage(
  source: UsageAndCostSource,
  usageCostFields: UsageCostFields,
): LocalTraceUsage {
  return {
    provider: usageCostFields.provider,
    model: usageCostFields.model,
    providerResponseId: usageCostFields.providerResponseId,
    inputTokens: asNullableInteger(source.totalUsage?.inputTokens),
    inputNoCacheTokens: asNullableInteger(
      source.totalUsage?.inputTokenDetails?.noCacheTokens,
    ),
    inputCacheReadTokens: asNullableInteger(
      source.totalUsage?.inputTokenDetails?.cacheReadTokens,
    ),
    inputCacheWriteTokens: asNullableInteger(
      source.totalUsage?.inputTokenDetails?.cacheWriteTokens,
    ),
    outputTokens: asNullableInteger(source.totalUsage?.outputTokens),
    outputTextTokens: asNullableInteger(
      source.totalUsage?.outputTokenDetails?.textTokens,
    ),
    outputReasoningTokens:
      asNullableInteger(source.totalUsage?.outputTokenDetails?.reasoningTokens) ??
      asNullableInteger(source.totalUsage?.reasoningTokens),
    totalTokens: asNullableInteger(source.totalUsage?.totalTokens),
  };
}

export function getRetrievedSourcesFromCanonicalEvidence(
  canonicalEvidenceItems: CanonicalEvidenceItem[],
) {
  const pagesByDocument = new Map<string, Set<string>>();

  for (const item of canonicalEvidenceItems) {
    const pages = pagesByDocument.get(item.documentName) ?? new Set<string>();

    pages.add(item.pageRef);
    pagesByDocument.set(item.documentName, pages);
  }

  return Array.from(pagesByDocument.entries()).map(([documentName, pages]) => ({
    documentName,
    pages: Array.from(pages),
  }));
}

export function getObservedCostForTrace(args: {
  usageCostFields: UsageCostFields;
  usage: LocalTraceUsage;
  calculatedAt: string;
}) {
  return getObservedCostFields(
    args.usageCostFields,
    {
      inputCacheWriteTokens: args.usage.inputCacheWriteTokens,
      outputTextTokens: args.usage.outputTextTokens,
      outputReasoningTokens: args.usage.outputReasoningTokens,
    },
    args.calculatedAt,
  );
}

export function buildLocalAnswerTracePayload(args: {
  selectedScope: ContractScope;
  userQuery: string;
  finalAnswer: string;
  canonicalEvidenceItems: CanonicalEvidenceItem[];
  validation: RawLocalAnswerTracePayload["validation"];
  usage: LocalTraceUsage;
  observedCost: ObservedCostFields;
  toolCalls: LocalTraceToolCall[];
}): RawLocalAnswerTracePayload | null {
  if (normalizeWhitespace(args.finalAnswer).length === 0) {
    return null;
  }

  if (args.canonicalEvidenceItems.length === 0) {
    return null;
  }

  return {
    request: {
      selectedScope: args.selectedScope,
      userQuery: args.userQuery,
    },
    response: {
      finalAnswer: args.finalAnswer,
    },
    evidence: {
      canonicalEvidenceItems: args.canonicalEvidenceItems.map((item) => ({
        ...item,
        rawText: sanitizeTraceValue(item.rawText) as string,
      })),
    },
    validation: args.validation,
    usage: args.usage,
    observedCost: args.observedCost,
    retrieval: {
      retrievedSources: getRetrievedSourcesFromCanonicalEvidence(
        args.canonicalEvidenceItems,
      ),
      toolCalls: args.toolCalls,
    },
  };
}

export async function sendLocalAnswerTrace(args: {
  payload: RawLocalAnswerTracePayload | null;
  env?: LocalTraceEnv;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
  timeoutMs?: number;
}) {
  if (!isLocalTraceCaptureEnabled(args.env)) {
    return { status: "skipped" as const, reason: "disabled" as const };
  }

  const endpointUrl = getLocalTraceCaptureEndpoint(args.env);

  if (endpointUrl == null) {
    const log = args.log ?? console.log;

    log("[chat] local-trace-capture:skipped invalid-endpoint-config");

    return { status: "skipped" as const, reason: "invalid_endpoint" as const };
  }

  if (args.payload == null) {
    return { status: "skipped" as const, reason: "empty_answer_or_evidence" as const };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    args.timeoutMs ?? LOCAL_TRACE_SENDER_TIMEOUT_MS,
  );
  const fetchImpl = args.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(endpointUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(args.payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`local trace capture failed with status ${response.status}`);
    }

    return { status: "sent" as const };
  } finally {
    clearTimeout(timeout);
  }
}

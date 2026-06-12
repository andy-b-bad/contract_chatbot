import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  LocalTraceToolCall,
  RawLocalAnswerTrace,
  RawLocalAnswerTracePayload,
} from "./local-answer-trace";

const TRACE_DIR = ".local/traces";
const MAX_RETRIEVED_SOURCES = 24;
const MAX_RETRIEVED_SOURCE_PAGES = 100;
const MAX_TOOL_CALLS = 24;
const MAX_TRACE_STRING_LENGTH = 1000;
const MAX_TOOL_INPUT_ARRAY_ITEMS = 100;
const MAX_TOOL_INPUT_DEPTH = 8;
const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|credential|api[-_]?key|token|secret|password|user[-_]?id|thread[-_]?id|chat[-_]?id|email|headers?)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export type LocalTraceWriteResult = {
  filePath: string;
  trace: RawLocalAnswerTrace;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown) {
  return typeof value === "string" || value === null;
}

function isNumberOrNull(value: unknown) {
  return typeof value === "number" || value === null;
}

function isStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isBoundedString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_TRACE_STRING_LENGTH
  );
}

function isCanonicalEvidenceItem(value: unknown) {
  return (
    isObject(value) &&
    typeof value.scope === "string" &&
    value.toolName === "get_page_content" &&
    typeof value.documentName === "string" &&
    typeof value.pageRef === "string" &&
    (typeof value.pageNumber === "number" || value.pageNumber === null) &&
    (typeof value.requestedPages === "string" || value.requestedPages === null) &&
    typeof value.rawText === "string"
  );
}

function isValidation(value: unknown) {
  if (!isObject(value) || typeof value.status !== "string") {
    return false;
  }

  if (value.status === "skipped") {
    return typeof value.reason === "string";
  }

  return (
    value.status === "validated" &&
    Array.isArray(value.definiteDefects) &&
    Array.isArray(value.possibleDefects) &&
    Array.isArray(value.representedSources) &&
    Array.isArray(value.omittedSources)
  );
}

function isUsage(value: unknown) {
  return (
    isObject(value) &&
    isStringOrNull(value.provider) &&
    isStringOrNull(value.model) &&
    isStringOrNull(value.providerResponseId) &&
    isNumberOrNull(value.inputTokens) &&
    isNumberOrNull(value.inputNoCacheTokens) &&
    isNumberOrNull(value.inputCacheReadTokens) &&
    isNumberOrNull(value.inputCacheWriteTokens) &&
    isNumberOrNull(value.outputTokens) &&
    isNumberOrNull(value.outputTextTokens) &&
    isNumberOrNull(value.outputReasoningTokens) &&
    isNumberOrNull(value.totalTokens)
  );
}

function isObservedCost(value: unknown) {
  return (
    isObject(value) &&
    value.currency === "USD" &&
    (typeof value.amount === "string" || value.amount === null) &&
    (typeof value.pricingVersion === "string" || value.pricingVersion === null) &&
    typeof value.calculatedAt === "string" &&
    isStringArray(value.pricedTokenClasses) &&
    isStringArray(value.notSeparatelyPricedTokenClasses)
  );
}

function sanitizeServerTraceValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (depth > MAX_TOOL_INPUT_DEPTH) {
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
    return value
      .slice(0, MAX_TOOL_INPUT_ARRAY_ITEMS)
      .map((item) => sanitizeServerTraceValue(item, depth + 1, seen));
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[redacted-circular]";
  }

  seen.add(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, nestedValue]) => [
        key,
        sanitizeServerTraceValue(nestedValue, depth + 1, seen),
      ]),
  );
}

function parseRetrievedSources(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_RETRIEVED_SOURCES) {
    throw new Error("Trace payload has invalid retrieved sources.");
  }

  return value.map((source) => {
    if (
      !isObject(source) ||
      !hasOnlyKeys(source, ["documentName", "pages"]) ||
      !isBoundedString(source.documentName) ||
      !Array.isArray(source.pages) ||
      source.pages.length > MAX_RETRIEVED_SOURCE_PAGES ||
      !source.pages.every(isBoundedString)
    ) {
      throw new Error("Trace payload has invalid retrieved source fields.");
    }

    return {
      documentName: source.documentName,
      pages: source.pages,
    };
  });
}

function parseToolCalls(value: unknown): LocalTraceToolCall[] {
  if (!Array.isArray(value) || value.length > MAX_TOOL_CALLS) {
    throw new Error("Trace payload has invalid retrieval tool calls.");
  }

  return value.map((toolCall) => {
    if (
      !isObject(toolCall) ||
      !hasOnlyKeys(toolCall, ["toolName", "input"]) ||
      !isBoundedString(toolCall.toolName)
    ) {
      throw new Error("Trace payload has invalid retrieval tool call fields.");
    }

    const toolName = toolCall.toolName;

    return {
      toolName,
      input: sanitizeServerTraceValue(toolCall.input),
    };
  });
}

function parseRetrieval(value: unknown) {
  if (value == null) {
    return undefined;
  }

  if (
    !isObject(value) ||
    !hasOnlyKeys(value, ["retrievedSources", "toolCalls"])
  ) {
    throw new Error("Trace payload has invalid retrieval fields.");
  }

  return {
    ...("retrievedSources" in value
      ? { retrievedSources: parseRetrievedSources(value.retrievedSources) }
      : {}),
    ...("toolCalls" in value ? { toolCalls: parseToolCalls(value.toolCalls) } : {}),
  };
}

export function parseRawLocalAnswerTracePayload(
  value: unknown,
): RawLocalAnswerTracePayload {
  if (!isObject(value)) {
    throw new Error("Trace payload must be an object.");
  }

  if ("capturedAt" in value || "git" in value || "schemaVersion" in value) {
    throw new Error("Trace payload must not include server-owned fields.");
  }

  if (
    !isObject(value.request) ||
    typeof value.request.selectedScope !== "string" ||
    typeof value.request.userQuery !== "string"
  ) {
    throw new Error("Trace payload has invalid request fields.");
  }

  if (!isObject(value.response) || typeof value.response.finalAnswer !== "string") {
    throw new Error("Trace payload has invalid response fields.");
  }

  if (
    !isObject(value.evidence) ||
    !Array.isArray(value.evidence.canonicalEvidenceItems) ||
    !value.evidence.canonicalEvidenceItems.every(isCanonicalEvidenceItem)
  ) {
    throw new Error("Trace payload has invalid evidence fields.");
  }

  if (!isValidation(value.validation)) {
    throw new Error("Trace payload has invalid validation fields.");
  }

  if (!isUsage(value.usage)) {
    throw new Error("Trace payload has invalid usage fields.");
  }

  if (!isObservedCost(value.observedCost)) {
    throw new Error("Trace payload has invalid observed cost fields.");
  }

  const retrieval = parseRetrieval(value.retrieval);

  return {
    request: value.request,
    response: value.response,
    evidence: value.evidence,
    validation: value.validation,
    usage: value.usage,
    observedCost: value.observedCost,
    ...(retrieval ? { retrieval } : {}),
  } as RawLocalAnswerTracePayload;
}

function getGitValue(cwd: string, args: string[]) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

function getGitInfo(cwd: string) {
  return {
    branch: getGitValue(cwd, ["branch", "--show-current"]),
    commit: getGitValue(cwd, ["rev-parse", "HEAD"]),
  };
}

function assertContainedPath(rootDir: string, candidatePath: string) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(candidatePath);

  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error("Trace path escapes trace directory.");
  }

  return resolvedCandidate;
}

export async function writeRawLocalAnswerTrace(args: {
  cwd?: string;
  traceRoot?: string;
  payload: RawLocalAnswerTracePayload;
  now?: Date;
  randomId?: string;
}): Promise<LocalTraceWriteResult> {
  const cwd = args.cwd ?? process.cwd();
  const traceRoot = args.traceRoot ?? path.join(cwd, TRACE_DIR);
  const capturedAt = (args.now ?? new Date()).toISOString();
  const safeTimestamp = capturedAt.replace(/[:.]/g, "-");
  const traceId = args.randomId ?? randomUUID();
  const fileName = `${safeTimestamp}-${traceId}.json`;
  const filePath = assertContainedPath(traceRoot, path.join(traceRoot, fileName));
  const trace: RawLocalAnswerTrace = {
    schemaVersion: 1,
    capturedAt,
    git: getGitInfo(cwd),
    ...args.payload,
    observedCost: {
      ...args.payload.observedCost,
      calculatedAt: capturedAt,
    },
  };

  await mkdir(traceRoot, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(trace, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  return {
    filePath,
    trace,
  };
}

import { createMCPClient } from "@ai-sdk/mcp";
import { createDeepSeek } from "@ai-sdk/deepseek";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessageChunk,
  type UIMessageStreamWriter,
} from "ai";
import {
  getContractScopeOption,
  getSharedSummaryPageRange,
  isDocumentAllowedForScope,
  isSharedSummaryPageSelectionAllowed,
  isSharedSummaryDocumentName,
  parseContractScope,
  type ContractScope,
} from "../../contracts";
import {
  getChatMessageText,
  type ChatDataParts,
  type ChatMessage,
  type RetrievalStatus,
} from "@/lib/chat";
import {
  persistAssistantTurnWithAuditIfNeeded,
  persistUserTurnIfNeeded,
  resolveChatSession,
  type ChatSessionContext,
} from "@/lib/chat-session";
import {
  buildExcerptPacket,
  type ExcerptPacketItem,
} from "@/lib/audit/excerpt-packet";
import { mapUsageAndCost } from "@/lib/audit/usage-cost";
import {
  createRetrievalAuditCollector,
  type RetrievalAuditTraceData,
} from "@/lib/retrieval-audit";

export const runtime = "edge";

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const ALLOWED_CHAT_TOOL_NAMES = [
  "recent_documents",
  "find_relevant_documents",
  "get_document",
  "get_document_structure",
  "get_page_content",
] as const;

const RETRIEVAL_STATUS_LABEL = "Retrieving contract content...";
const RETRIEVAL_TOOL_NAMES = new Set([
  "recent_documents",
  "find_relevant_documents",
  "get_document",
  "get_document_structure",
  "get_page_content",
]);
const MAX_SEARCH_RESULT_LIMIT = 4;
const MAX_CARRIED_HISTORY_MESSAGES = 4;
const MAX_CARRIED_HISTORY_TEXT_LENGTH = 220;
const MAX_MODEL_EVIDENCE_ITEMS = 4;
const MAX_MODEL_EVIDENCE_OVERFLOW_ITEMS = 1;
const MAX_SUMMARY_EVIDENCE_TEXT_LENGTH = 350;
const MAX_CONTRACT_EVIDENCE_TEXT_LENGTH = 500;
const PRIMARY_AGREEMENT_DOCUMENTS: Partial<Record<ContractScope, string>> = {
  "pact-cinema":
    "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf",
};
const SCOPED_SUMMARY_DOCUMENT_IDS: Partial<Record<ContractScope, string>> = {
  "pact-cinema": "pi-cmoa82pdy000001qtxhbkqkk3",
};
const OUT_OF_SCOPE_RESPONSE =
  "I can only answer questions about the provided documents.";
const INSUFFICIENT_EVIDENCE_RESPONSE =
  "I cannot find this information in the provided documents.";
const SERVICE_UNAVAILABLE_RESPONSE =
  "I could not complete retrieval because the document or model service timed out. Please try again.";

const BASE_SYSTEM_PROMPT = `You are a document-grounded assistant for a UK audience.
Answer only from the provided documents retrieved through the available tools and the latest user turn.
Do not use general knowledge, assumptions, industry norms, or unstated interpretations.
If exact wording is available, quote or closely cite it rather than broadening it
Use PageIndex document structure before page content for contract lookup questions.
Keep the final answer concise, precise, and document-bound.
If retrieved wording defines a closed list, answer whether the queried item appears in that list and state when it is absent.
Never describe retrieval steps, tool usage, or your process.
Only output the final answer.
If the user asks for general world knowledge or something clearly unrelated to the provided documents, reply with exactly: "${OUT_OF_SCOPE_RESPONSE}".
If the retrieved document content does not explicitly support the answer, reply with exactly: "${INSUFFICIENT_EVIDENCE_RESPONSE}".`;

function extractToolText(result: unknown) {
  if (
    typeof result === "object" &&
    result !== null &&
    "content" in result &&
    Array.isArray(result.content)
  ) {
    return result.content
      .filter(
        (item): item is { type: string; text: string } =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          "text" in item &&
          item.type === "text" &&
          typeof item.text === "string",
      )
      .map((item) => item.text)
      .join("\n");
  }

  return "";
}

function parseToolJson<T>(result: unknown): T | null {
  const text = extractToolText(result);

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function truncateForTrace(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getModelMessageText(message: ModelMessage) {
  const content = message.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return safeJsonStringify(part);
      })
      .join("\n");
  }

  return safeJsonStringify(content);
}

function formatModelContext(system: string, messages: ModelMessage[]) {
  const messageText = messages
    .map(
      (message, index) =>
        `[${index}:${message.role}]\n${getModelMessageText(message)}`,
    )
    .join("\n\n");

  return `[system]\n${system}\n\n${messageText}`;
}

type NamedDocument = {
  name?: string;
  status?: string;
  [key: string]: unknown;
};

type ModelEvidenceItem = {
  provenance: "summary" | "contract";
  document_name: string;
  page_ref: string;
  excerpt_text: string;
  requested_pages: string | null;
};

type RouteRuntimeState = {
  latestUserText: string;
  queryMode: QueryMode;
  searchResultCount: number;
  pageContentFetchCount: number;
  priorHistoryIncluded: boolean;
  carriedHistoryCount: number;
  carriedHistoryChars: number;
  evidenceItemsBeforeDedupe: number;
  evidenceItemsAfterDedupe: number;
  evidenceChars: number;
  primaryAgreementDocumentName: string | null;
};

type QueryMode = "lookup" | "structure";

function truncateForPacket(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function buildSystemPrompt(selectedScope: ContractScope, queryMode: QueryMode) {
  return BASE_SYSTEM_PROMPT;
}

function getPrimaryAgreementDocumentName(selectedScope: ContractScope) {
  return PRIMARY_AGREEMENT_DOCUMENTS[selectedScope] ?? null;
}

function getScopedSummaryDocumentId(selectedScope: ContractScope) {
  return SCOPED_SUMMARY_DOCUMENT_IDS[selectedScope] ?? null;
}

function createToolTextResult(payload: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function createTextModelMessage(
  role: "assistant" | "user",
  content: string,
): ModelMessage {
  return {
    role,
    content,
  };
}

function isObviousOutOfScopeQuery(query: string) {
  const normalizedQuery = normalizeWhitespace(query).toLowerCase();

  if (!normalizedQuery) {
    return false;
  }

  const contractPattern =
    /\b(contract|clause|agreement|rate|night rate|overtime|holiday|public holiday|travel|resident location|payment|leave|entitlement|definition|call|performer|stunt|cinema|tv|svod|bbc|itv|commercial|mocap)\b/;

  if (contractPattern.test(normalizedQuery)) {
    return false;
  }

  const obviousOutOfScopePatterns = [
    /\bweather\b/,
    /\btemperature\b/,
    /\bcapital of\b/,
    /\bnews\b/,
    /\bwho won\b/,
    /\bjoke\b/,
    /\brecipe\b/,
    /\bmovie recommendation\b/,
    /\btime in\b/,
    /\bstock price\b/,
  ];

  if (obviousOutOfScopePatterns.some((pattern) => pattern.test(normalizedQuery))) {
    return true;
  }

  return /^(hi|hello|hey|yo)\b[\w\s,!.?'-]*$/.test(normalizedQuery);
}

function getQueryMode(query: string): QueryMode {
  const normalizedQuery = normalizeWhitespace(query).toLowerCase();

  if (!normalizedQuery) {
    return "lookup";
  }

  const structurePattern =
    /\b(structure|outline|table of contents|contents|section list|clause list|all clauses|where in the agreement|where does it say|which section|which clause|document organisation|document organization|navigate|navigation)\b/;

  if (structurePattern.test(normalizedQuery)) {
    return "structure";
  }

  return "lookup";
}

function isReferentialFollowUp(query: string) {
  const normalizedQuery = normalizeWhitespace(query).toLowerCase();

  if (!normalizedQuery) {
    return false;
  }

  const referentialPatterns = [
    /\bwhat about\b/,
    /^\band\b/,
    /\binstead\b/,
    /\bdoes that\b/,
    /\bdoes this\b/,
    /\bchange for\b/,
    /\bthat\b/,
    /\bthose\b/,
    /\bthese\b/,
  ];

  return referentialPatterns.some((pattern) => pattern.test(normalizedQuery));
}

function getLatestUserMessageIndex(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }

  return -1;
}

function buildScopedModelMessages(
  messages: ChatMessage[],
  runtimeState: RouteRuntimeState,
) {
  const latestUserIndex = getLatestUserMessageIndex(messages);

  if (latestUserIndex === -1) {
    return [] as ModelMessage[];
  }

  const latestUserText = normalizeWhitespace(getUiMessageText(messages[latestUserIndex]));
  runtimeState.latestUserText = latestUserText;
  const referentialFollowUp = isReferentialFollowUp(latestUserText);
  const priorMessages = referentialFollowUp
    ? messages
        .slice(0, latestUserIndex)
        .filter(
          (message) =>
            (message.role === "assistant" || message.role === "user") &&
            normalizeWhitespace(getUiMessageText(message)).length > 0,
        )
        .slice(-MAX_CARRIED_HISTORY_MESSAGES)
        .map((message) => ({
          role: message.role,
          text: truncateForPacket(
            normalizeWhitespace(getUiMessageText(message)),
            MAX_CARRIED_HISTORY_TEXT_LENGTH,
          ),
        }))
    : [];

  runtimeState.priorHistoryIncluded = priorMessages.length > 0;
  runtimeState.carriedHistoryCount = priorMessages.length;
  runtimeState.carriedHistoryChars = priorMessages.reduce(
    (total, message) => total + message.text.length,
    0,
  );

  const modelMessages: ModelMessage[] = [];

  if (priorMessages.length > 0) {
    modelMessages.push(
      createTextModelMessage(
        "assistant",
        `04_recent_history\nUse this only to resolve references in the latest user turn.\n${priorMessages
          .map((message) => `- ${message.role}: ${message.text}`)
          .join("\n")}`,
      ),
    );
  }

  modelMessages.push(createTextModelMessage("user", latestUserText));

  return modelMessages;
}

function getRequestedDocumentName(input: unknown) {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }

  if ("doc_name" in input && typeof input.doc_name === "string") {
    return input.doc_name;
  }

  if ("docName" in input && typeof input.docName === "string") {
    return input.docName;
  }

  if ("name" in input && typeof input.name === "string") {
    return input.name;
  }

  return undefined;
}

function getRequestedPages(input: unknown) {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }

  if ("pages" in input) {
    const pages = input.pages;

    if (typeof pages === "string") {
      return pages;
    }

    if (typeof pages === "number" && Number.isFinite(pages)) {
      return String(pages);
    }
  }

  return undefined;
}

function getCompactExcerptText(item: ExcerptPacketItem) {
  const maxLength = isSharedSummaryDocumentName(item.document_name)
    ? MAX_SUMMARY_EVIDENCE_TEXT_LENGTH
    : MAX_CONTRACT_EVIDENCE_TEXT_LENGTH;

  return truncateForPacket(normalizeWhitespace(item.excerpt_text), maxLength);
}

function buildCompactEvidenceItems(excerptPacket: ExcerptPacketItem[]) {
  const normalizedItems = excerptPacket
    .map((item) => ({
      provenance: isSharedSummaryDocumentName(item.document_name)
        ? ("summary" as const)
        : ("contract" as const),
      document_name: item.document_name,
      page_ref: item.page_ref,
      excerpt_text: getCompactExcerptText(item),
      requested_pages: item.requested_pages,
    }))
    .filter((item) => item.excerpt_text.length > 0);
  const seenItemKeys = new Set<string>();
  const seenDocPageKeys = new Map<string, number>();
  const dedupedItems: ModelEvidenceItem[] = [];

  for (const item of normalizedItems) {
    const itemKey = [
      item.document_name.trim().toLowerCase(),
      item.page_ref.trim().toLowerCase(),
      item.excerpt_text.trim().toLowerCase(),
    ].join("::");

    if (seenItemKeys.has(itemKey)) {
      continue;
    }

    seenItemKeys.add(itemKey);

    const docPageKey = [
      item.document_name.trim().toLowerCase(),
      item.page_ref.trim().toLowerCase(),
    ].join("::");
    const existingIndex = seenDocPageKeys.get(docPageKey);

    if (existingIndex != null) {
      if (item.excerpt_text.length < dedupedItems[existingIndex].excerpt_text.length) {
        dedupedItems[existingIndex] = item;
      }

      continue;
    }

    seenDocPageKeys.set(docPageKey, dedupedItems.length);
    dedupedItems.push(item);
  }

  dedupedItems.sort((left, right) => {
    if (left.provenance !== right.provenance) {
      return left.provenance === "summary" ? -1 : 1;
    }

    return left.page_ref.localeCompare(right.page_ref);
  });

  const selectedItems = dedupedItems.slice(0, MAX_MODEL_EVIDENCE_ITEMS);

  if (
    selectedItems.length === MAX_MODEL_EVIDENCE_ITEMS &&
    selectedItems.some((item) => item.provenance === "summary") &&
    !selectedItems.some((item) => item.provenance === "contract")
  ) {
    const contractOverflowItem = dedupedItems
      .slice(MAX_MODEL_EVIDENCE_ITEMS)
      .find((item) => item.provenance === "contract");

    if (contractOverflowItem && MAX_MODEL_EVIDENCE_OVERFLOW_ITEMS > 0) {
      selectedItems.push(contractOverflowItem);
    }
  }

  return {
    rawCount: normalizedItems.length,
    dedupedCount: dedupedItems.length,
    items: selectedItems,
    totalChars: selectedItems.reduce(
      (total, item) => total + item.excerpt_text.length,
      0,
    ),
  };
}

function withScopeSearchInput(input: unknown) {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const query =
    "query" in input && typeof input.query === "string" ? input.query.trim() : "";
  const limit =
    "limit" in input && typeof input.limit === "number"
      ? Math.min(Math.max(input.limit, 1), MAX_SEARCH_RESULT_LIMIT)
      : MAX_SEARCH_RESULT_LIMIT;

  return {
    ...input,
    query,
    limit,
  };
}

function withPrimaryAgreementDocumentInput(
  input: unknown,
  primaryAgreementDocumentName: string,
) {
  if (typeof input !== "object" || input === null) {
    return {
      doc_name: primaryAgreementDocumentName,
    };
  }

  return {
    ...input,
    doc_name: primaryAgreementDocumentName,
  };
}

function filterDocumentsForScope<T extends NamedDocument>(
  docs: T[],
  selectedScope: ContractScope,
) {
  const scopedDocs: T[] = [];
  const seenNames = new Set<string>();

  for (const doc of docs) {
    const docName = typeof doc.name === "string" ? doc.name : undefined;

    if (
      typeof docName !== "string" ||
      !isDocumentAllowedForScope(docName, selectedScope)
    ) {
      continue;
    }

    const normalizedName = docName.trim().toLowerCase();

    if (seenNames.has(normalizedName)) {
      continue;
    }

    seenNames.add(normalizedName);
    scopedDocs.push(doc);
  }

  return scopedDocs;
}

function decorateDocumentsForScope(
  docs: NamedDocument[],
  selectedScope: ContractScope,
) {
  const sharedSummaryPages = getSharedSummaryPageRange(selectedScope);

  return docs.map((doc) => {
    const decoratedDoc =
      typeof doc.pageNum === "number"
        ? {
            ...doc,
            pageNum: undefined,
            total_pages: doc.pageNum,
          }
        : doc;

    if (
      typeof decoratedDoc.name === "string" &&
      isSharedSummaryDocumentName(decoratedDoc.name)
    ) {
      return {
        ...decoratedDoc,
        shared_summary_pages: sharedSummaryPages,
      };
    }

    return decoratedDoc;
  });
}

function filterRecentDocumentsResult(
  result: unknown,
  selectedScope: ContractScope,
) {
  const json = parseToolJson<{
    docs?: NamedDocument[];
    ready_count?: number;
    processing_count?: number;
    has_more?: boolean;
    next_cursor?: string;
    [key: string]: unknown;
  }>(result);

  if (!json || !Array.isArray(json.docs)) {
    return result;
  }

  const docs = filterDocumentsForScope(json.docs, selectedScope);
  const scopedDocs = decorateDocumentsForScope(docs, selectedScope);
  const readyCount = docs.filter((doc) => doc.status === "completed").length;
  const processingCount = docs.length - readyCount;

  return createToolTextResult({
    ...json,
    docs: scopedDocs,
    ready_count: readyCount,
    processing_count: processingCount,
    has_more: false,
    selected_scope: getContractScopeOption(selectedScope).label,
  });
}

function filterSearchDocumentsResult(
  result: unknown,
  selectedScope: ContractScope,
) {
  const json = parseToolJson<{
    success?: boolean;
    docs?: NamedDocument[];
    total_returned?: number;
    has_more?: boolean;
    next_steps?: unknown;
    [key: string]: unknown;
  }>(result);

  if (!json || !Array.isArray(json.docs)) {
    return result;
  }

  const scopeOption = getContractScopeOption(selectedScope);
  const docs = filterDocumentsForScope(json.docs, selectedScope);
  const scopedDocs = decorateDocumentsForScope(docs, selectedScope);

  return createToolTextResult({
    ...json,
    success: scopedDocs.length > 0 ? json.success ?? true : false,
    docs: scopedDocs,
    total_returned: scopedDocs.length,
    has_more: false,
    selected_scope: scopeOption.label,
    next_steps:
      scopedDocs.length > 0
        ? json.next_steps
        : {
            summary: `No ${scopeOption.label} documents matched this search.`,
            options: [
              `Only ${scopeOption.label} documents and shared summary documents are allowed for this request.`,
            ],
          },
  });
}

function getSearchResultCount(result: unknown) {
  const json = parseToolJson<{
    docs?: NamedDocument[];
  }>(result);

  if (!json || !Array.isArray(json.docs)) {
    return 0;
  }

  return json.docs.length;
}

function createOutOfScopeToolResult(
  toolName: string,
  docName: string,
  selectedScope: ContractScope,
) {
  const scopeOption = getContractScopeOption(selectedScope);

  return createToolTextResult({
    success: false,
    tool: toolName,
    doc_name: docName,
    selected_scope: scopeOption.label,
    error: "The requested document is outside the selected contract scope.",
    allowed_documents: `Only ${scopeOption.label} documents and shared summary documents are allowed.`,
  });
}

function createToolExecutionErrorResult(toolName: string, error: unknown) {
  return createToolTextResult({
    success: false,
    tool: toolName,
    error: "PageIndex tool execution failed.",
    message: getErrorMessage(error),
    next_steps: {
      summary: "The document retrieval service did not return usable content.",
      options: [
        `Reply with exactly: "${SERVICE_UNAVAILABLE_RESPONSE}"`,
      ],
    },
  });
}

function createScopedSummaryDocumentResult(
  docName: string,
  selectedScope: ContractScope,
) {
  const scopeOption = getContractScopeOption(selectedScope);
  const allowedPages = getSharedSummaryPageRange(selectedScope);

  return createToolTextResult({
    success: true,
    doc_name: docName,
    selected_scope: scopeOption.label,
    shared_summary_pages: allowedPages,
    next_steps: {
      summary: `Use the shared summary only within pages ${allowedPages} for ${scopeOption.label}.`,
      options: [
        `Call get_page_content(doc_name: "${docName}", pages: "${allowedPages}")`,
      ],
    },
  });
}

function createSharedSummaryStructureBlockedResult(
  docName: string,
  selectedScope: ContractScope,
) {
  const scopeOption = getContractScopeOption(selectedScope);
  const allowedPages = getSharedSummaryPageRange(selectedScope);

  return createToolTextResult({
    success: false,
    tool: "get_document_structure",
    doc_name: docName,
    selected_scope: scopeOption.label,
    error: "Shared summary structure is disabled for scoped requests.",
    shared_summary_pages: allowedPages,
    next_steps: {
      summary: `Use get_page_content only within pages ${allowedPages} for ${scopeOption.label}.`,
      options: [
        `Call get_page_content(doc_name: "${docName}", pages: "${allowedPages}")`,
      ],
    },
  });
}

function withScopedSummaryPages(
  input: unknown,
  selectedScope: ContractScope,
) {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const allowedPages = getSharedSummaryPageRange(selectedScope);
  const requestedPages = getRequestedPages(input);
  const scopedSummaryDocumentId = getScopedSummaryDocumentId(selectedScope);
  const summaryDocumentInput = scopedSummaryDocumentId
    ? {
        ...input,
        doc_id: scopedSummaryDocumentId,
      }
    : input;

  if (
    typeof requestedPages === "string" &&
    isSharedSummaryPageSelectionAllowed(requestedPages, selectedScope)
  ) {
    return summaryDocumentInput;
  }

  return {
    ...summaryDocumentInput,
    pages: allowedPages,
  };
}

function filterMessagesForScope(
  messages: ChatMessage[],
  selectedScope: ContractScope,
) {
  const hasScopeMetadata = messages.some(
    (message) => typeof message.metadata?.scope === "string",
  );

  if (!hasScopeMetadata) {
    return messages;
  }

  return messages.filter((message) => message.metadata?.scope === selectedScope);
}

function getUiMessageText(message: ChatMessage) {
  return getChatMessageText(message);
}

function getLatestUserMessage(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role === "user") {
      return message;
    }
  }

  return undefined;
}

function isRetrievalToolName(toolName: string | undefined) {
  return typeof toolName === "string" && RETRIEVAL_TOOL_NAMES.has(toolName);
}

function writeRetrievalStatus(
  writer: UIMessageStreamWriter<ChatMessage>,
  status: RetrievalStatus,
) {
  writer.write({
    type: "data-retrievalStatus",
    data: status,
    transient: true,
  });
}

function syncRetrievalStatusFromChunk(
  writer: UIMessageStreamWriter<ChatMessage>,
  chunk: UIMessageChunk<unknown, ChatDataParts>,
  retrievalState: {
    active: boolean;
    toolName?: string;
    toolCallId?: string;
  },
) {
  switch (chunk.type) {
    case "tool-input-start":
    case "tool-input-available": {
      if (!isRetrievalToolName(chunk.toolName)) {
        return;
      }

      if (retrievalState.active) {
        return;
      }

      retrievalState.active = true;
      retrievalState.toolName = chunk.toolName;
      retrievalState.toolCallId = chunk.toolCallId;
      writeRetrievalStatus(writer, {
        active: true,
        label: RETRIEVAL_STATUS_LABEL,
        toolName: chunk.toolName,
        toolCallId: chunk.toolCallId,
      });
      return;
    }

    case "text-start":
    case "text-delta":
    case "finish":
    case "abort":
    case "error": {
      if (!retrievalState.active) {
        return;
      }

      const { toolName, toolCallId } = retrievalState;
      retrievalState.active = false;
      retrievalState.toolName = undefined;
      retrievalState.toolCallId = undefined;
      writeRetrievalStatus(writer, {
        active: false,
        label: RETRIEVAL_STATUS_LABEL,
        toolName,
        toolCallId,
      });
      return;
    }

    default:
      return;
  }
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

type RetrievalTraceItem = {
  id?: string | number;
  name?: string;
  document_name?: string;
  page?: number;
  page_number?: number;
  text?: string;
  content?: string;
  snippet?: string;
  excerpt?: string;
  excerpt_text?: string;
  page_ref?: string;
};

type RetrievalTraceSummary = {
  query: string;
  docCount: number;
  docIds: string;
  rawText: string;
  hasStructuredJson: boolean;
} & RetrievalAuditTraceData;

function buildTraceSummary(input: unknown, output: unknown): RetrievalTraceSummary {
  const query =
    typeof input === "object" &&
    input !== null &&
    "query" in input &&
    typeof input.query === "string"
      ? input.query
      : safeJsonStringify(input);

  const json = parseToolJson<{
    docs?: RetrievalTraceItem[];
    content?: RetrievalTraceItem[];
    text?: string;
    content_text?: string;
  }>(output);
  const items = json?.docs ?? json?.content ?? [];
  const rawText = extractToolText(output);
  const docCount = items.length || (rawText ? 1 : 0);
  const docIds = items
    .map((item, index) => {
      const parts = [
        item.id != null ? String(item.id) : null,
        item.document_name ?? item.name ?? null,
        item.page_ref ?? null,
        item.page != null ? `page:${item.page}` : null,
        item.page_number != null ? `page:${item.page_number}` : null,
      ].filter((value): value is string => Boolean(value));

      return parts.length > 0 ? parts.join("@") : `item:${index + 1}`;
    })
    .join(", ");
  const snippets = (
    items.length > 0
      ? items.map((item) =>
          normalizeWhitespace(
            item.excerpt_text ??
              item.text ??
              item.content ??
              item.snippet ??
              item.excerpt ??
              "",
          ),
        )
      : [normalizeWhitespace(rawText)]
  )
    .filter(Boolean)
    .slice(0, 2)
    .map((snippet) => truncateForTrace(snippet, 300));
  const documentNames = Array.from(
    new Set(
      [
        ...items
          .map((item) => item.document_name?.trim() ?? item.name?.trim())
          .filter((value): value is string => Boolean(value)),
        getRequestedDocumentName(input)?.trim(),
      ].filter((value): value is string => Boolean(value)),
    ),
  );
  const pageRefs = Array.from(
    new Set(
      [
        ...items
          .map((item) => {
            if (typeof item.page_ref === "string" && item.page_ref.trim().length > 0) {
              return item.page_ref.trim();
            }

            if (typeof item.page === "number") {
              return String(item.page);
            }

            if (typeof item.page_number === "number") {
              return String(item.page_number);
            }

            return undefined;
          })
          .filter((value): value is string => Boolean(value)),
        getRequestedPages(input)?.trim(),
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  return {
    query,
    docCount,
    docIds,
    snippets,
    rawText,
    hasStructuredJson: Boolean(json),
    documentNames,
    pageRefs,
  };
}

function traceRetrieval(toolName: string, input: unknown, output: unknown) {
  const summary = buildTraceSummary(input, output);

  console.log(`[TRACE] QUERY: ${summary.query}`);
  console.log(`[TRACE] DOC_COUNT: ${summary.docCount}`);
  console.log(`[TRACE] DOC_IDS: ${summary.docIds || "none"}`);
  console.log("[TRACE] SNIPPETS:");

  if (summary.snippets.length === 0) {
    console.log("- none");
    return summary;
  }

  for (const snippet of summary.snippets) {
    console.log(`- ${snippet}`);
  }

  if (!summary.hasStructuredJson && summary.rawText) {
    console.log(
      `[TRACE] RAW_${toolName.toUpperCase()}: ${truncateForTrace(summary.rawText, 1000)}`,
    );
  }

  return summary;
}

type ToolWithExecute = {
  execute: (...args: never[]) => unknown;
};

function updateEvidenceObservability(
  runtimeState: RouteRuntimeState,
  evidenceSummary: ReturnType<typeof buildCompactEvidenceItems>,
) {
  runtimeState.evidenceItemsBeforeDedupe = Math.max(
    runtimeState.evidenceItemsBeforeDedupe,
    evidenceSummary.rawCount,
  );
  runtimeState.evidenceItemsAfterDedupe = Math.max(
    runtimeState.evidenceItemsAfterDedupe,
    evidenceSummary.items.length,
  );
  runtimeState.evidenceChars = Math.max(
    runtimeState.evidenceChars,
    evidenceSummary.totalChars,
  );
}

function withScopedRetrieval<TOOLS extends Record<string, ToolWithExecute>>(
  tools: TOOLS,
  selectedScope: ContractScope,
  runtimeState: RouteRuntimeState,
): TOOLS {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => {
      const execute = (async (...args: Parameters<typeof tool.execute>) => {
        try {
          if (toolName === "find_relevant_documents") {
            const scopedInput = withScopeSearchInput(args[0]);
            const result = await tool.execute(
              ...([scopedInput, ...args.slice(1)] as Parameters<typeof tool.execute>),
            );
            const filteredResult = filterSearchDocumentsResult(result, selectedScope);
            runtimeState.searchResultCount = getSearchResultCount(filteredResult);

            return filteredResult;
          }

          if (toolName === "recent_documents") {
            const result = await tool.execute(...args);

            return filterRecentDocumentsResult(result, selectedScope);
          }

          if (
            toolName === "get_document" ||
            toolName === "get_page_content" ||
            toolName === "get_document_structure"
          ) {
            if (false && runtimeState.primaryAgreementDocumentName) {
              const scopedInput = withPrimaryAgreementDocumentInput(
                args[0],
                runtimeState.primaryAgreementDocumentName!,
              );
              const result = await tool.execute(
                ...([scopedInput, ...args.slice(1)] as Parameters<typeof tool.execute>),
              );

              return result;
            }

            const docName = getRequestedDocumentName(args[0]);

            if (
              typeof docName === "string" &&
              !isDocumentAllowedForScope(docName, selectedScope)
            ) {
              return createOutOfScopeToolResult(toolName, docName, selectedScope);
            }

            if (
              typeof docName === "string" &&
              isSharedSummaryDocumentName(docName)
            ) {
              if (toolName === "get_document") {
                return createScopedSummaryDocumentResult(docName, selectedScope);
              }

              if (toolName === "get_document_structure") {
                return createSharedSummaryStructureBlockedResult(
                  docName,
                  selectedScope,
                );
              }

              if (toolName === "get_page_content") {
                const scopedInput = withScopedSummaryPages(args[0], selectedScope);
                const result = await tool.execute(
                  ...([scopedInput, ...args.slice(1)] as Parameters<typeof tool.execute>),
                );
                runtimeState.pageContentFetchCount += 1;

                const excerptPacket = buildExcerptPacket(
                  scopedInput,
                  result,
                  toolName,
                );
                const evidenceSummary = buildCompactEvidenceItems(excerptPacket);

                updateEvidenceObservability(runtimeState, evidenceSummary);

                return result;
              }
            }

            if (toolName === "get_page_content") {
              const result = await tool.execute(...args);
              runtimeState.pageContentFetchCount += 1;
              const excerptPacket = buildExcerptPacket(args[0], result, toolName);
              const evidenceSummary = buildCompactEvidenceItems(excerptPacket);

              updateEvidenceObservability(runtimeState, evidenceSummary);

              return result;
            }
          }

          return tool.execute(...args);
        } catch (error) {
          console.error(`[chat] tool:error name=${toolName}`, error);

          return createToolExecutionErrorResult(toolName, error);
        }
      }) as typeof tool.execute;

      return [
        toolName,
        {
          ...tool,
          execute,
        },
      ];
    }),
  ) as TOOLS;
}

function withTraceLogging<TOOLS extends Record<string, ToolWithExecute>>(
  tools: TOOLS,
  retrievalAuditCollector?: ReturnType<typeof createRetrievalAuditCollector>,
): TOOLS {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => {
      const execute = (async (...args: Parameters<typeof tool.execute>) => {
        const result = await tool.execute(...args);

        if (
          toolName === "recent_documents" ||
          toolName === "find_relevant_documents" ||
          toolName === "get_document" ||
          toolName === "get_page_content" ||
          toolName === "get_document_structure"
        ) {
          const excerptPacket = buildExcerptPacket(args[0], result, toolName);
          const summary = traceRetrieval(toolName, args[0], result);

          if (retrievalAuditCollector) {
            retrievalAuditCollector.recordToolResult(
              toolName,
              summary,
              excerptPacket,
            );
          }
        }

        return result;
      }) as typeof tool.execute;

      return [
        toolName,
        {
          ...tool,
          execute,
        },
      ];
    }),
  ) as TOOLS;
}

function logToolMetadata(
  tools: Record<
    string,
    {
      execute?: unknown;
      description?: unknown;
      inputSchema?: unknown;
      parameters?: unknown;
    }
  >,
) {
  for (const [toolName, tool] of Object.entries(tools)) {
    const hasExecute = typeof tool.execute === "function";
    const hasDescription =
      typeof tool.description === "string" && tool.description.trim().length > 0;
    const hasInputSchema =
      typeof tool.inputSchema === "object" &&
      tool.inputSchema !== null &&
      Object.keys(tool.inputSchema).length > 0;
    const hasParameters =
      typeof tool.parameters === "object" &&
      tool.parameters !== null &&
      Object.keys(tool.parameters).length > 0;

    console.log(
      `[chat] tool name=${toolName} execute=${hasExecute} description=${hasDescription} schema=${
        hasInputSchema || hasParameters
      }`,
    );
  }
}

function logToolChunk(
  chunk: {
    type: string;
    toolName?: string;
    toolCallId?: string;
    delta?: string;
  },
) {
  if (
    chunk.type !== "tool-input-start" &&
    chunk.type !== "tool-input-delta" &&
    chunk.type !== "tool-input-end" &&
    chunk.type !== "tool-call" &&
    chunk.type !== "tool-result"
  ) {
    return;
  }

  const delta =
    typeof chunk.delta === "string" && chunk.delta.length > 0
      ? ` delta=${truncateForTrace(chunk.delta, 120)}`
      : "";

  console.log(
    `[chat] tool-event type=${chunk.type}` +
      (chunk.toolName ? ` name=${chunk.toolName}` : "") +
      (chunk.toolCallId ? ` id=${chunk.toolCallId}` : "") +
      delta,
  );
}

function createStaticAssistantResponse(
  originalMessages: ChatMessage[],
  text: string,
  selectedScope: ContractScope,
  sessionContext: ChatSessionContext,
  retrievalAuditCollector: ReturnType<typeof createRetrievalAuditCollector>,
) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<ChatMessage>({
      originalMessages,
      onFinish: async ({ responseMessage }) => {
        const responseText = getUiMessageText(responseMessage);
        console.log(`[TRACE] FINAL_ANSWER:\n${responseText}`);

        if (normalizeWhitespace(responseText).length === 0) {
          console.log("[chat] persist:assistant:skipped-empty");
          return;
        }

        try {
          await persistAssistantTurnWithAuditIfNeeded(
            sessionContext,
            responseMessage,
            retrievalAuditCollector.toRecord(),
          );
        } catch (error) {
          console.error("[chat] persist:assistant:error", error);
        }
      },
      execute: ({ writer }) => {
        const textId = crypto.randomUUID();
        writer.write({
          type: "start",
          messageMetadata: {
            scope: selectedScope,
          },
        });
        writer.write({
          type: "message-metadata",
          messageMetadata: {
            scope: selectedScope,
          },
        });
        writer.write({
          type: "text-start",
          id: textId,
        });
        writer.write({
          type: "text-delta",
          id: textId,
          delta: text,
        });
        writer.write({
          type: "text-end",
          id: textId,
        });
        writer.write({
          type: "finish",
          messageMetadata: {
            scope: selectedScope,
          },
        });
      },
    }),
  });
}

export async function POST(request: Request) {
  const {
    messages,
    selectedScope: rawSelectedScope,
    chatId: rawChatId,
  }: {
    messages: ChatMessage[];
    selectedScope?: ContractScope;
    chatId?: string;
  } = await request.json();

  const chatSession = await resolveChatSession(rawChatId);

  if (chatSession.kind === "unauthorized") {
    console.error("[chat] request:unauthorized", chatSession.error);
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (chatSession.kind === "forbidden") {
    console.error(
      `[chat] request:forbidden-chat user=${chatSession.userId} chatId=${chatSession.chatId}`,
    );
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionContext = chatSession.context;
  const { userId, chatId } = sessionContext;
  const selectedScope = parseContractScope(rawSelectedScope);
  const scopedMessages = filterMessagesForScope(messages, selectedScope);
  const latestUserMessage = getLatestUserMessage(messages);
  const retrievalAuditCollector = createRetrievalAuditCollector(
    selectedScope,
    latestUserMessage ? getUiMessageText(latestUserMessage) : "",
  );
  const runtimeState: RouteRuntimeState = {
    latestUserText: latestUserMessage
      ? normalizeWhitespace(getUiMessageText(latestUserMessage))
      : "",
    queryMode: latestUserMessage
      ? getQueryMode(getUiMessageText(latestUserMessage))
      : "lookup",
    searchResultCount: 0,
    pageContentFetchCount: 0,
    priorHistoryIncluded: false,
    carriedHistoryCount: 0,
    carriedHistoryChars: 0,
    evidenceItemsBeforeDedupe: 0,
    evidenceItemsAfterDedupe: 0,
    evidenceChars: 0,
    primaryAgreementDocumentName: getPrimaryAgreementDocumentName(selectedScope),
  };
  const modelMessages = buildScopedModelMessages(scopedMessages, runtimeState);
  runtimeState.queryMode = getQueryMode(runtimeState.latestUserText);
  const systemPrompt = buildSystemPrompt(selectedScope, runtimeState.queryMode);

  await persistUserTurnIfNeeded(sessionContext, latestUserMessage);

  console.log(
    `[chat] request:start messages=${messages.length} scopedMessages=${scopedMessages.length} scope=${selectedScope}` +
      (userId ? ` user=${userId}` : "") +
      (chatId ? ` chatId=${chatId}` : ""),
  );
  console.log(
    `[chat] context historyIncluded=${runtimeState.priorHistoryIncluded}` +
      ` carriedHistoryCount=${runtimeState.carriedHistoryCount}` +
      ` carriedHistoryChars=${runtimeState.carriedHistoryChars}` +
      ` queryMode=${runtimeState.queryMode}`,
  );

  if (isObviousOutOfScopeQuery(runtimeState.latestUserText)) {
    console.log("[chat] request:early-out-of-scope");

    return createStaticAssistantResponse(
      messages,
      OUT_OF_SCOPE_RESPONSE,
      selectedScope,
      sessionContext,
      retrievalAuditCollector,
    );
  }

  const mcp = await createMCPClient({
    transport: {
      type: "http",
      url: "https://api.pageindex.ai/mcp",
      headers: {
        Authorization: `Bearer ${process.env.PI_API}`,
      },
    },
  });

  try {
    const tools = await mcp.tools();
    const filteredTools = Object.fromEntries(
      Object.entries(tools).filter(([toolName]) =>
        ALLOWED_CHAT_TOOL_NAMES.includes(
          toolName as (typeof ALLOWED_CHAT_TOOL_NAMES)[number],
        ),
      ),
    ) as typeof tools;
    const chatTools = withTraceLogging(
      withScopedRetrieval(filteredTools, selectedScope, runtimeState),
      retrievalAuditCollector,
    );

    console.log(
      `[chat] request:tools-loaded count=${Object.keys(chatTools).length}`,
    );
    logToolMetadata(
      chatTools as Record<
        string,
        {
          execute?: unknown;
          description?: unknown;
          inputSchema?: unknown;
          parameters?: unknown;
        }
      >,
    );

    console.log(
      `[TRACE] MODEL_CONTEXT:\n${truncateForTrace(
        formatModelContext(systemPrompt, modelMessages),
        1000,
      )}`,
    );
    console.log("[chat] streamText:start");
    const result = streamText({
      model: deepseek("deepseek-chat"),
      stopWhen: stepCountIs(5),
      tools: chatTools,
      system: systemPrompt,
      messages: modelMessages,
      prepareStep: async ({ stepNumber }) => {
        if (runtimeState.queryMode === "lookup") {
          if (false) {
            return {
              activeTools: ["get_document_structure"],
              toolChoice: { type: "tool", toolName: "get_document_structure" },
            };
          }

          if (stepNumber === 0) {
            return {
              activeTools: ["find_relevant_documents"],
              toolChoice: { type: "tool", toolName: "find_relevant_documents" },
            };
          }

          if (stepNumber === 1 && !runtimeState.primaryAgreementDocumentName) {
            return {
              activeTools: ["get_document_structure"],
              toolChoice: { type: "tool", toolName: "get_document_structure" },
            };
          }

          return {
            activeTools: [
              "get_document_structure",
              "get_page_content",
            ],
          };
        }

        if (stepNumber === 0) {
          return { toolChoice: "required" };
        }

        return undefined;
      },
      onChunk: async ({ chunk }) => {
        logToolChunk(chunk as {
          type: string;
          toolName?: string;
          toolCallId?: string;
          delta?: string;
        });
      },
      onError: ({ error }) => {
        console.error("[chat] streamText:error", error);
      },
      onStepFinish: ({
        finishReason,
        rawFinishReason,
        toolCalls,
        toolResults,
      }) => {
        const toolCallNames = toolCalls.map((toolCall) => toolCall.toolName);
        const toolResultNames = toolResults.map(
          (toolResult) => toolResult.toolName,
        );

        console.log(
          `[chat] finish=${finishReason}` +
            (rawFinishReason ? ` raw=${rawFinishReason}` : "") +
            ` toolCalls=${toolCalls.length}` +
            (toolCallNames.length
              ? ` [${toolCallNames.join(", ")}]`
              : "") +
            ` toolResults=${toolResults.length}` +
            (toolResultNames.length
              ? ` [${toolResultNames.join(", ")}]`
              : ""),
        );
      },
      onFinish: async (event) => {
        retrievalAuditCollector.setUsageFields(mapUsageAndCost(event));
        console.log(
          `[chat] observability historyIncluded=${runtimeState.priorHistoryIncluded}` +
            ` evidenceBefore=${runtimeState.evidenceItemsBeforeDedupe}` +
            ` evidenceAfter=${runtimeState.evidenceItemsAfterDedupe}` +
            ` evidenceChars=${runtimeState.evidenceChars}` +
            ` searchResultCount=${runtimeState.searchResultCount}` +
            ` pageContentFetchCount=${runtimeState.pageContentFetchCount}`,
        );
        console.log("[chat] streamText:onFinish");
        await mcp.close();
        console.log("[chat] mcp:closed");
      },
    });

    console.log("[chat] response:returning-ui-stream");
    return createUIMessageStreamResponse({
      stream: createUIMessageStream<ChatMessage>({
        originalMessages: messages,
        onFinish: async ({ responseMessage }) => {
          const responseText = getUiMessageText(responseMessage);
          console.log(`[TRACE] FINAL_ANSWER:\n${responseText}`);

          if (normalizeWhitespace(responseText).length === 0) {
            console.log("[chat] persist:assistant:skipped-empty");
            return;
          }

          try {
            await persistAssistantTurnWithAuditIfNeeded(
              sessionContext,
              responseMessage,
              retrievalAuditCollector.toRecord(),
            );
          } catch (error) {
            console.error("[chat] persist:assistant:error", error);
          }
        },
        execute: async ({ writer }) => {
          const retrievalState = {
            active: false,
            toolName: undefined as string | undefined,
            toolCallId: undefined as string | undefined,
          };
          const uiStream = result.toUIMessageStream<ChatMessage>({
            messageMetadata: () => ({
              scope: selectedScope,
            }),
            onError: (error) => {
              console.error("[chat] ui-stream:error", error);

              return SERVICE_UNAVAILABLE_RESPONSE;
            },
          });
          const reader = uiStream.getReader();
          let sawStart = false;
          let assistantText = "";
          let bufferedStepTextChunks: Parameters<typeof writer.write>[0][] = [];
          let stepHasToolActivity = false;
          const flushBufferedStepText = () => {
            for (const bufferedValue of bufferedStepTextChunks) {
              if (bufferedValue.type === "text-delta") {
                assistantText += bufferedValue.delta;
              }

              writer.write(bufferedValue);
            }

            bufferedStepTextChunks = [];
          };
          const discardBufferedStepText = () => {
            bufferedStepTextChunks = [];
          };

          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              syncRetrievalStatusFromChunk(
                writer,
                value,
                retrievalState,
              );
              if (value.type === "start") {
                sawStart = true;
              }

              if (value.type === "start-step") {
                bufferedStepTextChunks = [];
                stepHasToolActivity = false;
                writer.write(value);
                continue;
              }

              if (value.type.startsWith("tool-")) {
                stepHasToolActivity = true;
              }

              if (
                value.type === "text-start" ||
                value.type === "text-delta" ||
                value.type === "text-end"
              ) {
                bufferedStepTextChunks.push(value);
                continue;
              }

              if (value.type === "finish-step") {
                if (stepHasToolActivity) {
                  discardBufferedStepText();
                } else {
                  flushBufferedStepText();
                }

                writer.write(value);
                continue;
              }

              if (value.type === "finish" && !stepHasToolActivity) {
                flushBufferedStepText();
              } else if (value.type === "finish") {
                discardBufferedStepText();
              }

              if (
                value.type === "finish" &&
                normalizeWhitespace(assistantText).length === 0 &&
                (runtimeState.searchResultCount > 0 ||
                  runtimeState.pageContentFetchCount > 0)
              ) {
                const fallbackTextId = crypto.randomUUID();

                writer.write({
                  type: "text-start",
                  id: fallbackTextId,
                });
                writer.write({
                  type: "text-delta",
                  id: fallbackTextId,
                  delta: INSUFFICIENT_EVIDENCE_RESPONSE,
                });
                writer.write({
                  type: "text-end",
                  id: fallbackTextId,
                });
                assistantText = INSUFFICIENT_EVIDENCE_RESPONSE;
              }

              writer.write(value);
            }
          } catch (error) {
            console.error("[chat] ui-stream:read:error", error);

            if (!sawStart) {
              writer.write({
                type: "start",
                messageMetadata: {
                  scope: selectedScope,
                },
              });
              writer.write({
                type: "message-metadata",
                messageMetadata: {
                  scope: selectedScope,
                },
              });
            }

            const textId = crypto.randomUUID();
            writer.write({
              type: "text-start",
              id: textId,
            });
            writer.write({
              type: "text-delta",
              id: textId,
              delta: SERVICE_UNAVAILABLE_RESPONSE,
            });
            writer.write({
              type: "text-end",
              id: textId,
            });
            writer.write({
              type: "finish",
              messageMetadata: {
                scope: selectedScope,
              },
            });
          } finally {
            if (retrievalState.active) {
              retrievalState.active = false;
              writeRetrievalStatus(writer, {
                active: false,
                label: RETRIEVAL_STATUS_LABEL,
                toolName: retrievalState.toolName,
                toolCallId: retrievalState.toolCallId,
              });
            }

            reader.releaseLock();
          }
        },
      }),
    });
  } catch (error) {
    console.error("[chat] request:error", error);
    await mcp.close();
    console.log("[chat] mcp:closed-after-error");
    throw error;
  }
}

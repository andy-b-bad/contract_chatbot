import { createMCPClient } from "@ai-sdk/mcp";
import { createDeepSeek } from "@ai-sdk/deepseek";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
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

type RetrievalStatus = {
  active: boolean;
  label: string;
  toolName?: string;
  toolCallId?: string;
};

type ChatDataParts = {
  retrievalStatus: RetrievalStatus;
};

type ChatMessageMetadata = {
  scope: ContractScope;
};

type ChatMessage = UIMessage<ChatMessageMetadata, ChatDataParts>;

const BASE_SYSTEM_PROMPT = `You are a document-grounded assistant for a UK audience.

You ONLY answer using the provided documents and previously retrieved document content in this conversation.
You MUST NOT use general knowledge, assumptions, likely interpretations, industry norms, or outside facts.
If the documents do not explicitly support the answer, you must refuse.

Decision order:
1. If the user asks something clearly unrelated to the provided documents or asks for general world knowledge, reply with exactly:
"I can only answer questions about the provided documents."
2. If the question could be about a contract, policy, clause, payment term, notice period, leave, overtime, rate, entitlement, obligation, definition, formula, or other document topic, treat it as potentially in scope and check the documents before refusing.
3. If the answer is already explicitly supported by previously retrieved document content in the conversation, answer directly from that content and do NOT call any tools.
4. Otherwise, use the available retrieval tools to find the minimum evidence needed.
5. If the first retrieval is insufficient, you may make at most one more targeted retrieval.
6. If the answer is still not explicitly stated or directly calculable from retrieved wording, reply with exactly:
"I cannot find this information in the provided documents."

Grounding rules:
- Retrieval-first: do not answer a document question before you have explicit supporting text.
- Evidence-only: every factual statement in the answer must be traceable to retrieved document wording.
- No guessing: do not infer missing meanings, fill gaps, or answer from common contract knowledge.
- No paraphrase drift: if the document gives exact wording, quote or closely cite that wording instead of replacing it with a looser summary.
- If the documents are ambiguous, partial, or silent on the exact point asked, refuse with the required fallback sentence.
- If a value can be directly transformed from retrieved wording, perform only that minimal transformation and nothing more.

Behaviour:
- Respond in English.
- Never describe what you are doing.
- Never say things like "I will search", "let me check", or "I found".
- Only output the final answer.
- Keep answers concise, precise, and document-bound.
- Follow the user's instructions exactly.
- Never invent document names. Only use exact document names returned by the tools.
- Reuse previously retrieved information whenever it is sufficient.
- Do not perform additional searches if the answer can already be given from existing evidence.
- As soon as you have enough evidence, stop and answer.

Tool strategy:
- For a simple factual document question, prefer the shortest path to the exact clause or wording.
- After finding a relevant document, go straight to the relevant content if possible.
- Do not call get_document_structure unless the question requires document organisation or you genuinely need structure to locate the answer.

Answer style:
- Give the answer in 1-3 sentences where possible.
- When available, include the exact quoted wording or a brief clause/page reference.
- Prefer exact wording over summary when the document text directly answers the question.
- For a straightforward lookup that is explicitly answered by a summary table or rate card line, answer from that line alone and do not add nearby definitions, neighbouring clauses, or extra context unless the user asks for it.
- Do not broaden the answer beyond what the documents say.
- Do not prefix the answer with phrases like "Based on the retrieved document" or similar process commentary.
- Preserve requested formats exactly. If the user asks for a fraction, output only a plain ASCII fraction in a/b form rather than a percentage, decimal, or mixed numeral.
- When re-expressing an already known value, transform the retrieved value directly instead of searching again.`;

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

function buildSystemPrompt(selectedScope: ContractScope) {
  const scopeOption = getContractScopeOption(selectedScope);
  const sharedSummaryPages = getSharedSummaryPageRange(selectedScope);

  return `${BASE_SYSTEM_PROMPT}

Selected contract scope: ${scopeOption.label}.

Scope rules:
- The selected contract scope is authoritative for this request.
- You may use ${scopeOption.label} documents and shared summary documents only.
- Shared summary documents apply to every scope.
- For straightforward rates, definitions, payments, overtime, holiday, travel, or similar lookup questions, prefer a shared summary document first when it explicitly answers the question.
- For shared summary documents in this scope, only use pages ${sharedSummaryPages}.
- Do NOT call get_document_structure on a shared summary document.
- If you use a shared summary document, call get_page_content directly with pages "${sharedSummaryPages}" or a subrange within it.
- Only consult the full agreement when the shared summary document does not explicitly answer, or when the user clearly needs fuller contractual wording.
- Do NOT answer from a different contract scope.
- Only reuse previously retrieved content if it comes from the same selected scope or a shared summary document.
- Do not add content from adjacent pages or neighbouring contract sections in the shared summary document.`;
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

function withScopeSearchInput(input: unknown, selectedScope: ContractScope) {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const scopeOption = getContractScopeOption(selectedScope);
  const query =
    "query" in input && typeof input.query === "string" ? input.query.trim() : "";
  const limit =
    "limit" in input && typeof input.limit === "number"
      ? Math.max(input.limit, 12)
      : 12;

  return {
    ...input,
    query: query
      ? `${query} ${scopeOption.searchHint}`
      : scopeOption.searchHint,
    limit,
  };
}

function filterDocumentsForScope<T extends NamedDocument>(
  docs: T[],
  selectedScope: ContractScope,
) {
  const summaryDocs: T[] = [];
  const scopeDocs: T[] = [];
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

    if (isSharedSummaryDocumentName(docName)) {
      summaryDocs.push(doc);
    } else {
      scopeDocs.push(doc);
    }
  }

  return [...summaryDocs, ...scopeDocs];
}

function decorateDocumentsForScope(
  docs: NamedDocument[],
  selectedScope: ContractScope,
) {
  const sharedSummaryPages = getSharedSummaryPageRange(selectedScope);

  return docs.map((doc) => {
    if (
      typeof doc.name === "string" &&
      isSharedSummaryDocumentName(doc.name)
    ) {
      return {
        ...doc,
        shared_summary_pages: sharedSummaryPages,
      };
    }

    return doc;
  });
}

function getSharedSummaryNextStepOption(
  docs: NamedDocument[],
  selectedScope: ContractScope,
) {
  const summaryDoc = docs.find(
    (doc) =>
      typeof doc.name === "string" &&
      isSharedSummaryDocumentName(doc.name),
  );

  if (typeof summaryDoc?.name !== "string") {
    return null;
  }

  const sharedSummaryPages = getSharedSummaryPageRange(selectedScope);

  return `For the shared summary, call get_page_content(doc_name: "${summaryDoc.name}", pages: "${sharedSummaryPages}")`;
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
  const sharedSummaryOption = getSharedSummaryNextStepOption(
    scopedDocs,
    selectedScope,
  );

  return createToolTextResult({
    ...json,
    docs: scopedDocs,
    ready_count: readyCount,
    processing_count: processingCount,
    has_more: false,
    selected_scope: getContractScopeOption(selectedScope).label,
    next_steps:
      sharedSummaryOption && typeof json.next_steps === "object" && json.next_steps !== null
        ? {
            ...json.next_steps,
            options: Array.isArray((json.next_steps as { options?: unknown }).options)
              ? [
                  ...((json.next_steps as { options: string[] }).options),
                  sharedSummaryOption,
                ]
              : [sharedSummaryOption],
          }
        : json.next_steps,
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
  const sharedSummaryOption = getSharedSummaryNextStepOption(
    scopedDocs,
    selectedScope,
  );

  return createToolTextResult({
    ...json,
    success: scopedDocs.length > 0 ? json.success ?? true : false,
    docs: scopedDocs,
    total_returned: scopedDocs.length,
    has_more: false,
    selected_scope: scopeOption.label,
    next_steps:
      scopedDocs.length > 0
        ? sharedSummaryOption &&
          typeof json.next_steps === "object" &&
          json.next_steps !== null
          ? {
              ...json.next_steps,
              options: Array.isArray((json.next_steps as { options?: unknown }).options)
                ? [
                    ...((json.next_steps as { options: string[] }).options),
                    sharedSummaryOption,
                  ]
                : [sharedSummaryOption],
            }
          : json.next_steps
        : {
            summary: `No ${scopeOption.label} documents matched this search.`,
            options: [
              `Only ${scopeOption.label} documents and shared summary documents are allowed for this request.`,
            ],
          },
  });
}

function parseToolDocs(result: unknown) {
  const json = parseToolJson<{
    docs?: NamedDocument[];
  }>(result);

  if (!json || !Array.isArray(json.docs)) {
    return null;
  }

  return json.docs;
}

function createFallbackSearchResult(
  docs: NamedDocument[],
  selectedScope: ContractScope,
) {
  const scopeOption = getContractScopeOption(selectedScope);
  const sharedSummaryOption = getSharedSummaryNextStepOption(
    docs,
    selectedScope,
  );

  return createToolTextResult({
    success: docs.length > 0,
    docs,
    search_mode: "scope_fallback_recent_documents",
    total_returned: docs.length,
    has_more: false,
    selected_scope: scopeOption.label,
    next_steps: {
      summary: `No direct ${scopeOption.label} search match. Showing allowed recent documents instead.`,
      options: [
        `${docs.length} allowed document(s) are available for ${scopeOption.label}.`,
        ...(sharedSummaryOption ? [sharedSummaryOption] : []),
      ],
    },
  });
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

  if (
    typeof requestedPages === "string" &&
    isSharedSummaryPageSelectionAllowed(requestedPages, selectedScope)
  ) {
    return input;
  }

  return {
    ...input,
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
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
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

function traceRetrieval(toolName: string, input: unknown, output: unknown) {
  const query =
    typeof input === "object" &&
    input !== null &&
    "query" in input &&
    typeof input.query === "string"
      ? input.query
      : safeJsonStringify(input);

  const json = parseToolJson<{
    docs?: Array<{
      id?: string | number;
      name?: string;
      page?: number;
      page_number?: number;
      text?: string;
      content?: string;
      snippet?: string;
      excerpt?: string;
      page_ref?: string;
    }>;
    content?: Array<{
      id?: string | number;
      name?: string;
      page?: number;
      page_number?: number;
      text?: string;
      content?: string;
      snippet?: string;
      excerpt?: string;
      page_ref?: string;
    }>;
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
        item.name ?? null,
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

  console.log(`[TRACE] QUERY: ${query}`);
  console.log(`[TRACE] DOC_COUNT: ${docCount}`);
  console.log(`[TRACE] DOC_IDS: ${docIds || "none"}`);
  console.log("[TRACE] SNIPPETS:");

  if (snippets.length === 0) {
    console.log("- none");
    return;
  }

  for (const snippet of snippets) {
    console.log(`- ${snippet}`);
  }

  if (!json && rawText) {
    console.log(`[TRACE] RAW_${toolName.toUpperCase()}: ${truncateForTrace(rawText, 1000)}`);
  }
}

type ToolWithExecute = {
  execute: (...args: never[]) => unknown;
};

function withScopedRetrieval<TOOLS extends Record<string, ToolWithExecute>>(
  tools: TOOLS,
  selectedScope: ContractScope,
): TOOLS {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => {
      const execute = (async (...args: Parameters<typeof tool.execute>) => {
        if (toolName === "find_relevant_documents") {
          const scopedInput = withScopeSearchInput(args[0], selectedScope);
          const result = await tool.execute(
            ...([scopedInput, ...args.slice(1)] as Parameters<typeof tool.execute>),
          );
          const filteredResult = filterSearchDocumentsResult(result, selectedScope);
          const filteredDocs = parseToolDocs(filteredResult);

          if (filteredDocs && filteredDocs.length > 0) {
            return filteredResult;
          }

          const recentDocumentsTool = tools.recent_documents;

          if (recentDocumentsTool) {
            const recentResult = await (
              recentDocumentsTool.execute as (...toolArgs: unknown[]) => Promise<unknown>
            )({ limit: 20 });
            const recentDocs = parseToolDocs(recentResult);

            if (recentDocs) {
              const scopedRecentDocs = decorateDocumentsForScope(
                filterDocumentsForScope(recentDocs, selectedScope),
                selectedScope,
              );

              if (scopedRecentDocs.length > 0) {
                return createFallbackSearchResult(
                  scopedRecentDocs,
                  selectedScope,
                );
              }
            }
          }

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

              return tool.execute(
                ...([scopedInput, ...args.slice(1)] as Parameters<typeof tool.execute>),
              );
            }
          }
        }

        return tool.execute(...args);
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
          traceRetrieval(toolName, args[0], result);
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

export async function POST(request: Request) {
  const {
    messages,
    selectedScope: rawSelectedScope,
  }: {
    messages: ChatMessage[];
    selectedScope?: ContractScope;
  } = await request.json();
  const selectedScope = parseContractScope(rawSelectedScope);
  const scopedMessages = filterMessagesForScope(messages, selectedScope);
  const systemPrompt = buildSystemPrompt(selectedScope);

  console.log(
    `[chat] request:start messages=${messages.length} scopedMessages=${scopedMessages.length} scope=${selectedScope}`,
  );

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
      withScopedRetrieval(filteredTools, selectedScope),
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

    const modelMessages = await convertToModelMessages(scopedMessages);

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
      onFinish: async () => {
        console.log("[chat] streamText:onFinish");
        await mcp.close();
        console.log("[chat] mcp:closed");
      },
    });

    console.log("[chat] response:returning-ui-stream");
    return createUIMessageStreamResponse({
      stream: createUIMessageStream<ChatMessage>({
        originalMessages: messages,
        onFinish: ({ responseMessage }) => {
          console.log(`[TRACE] FINAL_ANSWER:\n${getUiMessageText(responseMessage)}`);
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
          });
          const reader = uiStream.getReader();

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
              writer.write(value);
            }
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

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

type ChatMessage = UIMessage<unknown, ChatDataParts>;

const SYSTEM_PROMPT = `You are a document-grounded assistant for a UK audience.

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
- Do not broaden the answer beyond what the documents say.
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

function getUiMessageText(message: UIMessage) {
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

function withTraceLogging<TOOLS extends Record<string, ToolWithExecute>>(
  tools: TOOLS,
): TOOLS {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => {
      const execute = (async (...args: Parameters<typeof tool.execute>) => {
        const result = await tool.execute(...args);

        if (
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
  const { messages }: { messages: ChatMessage[] } = await request.json();
  console.log(`[chat] request:start messages=${messages.length}`);

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
    const chatTools = withTraceLogging(
      Object.fromEntries(
      Object.entries(tools).filter(([toolName]) =>
        ALLOWED_CHAT_TOOL_NAMES.includes(
          toolName as (typeof ALLOWED_CHAT_TOOL_NAMES)[number],
        ),
      ),
      ) as typeof tools,
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

    const modelMessages = await convertToModelMessages(messages);

    console.log(
      `[TRACE] MODEL_CONTEXT:\n${truncateForTrace(
        formatModelContext(SYSTEM_PROMPT, modelMessages),
        1000,
      )}`,
    );
    console.log("[chat] streamText:start");
    const result = streamText({
      model: deepseek("deepseek-chat"),
      stopWhen: stepCountIs(5),
      tools: chatTools,
      system: SYSTEM_PROMPT,
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
          const uiStream = result.toUIMessageStream<ChatMessage>();
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

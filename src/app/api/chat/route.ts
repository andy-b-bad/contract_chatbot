import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3Message,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";

export const runtime = "edge";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

type DeepSeekMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

type DeepSeekChunk = {
  id?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    delta?: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function getApiKey() {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  return apiKey;
}

function toDeepSeekMessages(prompt: LanguageModelV3Message[]): DeepSeekMessage[] {
  return prompt.map((message) => {
    if (message.role === "system") {
      return {
        role: "system",
        content: message.content,
      };
    }

    const content = message.content
      .map((part) => {
        switch (part.type) {
          case "text":
          case "reasoning":
            return part.text;
          case "tool-result":
            return JSON.stringify(part.output);
          default:
            throw new Error(`Unsupported message part type: ${part.type}`);
        }
      })
      .join("\n");

    return {
      role: message.role,
      content,
    };
  });
}

function toUsage(usage?: DeepSeekChunk["usage"]): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: usage?.prompt_tokens,
      noCache: usage?.prompt_tokens,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage?.completion_tokens,
      text: usage?.completion_tokens,
      reasoning: undefined,
    },
    raw: usage
      ? {
          prompt_tokens: usage.prompt_tokens ?? null,
          completion_tokens: usage.completion_tokens ?? null,
          total_tokens: usage.total_tokens ?? null,
        }
      : undefined,
  };
}

function toFinishReason(reason?: string | null): LanguageModelV3FinishReason {
  switch (reason) {
    case "stop":
      return { unified: "stop", raw: reason };
    case "length":
      return { unified: "length", raw: reason };
    case "content_filter":
      return { unified: "content-filter", raw: reason };
    case "tool_calls":
      return { unified: "tool-calls", raw: reason };
    default:
      return { unified: "other", raw: reason ?? undefined };
  }
}

function buildRequestBody(options: LanguageModelV3CallOptions, stream: boolean) {
  return {
    model: DEEPSEEK_MODEL,
    messages: toDeepSeekMessages(options.prompt),
    stream,
    stream_options: stream ? { include_usage: true } : undefined,
    temperature: options.temperature,
    top_p: options.topP,
    max_tokens: options.maxOutputTokens,
    stop: options.stopSequences,
  };
}

async function callDeepSeek(
  body: ReturnType<typeof buildRequestBody>,
  headers?: Record<string, string | undefined>,
  abortSignal?: AbortSignal,
) {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getApiKey()}`,
      ...headers,
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response;
}

const deepSeekModel: LanguageModelV3 = {
  specificationVersion: "v3",
  provider: "deepseek",
  modelId: DEEPSEEK_MODEL,
  supportedUrls: {},

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const requestBody = buildRequestBody(options, false);
    const response = await callDeepSeek(
      requestBody,
      options.headers,
      options.abortSignal,
    );
    const json = (await response.json()) as {
      id?: string;
      created?: number;
      model?: string;
      choices?: Array<{
        message?: {
          content?: string;
        };
        finish_reason?: string | null;
      }>;
      usage?: DeepSeekChunk["usage"];
    };

    return {
      content: [
        {
          type: "text",
          text: json.choices?.[0]?.message?.content ?? "",
        },
      ],
      finishReason: toFinishReason(json.choices?.[0]?.finish_reason),
      usage: toUsage(json.usage),
      warnings: [],
      request: {
        body: requestBody,
      },
      response: {
        id: json.id,
        modelId: json.model,
        timestamp: json.created ? new Date(json.created * 1000) : undefined,
        headers: Object.fromEntries(response.headers.entries()),
        body: json,
      },
    };
  },

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const requestBody = buildRequestBody(options, true);
    const response = await callDeepSeek(
      requestBody,
      options.headers,
      options.abortSignal,
    );

    if (!response.body) {
      throw new Error("DeepSeek response body is empty");
    }

    const warnings: LanguageModelV3StreamPart[] = [
      { type: "stream-start", warnings: [] },
    ];

    let usage = toUsage();
    let finishReason = toFinishReason("stop");
    let textStarted = false;
    let textEnded = false;
    let finishSent = false;
    let metadataSent = false;
    const textId = crypto.randomUUID();

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      async start(controller) {
        for (const part of warnings) {
          controller.enqueue(part);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const flushText = () => {
          if (textStarted && !textEnded) {
            controller.enqueue({ type: "text-end", id: textId });
            textEnded = true;
          }
        };

        const flushFinish = () => {
          if (!finishSent) {
            controller.enqueue({
              type: "finish",
              finishReason,
              usage,
            });
            finishSent = true;
          }
        };

        const processChunk = (chunk: DeepSeekChunk) => {
          if (!metadataSent && (chunk.id || chunk.created || chunk.model)) {
            controller.enqueue({
              type: "response-metadata",
              id: chunk.id,
              modelId: chunk.model,
              timestamp: chunk.created
                ? new Date(chunk.created * 1000)
                : undefined,
            });
            metadataSent = true;
          }

          if (chunk.usage) {
            usage = toUsage(chunk.usage);
          }

          const choice = chunk.choices?.[0];
          const delta = choice?.delta?.content;

          if (delta) {
            if (!textStarted) {
              controller.enqueue({ type: "text-start", id: textId });
              textStarted = true;
            }

            controller.enqueue({
              type: "text-delta",
              id: textId,
              delta,
            });
          }

          if (choice?.finish_reason) {
            finishReason = toFinishReason(choice.finish_reason);
            flushText();
            flushFinish();
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            while (buffer.includes("\n\n")) {
              const boundary = buffer.indexOf("\n\n");
              const rawEvent = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);

              const data = rawEvent
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim())
                .join("");

              if (!data) {
                continue;
              }

              if (data === "[DONE]") {
                break;
              }

              const chunk = JSON.parse(data) as DeepSeekChunk;

              if (options.includeRawChunks) {
                controller.enqueue({
                  type: "raw",
                  rawValue: chunk,
                });
              }

              processChunk(chunk);
            }
          }

          flushText();
          flushFinish();
          controller.close();
        } catch (error) {
          controller.enqueue({
            type: "error",
            error,
          });
          controller.close();
        }
      },
    });

    return {
      stream,
      request: {
        body: requestBody,
      },
      response: {
        headers: Object.fromEntries(response.headers.entries()),
      },
    };
  },
};

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: deepSeekModel,
    system:
      "You are a professional assistant for a UK audience.\nYou must ALWAYS respond in English.\nIf the user message is very short (e.g. 'hello'), assume English.",
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}

"use client";

import { DefaultChatTransport, jsonSchema, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useState } from "react";

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

const RETRIEVAL_STATUS_SCHEMA = jsonSchema<RetrievalStatus>({
  type: "object",
  additionalProperties: false,
  properties: {
    active: { type: "boolean" },
    label: { type: "string" },
    toolName: { type: "string" },
    toolCallId: { type: "string" },
  },
  required: ["active", "label"],
});

function getMessageText(message: ChatMessage) {
  return message.parts
    .filter((part): part is Extract<ChatMessage["parts"][number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export default function Home() {
  const [input, setInput] = useState("");
  const [retrievalStatus, setRetrievalStatus] = useState<RetrievalStatus | null>(null);
  const { messages, sendMessage, status } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    dataPartSchemas: {
      retrievalStatus: RETRIEVAL_STATUS_SCHEMA,
    },
    onData: (part) => {
      if (part.type !== "data-retrievalStatus") {
        return;
      }

      setRetrievalStatus(part.data.active ? part.data : null);
    },
    onFinish: () => {
      setRetrievalStatus(null);
    },
    onError: () => {
      setRetrievalStatus(null);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";
  const pendingAssistantLabel =
    retrievalStatus?.label ?? (status === "submitted" ? "Preparing response..." : null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = input.trim();

    if (!value) {
      return;
    }

    setInput("");
    await sendMessage({ text: value });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Contract Chatbot</h1>
        <p className="text-sm text-zinc-600">
          Minimal streaming chat UI using the Vercel AI SDK.
        </p>
      </header>

      <section className="flex-1 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
        {messages.length === 0 && pendingAssistantLabel === null ? (
          <p className="text-sm text-zinc-500">No messages yet.</p>
        ) : (
          <>
            {messages.map((message) => {
              const text = getMessageText(message);

              if (text.length === 0) {
                return null;
              }

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                      message.role === "user"
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-900"
                    }`}
                  >
                    {text}
                  </div>
                </div>
              );
            })}

            {pendingAssistantLabel ? (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-zinc-900">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>{pendingAssistantLabel}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Send a message..."
          className="flex-1 rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500"
        />
        <button
          type="submit"
          disabled={isLoading || input.trim().length === 0}
          className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
      </form>
    </main>
  );
}

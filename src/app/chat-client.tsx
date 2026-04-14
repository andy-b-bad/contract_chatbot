"use client";

import { DefaultChatTransport, jsonSchema } from "ai";
import { useChat } from "@ai-sdk/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CONTRACT_SCOPE_OPTIONS,
  type ContractScope,
} from "./contracts";
import {
  type ChatMessage,
  type RetrievalStatus,
  getChatMessageText,
} from "@/lib/chat";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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

type ChatClientProps = {
  authEnabled: boolean;
  initialChatId: string | null;
  initialMessages: ChatMessage[];
  initialScope: ContractScope;
  userEmail: string | null;
};

export function ChatClient({
  authEnabled,
  initialChatId,
  initialMessages,
  initialScope,
  userEmail,
}: ChatClientProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [selectedScope, setSelectedScope] = useState<ContractScope>(initialScope);
  const [retrievalStatus, setRetrievalStatus] = useState<RetrievalStatus | null>(
    null,
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [ratingMessageId, setRatingMessageId] = useState<string | null>(null);
  const { messages, sendMessage, setMessages, status } = useChat<ChatMessage>({
    messages: initialMessages,
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

      setMessages((msgs) => {
        if (msgs.length === 0) {
          return msgs;
        }

        const lastIndex = msgs.length - 1;
        const last = msgs[lastIndex];

        if (last.role !== "assistant" || !last.metadata) {
          return msgs;
        }

        const nextMessages = [...msgs];
        nextMessages[lastIndex] = {
          ...last,
          metadata: {
            ...last.metadata,
            hasPersistedAudit: true,
            userRating: null,
          },
        };

        return nextMessages;
      });
    },
    onError: () => {
      setRetrievalStatus(null);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";
  const pendingAssistantLabel =
    retrievalStatus?.label ??
    (status === "submitted" ? "Preparing response..." : null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = input.trim();

    if (!value) {
      return;
    }

    setInput("");
    await sendMessage(
      {
        text: value,
        metadata: {
          scope: selectedScope,
        },
      },
      {
        body: {
          ...(initialChatId ? { chatId: initialChatId } : {}),
          selectedScope,
        },
      },
    );
  }

  async function handleSignOut() {
    setAuthError(null);
    setIsSigningOut(true);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      setAuthError(error.message);
      setIsSigningOut(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  async function handleRateMessage(messageId: string, userRating: 1 | 2 | 3) {
    if (!initialChatId) {
      return;
    }

    setRatingMessageId(messageId);

    try {
      const response = await fetch("/api/chat/rating", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatId: initialChatId,
          messageId,
          userRating,
        }),
      });

      if (!response.ok) {
        console.error("[chat-rating] client:request-failed", {
          messageId,
          status: response.status,
        });
        return;
      }

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === messageId && message.metadata
            ? {
                ...message,
                metadata: {
                  ...message.metadata,
                  userRating,
                },
              }
            : message,
        ),
      );
    } catch (error) {
      console.error("[chat-rating] client:unexpected-error", error);
    } finally {
      setRatingMessageId((currentMessageId) =>
        currentMessageId === messageId ? null : currentMessageId,
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header
        className={
          authEnabled
            ? "flex flex-wrap items-start justify-between gap-4"
            : "space-y-2"
        }
      >
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            BSR Contract Chatbot
          </h1>
          <p className="text-sm text-zinc-600">
            Contract-Scoped Retrieval-Augmented Chat Interface: Clause-Level
            Contract Intelligence for Stunt Performers in Film & TV
          </p>
        </div>

        {authEnabled ? (
          <div className="flex items-center gap-3">
            {userEmail ? (
              <p className="text-sm text-zinc-500">{userEmail}</p>
            ) : null}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="rounded-full border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        ) : null}
      </header>

      <section className="space-y-2">
        <p className="text-xs font-medium tracking-[0.16em] text-zinc-500 uppercase">
          Choose your contract
        </p>
        <div className="flex flex-wrap gap-2">
          {CONTRACT_SCOPE_OPTIONS.map((scope) => {
            const isSelected = scope.id === selectedScope;

            return (
              <button
                key={scope.id}
                type="button"
                aria-pressed={isSelected}
                disabled={isLoading}
                onClick={() => setSelectedScope(scope.id)}
                className={`rounded-full border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSelected
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
                }`}
              >
                {scope.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex-1 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
        {messages.length === 0 && pendingAssistantLabel === null ? (
          <p className="text-sm text-zinc-500">No messages yet.</p>
        ) : (
          <>
            {messages.map((message) => {
              const text = getChatMessageText(message);
              const showRatingControls =
                authEnabled &&
                Boolean(initialChatId) &&
                message.role === "assistant" &&
                message.metadata?.hasPersistedAudit === true;
              const selectedUserRating = message.metadata?.userRating ?? null;
              const isRatingMessage = ratingMessageId === message.id;

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
                    className={`flex max-w-[85%] flex-col ${
                      message.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`w-full rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                        message.role === "user"
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-100 text-zinc-900"
                      }`}
                    >
                      {text}
                    </div>
                    {showRatingControls ? (
                      <div className="mt-2 flex flex-wrap gap-2 px-1">
                        {([
                          [1, "Not helpful"],
                          [2, "Partly helpful"],
                          [3, "Helpful"],
                        ] as const).map(([ratingValue, ratingLabel]) => {
                          const isSelected = selectedUserRating === ratingValue;

                          return (
                            <button
                              key={ratingValue}
                              type="button"
                              disabled={isRatingMessage}
                              onClick={() => handleRateMessage(message.id, ratingValue)}
                              className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                isSelected
                                  ? "border-zinc-900 bg-zinc-900 text-white"
                                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
                              }`}
                            >
                              {ratingValue} {ratingLabel}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
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

      {authEnabled && authError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {authError}
        </p>
      ) : null}

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

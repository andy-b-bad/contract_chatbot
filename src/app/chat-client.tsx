"use client";

import { DefaultChatTransport, jsonSchema } from "ai";
import { useChat } from "@ai-sdk/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  CONTRACT_SCOPE_OPTIONS,
  getContractScopeOption,
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

function renderTextWithBoldMarkdown(text: string) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  while (cursor < text.length) {
    const start = text.indexOf("**", cursor);

    if (start === -1) {
      nodes.push(text.slice(cursor));
      break;
    }

    const end = text.indexOf("**", start + 2);

    if (end === -1) {
      nodes.push(text.slice(cursor));
      break;
    }

    if (end === start + 2) {
      nodes.push(text.slice(cursor, end + 2));
      cursor = end + 2;
      continue;
    }

    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }

    nodes.push(<b key={`bold-${key}`}>{text.slice(start + 2, end)}</b>);
    key += 1;
    cursor = end + 2;
  }

  return nodes;
}

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
  const selectedScopeLabel = getContractScopeOption(selectedScope).label;

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
    <>
      <div className="h-[3px] bg-brandred" />
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-10">
        <header className="mb-8 flex items-start justify-between gap-6">
          <div>
            <p className="mb-2.5 text-[11px] font-semibold tracking-[0.2em] text-brandred uppercase">
              Equity
            </p>
            <h1 className="mb-1.5 font-serif text-[27px] font-semibold tracking-tight text-ink">
              Contract chatbot
            </h1>
            <p className="max-w-md text-[13px] leading-relaxed text-secondary">
              Clause-level contract intelligence for Equity members
            </p>
          </div>

          {authEnabled ? (
            <div className="flex shrink-0 flex-col items-end gap-2.5 pt-1">
              {userEmail ? (
                <p className="max-w-[220px] truncate text-[12px] text-secondary">
                  {userEmail}
                </p>
              ) : null}
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="rounded-full border border-line px-3.5 py-1.5 text-[12px] text-ink transition-colors hover:border-linestrong hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSigningOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          ) : null}
        </header>

        <div className="mb-2.5 h-[4px] w-full bg-brandred" />

        <section className="mb-9">
          <p className="mb-3 text-[10.5px] tracking-[0.16em] text-tertiary uppercase">
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
                  className={`rounded-full border px-4 py-2 text-[12.5px] font-medium shadow-[0_1px_2px_rgba(26,26,26,0.04)] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    isSelected
                      ? "border-brandred bg-brandred text-white shadow-[0_1px_2px_rgba(166,25,46,0.35)] hover:bg-brandred-hover"
                      : "border-line bg-white text-secondary hover:border-brandred/40 hover:text-ink"
                  }`}
                >
                  {scope.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex-1 rounded-xl border border-line bg-card p-5 shadow-[0_1px_3px_rgba(26,26,26,0.05)] sm:p-8">
          <div className="space-y-5">
            {messages.length === 0 && pendingAssistantLabel === null ? (
              <div className="rounded-2xl rounded-tl-sm bg-page px-4 py-3.5 text-[13.5px] text-secondary italic">
                No messages yet.
              </div>
            ) : (
              <>
                {messages.map((message) => {
                  const text = getChatMessageText(message);
                  const isUserMessage = message.role === "user";
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
                    <div key={message.id}>
                      <div
                        className={`flex items-start gap-2.5 ${
                          isUserMessage ? "justify-end" : "justify-start"
                        }`}
                      >
                        {!isUserMessage ? (
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brandred-tint text-[10px] font-bold text-brandred">
                            Eq
                          </div>
                        ) : null}

                        <div
                          className={`max-w-[80%] rounded-2xl px-4 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                            isUserMessage
                              ? "rounded-tr-sm bg-ink py-2.5 text-page"
                              : "rounded-tl-sm bg-page py-4 text-ink sm:px-5"
                          }`}
                        >
                          {message.role === "assistant"
                            ? renderTextWithBoldMarkdown(text)
                            : text}
                        </div>

                        {isUserMessage ? (
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-page">
                            You
                          </div>
                        ) : null}
                      </div>

                      {showRatingControls ? (
                        <div className="mt-2 flex flex-wrap gap-2 pl-[38px]">
                          {([
                            [1, "Not helpful"],
                            [2, "Partly helpful"],
                            [3, "Helpful"],
                          ] as const).map(([ratingValue, ratingLabel]) => {
                            const isSelected =
                              selectedUserRating === ratingValue;

                            return (
                              <button
                                key={ratingValue}
                                type="button"
                                disabled={isRatingMessage}
                                onClick={() =>
                                  handleRateMessage(message.id, ratingValue)
                                }
                                className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                  isSelected
                                    ? "border-brandred bg-brandred-tint font-medium text-brandred"
                                    : "border-line text-secondary hover:border-linestrong"
                                }`}
                              >
                                {ratingLabel}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {pendingAssistantLabel ? (
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brandred-tint text-[10px] font-bold text-brandred">
                      Eq
                    </div>
                    <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-page px-4 py-3.5 text-[13.5px] text-secondary italic sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="size-2 animate-pulse rounded-full bg-brandred" />
                        <span>{pendingAssistantLabel}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {authEnabled && authError ? (
            <p className="mt-5 rounded-lg border border-brandred/25 bg-brandred-tint px-4 py-3 text-[13px] text-brandred">
              {authError}
            </p>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className="mt-7 flex gap-2.5 border-t border-line pt-5"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={`Ask about the ${selectedScopeLabel} agreement...`}
              className="min-w-0 flex-1 rounded-lg border border-line bg-page px-4 py-3 text-[13.5px] outline-none transition-shadow placeholder:text-tertiary focus:border-brandred focus:ring-2 focus:ring-brandred/25"
            />
            <button
              type="submit"
              disabled={isLoading || input.trim().length === 0}
              className="rounded-lg bg-brandred px-5 py-3 text-[13px] font-medium text-white transition-colors hover:bg-brandred-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Sending..." : "Ask"}
            </button>
          </form>
        </section>

        <p className="mt-5 text-center text-[11px] text-tertiary">
          Answers are generated from clause text in the selected agreement.
          Always confirm against the source document.
        </p>
      </main>
    </>
  );
}

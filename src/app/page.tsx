"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  const isLoading = status === "submitted" || status === "streaming";

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
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500">No messages yet.</p>
        ) : (
          messages.map((message) => (
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
                {message.parts
                  .filter((part) => part.type === "text")
                  .map((part, index) => (
                    <span key={`${message.id}-${index}`}>{part.text}</span>
                  ))}
              </div>
            </div>
          ))
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

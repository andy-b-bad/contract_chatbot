"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  initialError: string | null;
};

export function LoginForm({ initialError }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    setStatusMessage("Check your email for the sign-in link.");
    setIsSubmitting(false);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8 sm:px-6">
      <div className="space-y-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <header className="space-y-2">
          <p className="text-xs font-medium tracking-[0.16em] text-zinc-500 uppercase">
            Supabase Sign-In
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Access the contract chat
          </h1>
          <p className="text-sm text-zinc-600">
            Enter your email and Supabase will send you a magic link.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting || email.trim().length === 0}
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Sending link..." : "Send magic link"}
          </button>
        </form>

        {statusMessage ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {statusMessage}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}

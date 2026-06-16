"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  initialError: string | null;
};

export function LoginForm({ initialError }: LoginFormProps) {
  const [error, setError] = useState<string | null>(initialError);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  function getAuthRedirectUrl() {
    return `${window.location.origin}/auth/callback?next=/`;
  }

  async function handleGoogleSignIn() {
    setError(null);
    setIsGoogleSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    });

    if (signInError) {
      setError(signInError.message);
      setIsGoogleSubmitting(false);
    }
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
            Continue with Google to access the authenticated contract chat.
          </p>
        </header>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleSubmitting}
          className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGoogleSubmitting ? "Redirecting..." : "Continue with Google"}
        </button>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}

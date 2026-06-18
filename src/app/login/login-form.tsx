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
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Access the contract chat
          </h1>
        </header>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            viewBox="0 0 18 18"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18Z"
            />
            <path
              fill="#FBBC05"
              d="M3.95 10.7a5.41 5.41 0 0 1 0-3.4V4.97H.94a9 9 0 0 0 0 8.06l3.01-2.33Z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.42 0 9 0A9 9 0 0 0 .94 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58Z"
            />
          </svg>
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

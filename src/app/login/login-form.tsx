"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  initialError: string | null;
};

export function LoginForm({ initialError }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);

  function getAuthRedirectUrl() {
    return `${window.location.origin}/auth/callback?next=/`;
  }

  async function handleGoogleSignIn() {
    setError(null);
    setStatusMessage(null);
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

  function getTrimmedCredentials() {
    return {
      email: email.trim(),
      password,
    };
  }

  function getPasswordAuthValidationError() {
    const { email: trimmedEmail, password: currentPassword } =
      getTrimmedCredentials();

    if (!trimmedEmail) {
      return "Enter your email address.";
    }

    if (!currentPassword) {
      return "Enter your password.";
    }

    if (currentPassword.length < 6) {
      return "Password must be at least 6 characters.";
    }

    return null;
  }

  async function handlePasswordSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const { email: trimmedEmail, password: trimmedPassword } = getTrimmedCredentials();
    const validationError = getPasswordAuthValidationError();

    if (validationError) {
      setError(validationError);
      setStatusMessage(null);
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsPasswordSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword,
    });

    if (signInError) {
      setError(signInError.message);
      setIsPasswordSubmitting(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function handlePasswordSignUp() {
    const { email: trimmedEmail, password: trimmedPassword } = getTrimmedCredentials();
    const validationError = getPasswordAuthValidationError();

    if (validationError) {
      setError(validationError);
      setStatusMessage(null);
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsPasswordSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: trimmedPassword,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setIsPasswordSubmitting(false);
      return;
    }

    setStatusMessage("Check your email to confirm your account, then return here to sign in.");
    setIsPasswordSubmitting(false);
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
            Continue with Google, or use email and password.
          </p>
        </header>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleSubmitting || isPasswordSubmitting}
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGoogleSubmitting ? "Redirecting..." : "Continue with Google"}
        </button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200" />
          <span>Email and password</span>
          <span className="h-px flex-1 bg-zinc-200" />
        </div>

        <form onSubmit={handlePasswordSignIn} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
              autoComplete="email"
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoComplete="current-password"
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500"
            />
          </label>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isGoogleSubmitting || isPasswordSubmitting}
              className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPasswordSubmitting ? "Working..." : "Sign in"}
            </button>
            <button
              type="button"
              onClick={handlePasswordSignUp}
              disabled={isGoogleSubmitting || isPasswordSubmitting}
              className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPasswordSubmitting ? "Working..." : "Create account"}
            </button>
          </div>
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

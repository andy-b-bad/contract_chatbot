const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ENABLE_AUTH = process.env.ENABLE_AUTH === "true";

export function isAuthEnabled() {
  return ENABLE_AUTH;
}

export function getSupabaseUrl() {
  if (!SUPABASE_URL) {
    throw new Error("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  return SUPABASE_URL;
}

export function getSupabasePublishableKey() {
  if (!SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "[supabase] Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return SUPABASE_PUBLISHABLE_KEY;
}

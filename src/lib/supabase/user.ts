import type { User } from "@supabase/supabase-js";

export function isAnonymousSupabaseUser(user: User | null | undefined) {
  return user?.is_anonymous === true;
}

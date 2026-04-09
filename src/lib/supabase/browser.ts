"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "./config";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
  );
}

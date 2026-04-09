import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const redirectPath = next?.startsWith("/") ? next : "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth_callback", requestUrl));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth] callback:error", error);
    return NextResponse.redirect(new URL("/login?error=auth_callback", requestUrl));
  }

  return NextResponse.redirect(new URL(redirectPath, requestUrl));
}

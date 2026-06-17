import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getSafeRedirectPath(next: string | null, requestUrl: URL) {
  if (!next?.startsWith("/")) {
    return "/";
  }

  const redirectUrl = new URL(next, requestUrl);

  if (redirectUrl.origin !== requestUrl.origin) {
    return "/";
  }

  return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const redirectPath = getSafeRedirectPath(next, requestUrl);

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

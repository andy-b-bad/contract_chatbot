import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      const missingSession =
        userError.name === "AuthSessionMissingError" ||
        userError.message.toLowerCase().includes("session missing");

      if (missingSession) {
        return Response.json({
          ok: true,
          authenticated: false,
        });
      }

      console.error("[supabase] health:user-error", userError);
      return Response.json(
        {
          ok: false,
          authenticated: false,
          error: "Failed to resolve Supabase user.",
        },
        { status: 500 },
      );
    }

    if (!user) {
      return Response.json({
        ok: true,
        authenticated: false,
      });
    }

    const [threadResult, messageResult] = await Promise.all([
      supabase
        .from("chat_threads")
        .select("id", { head: true, count: "exact" }),
      supabase
        .from("chat_messages")
        .select("id", { head: true, count: "exact" }),
    ]);

    const ok = !threadResult.error && !messageResult.error;

    if (threadResult.error) {
      console.error("[supabase] health:thread-error", threadResult.error);
    }

    if (messageResult.error) {
      console.error("[supabase] health:message-error", messageResult.error);
    }

    return Response.json(
      {
        ok,
        authenticated: true,
        userId: user.id,
        threadAccess: threadResult.error ? "error" : "ok",
        messageAccess: messageResult.error ? "error" : "ok",
      },
      { status: ok ? 200 : 500 },
    );
  } catch (error) {
    console.error("[supabase] health:unexpected-error", error);

    return Response.json(
      {
        ok: false,
        authenticated: false,
        error:
          error instanceof Error ? error.message : "Unexpected Supabase error.",
      },
      { status: 500 },
    );
  }
}

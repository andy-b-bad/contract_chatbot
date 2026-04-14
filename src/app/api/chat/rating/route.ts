import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateUserRating } from "@/lib/retrieval-audit-persistence";

type RatingRequestBody = {
  chatId?: unknown;
  messageId?: unknown;
  userRating?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUserRating(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json(
        {
          error: "Authentication required.",
        },
        { status: 401 },
      );
    }

    let body: RatingRequestBody;

    try {
      body = (await request.json()) as RatingRequestBody;
    } catch {
      return Response.json(
        {
          error: "Invalid request body.",
        },
        { status: 400 },
      );
    }

    const { chatId, messageId, userRating } = body;

    if (!isNonEmptyString(chatId)) {
      return Response.json(
        {
          error: "Invalid chatId.",
        },
        { status: 400 },
      );
    }

    if (!isNonEmptyString(messageId)) {
      return Response.json(
        {
          error: "Invalid messageId.",
        },
        { status: 400 },
      );
    }

    if (!isUserRating(userRating)) {
      return Response.json(
        {
          error: "Invalid userRating.",
        },
        { status: 400 },
      );
    }

    const result = await updateUserRating(supabase, {
      threadId: chatId,
      userId: user.id,
      uiMessageId: messageId,
      userRating,
    });

    if (result.status === "success") {
      return Response.json({ success: true });
    }

    if (result.status === "audit_not_found") {
      console.error("[chat-rating] post:audit-not-found", {
        userId: user.id,
        chatId,
        messageId,
      });
    } else {
      console.error("[chat-rating] post:not-found", {
        userId: user.id,
        chatId,
        messageId,
      });
    }

    return Response.json(
      {
        error: "This message isn’t available for rating.",
      },
      { status: 404 },
    );
  } catch (error) {
    console.error("[chat-rating] post:unexpected-error", error);

    return Response.json(
      {
        error: "Unexpected rating update error.",
      },
      { status: 500 },
    );
  }
}

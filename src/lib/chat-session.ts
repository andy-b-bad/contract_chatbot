import {
  doesChatThreadBelongToUser,
  getOrCreateChatThread,
  persistChatMessage,
} from "@/lib/chat-persistence";
import type { ChatMessage } from "@/lib/chat";
import {
  persistRetrievalAudit,
  persistRetrievalAuditSource,
  type RetrievalAuditRecord,
} from "@/lib/retrieval-audit-persistence";
import { isAuthEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type AnonymousChatContext = {
  authEnabled: false;
  supabase: null;
  userId: null;
  chatId: null;
};

type AuthenticatedChatContext = {
  authEnabled: true;
  supabase: ServerSupabaseClient;
  userId: string;
  chatId: string;
};

export type ChatSessionContext =
  | AnonymousChatContext
  | AuthenticatedChatContext;

export type ChatSessionResolution =
  | {
      kind: "ok";
      context: ChatSessionContext;
    }
  | {
      kind: "unauthorized";
      error: unknown;
    }
  | {
      kind: "forbidden";
      userId: string;
      chatId: string;
    };

export async function resolveChatSession(
  rawChatId?: string,
): Promise<ChatSessionResolution> {
  if (!isAuthEnabled()) {
    return {
      kind: "ok",
      context: {
        authEnabled: false,
        supabase: null,
        userId: null,
        chatId: null,
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      kind: "unauthorized",
      error: userError ?? "missing-user",
    };
  }

  let chatId =
    typeof rawChatId === "string" && rawChatId.trim().length > 0
      ? rawChatId
      : await getOrCreateChatThread(supabase, user.id);

  if (typeof rawChatId === "string" && rawChatId.trim().length > 0) {
    const ownsChatThread = await doesChatThreadBelongToUser(
      supabase,
      rawChatId,
      user.id,
    );

    if (!ownsChatThread) {
      return {
        kind: "forbidden",
        userId: user.id,
        chatId: rawChatId,
      };
    }

    chatId = rawChatId;
  }

  return {
    kind: "ok",
    context: {
      authEnabled: true,
      supabase,
      userId: user.id,
      chatId,
    },
  };
}

export async function persistUserTurnIfNeeded(
  context: ChatSessionContext,
  message: ChatMessage | undefined,
) {
  if (!context.authEnabled || !message) {
    return;
  }

  await persistChatMessage(
    context.supabase,
    context.chatId,
    context.userId,
    message,
  );
}

export async function persistAssistantTurnWithAuditIfNeeded(
  context: ChatSessionContext,
  responseMessage: ChatMessage,
  auditRecord: RetrievalAuditRecord,
) {
  if (!context.authEnabled) {
    return;
  }

  const chatMessageId = await persistChatMessage(
    context.supabase,
    context.chatId,
    context.userId,
    responseMessage,
  );

  if (!chatMessageId) {
    return;
  }

  const retrievalAuditId = await persistRetrievalAudit(
    context.supabase,
    context.chatId,
    chatMessageId,
    context.userId,
    auditRecord,
  );

  if (!retrievalAuditId) {
    return;
  }

  await persistRetrievalAuditSource(
    context.supabase,
    retrievalAuditId,
    context.userId,
    auditRecord.excerptPacket,
  );
}

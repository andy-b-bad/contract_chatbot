import type { SupabaseClient } from "@supabase/supabase-js";
import { parseContractScope, type ContractScope } from "@/app/contracts";
import {
  getChatMessageScope,
  getChatMessageText,
  type ChatMessage,
} from "@/lib/chat";

type ChatThreadRow = {
  id: string;
};

type ChatMessageRole = "user" | "assistant";

type ChatMessageRow = {
  id: string;
  ui_message_id: string;
  role: ChatMessageRole;
  content: string;
  scope: ContractScope;
};

type RetrievalAuditRatingRow = {
  chat_message_id: string;
  user_rating: 1 | 2 | 3 | null;
};

type PersistedChatMessageRow = {
  id: string;
};

async function touchChatThread(
  supabase: SupabaseClient,
  threadId: string,
  userId: string,
) {
  const { error } = await supabase
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function getOrCreateChatThread(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data: existingThread, error: existingThreadError } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingThreadError) {
    throw existingThreadError;
  }

  const thread = existingThread as ChatThreadRow | null;

  if (thread?.id) {
    return thread.id;
  }

  const { data: createdThread, error: createdThreadError } = await supabase
    .from("chat_threads")
    .insert({ user_id: userId })
    .select("id")
    .single();

  if (!createdThreadError) {
    return (createdThread as ChatThreadRow).id;
  }

  if (createdThreadError.code !== "23505") {
    throw createdThreadError;
  }

  const { data: retryThread, error: retryThreadError } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (retryThreadError) {
    throw retryThreadError;
  }

  return (retryThread as ChatThreadRow).id;
}

export async function doesChatThreadBelongToUser(
  supabase: SupabaseClient,
  threadId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean((data as ChatThreadRow | null)?.id);
}

export async function listChatMessages(
  supabase: SupabaseClient,
  threadId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, ui_message_id, role, content, scope")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as ChatMessageRow[];
  const { data: retrievalAuditData, error: retrievalAuditError } = await supabase
    .from("retrieval_audits")
    .select("chat_message_id, user_rating")
    .eq("thread_id", threadId)
    .eq("user_id", userId);

  if (retrievalAuditError) {
    throw retrievalAuditError;
  }

  const retrievalAudits = (retrievalAuditData ?? []) as RetrievalAuditRatingRow[];
  const retrievalAuditMap = new Map(
    retrievalAudits.map((audit) => [
      audit.chat_message_id,
      {
        userRating: audit.user_rating,
      },
    ]),
  );

  return rows.map(
    (row): ChatMessage => {
      const scope = parseContractScope(row.scope);
      const retrievalAudit = retrievalAuditMap.get(row.id);

      return {
        id: row.ui_message_id,
        role: row.role,
        parts: [{ type: "text", text: row.content }],
        metadata:
          row.role === "assistant" && retrievalAudit
            ? {
                scope,
                hasPersistedAudit: true,
                userRating: retrievalAudit.userRating ?? null,
              }
            : {
                scope,
              },
      };
    },
  );
}

export async function persistChatMessage(
  supabase: SupabaseClient,
  threadId: string,
  userId: string,
  message: ChatMessage,
) {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }

  const content = getChatMessageText(message).trim();

  if (!content) {
    return null;
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .upsert(
      {
        thread_id: threadId,
        user_id: userId,
        ui_message_id: message.id,
        role: message.role,
        content,
        scope: getChatMessageScope(message),
      },
      {
        onConflict: "thread_id,ui_message_id",
      },
    )
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  await touchChatThread(supabase, threadId, userId);

  return (data as PersistedChatMessageRow | null)?.id ?? null;
}

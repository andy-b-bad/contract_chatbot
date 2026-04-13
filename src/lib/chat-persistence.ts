import type { SupabaseClient } from "@supabase/supabase-js";
import { parseContractScope, type ContractScope } from "@/app/contracts";
import type { ExcerptPacketJson } from "@/lib/audit/excerpt-packet";
import type { UsageCostFields } from "@/lib/audit/usage-cost";
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

type PersistedChatMessageRow = {
  id: string;
};

type PersistedRetrievalAuditRow = {
  id: string;
};

export type RetrievalAuditRecord = {
  scope: ContractScope;
  normalizedUserQuery: string;
  toolNames: string[];
  documentNames: string[];
  pageRefs: string[];
  traceSnippets: string[];
  excerptPacket: ExcerptPacketJson;
  usage: UsageCostFields;
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

  return rows.map(
    (row): ChatMessage => ({
      id: row.ui_message_id,
      role: row.role,
      parts: [{ type: "text", text: row.content }],
      metadata: {
        scope: parseContractScope(row.scope),
      },
    }),
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

export async function persistRetrievalAudit(
  supabase: SupabaseClient,
  threadId: string,
  chatMessageId: string,
  userId: string,
  auditRecord: RetrievalAuditRecord,
) {
  const { data, error } = await supabase
    .from("retrieval_audits")
    .upsert(
      {
        thread_id: threadId,
        chat_message_id: chatMessageId,
        user_id: userId,
        scope: auditRecord.scope,
        normalized_user_query: auditRecord.normalizedUserQuery,
        tool_names: auditRecord.toolNames,
        document_names: auditRecord.documentNames,
        page_refs: auditRecord.pageRefs,
        trace_snippets: auditRecord.traceSnippets,
        provider: auditRecord.usage.provider,
        model: auditRecord.usage.model,
        provider_request_id: auditRecord.usage.providerRequestId,
        provider_response_id: auditRecord.usage.providerResponseId,
        prompt_tokens: auditRecord.usage.promptTokens,
        completion_tokens: auditRecord.usage.completionTokens,
        total_tokens: auditRecord.usage.totalTokens,
        prompt_cache_hit_tokens: auditRecord.usage.promptCacheHitTokens,
        prompt_cache_miss_tokens: auditRecord.usage.promptCacheMissTokens,
        reasoning_tokens: auditRecord.usage.reasoningTokens,
        provider_usage_json: auditRecord.usage.providerUsageJson,
        estimated_cost_usd: auditRecord.usage.estimatedCostUsd,
        pricing_version: auditRecord.usage.pricingVersion,
      },
      {
        onConflict: "chat_message_id",
      },
    )
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return (data as PersistedRetrievalAuditRow | null)?.id ?? null;
}

export async function persistRetrievalAuditSource(
  supabase: SupabaseClient,
  retrievalAuditId: string,
  userId: string,
  excerptPacket: ExcerptPacketJson,
) {
  if (excerptPacket.length === 0) {
    return;
  }

  const { error } = await supabase.from("retrieval_audit_sources").upsert(
    {
      retrieval_audit_id: retrievalAuditId,
      user_id: userId,
      excerpt_packet_json: excerptPacket,
    },
    {
      onConflict: "retrieval_audit_id",
    },
  );

  if (error) {
    throw error;
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContractScope } from "@/app/contracts";
import type { ExcerptPacketJson } from "@/lib/audit/excerpt-packet";
import type { UsageCostFields } from "@/lib/audit/usage-cost";

type PersistedRetrievalAuditRow = {
  id: string;
};

type PersistedChatMessageRow = {
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

export type UpdateUserRatingResult =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "audit_not_found" };

export async function updateUserRating(
  supabase: SupabaseClient,
  {
    threadId,
    userId,
    uiMessageId,
    userRating,
  }: {
    threadId: string;
    userId: string;
    uiMessageId: string;
    userRating: 1 | 2 | 3;
  },
): Promise<UpdateUserRatingResult> {
  const { data: chatMessage, error: chatMessageError } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .eq("ui_message_id", uiMessageId)
    .eq("role", "assistant")
    .maybeSingle();

  if (chatMessageError) {
    throw chatMessageError;
  }

  const resolvedChatMessage = chatMessage as PersistedChatMessageRow | null;

  if (!resolvedChatMessage?.id) {
    return { status: "not_found" };
  }

  const { data: retrievalAudit, error: retrievalAuditError } = await supabase
    .from("retrieval_audits")
    .update({
      user_rating: userRating,
      user_rated_at: new Date().toISOString(),
    })
    .eq("chat_message_id", resolvedChatMessage.id)
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (retrievalAuditError) {
    throw retrievalAuditError;
  }

  if (!(retrievalAudit as PersistedRetrievalAuditRow | null)?.id) {
    return { status: "audit_not_found" };
  }

  return { status: "success" };
}

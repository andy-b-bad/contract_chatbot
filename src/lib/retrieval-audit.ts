import type { ExcerptPacketJson } from "@/lib/audit/excerpt-packet";
import type { UsageCostFields } from "@/lib/audit/usage-cost";
import type { ContractScope } from "@/app/contracts";
import type { RetrievalAuditRecord } from "@/lib/chat-persistence";

const MAX_RETRIEVAL_AUDIT_VALUES = 24;
const MAX_RETRIEVAL_AUDIT_SNIPPETS = 8;
const MAX_RETRIEVAL_AUDIT_QUERY_LENGTH = 1000;
const MAX_RETRIEVAL_AUDIT_EXCERPTS = 8;

export type RetrievalAuditTraceData = {
  documentNames: string[];
  pageRefs: string[];
  snippets: string[];
};

type RetrievalAuditState = {
  toolNames: string[];
  documentNames: string[];
  pageRefs: string[];
  traceSnippets: string[];
  excerptPacket: ExcerptPacketJson;
  usage: UsageCostFields;
};

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function truncateForAudit(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function addUniqueValues(target: string[], values: string[], maxItems: number) {
  for (const value of values) {
    if (!value || target.includes(value)) {
      continue;
    }

    target.push(value);

    if (target.length >= maxItems) {
      break;
    }
  }
}

function createDefaultUsageCostFields(): UsageCostFields {
  return {
    provider: null,
    model: null,
    providerRequestId: null,
    providerResponseId: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    promptCacheHitTokens: null,
    promptCacheMissTokens: null,
    reasoningTokens: null,
    providerUsageJson: null,
    estimatedCostUsd: 0,
    pricingVersion: "deepseek_v1",
  };
}

export function createRetrievalAuditCollector(
  scope: ContractScope,
  userQueryText: string,
) {
  const normalizedUserQuery = truncateForAudit(
    normalizeWhitespace(userQueryText),
    MAX_RETRIEVAL_AUDIT_QUERY_LENGTH,
  );
  const state: RetrievalAuditState = {
    toolNames: [],
    documentNames: [],
    pageRefs: [],
    traceSnippets: [],
    excerptPacket: [],
    usage: createDefaultUsageCostFields(),
  };

  return {
    recordToolResult(
      toolName: string,
      summary: RetrievalAuditTraceData,
      excerptPacket: ExcerptPacketJson = [],
    ) {
      addUniqueValues(state.toolNames, [toolName], MAX_RETRIEVAL_AUDIT_VALUES);
      addUniqueValues(
        state.documentNames,
        summary.documentNames,
        MAX_RETRIEVAL_AUDIT_VALUES,
      );
      addUniqueValues(state.pageRefs, summary.pageRefs, MAX_RETRIEVAL_AUDIT_VALUES);
      addUniqueValues(
        state.traceSnippets,
        summary.snippets,
        MAX_RETRIEVAL_AUDIT_SNIPPETS,
      );

      for (const item of excerptPacket) {
        if (state.excerptPacket.length >= MAX_RETRIEVAL_AUDIT_EXCERPTS) {
          break;
        }

        state.excerptPacket.push({
          ...item,
          ordinal: state.excerptPacket.length,
        });
      }
    },
    setUsageFields(usageFields: UsageCostFields) {
      state.usage = usageFields;
    },
    toRecord(): RetrievalAuditRecord {
      return {
        scope,
        normalizedUserQuery,
        toolNames: [...state.toolNames],
        documentNames: [...state.documentNames],
        pageRefs: [...state.pageRefs],
        traceSnippets: [...state.traceSnippets],
        excerptPacket: [...state.excerptPacket],
        usage: state.usage,
      };
    },
  };
}

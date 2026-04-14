import type { UIMessage } from "ai";
import {
  DEFAULT_CONTRACT_SCOPE,
  parseContractScope,
  type ContractScope,
} from "@/app/contracts";

export type RetrievalStatus = {
  active: boolean;
  label: string;
  toolName?: string;
  toolCallId?: string;
};

export type ChatDataParts = {
  retrievalStatus: RetrievalStatus;
};

export type ChatMessageMetadata = {
  scope: ContractScope;
  hasPersistedAudit?: boolean;
  userRating?: 1 | 2 | 3 | null;
};

export type ChatMessage = UIMessage<ChatMessageMetadata, ChatDataParts>;

export function getChatMessageText(message: ChatMessage) {
  return message.parts
    .filter(
      (
        part,
      ): part is Extract<ChatMessage["parts"][number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

export function getChatMessageScope(message: ChatMessage) {
  return parseContractScope(message.metadata?.scope);
}

export function getInitialScope(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const scope = messages[index]?.metadata?.scope;

    if (typeof scope === "string") {
      return parseContractScope(scope);
    }
  }

  return DEFAULT_CONTRACT_SCOPE;
}

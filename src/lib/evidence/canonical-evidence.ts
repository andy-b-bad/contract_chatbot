import type { ContractScope } from "@/app/contracts";

export type CanonicalEvidenceItem = {
  scope: ContractScope;
  toolName: "get_page_content";
  documentName: string;
  pageRef: string;
  pageNumber: number | null;
  requestedPages: string | null;
  rawText: string;
};

export type CanonicalEvidenceCollector = {
  recordPageContentResult(args: {
    scope: ContractScope;
    toolName: "get_page_content";
    toolInput: unknown;
    toolResult: unknown;
  }): void;
  items(): CanonicalEvidenceItem[];
};

type ParsedPageIndexJson = {
  content?: unknown[];
  docs?: unknown[];
  pages?: unknown;
  requested_pages?: unknown;
  shared_summary_pages?: unknown;
};

type ToolResultContentPart = {
  type?: unknown;
  text?: unknown;
};

function extractToolText(result: unknown) {
  if (
    typeof result !== "object" ||
    result === null ||
    !("content" in result) ||
    !Array.isArray(result.content)
  ) {
    return "";
  }

  return result.content
    .filter(
      (item): item is ToolResultContentPart =>
        typeof item === "object" &&
        item !== null &&
        item.type === "text" &&
        typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("\n");
}

function parseToolJson(result: unknown) {
  const text = extractToolText(result);

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as ParsedPageIndexJson | unknown[];
  } catch {
    return null;
  }
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRequestedPagesValue(value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getRequestedPagesFromInput(input: unknown) {
  if (typeof input !== "object" || input === null || !("pages" in input)) {
    return null;
  }

  return getRequestedPagesValue(input.pages);
}

function getParsedItems(json: ParsedPageIndexJson | unknown[]) {
  if (Array.isArray(json)) {
    return json;
  }

  if (Array.isArray(json.content)) {
    return json.content;
  }

  if (Array.isArray(json.docs)) {
    return json.docs;
  }

  return [];
}

function getTopLevelRequestedPages(json: ParsedPageIndexJson | unknown[]) {
  if (Array.isArray(json)) {
    return null;
  }

  return (
    getRequestedPagesValue(json.requested_pages) ??
    getRequestedPagesValue(json.pages) ??
    getRequestedPagesValue(json.shared_summary_pages)
  );
}

function getCanonicalEvidenceItem(args: {
  scope: ContractScope;
  toolName: "get_page_content";
  item: unknown;
  requestedPages: string | null;
}) {
  const { scope, toolName, item, requestedPages } = args;

  if (typeof item !== "object" || item === null) {
    return null;
  }

  const documentName =
    getString("document_name" in item ? item.document_name : undefined) ??
    getString("doc_name" in item ? item.doc_name : undefined) ??
    getString("name" in item ? item.name : undefined);
  const rawText =
    getString("raw_text" in item ? item.raw_text : undefined) ??
    getString("text" in item ? item.text : undefined) ??
    getString("content" in item ? item.content : undefined) ??
    getString("excerpt_text" in item ? item.excerpt_text : undefined);
  const pageNumber =
    getNumber("page_number" in item ? item.page_number : undefined) ??
    getNumber("page" in item ? item.page : undefined);
  const pageRef =
    getString("page_ref" in item ? item.page_ref : undefined)?.trim() ??
    (pageNumber != null ? String(pageNumber) : null);

  if (documentName == null || pageRef == null || rawText == null) {
    return null;
  }

  return {
    scope,
    toolName,
    documentName,
    pageRef,
    pageNumber,
    requestedPages,
    rawText,
  } satisfies CanonicalEvidenceItem;
}

function normalizeRawText(rawText: string) {
  return rawText.replace(/\s+/g, " ").trim();
}

function getDeduplicationKey(item: CanonicalEvidenceItem) {
  return [
    item.scope,
    item.documentName.trim().toLowerCase(),
    item.pageRef.trim().toLowerCase(),
    normalizeRawText(item.rawText),
  ].join("::");
}

export function createCanonicalEvidenceCollector(): CanonicalEvidenceCollector {
  const evidenceItems: CanonicalEvidenceItem[] = [];
  const seenKeys = new Set<string>();

  return {
    recordPageContentResult({ scope, toolName, toolInput, toolResult }) {
      const parsed = parseToolJson(toolResult);

      if (parsed == null) {
        return;
      }

      const requestedPages =
        getTopLevelRequestedPages(parsed) ?? getRequestedPagesFromInput(toolInput);
      const parsedItems = getParsedItems(parsed);

      for (const parsedItem of parsedItems) {
        const evidenceItem = getCanonicalEvidenceItem({
          scope,
          toolName,
          item: parsedItem,
          requestedPages,
        });

        if (evidenceItem == null) {
          continue;
        }

        const key = getDeduplicationKey(evidenceItem);

        if (seenKeys.has(key)) {
          continue;
        }

        seenKeys.add(key);
        evidenceItems.push(evidenceItem);
      }
    },
    items() {
      return [...evidenceItems];
    },
  };
}

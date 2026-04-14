const MAX_EXCERPT_PACKET_ITEMS = 8;
const MAX_EXCERPT_TEXT_LENGTH = 1200;

export type ExcerptPacketItem = {
  ordinal: number;
  tool_name: string;
  document_name: string;
  document_item_id: string | null;
  page_ref: string;
  excerpt_text: string;
  page_number: number | null;
  requested_pages: string | null;
};

export type ExcerptPacketJson = ExcerptPacketItem[];

type ParsedToolJson = {
  docs?: unknown[];
  content?: unknown[];
  pages?: unknown;
  requested_pages?: unknown;
  shared_summary_pages?: unknown;
};

type ToolResultContentPart = {
  type?: unknown;
  text?: unknown;
};

function getRequestedDocumentName(input: unknown) {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  if ("doc_name" in input && typeof input.doc_name === "string") {
    return input.doc_name.trim() || null;
  }

  if ("docName" in input && typeof input.docName === "string") {
    return input.docName.trim() || null;
  }

  if ("name" in input && typeof input.name === "string") {
    return input.name.trim() || null;
  }

  return null;
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function truncateExcerptText(text: string) {
  if (text.length <= MAX_EXCERPT_TEXT_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_EXCERPT_TEXT_LENGTH)}...`;
}

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
    return JSON.parse(text) as ParsedToolJson | unknown[];
  } catch {
    return null;
  }
}

function getStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalString(value: unknown) {
  const text = getStringValue(value);

  return text.length > 0 ? text : null;
}

function getNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRequestedPages(value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getParsedItems(json: ParsedToolJson | unknown[]) {
  if (Array.isArray(json)) {
    return json;
  }

  if (Array.isArray(json.docs)) {
    return json.docs;
  }

  if (Array.isArray(json.content)) {
    return json.content;
  }

  return [];
}

function getTopLevelRequestedPages(json: ParsedToolJson | unknown[]) {
  if (Array.isArray(json)) {
    return null;
  }

  return (
    getRequestedPages(json.requested_pages) ??
    getRequestedPages(json.pages) ??
    getRequestedPages(json.shared_summary_pages)
  );
}

function buildExcerptItem(
  item: unknown,
  toolName: string,
  fallbackDocumentName: string | null,
  fallbackRequestedPages: string | null,
) {
  if (typeof item !== "object" || item === null) {
    return null;
  }

  const documentName =
    getOptionalString(
      "document_name" in item ? item.document_name : undefined,
    ) ??
    getOptionalString("doc_name" in item ? item.doc_name : undefined) ??
    getOptionalString("name" in item ? item.name : undefined) ??
    fallbackDocumentName;
  const excerptTextSource =
    getOptionalString("excerpt_text" in item ? item.excerpt_text : undefined) ??
    getOptionalString("snippet" in item ? item.snippet : undefined) ??
    getOptionalString("excerpt" in item ? item.excerpt : undefined) ??
    getOptionalString("text" in item ? item.text : undefined) ??
    getOptionalString("content" in item ? item.content : undefined);
  const pageNumber =
    getNumberValue("page_number" in item ? item.page_number : undefined) ??
    getNumberValue("page" in item ? item.page : undefined);
  const requestedPages =
    getRequestedPages("requested_pages" in item ? item.requested_pages : undefined) ??
    getRequestedPages("pages" in item ? item.pages : undefined) ??
    fallbackRequestedPages;
  const pageRef =
    getOptionalString("page_ref" in item ? item.page_ref : undefined) ??
    (pageNumber != null ? String(pageNumber) : null) ??
    requestedPages;
  const normalizedExcerptText =
    excerptTextSource != null
      ? truncateExcerptText(normalizeWhitespace(excerptTextSource))
      : null;

  if (
    documentName == null ||
    pageRef == null ||
    normalizedExcerptText == null ||
    normalizedExcerptText.length === 0
  ) {
    return null;
  }

  return {
    ordinal: 0,
    tool_name: toolName,
    document_name: documentName,
    document_item_id:
      getOptionalString(
        "document_item_id" in item ? item.document_item_id : undefined,
      ) ??
      getOptionalString("item_id" in item ? item.item_id : undefined) ??
      ("id" in item &&
      (typeof item.id === "string" || typeof item.id === "number")
        ? String(item.id)
        : null),
    page_ref: pageRef,
    excerpt_text: normalizedExcerptText,
    page_number: pageNumber,
    requested_pages: requestedPages,
  } satisfies ExcerptPacketItem;
}

export function buildExcerptPacket(
  toolInput: unknown,
  toolResults: unknown,
  toolName: string,
): ExcerptPacketJson {
  const parsed = parseToolJson(toolResults);

  if (parsed == null) {
    return [];
  }

  const requestedDocumentName = getRequestedDocumentName(toolInput);
  const requestedPages = getTopLevelRequestedPages(parsed);
  const items = getParsedItems(parsed);
  const packet: ExcerptPacketJson = [];

  for (const item of items) {
    if (packet.length >= MAX_EXCERPT_PACKET_ITEMS) {
      break;
    }

    const excerptItem = buildExcerptItem(
      item,
      toolName,
      requestedDocumentName,
      requestedPages,
    );

    if (excerptItem == null) {
      continue;
    }

    packet.push({
      ...excerptItem,
      ordinal: packet.length,
    });
  }

  return packet;
}

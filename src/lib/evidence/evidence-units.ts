import type { CanonicalEvidenceItem } from "./canonical-evidence";
import {
  parseMarkdownTablesFromPactCinemaSummary,
  type ParsedSummaryTableCell,
} from "./pact-cinema-summary-tables";

export type EvidenceUnitKind = "table-row" | "prose-block";

export type EvidenceUnit = {
  evidenceId: string;
  kind: EvidenceUnitKind;
  sourceDocument: string;
  sourcePage: string;
  requestedPages: string | null;
  section: string | null;
  headingPath: string[];
  sourceText: string;
  canonicalEvidenceId: string;
  metadata: {
    tableHeaders?: string[];
    cells?: ParsedSummaryTableCell[];
    applicableRoles?: string[];
  };
};

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function stableHash(parts: string[]) {
  let hash = 2166136261;

  for (const char of parts.join("::")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getCanonicalEvidenceId(item: CanonicalEvidenceItem) {
  return stableHash([
    item.scope,
    item.documentName,
    item.pageRef,
    normalizeWhitespace(item.rawText),
  ]);
}

function getEvidenceUnitId(args: {
  sourceDocument: string;
  sourcePage: string;
  kind: EvidenceUnitKind;
  section: string | null;
  sourceText: string;
}) {
  return stableHash([
    args.sourceDocument,
    args.sourcePage,
    args.kind,
    args.section ?? "",
    normalizeWhitespace(args.sourceText),
  ]);
}

function getMarkdownHeading(line: string) {
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);

  if (!match) {
    return null;
  }

  return {
    level: match[1].length,
    text: match[2].trim(),
  };
}

function isMarkdownTableLine(line: string) {
  const trimmedLine = line.trim();

  return trimmedLine.startsWith("|") && trimmedLine.endsWith("|");
}

function buildTableUnits(canonicalItems: CanonicalEvidenceItem[]) {
  const parsed = parseMarkdownTablesFromPactCinemaSummary(canonicalItems);

  return parsed.rows.map((row) => {
    const canonicalItem = canonicalItems.find(
      (item) =>
        item.documentName === row.sourceDocument &&
        item.pageRef === row.sourcePage &&
        item.rawText.includes(row.sourceRowText),
    );
    const canonicalEvidenceId = canonicalItem
      ? getCanonicalEvidenceId(canonicalItem)
      : stableHash([row.sourceDocument, row.sourcePage, row.sourceRowText]);

    return {
      evidenceId: getEvidenceUnitId({
        sourceDocument: row.sourceDocument,
        sourcePage: row.sourcePage,
        kind: "table-row",
        section: row.section,
        sourceText: row.sourceRowText,
      }),
      kind: "table-row",
      sourceDocument: row.sourceDocument,
      sourcePage: row.sourcePage,
      requestedPages: canonicalItem?.requestedPages ?? null,
      section: row.section,
      headingPath: row.section ? [row.section] : [],
      sourceText: row.sourceRowText,
      canonicalEvidenceId,
      metadata: {
        tableHeaders: row.tableHeaders,
        cells: row.cells,
        applicableRoles: row.applicableRoles,
      },
    } satisfies EvidenceUnit;
  });
}

function buildProseUnits(canonicalItem: CanonicalEvidenceItem) {
  const units: EvidenceUnit[] = [];
  const headingPath: Array<{ level: number; text: string }> = [];
  let currentBlock: string[] = [];

  const flushBlock = () => {
    const sourceText = currentBlock.join("\n").trim();

    currentBlock = [];

    if (!sourceText || isMarkdownTableLine(sourceText)) {
      return;
    }

    const activeHeadings = headingPath.map((heading) => heading.text);
    const section = activeHeadings.at(-1) ?? null;

    units.push({
      evidenceId: getEvidenceUnitId({
        sourceDocument: canonicalItem.documentName,
        sourcePage: canonicalItem.pageRef,
        kind: "prose-block",
        section,
        sourceText,
      }),
      kind: "prose-block",
      sourceDocument: canonicalItem.documentName,
      sourcePage: canonicalItem.pageRef,
      requestedPages: canonicalItem.requestedPages,
      section,
      headingPath: activeHeadings,
      sourceText,
      canonicalEvidenceId: getCanonicalEvidenceId(canonicalItem),
      metadata: {},
    });
  };

  for (const line of canonicalItem.rawText.split(/\r?\n/)) {
    const heading = getMarkdownHeading(line);

    if (heading) {
      flushBlock();

      while (
        headingPath.length > 0 &&
        headingPath[headingPath.length - 1].level >= heading.level
      ) {
        headingPath.pop();
      }

      headingPath.push(heading);
      continue;
    }

    if (isMarkdownTableLine(line)) {
      flushBlock();
      continue;
    }

    if (line.trim().length === 0) {
      flushBlock();
      continue;
    }

    currentBlock.push(line);
  }

  flushBlock();

  return units;
}

export function buildEvidenceUnits(
  canonicalItems: CanonicalEvidenceItem[],
): EvidenceUnit[] {
  return [
    ...buildTableUnits(canonicalItems),
    ...canonicalItems.flatMap((item) => buildProseUnits(item)),
  ];
}

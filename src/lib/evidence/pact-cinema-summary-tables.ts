import type { CanonicalEvidenceItem } from "./canonical-evidence";

export type ParsedSummaryTableCell = {
  header: string;
  normalizedHeader: string;
  value: string;
};

export type PactCinemaSummaryTableRow = {
  scope: "pact-cinema";
  sourceDocument: "PACT_Cinema_Summary.pdf";
  sourcePage: string;
  section: string | null;
  tableHeaders: string[];
  cells: ParsedSummaryTableCell[];
  applicableRoles: string[];
  sourceRowText: string;
};

export type PactCinemaSummaryTableParseFailure = {
  sourceDocument: "PACT_Cinema_Summary.pdf";
  sourcePage: string;
  section: string | null;
  sourceRowText: string;
  reason:
    | "blank_header"
    | "duplicate_header"
    | "malformed_header"
    | "malformed_row";
};

export type PactCinemaSummaryTableParseResult = {
  rows: PactCinemaSummaryTableRow[];
  failures: PactCinemaSummaryTableParseFailure[];
};

const SUMMARY_DOCUMENT_NAME = "pact_cinema_summary.pdf";
const ROLE_HEADER_PATTERN = /\b(role|applicable|performer|coordinator|artist)\b/i;
const HEADING_ROLE_PATTERN =
  /\b(Stunt Coordinators and Stunt Performers|Stunt Coordinators|Stunt Performers)\b/gi;

type MarkdownTableState = {
  headers: string[];
  normalizedHeaders: string[];
  section: string | null;
  invalid: boolean;
};

function isPactCinemaSummaryEvidence(item: CanonicalEvidenceItem) {
  return (
    item.scope === "pact-cinema" &&
    item.documentName.trim().toLowerCase() === SUMMARY_DOCUMENT_NAME
  );
}

function normalizeHeader(header: string) {
  return header.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeRole(role: string) {
  return role.replace(/\s+/g, " ").trim();
}

function splitMarkdownRow(line: string) {
  const trimmedLine = line.trim();

  if (!trimmedLine.startsWith("|") || !trimmedLine.endsWith("|")) {
    return null;
  }

  return trimmedLine
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function getMarkdownHeading(line: string) {
  const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);

  if (!headingMatch) {
    return null;
  }

  return headingMatch[2].trim();
}

function getHeadingRoles(heading: string | null) {
  if (heading == null) {
    return [];
  }

  const roles: string[] = [];

  for (const match of heading.matchAll(HEADING_ROLE_PATTERN)) {
    roles.push(normalizeRole(match[1]));
  }

  return roles;
}

function getRowRoles(headers: string[], cells: string[]) {
  const roles: string[] = [];

  headers.forEach((header, index) => {
    if (!ROLE_HEADER_PATTERN.test(header)) {
      return;
    }

    const value = cells[index];

    if (!value) {
      return;
    }

    for (const role of value.split(/\s*(?:,|;|\/)\s*/)) {
      const normalizedRole = normalizeRole(role);

      if (normalizedRole) {
        roles.push(normalizedRole);
      }
    }
  });

  return roles;
}

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const key = value.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(value);
  }

  return unique;
}

function getHeaderFailureReason(headers: string[]) {
  if (headers.length === 0) {
    return "malformed_header" as const;
  }

  const normalizedHeaders = headers.map(normalizeHeader);

  if (normalizedHeaders.some((header) => header.length === 0)) {
    return "blank_header" as const;
  }

  const seenHeaders = new Set<string>();

  for (const header of normalizedHeaders) {
    if (seenHeaders.has(header)) {
      return "duplicate_header" as const;
    }

    seenHeaders.add(header);
  }

  return null;
}

function createFailure(args: {
  sourcePage: string;
  section: string | null;
  sourceRowText: string;
  reason: PactCinemaSummaryTableParseFailure["reason"];
}) {
  return {
    sourceDocument: "PACT_Cinema_Summary.pdf",
    sourcePage: args.sourcePage,
    section: args.section,
    sourceRowText: args.sourceRowText,
    reason: args.reason,
  } satisfies PactCinemaSummaryTableParseFailure;
}

function parseMarkdownTablesFromEvidenceItem(item: CanonicalEvidenceItem) {
  const rows: PactCinemaSummaryTableRow[] = [];
  const failures: PactCinemaSummaryTableParseFailure[] = [];
  const sourcePage = item.pageRef.trim();
  let currentSection: string | null = null;
  let pendingHeaders: { headers: string[]; sourceRowText: string } | null = null;
  let tableState: MarkdownTableState | null = null;

  for (const line of item.rawText.split(/\r?\n/)) {
    const heading = getMarkdownHeading(line);

    if (heading != null) {
      currentSection = heading;
      pendingHeaders = null;
      tableState = null;
      continue;
    }

    const cells = splitMarkdownRow(line);

    if (cells == null) {
      pendingHeaders = null;
      tableState = null;
      continue;
    }

    if (isSeparatorRow(cells)) {
      if (pendingHeaders == null) {
        failures.push(
          createFailure({
            sourcePage,
            section: currentSection,
            sourceRowText: line,
            reason: "malformed_header",
          }),
        );
        tableState = null;
        continue;
      }

      const headerFailureReason = getHeaderFailureReason(pendingHeaders.headers);

      if (headerFailureReason != null) {
        failures.push(
          createFailure({
            sourcePage,
            section: currentSection,
            sourceRowText: pendingHeaders.sourceRowText,
            reason: headerFailureReason,
          }),
        );
        tableState = {
          headers: pendingHeaders.headers,
          normalizedHeaders: pendingHeaders.headers.map(normalizeHeader),
          section: currentSection,
          invalid: true,
        };
        pendingHeaders = null;
        continue;
      }

      tableState = {
        headers: pendingHeaders.headers,
        normalizedHeaders: pendingHeaders.headers.map(normalizeHeader),
        section: currentSection,
        invalid: false,
      };
      pendingHeaders = null;
      continue;
    }

    if (tableState == null) {
      pendingHeaders = {
        headers: cells,
        sourceRowText: line,
      };
      continue;
    }

    if (tableState.invalid || cells.length !== tableState.headers.length) {
      failures.push(
        createFailure({
          sourcePage,
          section: tableState.section,
          sourceRowText: line,
          reason: "malformed_row",
        }),
      );
      continue;
    }

    const rowRoles = getRowRoles(tableState.headers, cells);
    const headingRoles = getHeadingRoles(tableState.section);
    const activeTable = tableState;

    rows.push({
      scope: "pact-cinema",
      sourceDocument: "PACT_Cinema_Summary.pdf",
      sourcePage,
      section: activeTable.section,
      tableHeaders: [...activeTable.headers],
      cells: cells.map((value, index) => ({
        header: activeTable.headers[index],
        normalizedHeader: activeTable.normalizedHeaders[index],
        value,
      })),
      applicableRoles: uniqueValues([...headingRoles, ...rowRoles]),
      sourceRowText: line,
    });
  }

  return { rows, failures };
}

export function parseMarkdownTablesFromPactCinemaSummary(
  evidenceItems: CanonicalEvidenceItem[],
): PactCinemaSummaryTableParseResult {
  const rows: PactCinemaSummaryTableRow[] = [];
  const failures: PactCinemaSummaryTableParseFailure[] = [];

  for (const item of evidenceItems.filter(isPactCinemaSummaryEvidence)) {
    const result = parseMarkdownTablesFromEvidenceItem(item);

    rows.push(...result.rows);
    failures.push(...result.failures);
  }

  return { rows, failures };
}

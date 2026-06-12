import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceItem } from "./canonical-evidence";
import {
  parseMarkdownTablesFromPactCinemaSummary,
  type PactCinemaSummaryTableRow,
} from "./pact-cinema-summary-tables";
import pactCinemaSummaryPage from "./fixtures/pact-cinema-summary-page-1.pageindex.json";
import pactCinemaPrimaryAgreementPages from "./fixtures/pact-cinema-primary-agreement-pages-20-22.pageindex.json";

const overtimeRowText =
  "| Overtime | Stunt Coordinators and Stunt Performers | 1/7 daily/hr | Applies where overtime is payable for stunt coordinators and stunt performers under the summary rate table. | PACT Cinema Summary p.1, Overtime row |";
const nightWorkRowText =
  "| Night Work | See agreement | Night work terms are summarised for quick lookup. | PACT Cinema Summary p.1, Night Work row |";
const travelRowText =
  "| Travel | By agreement | Travel summary row unrelated to overtime. | PACT Cinema Summary p.1, Travel row |";

function evidence(rawText = pactCinemaSummaryPage.content[0].content) {
  return [
    {
      scope: "pact-cinema",
      toolName: "get_page_content",
      documentName: "PACT_Cinema_Summary.pdf",
      pageRef: "1",
      pageNumber: 1,
      requestedPages: "1",
      rawText,
    },
  ] satisfies CanonicalEvidenceItem[];
}

function primaryAgreementEvidence() {
  return pactCinemaPrimaryAgreementPages.content.map((item) => ({
    scope: "pact-cinema",
    toolName: "get_page_content",
    documentName: item.name,
    pageRef: item.page_ref,
    pageNumber: item.page_number,
    requestedPages: "20-22",
    rawText: item.content,
  })) satisfies CanonicalEvidenceItem[];
}

function cell(row: PactCinemaSummaryTableRow, header: string) {
  return row.cells.find((item) => item.header === header);
}

test("parses overtime as a generic summary table row", () => {
  const result = parseMarkdownTablesFromPactCinemaSummary(evidence());
  const row = result.rows.find((item) => cell(item, "Topic")?.value === "Overtime");

  assert.equal(row?.sourceRowText, overtimeRowText);
  assert.equal(cell(row!, "Rate")?.value, "1/7 daily/hr");
  assert.deepEqual(row?.tableHeaders, [
    "Topic",
    "Applicable role",
    "Rate",
    "Notes",
    "Source reference",
  ]);
});

test("parses night work as a generic summary table row", () => {
  const result = parseMarkdownTablesFromPactCinemaSummary(evidence());
  const row = result.rows.find((item) => cell(item, "Item")?.value === "Night Work");

  assert.equal(row?.sourceRowText, nightWorkRowText);
  assert.equal(cell(row!, "Value")?.value, "See agreement");
  assert.equal(cell(row!, "Reference")?.value, "PACT Cinema Summary p.1, Night Work row");
});

test("parses an unrelated summary row", () => {
  const result = parseMarkdownTablesFromPactCinemaSummary(evidence());
  const row = result.rows.find((item) => cell(item, "Item")?.value === "Travel");

  assert.equal(row?.sourceRowText, travelRowText);
  assert.equal(cell(row!, "Value")?.value, "By agreement");
  assert.equal(cell(row!, "Notes")?.value, "Travel summary row unrelated to overtime.");
});

test("derives applicable roles from nearest heading and explicit role column", () => {
  const result = parseMarkdownTablesFromPactCinemaSummary(evidence());
  const overtime = result.rows.find((row) => cell(row, "Topic")?.value === "Overtime");
  const nightWork = result.rows.find((row) => cell(row, "Item")?.value === "Night Work");

  assert.deepEqual(overtime?.applicableRoles, [
    "Stunt Coordinators and Stunt Performers",
  ]);
  assert.deepEqual(nightWork?.applicableRoles, []);
});

test("derives applicable roles from a heading when no role column is present", () => {
  const result = parseMarkdownTablesFromPactCinemaSummary(
    evidence(
      [
        "# Stunt Performers",
        "",
        "| Item | Value | Reference |",
        "| --- | --- | --- |",
        "| Meal break | See agreement | PACT Cinema Summary p.1, Meal break row |",
      ].join("\n"),
    ),
  );

  assert.deepEqual(result.rows[0]?.applicableRoles, ["Stunt Performers"]);
});

test("preserves source headers and values while adding normalized headers", () => {
  const result = parseMarkdownTablesFromPactCinemaSummary(evidence());
  const overtime = result.rows.find((row) => cell(row, "Topic")?.value === "Overtime");

  assert.deepEqual(overtime?.cells[1], {
    header: "Applicable role",
    normalizedHeader: "applicable role",
    value: "Stunt Coordinators and Stunt Performers",
  });
});

test("parses multiple tables and sections from the fixture", () => {
  const result = parseMarkdownTablesFromPactCinemaSummary(evidence());

  assert.deepEqual(
    result.rows.map((row) => row.section),
    [
      "Stunt Coordinators and Stunt Performers",
      "Stunt Coordinators and Stunt Performers",
      "Work Conditions",
      "Work Conditions",
    ],
  );
  assert.deepEqual(
    result.rows.map((row) => row.tableHeaders),
    [
      ["Topic", "Applicable role", "Rate", "Notes", "Source reference"],
      ["Topic", "Applicable role", "Rate", "Notes", "Source reference"],
      ["Item", "Value", "Notes", "Reference"],
      ["Item", "Value", "Notes", "Reference"],
    ],
  );
});

test("reports duplicate and blank headers", () => {
  const duplicateResult = parseMarkdownTablesFromPactCinemaSummary(
    evidence(["| Item | Item | Notes |", "| --- | --- | --- |", "| A | B | C |"].join("\n")),
  );
  const blankResult = parseMarkdownTablesFromPactCinemaSummary(
    evidence(["| Item |  | Notes |", "| --- | --- | --- |", "| A | B | C |"].join("\n")),
  );

  assert.equal(duplicateResult.failures[0]?.reason, "duplicate_header");
  assert.equal(duplicateResult.failures[1]?.reason, "malformed_row");
  assert.equal(blankResult.failures[0]?.reason, "blank_header");
  assert.equal(blankResult.failures[1]?.reason, "malformed_row");
});

test("reports malformed rows", () => {
  const result = parseMarkdownTablesFromPactCinemaSummary(
    evidence(
      [
        "| Item | Value | Notes |",
        "| --- | --- | --- |",
        "| Night Work | See agreement |",
      ].join("\n"),
    ),
  );

  assert.deepEqual(result.rows, []);
  assert.equal(result.failures[0]?.reason, "malformed_row");
});

test("ignores prose false positives", () => {
  const result = parseMarkdownTablesFromPactCinemaSummary(
    evidence("A prose paragraph mentions Overtime and 1/7 daily/hr without a table row."),
  );

  assert.deepEqual(result, {
    rows: [],
    failures: [],
  });
});

test("ignores non-summary evidence", () => {
  const result = parseMarkdownTablesFromPactCinemaSummary(primaryAgreementEvidence());

  assert.deepEqual(result, {
    rows: [],
    failures: [],
  });
});

test("returns deterministic repeated output", () => {
  const firstResult = parseMarkdownTablesFromPactCinemaSummary(evidence());
  const secondResult = parseMarkdownTablesFromPactCinemaSummary(evidence());

  assert.deepEqual(firstResult, secondResult);
});

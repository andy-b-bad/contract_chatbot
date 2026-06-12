import assert from "node:assert/strict";
import test from "node:test";
import { createCanonicalEvidenceCollector } from "./canonical-evidence";
import pactCinemaPrimaryAgreementPages from "./fixtures/pact-cinema-primary-agreement-pages-20-22.pageindex.json";
import pactCinemaSummaryPage from "./fixtures/pact-cinema-summary-page-1.pageindex.json";

function toolResult(payload: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload),
      },
    ],
  };
}

test("records PageIndex get_page_content fixture items", () => {
  const collector = createCanonicalEvidenceCollector();

  collector.recordPageContentResult({
    scope: "pact-cinema",
    toolName: "get_page_content",
    toolInput: { doc_name: "PACT_Cinema_Summary.pdf", pages: "1" },
    toolResult: toolResult(pactCinemaSummaryPage),
  });

  assert.deepEqual(collector.items(), [
    {
      scope: "pact-cinema",
      toolName: "get_page_content",
      documentName: "PACT_Cinema_Summary.pdf",
      pageRef: "1",
      pageNumber: 1,
      requestedPages: "1",
      rawText: pactCinemaSummaryPage.content[0].content,
    },
  ]);
});

test("dedupes identical scope document page and raw text items", () => {
  const collector = createCanonicalEvidenceCollector();
  const args = {
    scope: "pact-cinema" as const,
    toolName: "get_page_content" as const,
    toolInput: { doc_name: "PACT_Cinema_Summary.pdf", pages: "1" },
    toolResult: toolResult(pactCinemaSummaryPage),
  };

  collector.recordPageContentResult(args);
  collector.recordPageContentResult(args);

  assert.equal(collector.items().length, 1);
});

test("does not dedupe the same page with different raw text", () => {
  const collector = createCanonicalEvidenceCollector();
  const variant = {
    ...pactCinemaSummaryPage,
    content: [
      {
        ...pactCinemaSummaryPage.content[0],
        content: `${pactCinemaSummaryPage.content[0].content}\nAdditional text.`,
      },
    ],
  };

  collector.recordPageContentResult({
    scope: "pact-cinema",
    toolName: "get_page_content",
    toolInput: { doc_name: "PACT_Cinema_Summary.pdf", pages: "1" },
    toolResult: toolResult(pactCinemaSummaryPage),
  });
  collector.recordPageContentResult({
    scope: "pact-cinema",
    toolName: "get_page_content",
    toolInput: { doc_name: "PACT_Cinema_Summary.pdf", pages: "1" },
    toolResult: toolResult(variant),
  });

  assert.equal(collector.items().length, 2);
});

test("ignores non-JSON tool output", () => {
  const collector = createCanonicalEvidenceCollector();

  collector.recordPageContentResult({
    scope: "pact-cinema",
    toolName: "get_page_content",
    toolInput: { pages: "1" },
    toolResult: {
      content: [{ type: "text", text: "not json" }],
    },
  });

  assert.deepEqual(collector.items(), []);
});

test("ignores PageIndex items without document name page reference or text", () => {
  const collector = createCanonicalEvidenceCollector();

  collector.recordPageContentResult({
    scope: "pact-cinema",
    toolName: "get_page_content",
    toolInput: { pages: "1" },
    toolResult: toolResult({
      content: [
        { page_ref: "1", page_number: 1, content: "Missing document name" },
        { name: "PACT_Cinema_Summary.pdf", content: "Missing page" },
        { name: "PACT_Cinema_Summary.pdf", page_ref: "1" },
      ],
    }),
  });

  assert.deepEqual(collector.items(), []);
});

test("preserves requested pages from top-level PageIndex response", () => {
  const collector = createCanonicalEvidenceCollector();

  collector.recordPageContentResult({
    scope: "pact-cinema",
    toolName: "get_page_content",
    toolInput: { pages: "1" },
    toolResult: toolResult(pactCinemaPrimaryAgreementPages),
  });

  assert.deepEqual(
    collector.items().map((item) => item.requestedPages),
    ["20-22", "20-22", "20-22"],
  );
});

test("preserves requested pages from tool input fallback", () => {
  const collector = createCanonicalEvidenceCollector();
  const withoutTopLevelPages = {
    content: pactCinemaPrimaryAgreementPages.content,
  };

  collector.recordPageContentResult({
    scope: "pact-cinema",
    toolName: "get_page_content",
    toolInput: { pages: "20-22" },
    toolResult: toolResult(withoutTopLevelPages),
  });

  assert.deepEqual(
    collector.items().map((item) => item.requestedPages),
    ["20-22", "20-22", "20-22"],
  );
});

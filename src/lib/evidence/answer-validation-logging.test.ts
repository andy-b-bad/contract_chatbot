import assert from "node:assert/strict";
import test from "node:test";
import {
  getAnswerValidationLogResult,
  isAnswerValidationLoggingEnabled,
  logAnswerValidationResult,
  safelyLogAnswerValidation,
} from "./answer-validation-logging";
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

function buildCanonicalEvidenceItems() {
  const collector = createCanonicalEvidenceCollector();

  collector.recordPageContentResult({
    scope: "pact-cinema",
    toolName: "get_page_content",
    toolInput: { doc_name: "PACT_Cinema_Summary.pdf", pages: "1" },
    toolResult: toolResult(pactCinemaSummaryPage),
  });
  collector.recordPageContentResult({
    scope: "pact-cinema",
    toolName: "get_page_content",
    toolInput: {
      doc_name:
        "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf",
      pages: "20-22",
    },
    toolResult: pactCinemaPrimaryAgreementPages,
  });

  return collector.items();
}

test("answer validation logging flag defaults off unless explicitly true", () => {
  assert.equal(isAnswerValidationLoggingEnabled({}), false);
  assert.equal(
    isAnswerValidationLoggingEnabled({
      ENABLE_ANSWER_VALIDATION_LOGGING: "false",
    }),
    false,
  );
  assert.equal(
    isAnswerValidationLoggingEnabled({
      ENABLE_ANSWER_VALIDATION_LOGGING: "true",
    }),
    true,
  );
});

test("flag disabled skips validation without calling dependencies", () => {
  const result = getAnswerValidationLogResult(
    {
      enabled: false,
      userQuery: "How much is overtime?",
      candidateAnswer: "Overtime is one third of daily Performance Salary.",
      canonicalEvidenceItems: buildCanonicalEvidenceItems(),
    },
    {
      buildUnits: () => {
        throw new Error("buildUnits should not run when disabled");
      },
    },
  );

  assert.deepEqual(result, {
    status: "skipped",
    reason: "disabled",
  });
});

test("enabled validation returns a compact serializable report", () => {
  const result = getAnswerValidationLogResult({
    enabled: true,
    userQuery: "How much is overtime?",
    candidateAnswer:
      "Overtime is payable at one third of the daily Performance Salary per hour, subject to a maximum of £88 per hour or part thereof.",
    canonicalEvidenceItems: buildCanonicalEvidenceItems(),
  });

  assert.equal(result.status, "validated");

  if (result.status !== "validated") {
    return;
  }

  assert.deepEqual(result.definiteDefects, []);
  assert.ok(
    result.possibleDefects.some(
      (defect) => defect.type === "likely_source_omission",
    ),
  );
  assert.ok(
    result.representedSources.some(
      (source) =>
        source.sourceDocument ===
          "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf" &&
        source.sourcePage === "20",
    ),
  );
  assert.ok(result.omittedSources.length > 0);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("no evidence and empty answer produce explicit skip reasons", () => {
  assert.deepEqual(
    getAnswerValidationLogResult({
      enabled: true,
      userQuery: "How much is overtime?",
      candidateAnswer: "Overtime is one third of daily Performance Salary.",
      canonicalEvidenceItems: [],
    }),
    {
      status: "skipped",
      reason: "empty_evidence",
    },
  );
  assert.deepEqual(
    getAnswerValidationLogResult({
      enabled: true,
      userQuery: "How much is overtime?",
      candidateAnswer: "   ",
      canonicalEvidenceItems: buildCanonicalEvidenceItems(),
    }),
    {
      status: "skipped",
      reason: "empty_answer",
    },
  );
});

test("safe logging catches helper errors and does not emit validation line", () => {
  const logs: string[] = [];
  const errors: Array<[string, unknown]> = [];

  assert.doesNotThrow(() =>
    safelyLogAnswerValidation(
      {
        enabled: true,
        userQuery: "How much is overtime?",
        candidateAnswer: "Overtime is one third of daily Performance Salary.",
        canonicalEvidenceItems: buildCanonicalEvidenceItems(),
      },
      {
        buildUnits: () => {
          throw new Error("synthetic validation failure");
        },
        log: (message) => logs.push(message),
        logError: (message, error) => errors.push([message, error]),
      },
    ),
  );
  assert.deepEqual(logs, []);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], "[chat] answer-validation:error");
});

test("validated reports are logged as one JSON-formatted line", () => {
  const logs: string[] = [];
  const result = getAnswerValidationLogResult({
    enabled: true,
    userQuery: "How much is overtime?",
    candidateAnswer:
      "The agreement says one third of daily Performance Salary subject to £88 per hour.",
    canonicalEvidenceItems: buildCanonicalEvidenceItems(),
  });

  logAnswerValidationResult({
    result,
    log: (message) => logs.push(message),
  });

  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\[chat\] answer-validation /);
  assert.doesNotThrow(() =>
    JSON.parse(logs[0].replace("[chat] answer-validation ", "")),
  );
});

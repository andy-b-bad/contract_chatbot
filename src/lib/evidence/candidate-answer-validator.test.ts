import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createCanonicalEvidenceCollector } from "./canonical-evidence";
import { buildEvidenceUnits, type EvidenceUnit } from "./evidence-units";
import { validateCandidateAnswer } from "./candidate-answer-validator";
import { historicalOvertimeCandidateAnswers } from "./fixtures/historical-overtime-candidate-answers";
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

function buildOfflineEvidenceUnits() {
  return buildEvidenceUnits(buildCanonicalEvidenceItems());
}

function defectTypes(report: ReturnType<typeof validateCandidateAnswer>) {
  return report.definiteDefects.map((defect) => defect.type);
}

function possibleDefectTypes(report: ReturnType<typeof validateCandidateAnswer>) {
  return report.possibleDefects.map((defect) => defect.type);
}

function sourceObservationTypes(report: ReturnType<typeof validateCandidateAnswer>) {
  return report.neutralObservations.map((observation) => observation.type);
}

function sourceKey(unit: EvidenceUnit) {
  return `${unit.sourceDocument}::${unit.sourcePage}`;
}

test("buildEvidenceUnits creates stable table-row and prose-block records from canonical evidence", () => {
  const units = buildOfflineEvidenceUnits();
  const repeatedUnits = buildOfflineEvidenceUnits();

  assert.deepEqual(
    units.map((unit) => unit.evidenceId),
    repeatedUnits.map((unit) => unit.evidenceId),
  );
  assert.ok(units.some((unit) => unit.kind === "table-row"));
  assert.ok(units.some((unit) => unit.kind === "prose-block"));
  assert.ok(
    units.some((unit) =>
      unit.sourceText.includes(
        "Hourly payments for overtime shall be at one third the daily Performance Salary",
      ),
    ),
  );
  assert.ok(new Set(units.map(sourceKey)).has("PACT_Cinema_Summary.pdf::1"));
  assert.ok(
    new Set(units.map(sourceKey)).has(
      "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::20",
    ),
  );
});

test("candidate-answer validation keeps desired-answer benchmark separate from historical candidates", () => {
  const benchmark = fs.readFileSync("docs/results/questions.md", "utf8");

  assert.match(benchmark, /gold-standard evaluation specification/);
  assert.equal(
    historicalOvertimeCandidateAnswers.every(
      (fixture) => !benchmark.includes(fixture.candidateAnswer),
    ),
    true,
  );
});

test("validates recovered historical overtime candidate answers against expected defects", () => {
  const evidenceUnits = buildOfflineEvidenceUnits();

  for (const fixture of historicalOvertimeCandidateAnswers) {
    const report = validateCandidateAnswer({
      userQuery: fixture.userQuery,
      candidateAnswer: fixture.candidateAnswer,
      evidenceUnits,
    });

    for (const expectedDefect of fixture.expectedDefiniteDefects) {
      assert.ok(
        defectTypes(report).includes(expectedDefect),
        `${fixture.fixtureId} should include definite defect ${expectedDefect}`,
      );
    }

    for (const expectedDefect of fixture.expectedPossibleDefects) {
      assert.ok(
        possibleDefectTypes(report).includes(expectedDefect),
        `${fixture.fixtureId} should include possible defect ${expectedDefect}`,
      );
    }

    if (fixture.fixtureId === "historical-overtime-good-both-provisions") {
      assert.deepEqual(report.definiteDefects, []);
      assert.equal(
        possibleDefectTypes(report).includes("likely_source_omission"),
        false,
      );
    }
  }
});

test("separates source_not_represented from likely_source_omission for preloaded non-relevant sources", () => {
  const evidenceUnits = buildOfflineEvidenceUnits();
  const report = validateCandidateAnswer({
    userQuery: "What is a resident location?",
    candidateAnswer:
      "The agreement refers to Resident Location travel in Clause F20 on page 22.",
    evidenceUnits,
  });

  assert.ok(sourceObservationTypes(report).includes("source_not_represented"));
  assert.equal(
    report.possibleDefects.some(
      (defect) =>
        defect.type === "likely_source_omission" &&
        defect.source?.sourceDocument === "PACT_Cinema_Summary.pdf",
    ),
    false,
  );
});

test("normalizes harmless number and rate text without deriving values", () => {
  const evidenceUnits = buildOfflineEvidenceUnits();
  const report = validateCandidateAnswer({
    userQuery: "How much is overtime?",
    candidateAnswer:
      "The summary says overtime is 1/7th daily/hr. The agreement says one third of daily Performance Salary subject to £88.00 per hour.",
    evidenceUnits,
  });

  assert.equal(
    report.definiteDefects.some(
      (defect) => defect.type === "unsupported_number_or_rate",
    ),
    false,
  );
});

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

function loadLocalTraceByQuery(queryPattern: RegExp) {
  const traceDir = ".local/traces";
  const traceFile = fs
    .readdirSync(traceDir)
    .sort()
    .find((fileName) => {
      const trace = JSON.parse(
        fs.readFileSync(`${traceDir}/${fileName}`, "utf8"),
      );

      return queryPattern.test(trace.request.userQuery);
    });

  assert.ok(traceFile, `Expected local trace matching ${queryPattern}`);

  return JSON.parse(fs.readFileSync(`${traceDir}/${traceFile}`, "utf8")) as {
    request: {
      userQuery: string;
    };
    response: {
      finalAnswer: string;
    };
    evidence: {
      canonicalEvidenceItems: Parameters<typeof buildEvidenceUnits>[0];
    };
  };
}

function validateLocalTrace(queryPattern: RegExp) {
  const trace = loadLocalTraceByQuery(queryPattern);

  return validateCandidateAnswer({
    userQuery: trace.request.userQuery,
    candidateAnswer: trace.response.finalAnswer,
    evidenceUnits: buildEvidenceUnits(trace.evidence.canonicalEvidenceItems),
  });
}

function validateLocalTraceFile(fileName: string) {
  const trace = JSON.parse(
    fs.readFileSync(`.local/traces/${fileName}`, "utf8"),
  ) as {
    request: {
      userQuery: string;
    };
    response: {
      finalAnswer: string;
    };
    evidence: {
      canonicalEvidenceItems: Parameters<typeof buildEvidenceUnits>[0];
    };
  };

  return validateCandidateAnswer({
    userQuery: trace.request.userQuery,
    candidateAnswer: trace.response.finalAnswer,
    evidenceUnits: buildEvidenceUnits(trace.evidence.canonicalEvidenceItems),
  });
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

function sourceKeyFromSource(source: { sourceDocument: string; sourcePage: string }) {
  return `${source.sourceDocument}::${source.sourcePage}`;
}

function representedSourceKeys(report: ReturnType<typeof validateCandidateAnswer>) {
  return new Set(report.representedSources.map(sourceKeyFromSource));
}

function likelyOmissionSourceKeys(report: ReturnType<typeof validateCandidateAnswer>) {
  return new Set(
    report.possibleDefects
      .filter((defect) => defect.type === "likely_source_omission" && defect.source)
      .map((defect) => sourceKeyFromSource(defect.source!)),
  );
}

function neutralNotRepresentedSourceKeys(
  report: ReturnType<typeof validateCandidateAnswer>,
) {
  return new Set(
    report.neutralObservations
      .filter(
        (observation) =>
          observation.type === "source_not_represented" && observation.source,
      )
      .map((observation) => sourceKeyFromSource(observation.source!)),
  );
}

function syntheticEvidenceUnit(args: {
  sourcePage: string;
  sourceText: string;
  section?: string | null;
}): EvidenceUnit {
  return {
    evidenceId: `synthetic-${args.sourcePage}`,
    kind: "prose-block",
    sourceDocument: "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf",
    sourcePage: args.sourcePage,
    requestedPages: "5-9",
    section: args.section ?? null,
    headingPath: args.section ? [args.section] : [],
    sourceText: args.sourceText,
    canonicalEvidenceId: `synthetic-canonical-${args.sourcePage}`,
    metadata: {},
  };
}

test("buildEvidenceUnits creates stable table-row and prose-block records from canonical evidence", () => {
  const units = buildOfflineEvidenceUnits();
  const repeatedUnits = buildOfflineEvidenceUnits();

  assert.deepEqual(
    units.map((unit) => unit.evidenceId),
    repeatedUnits.map((unit) => unit.evidenceId),
  );
  assert.deepEqual(
    units.map((unit) => unit.canonicalEvidenceId),
    repeatedUnits.map((unit) => unit.canonicalEvidenceId),
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

test("treats Stunt Coordinators and Performers as an exact supported summary role equivalent", () => {
  const report = validateCandidateAnswer({
    userQuery: "How much is overtime?",
    candidateAnswer:
      "For Stunt Coordinators and Performers, the summary states overtime is 1/7 daily per hour.",
    evidenceUnits: buildOfflineEvidenceUnits(),
  });

  assert.equal(
    report.possibleDefects.some(
      (defect) => defect.type === "possible_unsupported_role_label",
    ),
    false,
  );
});

test("recognizes summary and agreement sources through conservative value signatures", () => {
  const report = validateCandidateAnswer({
    userQuery: "How much is overtime?",
    candidateAnswer:
      "Clause F15.1 says overtime is 1/3 of daily Performance Salary, capped at £88 per hour. For Stunt Coordinators and Performers, the summary gives overtime as 1/7 daily per hour.",
    evidenceUnits: buildOfflineEvidenceUnits(),
  });
  const representedSourceKeys = new Set(report.representedSources.map(sourceKeyFromSource));

  assert.equal(
    representedSourceKeys.has("PACT_Cinema_Summary.pdf::1"),
    true,
  );
  assert.equal(
    representedSourceKeys.has(
      "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::20",
    ),
    true,
  );
  assert.equal(
    report.possibleDefects.some(
      (defect) => defect.type === "likely_source_omission",
    ),
    false,
  );
});

test("keeps neighbouring retrieved pages neutral unless directly relevant to the query", () => {
  const evidenceUnits = [
    syntheticEvidenceUnit({
      sourcePage: "5",
      section: "Declared Holidays",
      sourceText:
        "Declared Holidays include Christmas Day, Boxing Day, New Year's Day, Good Friday, Easter Sunday and Easter Monday.",
    }),
    syntheticEvidenceUnit({
      sourcePage: "8",
      section: "Holiday Entitlement",
      sourceText:
        "An Artist shall be entitled to paid holiday calculated at 28 days a year on a pro rata basis.",
    }),
    syntheticEvidenceUnit({
      sourcePage: "9",
      section: "Sunday Work",
      sourceText:
        "Where Sunday work is scheduled, local discussions may apply to the call time.",
    }),
  ];
  const report = validateCandidateAnswer({
    userQuery: "Is Easter Sunday a public holiday?",
    candidateAnswer:
      "Yes. Easter Sunday appears in the Declared Holidays list on page 5.",
    evidenceUnits,
  });
  const likelyOmissionKeys = report.possibleDefects
    .filter((defect) => defect.type === "likely_source_omission")
    .map((defect) => defect.source && sourceKeyFromSource(defect.source));
  const neutralKeys = report.neutralObservations
    .filter((observation) => observation.type === "source_not_represented")
    .map((observation) => observation.source && sourceKeyFromSource(observation.source));

  assert.deepEqual(likelyOmissionKeys, []);
  assert.ok(
    neutralKeys.includes(
      "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::8",
    ),
  );
  assert.ok(
    neutralKeys.includes(
      "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::9",
    ),
  );
});

test("flags time-and-a-half as possible derived explanation when evidence only says Daily plus 50 percent", () => {
  const evidenceUnits = [
    syntheticEvidenceUnit({
      sourcePage: "5",
      section: "Night Work",
      sourceText: "Night Work | Daily + 50% | Applies to qualifying night work.",
    }),
  ];
  const report = validateCandidateAnswer({
    userQuery: "What is the night rate in the contract?",
    candidateAnswer: "Night work is paid at time-and-a-half.",
    evidenceUnits,
  });

  assert.equal(
    report.possibleDefects.some(
      (defect) => defect.type === "possible_derived_explanation",
    ),
    true,
  );
  assert.equal(
    report.definiteDefects.some(
      (defect) => defect.type === "apparent_arithmetic_or_derived_value",
    ),
    false,
  );
});

test("does not treat generic night and rate language as a night-rate omission", () => {
  const report = validateCandidateAnswer({
    userQuery: "What is the night rate in the contract?",
    candidateAnswer:
      "Clause F15.6(i) says night work is paid as an additional sum equal to one half of negotiated daily Performance Salary.",
    evidenceUnits: [
      syntheticEvidenceUnit({
        sourcePage: "21",
        section: "Clause F15.6",
        sourceText:
          "Night work: Artists rendering services on night work shall be paid an additional sum equal to one half of the Artist's negotiated daily Performance Salary.",
      }),
      syntheticEvidenceUnit({
        sourcePage: "49",
        section: "Appendix FB",
        sourceText:
          "The Producer may schedule night scenes. Minimum rates are set out elsewhere and payments are administered under the contract.",
      }),
    ],
  });
  const likelyOmissions = likelyOmissionSourceKeys(report);
  const neutral = neutralNotRepresentedSourceKeys(report);
  const page49Key =
    "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::49";

  assert.equal(likelyOmissions.has(page49Key), false);
  assert.equal(neutral.has(page49Key), true);
});

test("represents captured night-rate summary and F15.6(i) while keeping incidental pages neutral", () => {
  const report = validateLocalTraceFile(
    "2026-06-12T22-06-23-692Z-eda71d4a-2ea5-420c-8530-d26e4aaec18b.json",
  );
  const represented = representedSourceKeys(report);
  const likelyOmissions = likelyOmissionSourceKeys(report);
  const neutral = neutralNotRepresentedSourceKeys(report);

  assert.deepEqual(report.definiteDefects, []);
  assert.equal(
    report.possibleDefects.some(
      (defect) => defect.type === "possible_unsupported_role_label",
    ),
    false,
  );
  assert.equal(represented.has("PACT_Cinema_Summary.pdf::1"), true);
  assert.equal(
    represented.has(
      "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::21",
    ),
    true,
  );
  assert.equal(
    represented.has(
      "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::20",
    ),
    false,
  );
  assert.equal(
    represented.has(
      "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::22",
    ),
    false,
  );
  assert.equal(
    likelyOmissions.has(
      "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::49",
    ),
    false,
  );
  for (const page of ["22", "45", "46", "47", "48"]) {
    const key =
      `Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::${page}`;

    assert.equal(likelyOmissions.has(key), false);
    assert.equal(neutral.has(key), true);
  }
});

test("keeps clean overtime answer role labels supported and sources represented", () => {
  const fixture = historicalOvertimeCandidateAnswers.find(
    (candidate) => candidate.fixtureId === "historical-overtime-good-both-provisions",
  );

  assert.ok(fixture);

  const report = validateCandidateAnswer({
    userQuery: fixture.userQuery,
    candidateAnswer: fixture.candidateAnswer.replace(
      "the overtime rate for Artists",
      "the overtime rate for general Artists",
    ),
    evidenceUnits: buildOfflineEvidenceUnits(),
  });
  const represented = representedSourceKeys(report);

  assert.deepEqual(report.definiteDefects, []);
  assert.equal(
    report.possibleDefects.some(
      (defect) => defect.type === "possible_unsupported_role_label",
    ),
    false,
  );
  assert.equal(
    report.definiteDefects.some(
      (defect) => defect.type === "unsupported_precedence_or_override",
    ),
    false,
  );
  assert.equal(represented.has("PACT_Cinema_Summary.pdf::1"), true);
  assert.equal(
    represented.has(
      "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::20",
    ),
    true,
  );
});

test("keeps captured overtime process narration defect without role warnings", () => {
  const report = validateLocalTrace(/how much is overtime/i);
  const represented = representedSourceKeys(report);

  assert.equal(defectTypes(report).includes("process_narration"), true);
  assert.equal(
    report.possibleDefects.some(
      (defect) => defect.type === "possible_unsupported_role_label",
    ),
    false,
  );
  assert.equal(represented.has("PACT_Cinema_Summary.pdf::1"), true);
  assert.equal(
    represented.has(
      "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::20",
    ),
    true,
  );
});

test("keeps captured Easter Sunday answer page-specific with neighbouring pages neutral", () => {
  const report = validateLocalTrace(/easter sunday/i);
  const represented = representedSourceKeys(report);
  const likelyOmissions = likelyOmissionSourceKeys(report);
  const neutral = neutralNotRepresentedSourceKeys(report);

  assert.equal(
    represented.has(
      "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::5",
    ),
    true,
  );
  for (const page of ["8", "9"]) {
    const key =
      `Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::${page}`;

    assert.equal(likelyOmissions.has(key), false);
    assert.equal(neutral.has(key), true);
  }
});

test("represents captured Resident Location definition only on page 9", () => {
  const report = validateLocalTrace(/resident location/i);
  const represented = representedSourceKeys(report);
  const likelyOmissions = likelyOmissionSourceKeys(report);
  const neutral = neutralNotRepresentedSourceKeys(report);

  assert.equal(
    represented.has(
      "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::9",
    ),
    true,
  );

  for (const key of [
    "PACT_Cinema_Summary.pdf::1",
    "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::5",
    "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::8",
    "Pact-Equity-Cinema-Films-Agreement-2021-effective-from-6th-April-2021.pdf::14",
  ]) {
    assert.equal(represented.has(key), false, `${key} should not be represented`);
    assert.equal(likelyOmissions.has(key), false, `${key} should not be likely omission`);
    assert.equal(neutral.has(key), true, `${key} should remain neutral`);
  }
});

test("retains unsupported precedence control for replacement wording", () => {
  const report = validateCandidateAnswer({
    userQuery: "How much is overtime?",
    candidateAnswer:
      "For Stunt Coordinators and Performers, overtime is 1/7 daily/hr rather than the general rate.",
    evidenceUnits: buildOfflineEvidenceUnits(),
  });

  assert.equal(
    defectTypes(report).includes("unsupported_precedence_or_override"),
    true,
  );
});

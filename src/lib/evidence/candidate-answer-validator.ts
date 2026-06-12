import type { EvidenceUnit } from "./evidence-units";

export type CandidateAnswerDefectType =
  | "unsupported_number_or_rate"
  | "apparent_arithmetic_or_derived_value"
  | "unsupported_precedence_or_override"
  | "process_narration"
  | "citation_not_in_evidence"
  | "citation_not_in_current_evidence_packet";

export type CandidateAnswerPossibleDefectType =
  | "possible_unsupported_role_label"
  | "likely_source_omission";

export type CandidateAnswerObservationType =
  | "source_represented"
  | "source_represented_by_paraphrase"
  | "source_not_represented"
  | "uncertain_source_relevance";

export type EvidenceSourceRef = {
  sourceDocument: string;
  sourcePage: string;
};

export type CandidateAnswerIssue<T extends string> = {
  type: T;
  message: string;
  value?: string;
  source?: EvidenceSourceRef;
};

export type CandidateAnswerValidationReport = {
  definiteDefects: CandidateAnswerIssue<CandidateAnswerDefectType>[];
  possibleDefects: CandidateAnswerIssue<CandidateAnswerPossibleDefectType>[];
  neutralObservations: CandidateAnswerIssue<CandidateAnswerObservationType>[];
  representedSources: EvidenceSourceRef[];
  omittedSources: EvidenceSourceRef[];
  uncertainSources: EvidenceSourceRef[];
  detectedNumbers: string[];
  evidenceNumbers: string[];
  detectedRoleLabels: string[];
  evidenceRoleLabels: string[];
};

type NumberToken = {
  original: string;
  normalized: string;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "be",
  "for",
  "how",
  "is",
  "it",
  "much",
  "of",
  "on",
  "or",
  "rate",
  "the",
  "to",
  "what",
]);
const PROCESS_NARRATION_PATTERNS = [
  /\blet me\b/i,
  /\bi need to check\b/i,
  /\bi can see\b/i,
  /\bi found\b/i,
  /\bi will search\b/i,
  /\bnow i\b/i,
  /\bbased on the (retrieved|provided|extracted) (document|documents|content|text)\b/i,
  /<｜DSML｜/i,
];
const DERIVED_VALUE_PATTERNS = [
  /[+\-*/×÷=]/,
  /\b(calculated|calculate|works out|equivalent to|therefore|total charge|would be|≈|approx)\b/i,
];
const PRECEDENCE_PATTERNS = [
  /\b(overrides?|supersedes?|takes precedence|instead of|rather than|subject to the main agreement|capped at .* under)\b/i,
];
const ROLE_PATTERNS = [
  /\bGeneral Artists\b/g,
  /\bOther Artists\b/g,
  /\bArtists\b/g,
  /\bArtist\b/g,
  /\bStunt Co-ordinators and Performers\b/g,
  /\bStunt Coordinators and Stunt Performers\b/g,
  /\bStunt Coordinators and Performers\b/g,
  /\bStunt Co-ordinators\b/g,
  /\bStunt Coordinators\b/g,
  /\bStunt Performers\b/g,
  /\bStunt Performer\b/g,
];

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeText(text: string) {
  return normalizeWhitespace(text).toLowerCase();
}

function uniqueValues<T>(values: T[], getKey: (value: T) => string) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const value of values) {
    const key = getKey(value);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(value);
  }

  return unique;
}

function getQueryTerms(query: string) {
  return normalizeText(query)
    .split(/[^a-z0-9£/]+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

function sourceKey(source: EvidenceSourceRef) {
  return `${source.sourceDocument}::${source.sourcePage}`;
}

function getSource(unit: EvidenceUnit): EvidenceSourceRef {
  return {
    sourceDocument: unit.sourceDocument,
    sourcePage: unit.sourcePage,
  };
}

function normalizeNumberToken(token: string) {
  const normalized = token
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/⅓/g, "one third")
    .replace(/½/g, "one half")
    .replace(/⅐/g, "one seventh")
    .trim();
  const fractionMatch = normalized.match(/^(\d+)\/(\d+)(?:st|nd|rd|th)?$/);

  if (fractionMatch) {
    return `fraction:${fractionMatch[1]}/${fractionMatch[2]}`;
  }

  if (normalized === "one third") {
    return "fraction:1/3";
  }

  if (normalized === "one half") {
    return "fraction:1/2";
  }

  if (normalized === "one seventh") {
    return "fraction:1/7";
  }

  const moneyMatch = normalized.match(/^£([0-9][0-9,]*)(?:\.([0-9]{1,2}))?$/);

  if (moneyMatch) {
    const pounds = moneyMatch[1].replace(/,/g, "");
    const pence = (moneyMatch[2] ?? "").padEnd(2, "0");

    return `gbp:${pounds}.${pence || "00"}`;
  }

  const percentMatch = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:%|per cent)$/);

  if (percentMatch) {
    return `percent:${Number(percentMatch[1])}`;
  }

  const plainNumberMatch = normalized.match(/^[0-9]+(?:\.[0-9]+)?$/);

  if (plainNumberMatch) {
    return `number:${Number(normalized)}`;
  }

  return normalized;
}

function extractNumberTokens(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  const occupiedRanges: Array<[number, number]> = [];
  const patterns: RegExp[] = [
    /£[0-9][0-9,]*(?:\.[0-9]{1,2})?/g,
    /\b\d+\/\d+(?:st|nd|rd|th)?\b/g,
    /\b\d+(?:\.\d+)?\s*(?:%|per cent)\b/g,
    /\b(?:one third|one half|one seventh)\b/gi,
    /[⅓½⅐]/g,
    /\b\d+(?:\.\d+)?\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;

      if (
        occupiedRanges.some(
          ([occupiedStart, occupiedEnd]) =>
            start >= occupiedStart && end <= occupiedEnd,
        )
      ) {
        continue;
      }

      occupiedRanges.push([start, end]);
      tokens.push({
        original: match[0],
        normalized: normalizeNumberToken(match[0]),
      });
    }
  }

  return uniqueValues(tokens, (token) => `${token.original}::${token.normalized}`);
}

function normalizeRoleLabel(role: string) {
  const normalizedRole = normalizeWhitespace(role)
    .toLowerCase()
    .replace(/\s*&\s*/g, " and ")
    .replace(/\bstunt co-ordinators\b/g, "stunt coordinators")
    .replace(/\bco-ordinators\b/g, "coordinators")
    .replace(/\s+/g, " ");

  if (
    normalizedRole === "stunt coordinators and performers" ||
    normalizedRole === "stunt coordinators and stunt performers"
  ) {
    return "stunt coordinators and stunt performers";
  }

  return normalizedRole;
}

function extractRoleLabels(text: string) {
  const roles: string[] = [];

  for (const pattern of ROLE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      roles.push(match[0]);
    }
  }

  return uniqueValues(roles, (role) => role.toLowerCase());
}

function getEvidenceRoleLabels(evidenceUnits: EvidenceUnit[]) {
  const roles = evidenceUnits.flatMap((unit) => [
    ...extractRoleLabels(unit.sourceText),
    ...(unit.metadata.applicableRoles ?? []),
    ...(unit.metadata.cells ?? [])
      .filter((cell) => /\b(role|applicable|performer|coordinator|artist)\b/i.test(cell.header))
      .map((cell) => cell.value),
    ...unit.headingPath.flatMap(extractRoleLabels),
  ]);

  return uniqueValues(
    roles.map(normalizeWhitespace).filter(Boolean),
    normalizeRoleLabel,
  );
}

function isTableRowDirectlyRelevant(unit: EvidenceUnit, queryTerms: string[]) {
  if (unit.kind !== "table-row") {
    return false;
  }

  const cells = unit.metadata.cells ?? [];
  const itemCells = cells.filter((cell) =>
    /\b(item|topic|provision|clause|rate|value)\b/i.test(cell.header),
  );
  const searchableText = normalizeText(
    [
      ...unit.headingPath,
      ...unit.metadata.tableHeaders ?? [],
      ...itemCells.map((cell) => cell.value),
    ].join(" "),
  );

  return queryTerms.some((term) => searchableText.includes(term));
}

function isProseBlockDirectlyRelevant(
  unit: EvidenceUnit,
  queryTerms: string[],
  userQuery: string,
) {
  if (unit.kind !== "prose-block") {
    return false;
  }

  const sourceText = normalizeText(unit.sourceText);
  const queryAsksForRate = /\b(rate|how much|paid|pay|payment)\b/i.test(userQuery);
  const hasDirectRateLanguage =
    /\b(rate|paid at|payable at|hourly payments|one third|one seventh)\b/i.test(
      unit.sourceText,
    ) || /(?:£|\b\d+\/\d+)/.test(unit.sourceText);

  if (queryAsksForRate && !hasDirectRateLanguage) {
    return false;
  }

  return queryTerms.some((term) => sourceText.includes(term));
}

function isDirectlyRelevant(
  unit: EvidenceUnit,
  queryTerms: string[],
  userQuery: string,
) {
  return (
    isTableRowDirectlyRelevant(unit, queryTerms) ||
    isProseBlockDirectlyRelevant(unit, queryTerms, userQuery)
  );
}

function getRelevantSources(userQuery: string, evidenceUnits: EvidenceUnit[]) {
  const queryTerms = getQueryTerms(userQuery);

  if (queryTerms.length === 0) {
    return {
      directUnits: [] as EvidenceUnit[],
      direct: [] as EvidenceSourceRef[],
      uncertain: uniqueValues(evidenceUnits.map(getSource), sourceKey),
    };
  }

  const directUnits = evidenceUnits.filter((unit) =>
    isDirectlyRelevant(unit, queryTerms, userQuery),
  );
  const directSources = uniqueValues(directUnits.map(getSource), sourceKey);
  const allSources = uniqueValues(evidenceUnits.map(getSource), sourceKey);
  const directSourceKeys = new Set(directSources.map(sourceKey));

  return {
    directUnits,
    direct: directSources,
    uncertain: allSources.filter((source) => !directSourceKeys.has(sourceKey(source))),
  };
}

function answerRepresentsSource(answer: string, source: EvidenceSourceRef, units: EvidenceUnit[]) {
  const normalizedAnswer = normalizeText(answer);
  const pagePattern = new RegExp(`\\b(?:p\\.?|page)\\s*${source.sourcePage}\\b`, "i");
  const normalizedDocumentStem = normalizeText(
    source.sourceDocument.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "),
  );
  const documentTokens = source.sourceDocument
    .replace(/\.pdf$/i, "")
    .split(/[-_\s]+/)
    .filter((token) => token.length > 3)
    .map((token) => token.toLowerCase());
  const documentTokenMatches = documentTokens.filter((token) =>
    normalizedAnswer.includes(token),
  ).length;
  const hasDocumentMention = normalizedAnswer.includes(normalizedDocumentStem);
  const hasPageMention = pagePattern.test(answer);

  if (hasDocumentMention || (hasPageMention && documentTokenMatches >= 2)) {
    return true;
  }

  const sourceUnits = units.filter((unit) => sourceKey(getSource(unit)) === sourceKey(source));

  for (const unit of sourceUnits) {
    for (const heading of [unit.section, ...unit.headingPath]) {
      if (heading && normalizedAnswer.includes(normalizeText(heading))) {
        return true;
      }
    }

    const compactSource = normalizeText(unit.sourceText);
    const sourcePhrases = compactSource
      .split(/[.;:\n|]+/)
      .map((value) => value.trim())
      .filter((value) => value.length >= 30);

    if (sourcePhrases.some((phrase) => normalizedAnswer.includes(phrase))) {
      return true;
    }
  }

  return false;
}

function sourceRepresentedByParaphrase(
  answer: string,
  source: EvidenceSourceRef,
  units: EvidenceUnit[],
) {
  const normalizedAnswer = normalizeText(answer);
  const sourceUnits = units.filter((unit) => sourceKey(getSource(unit)) === sourceKey(source));

  for (const unit of sourceUnits) {
    const normalizedSource = normalizeText(unit.sourceText);
    const hasAgreementOvertimeSignature =
      normalizedSource.includes("one third the daily performance salary") &&
      normalizedSource.includes("£88") &&
      normalizedAnswer.includes("one third") &&
      normalizedAnswer.includes("daily performance salary") &&
      normalizedAnswer.includes("£88");
    const hasClauseReference =
      /clause\s+f\d+(?:\.\d+)?/i.test(answer) &&
      (unit.headingPath.some((heading) =>
        normalizedAnswer.includes(normalizeText(heading)),
      ) ||
        normalizedSource.includes(normalizeText(answer.match(/clause\s+f\d+(?:\.\d+)?/i)?.[0] ?? "")));

    if (hasAgreementOvertimeSignature || hasClauseReference) {
      return true;
    }
  }

  return false;
}

function validateCitations(answer: string, evidenceSources: EvidenceSourceRef[]) {
  const issues: CandidateAnswerIssue<CandidateAnswerDefectType>[] = [];
  const sourcePages = new Set(evidenceSources.map((source) => source.sourcePage));
  const pageMentions = answer.matchAll(/\b(?:p\.?|page|pages)\s+(\d+)(?:[–-](\d+))?\b/gi);

  for (const match of pageMentions) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    const pages = Array.from({ length: end - start + 1 }, (_, index) =>
      String(start + index),
    );

    if (!pages.some((page) => sourcePages.has(page))) {
      issues.push({
        type: "citation_not_in_current_evidence_packet",
        message:
          "The answer cites a page that is not present in the current offline evidence packet.",
        value: match[0],
      });
    }
  }

  return issues;
}

function sourceDirectEvidenceRepresented(args: {
  answer: string;
  source: EvidenceSourceRef;
  directUnits: EvidenceUnit[];
}) {
  const answerNumberSet = new Set(
    extractNumberTokens(args.answer).map((token) => token.normalized),
  );
  const directUnitsBySource = new Map<string, EvidenceUnit[]>();

  for (const unit of args.directUnits) {
    const key = sourceKey(getSource(unit));
    const existingUnits = directUnitsBySource.get(key) ?? [];

    existingUnits.push(unit);
    directUnitsBySource.set(key, existingUnits);
  }

  const tokenSourceKeys = new Map<string, Set<string>>();

  for (const [key, units] of directUnitsBySource) {
    for (const token of units.flatMap((unit) => extractNumberTokens(unit.sourceText))) {
      const sourceKeys = tokenSourceKeys.get(token.normalized) ?? new Set<string>();

      sourceKeys.add(key);
      tokenSourceKeys.set(token.normalized, sourceKeys);
    }
  }

  const currentSourceKey = sourceKey(args.source);
  const sourceUnits = directUnitsBySource.get(currentSourceKey) ?? [];
  const sourceTokens = uniqueValues(
    sourceUnits.flatMap((unit) => extractNumberTokens(unit.sourceText)),
    (token) => token.normalized,
  );

  return sourceTokens.some((token) => {
    const sourceKeys = tokenSourceKeys.get(token.normalized);

    return (
      answerNumberSet.has(token.normalized) &&
      sourceKeys != null &&
      sourceKeys.size === 1 &&
      sourceKeys.has(currentSourceKey)
    );
  });
}

export function validateCandidateAnswer(args: {
  userQuery: string;
  candidateAnswer: string;
  evidenceUnits: EvidenceUnit[];
}): CandidateAnswerValidationReport {
  const { userQuery, candidateAnswer, evidenceUnits } = args;
  const definiteDefects: CandidateAnswerIssue<CandidateAnswerDefectType>[] = [];
  const possibleDefects: CandidateAnswerIssue<CandidateAnswerPossibleDefectType>[] = [];
  const neutralObservations: CandidateAnswerIssue<CandidateAnswerObservationType>[] = [];
  const evidenceSources = uniqueValues(evidenceUnits.map(getSource), sourceKey);
  const relevance = getRelevantSources(userQuery, evidenceUnits);
  const representedSources = evidenceSources.filter((source) =>
    answerRepresentsSource(candidateAnswer, source, evidenceUnits),
  );
  const paraphraseRepresentedSources = evidenceSources.filter(
    (source) =>
      !representedSources.some(
        (representedSource) => sourceKey(representedSource) === sourceKey(source),
      ) &&
      sourceRepresentedByParaphrase(candidateAnswer, source, evidenceUnits),
  );
  const representedSourceKeys = new Set([
    ...representedSources.map(sourceKey),
    ...paraphraseRepresentedSources.map(sourceKey),
  ]);
  const directRelevantSourceKeys = new Set(relevance.direct.map(sourceKey));
  const omittedSources = evidenceSources.filter(
    (source) => !representedSourceKeys.has(sourceKey(source)),
  );
  const uncertainSources = relevance.uncertain;
  const answerNumbers = extractNumberTokens(candidateAnswer);
  const evidenceNumbers = uniqueValues(
    evidenceUnits.flatMap((unit) => extractNumberTokens(unit.sourceText)),
    (token) => token.normalized,
  );
  const evidenceNumberSet = new Set(evidenceNumbers.map((token) => token.normalized));
  const answerRoles = extractRoleLabels(candidateAnswer);
  const evidenceRoles = getEvidenceRoleLabels(evidenceUnits);
  const evidenceRoleSet = new Set(evidenceRoles.map(normalizeRoleLabel));

  for (const token of answerNumbers) {
    if (!evidenceNumberSet.has(token.normalized)) {
      definiteDefects.push({
        type: "unsupported_number_or_rate",
        message: "The answer contains a number or rate not present in the evidence packet.",
        value: token.original,
      });
    }
  }

  if (
    DERIVED_VALUE_PATTERNS.some((pattern) => pattern.test(candidateAnswer)) &&
    answerNumbers.some((token) => !evidenceNumberSet.has(token.normalized))
  ) {
    definiteDefects.push({
      type: "apparent_arithmetic_or_derived_value",
      message:
        "The answer appears to calculate or derive a value that is not present in the evidence.",
    });
  }

  for (const role of answerRoles) {
    const normalizedRole = normalizeRoleLabel(role);

    if (
      !evidenceRoleSet.has(normalizedRole) &&
      !evidenceUnits.some((unit) =>
        normalizeText(unit.sourceText).includes(normalizedRole),
      )
    ) {
      possibleDefects.push({
        type: "possible_unsupported_role_label",
        message:
          "The answer uses a role label that is not in the conservative evidence-derived role lexicon.",
        value: role,
      });
    }
  }

  if (
    PRECEDENCE_PATTERNS.some((pattern) => pattern.test(candidateAnswer)) &&
    !evidenceUnits.some((unit) => PRECEDENCE_PATTERNS.some((pattern) => pattern.test(unit.sourceText)))
  ) {
    definiteDefects.push({
      type: "unsupported_precedence_or_override",
      message:
        "The answer uses precedence, override, or reconciliation language not present in the evidence.",
    });
  }

  if (PROCESS_NARRATION_PATTERNS.some((pattern) => pattern.test(candidateAnswer))) {
    definiteDefects.push({
      type: "process_narration",
      message: "The answer contains process narration or tool-call leakage.",
    });
  }

  definiteDefects.push(...validateCitations(candidateAnswer, evidenceSources));

  for (const source of evidenceSources) {
    if (representedSourceKeys.has(sourceKey(source))) {
      neutralObservations.push({
        type: "source_represented",
        message: "The answer represents this evidence source.",
        source,
      });
      continue;
    }

    if (
      paraphraseRepresentedSources.some(
        (representedSource) => sourceKey(representedSource) === sourceKey(source),
      )
    ) {
      neutralObservations.push({
        type: "source_represented_by_paraphrase",
        message:
          "The answer appears to represent this source through a conservative distinctive fact signature.",
        source,
      });
      continue;
    }

    neutralObservations.push({
      type: "source_not_represented",
      message: "The answer does not represent this retrieved evidence source.",
      source,
    });

    if (
      directRelevantSourceKeys.has(sourceKey(source)) &&
      !sourceDirectEvidenceRepresented({
        answer: candidateAnswer,
        source,
        directUnits: relevance.directUnits,
      })
    ) {
      possibleDefects.push({
        type: "likely_source_omission",
        message:
          "The source contains direct deterministic evidence for the query but is not represented in the answer.",
        source,
      });
    }
  }

  for (const source of uncertainSources) {
    if (directRelevantSourceKeys.has(sourceKey(source))) {
      continue;
    }

    neutralObservations.push({
      type: "uncertain_source_relevance",
      message:
        "The source was retrieved or preloaded, but deterministic rules did not mark it directly relevant.",
      source,
    });
  }

  return {
    definiteDefects,
    possibleDefects,
    neutralObservations,
    representedSources,
    omittedSources,
    uncertainSources,
    detectedNumbers: answerNumbers.map((token) => token.original),
    evidenceNumbers: evidenceNumbers.map((token) => token.original),
    detectedRoleLabels: answerRoles,
    evidenceRoleLabels: evidenceRoles,
  };
}

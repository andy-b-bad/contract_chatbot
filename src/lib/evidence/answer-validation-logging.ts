import type { CanonicalEvidenceItem } from "./canonical-evidence";
import {
  validateCandidateAnswer,
  type CandidateAnswerIssue,
  type CandidateAnswerValidationReport,
  type EvidenceSourceRef,
} from "./candidate-answer-validator";
import { buildEvidenceUnits, type EvidenceUnit } from "./evidence-units";

export type AnswerValidationSkipReason =
  | "disabled"
  | "empty_answer"
  | "empty_evidence";

export type CompactAnswerValidationIssue = {
  type: string;
  value?: string;
  source?: EvidenceSourceRef;
};

export type CompactAnswerValidationReport = {
  status: "validated";
  definiteDefects: CompactAnswerValidationIssue[];
  possibleDefects: CompactAnswerValidationIssue[];
  representedSources: EvidenceSourceRef[];
  omittedSources: EvidenceSourceRef[];
};

export type AnswerValidationLogResult =
  | CompactAnswerValidationReport
  | {
      status: "skipped";
      reason: AnswerValidationSkipReason;
    };

type AnswerValidationLogArgs = {
  enabled?: boolean;
  userQuery: string;
  candidateAnswer: string;
  canonicalEvidenceItems: CanonicalEvidenceItem[];
};

type AnswerValidationDependencies = {
  buildUnits?: (items: CanonicalEvidenceItem[]) => EvidenceUnit[];
  validate?: typeof validateCandidateAnswer;
};

export function isAnswerValidationLoggingEnabled(
  env?: { ENABLE_ANSWER_VALIDATION_LOGGING?: string },
) {
  return (
    (env?.ENABLE_ANSWER_VALIDATION_LOGGING ??
      process.env.ENABLE_ANSWER_VALIDATION_LOGGING) === "true"
  );
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function compactIssues<T extends string>(
  issues: CandidateAnswerIssue<T>[],
): CompactAnswerValidationIssue[] {
  return issues.map(({ type, value, source }) => ({
    type,
    ...(value ? { value } : {}),
    ...(source ? { source } : {}),
  }));
}

function compactReport(
  report: CandidateAnswerValidationReport,
): CompactAnswerValidationReport {
  const representedSources = report.neutralObservations
    .filter(
      (observation) =>
        (observation.type === "source_represented" ||
          observation.type === "source_represented_by_paraphrase") &&
        observation.source != null,
    )
    .map((observation) => observation.source!);

  return {
    status: "validated",
    definiteDefects: compactIssues(report.definiteDefects),
    possibleDefects: compactIssues(report.possibleDefects),
    representedSources,
    omittedSources: report.omittedSources,
  };
}

export function getAnswerValidationLogResult(
  args: AnswerValidationLogArgs,
  dependencies: AnswerValidationDependencies = {},
): AnswerValidationLogResult {
  const enabled =
    args.enabled ?? isAnswerValidationLoggingEnabled();

  if (!enabled) {
    return {
      status: "skipped",
      reason: "disabled",
    };
  }

  if (normalizeWhitespace(args.candidateAnswer).length === 0) {
    return {
      status: "skipped",
      reason: "empty_answer",
    };
  }

  if (args.canonicalEvidenceItems.length === 0) {
    return {
      status: "skipped",
      reason: "empty_evidence",
    };
  }

  const buildUnits = dependencies.buildUnits ?? buildEvidenceUnits;
  const validate = dependencies.validate ?? validateCandidateAnswer;
  const evidenceUnits = buildUnits(args.canonicalEvidenceItems);
  const report = validate({
    userQuery: args.userQuery,
    candidateAnswer: args.candidateAnswer,
    evidenceUnits,
  });

  return compactReport(report);
}

export function logAnswerValidationResult(args: {
  result: AnswerValidationLogResult;
  log?: (message: string) => void;
}) {
  if (args.result.status !== "validated") {
    return;
  }

  const log = args.log ?? console.log;

  log(`[chat] answer-validation ${JSON.stringify(args.result)}`);
}

export function safelyLogAnswerValidation(
  args: AnswerValidationLogArgs,
  dependencies: AnswerValidationDependencies & {
    log?: (message: string) => void;
    logError?: (message: string, error: unknown) => void;
  } = {},
) {
  try {
    logAnswerValidationResult({
      result: getAnswerValidationLogResult(args, dependencies),
      log: dependencies.log,
    });
  } catch (error) {
    const logError = dependencies.logError ?? console.error;

    logError("[chat] answer-validation:error", error);
  }
}

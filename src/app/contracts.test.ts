import assert from "node:assert/strict";
import test from "node:test";
import {
  getExactScopeDocumentPolicy,
  isDocumentAllowedForScope,
  isPrimaryAgreementPageSelectionAllowed,
  isSharedSummaryPageSelectionAllowed,
} from "./contracts";

const PACT_TV_AGREEMENT =
  "pact-equity-tv-agreement-jan-2026-update.pdf";
const SHARED_SUMMARY = "Latest_rates_and_definitions_summary.pdf";

test("Pact TV uses the exact configured PageIndex documents", () => {
  const policy = getExactScopeDocumentPolicy("pact-tv-svod");

  assert.deepEqual(policy, {
    primaryAgreement: {
      id: "pi-cmnkrm3lp0f4n01qpfp3hksoe",
      name: PACT_TV_AGREEMENT,
      pages: "1-88",
    },
    sharedSummary: {
      id: "pi-cmnqadm3q033x01pgy2wmqioe",
      name: SHARED_SUMMARY,
      pages: "6-8",
    },
  });
});

test("Pact TV rejects every document outside the exact allow-list", () => {
  assert.equal(
    isDocumentAllowedForScope(PACT_TV_AGREEMENT, "pact-tv-svod"),
    true,
  );
  assert.equal(
    isDocumentAllowedForScope(SHARED_SUMMARY, "pact-tv-svod"),
    true,
  );
  assert.equal(
    isDocumentAllowedForScope("PACT_Cinema_Summary.pdf", "pact-tv-svod"),
    false,
  );
  assert.equal(
    isDocumentAllowedForScope("another-pact-tv-document.pdf", "pact-tv-svod"),
    false,
  );
});

test("Pact TV agreement access is bounded to pages 1 through 88", () => {
  assert.equal(
    isPrimaryAgreementPageSelectionAllowed("1,74-82,88", "pact-tv-svod"),
    true,
  );
  assert.equal(
    isPrimaryAgreementPageSelectionAllowed("0", "pact-tv-svod"),
    false,
  );
  assert.equal(
    isPrimaryAgreementPageSelectionAllowed("89", "pact-tv-svod"),
    false,
  );
  assert.equal(
    isPrimaryAgreementPageSelectionAllowed("1-89", "pact-tv-svod"),
    false,
  );
});

test("Pact TV summary access is bounded to pages 6 through 8", () => {
  assert.equal(
    isSharedSummaryPageSelectionAllowed("6-8", "pact-tv-svod"),
    true,
  );
  assert.equal(
    isSharedSummaryPageSelectionAllowed("6,8", "pact-tv-svod"),
    true,
  );
  assert.equal(
    isSharedSummaryPageSelectionAllowed("5-8", "pact-tv-svod"),
    false,
  );
  assert.equal(
    isSharedSummaryPageSelectionAllowed("9", "pact-tv-svod"),
    false,
  );
});

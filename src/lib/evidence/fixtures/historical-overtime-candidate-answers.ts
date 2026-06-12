import type {
  CandidateAnswerDefectType,
  CandidateAnswerPossibleDefectType,
} from "../candidate-answer-validator";

export type HistoricalCandidateAnswerFixture = {
  fixtureId: string;
  category:
    | "agreement-only"
    | "summary-only"
    | "calculated-derived"
    | "good-both-provisions"
    | "process-narration";
  provenance: {
    source: "supabase.chat_messages";
    chatMessageId: string;
    threadId: string;
    createdAt: string;
  };
  userQuery: string;
  candidateAnswer: string;
  expectedDefiniteDefects: CandidateAnswerDefectType[];
  expectedPossibleDefects: CandidateAnswerPossibleDefectType[];
};

export const historicalOvertimeCandidateAnswers = [
  {
    fixtureId: "historical-overtime-agreement-only",
    category: "agreement-only",
    provenance: {
      source: "supabase.chat_messages",
      chatMessageId: "99188329-93f4-438f-8d09-a675724ca802",
      threadId: "3ee81802-713f-4d61-bfb3-52832d99375b",
      createdAt: "2026-04-22T12:25:18.895539+00:00",
    },
    userQuery: "How much is overtime?",
    candidateAnswer:
      "Overtime is payable at one third of the daily Performance Salary per hour, subject to a maximum of £88 per hour or part thereof. These payments are not included in the Artist's Total Applicable Salary. Overtime is limited to four hours per day, with any additional overtime subject to local discussion.",
    expectedDefiniteDefects: [],
    expectedPossibleDefects: ["likely_source_omission"],
  },
  {
    fixtureId: "historical-overtime-summary-only",
    category: "summary-only",
    provenance: {
      source: "supabase.chat_messages",
      chatMessageId: "1780f483-71a5-4ac3-bbaa-452dea92c500",
      threadId: "3ee81802-713f-4d61-bfb3-52832d99375b",
      createdAt: "2026-06-12T08:47:07.936012+00:00",
    },
    userQuery: "How much is overtime?",
    candidateAnswer:
      "Based on the PACT Cinema Summary document, the overtime rate is:\n\n**Overtime:** 1/7 of daily rate per hour, with a 15-minute grace on the first hour only (a performer may complete a take without OT payment).",
    expectedDefiniteDefects: [],
    expectedPossibleDefects: ["likely_source_omission"],
  },
  {
    fixtureId: "historical-overtime-calculated-derived",
    category: "calculated-derived",
    provenance: {
      source: "supabase.chat_messages",
      chatMessageId: "857592fb-ad48-403d-aeaf-54219b9410af",
      threadId: "3ee81802-713f-4d61-bfb3-52832d99375b",
      createdAt: "2026-06-12T08:46:05.185017+00:00",
    },
    userQuery: "How much is overtime?",
    candidateAnswer:
      "For **Stunt Coordinators and Stunt Performers** under the Pact Cinema agreement, overtime is payable as follows:\n\n**Clause F15.1 (General – all Artists)** — Overtime is paid at **1/3 of the daily Performance Salary per hour**, subject to a maximum of **£88 per hour or part thereof**.\n\n**Summary Table (Stunt-specific, effective 6 April 2026)**  \n\nFrom the summary document:\n\n| Item | Rate | Notes |\n| --- | --- | --- |\n| Overtime | **1/7 daily/hr** | 15-minute grace on first hour only — may complete a take without OT payment |\n\nThis means:\n- For **Stunt Coordinators** (daily rate £899): overtime = £899 ÷ 7 ≈ **£128.43/hr**, but capped at **£88/hr** under the main Agreement.\n- For **Stunt Performers** (daily rate £708): overtime = £708 ÷ 7 ≈ **£101.14/hr**, but capped at **£88/hr** under the main Agreement.\n\n**Additional limits (Clause F15.2):** Overtime is limited to **four hours per day**; any additional overtime is subject to local discussion.\n\n**15-minute grace (Clause F15.3):** Artists shall work up to 15 minutes overtime without payment to complete a \"take\". If overtime extends beyond that, the 15 minutes is included for payment.",
    expectedDefiniteDefects: [
      "unsupported_number_or_rate",
      "apparent_arithmetic_or_derived_value",
      "unsupported_precedence_or_override",
    ],
    expectedPossibleDefects: [],
  },
  {
    fixtureId: "historical-overtime-good-both-provisions",
    category: "good-both-provisions",
    provenance: {
      source: "supabase.chat_messages",
      chatMessageId: "8172e863-dd6c-4b06-92cd-66c9b0f48504",
      threadId: "3ee81802-713f-4d61-bfb3-52832d99375b",
      createdAt: "2026-06-11T21:45:28.353722+00:00",
    },
    userQuery: "How much is overtime?",
    candidateAnswer:
      "From the Pact-Equity Cinema Films Agreement 2021 (Clause F15.1), the overtime rate for Artists is:\n\n**1/3 of the daily Performance Salary per hour** (or part thereof), subject to a maximum of **£88 per hour**. These overtime payments are not included in the Artist's Total Applicable Salary.\n\nAdditionally (Clause F15.3), Artists shall work **15 minutes overtime without payment** to complete a \"take\" at the end of the working day or night; if overtime extends beyond that 15 minutes, the period is included for payment.\n\nFor **Stunt Coordinators and Performers** specifically, the PACT Cinema Summary (Ref: FB.v) notes overtime at **1/7 daily per hour**, with a 15-minute grace on the first hour only (may complete a take without OT payment).",
    expectedDefiniteDefects: [],
    expectedPossibleDefects: [],
  },
  {
    fixtureId: "historical-overtime-process-narration",
    category: "process-narration",
    provenance: {
      source: "supabase.chat_messages",
      chatMessageId: "0fb5eae9-3244-418c-8cc6-bac3e9b0f265",
      threadId: "3ee81802-713f-4d61-bfb3-52832d99375b",
      createdAt: "2026-04-20T18:51:10.127079+00:00",
    },
    userQuery: "How much is overtime?",
    candidateAnswer:
      "I can see there are two relevant documents. Let me first check the shared summary document (pages 3-5 only as per the scope) and then the Pact Cinema agreement.Now let me check the Pact Cinema agreement document for more detailed information about overtime:Let me search for more specific overtime information in the Pact Cinema agreement:Let me get the structure of the Pact Cinema agreement to find the relevant section:",
    expectedDefiniteDefects: [
      "process_narration",
      "citation_not_in_current_evidence_packet",
    ],
    expectedPossibleDefects: ["likely_source_omission"],
  },
] as const satisfies readonly HistoricalCandidateAnswerFixture[];

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { POST } from "@/app/api/local-traces/route";
import {
  parseRawLocalAnswerTracePayload,
  writeRawLocalAnswerTrace,
} from "./local-trace-file-writer";
import type { RawLocalAnswerTracePayload } from "./local-answer-trace";

function payload(): RawLocalAnswerTracePayload {
  return {
    request: {
      selectedScope: "pact-cinema",
      userQuery: "How much is overtime?",
    },
    response: {
      finalAnswer: "Overtime is 1/7 daily/hr.",
    },
    evidence: {
      canonicalEvidenceItems: [
        {
          scope: "pact-cinema",
          toolName: "get_page_content",
          documentName: "PACT_Cinema_Summary.pdf",
          pageRef: "1",
          pageNumber: 1,
          requestedPages: "1",
          rawText: "Overtime | 1/7 daily/hr",
        },
      ],
    },
    validation: {
      status: "validated",
      definiteDefects: [],
      possibleDefects: [],
      representedSources: [],
      omittedSources: [],
    },
    usage: {
      provider: "deepseek.chat",
      model: "deepseek-chat",
      providerResponseId: "resp_123",
      inputTokens: 1200,
      inputNoCacheTokens: 1000,
      inputCacheReadTokens: 200,
      inputCacheWriteTokens: 50,
      outputTokens: 300,
      outputTextTokens: 260,
      outputReasoningTokens: 40,
      totalTokens: 1500,
    },
    observedCost: {
      currency: "USD",
      amount: "0.000614",
      pricingVersion: "deepseek_v1",
      calculatedAt: "2026-06-12T11:59:00.000Z",
      pricedTokenClasses: [
        "input_cache_read",
        "input_no_cache",
        "output_total",
      ],
      notSeparatelyPricedTokenClasses: [
        "input_cache_write",
        "output_text",
        "output_reasoning",
      ],
    },
    retrieval: {
      retrievedSources: [
        {
          documentName: "PACT_Cinema_Summary.pdf",
          pages: ["1"],
        },
      ],
      toolCalls: [
        {
          toolName: "get_page_content",
          input: {
            doc_name: "PACT_Cinema_Summary.pdf",
            pages: "1",
          },
        },
      ],
    },
  };
}

test("parseRawLocalAnswerTracePayload rejects server-owned fields and invalid schema", () => {
  assert.throws(() =>
    parseRawLocalAnswerTracePayload({
      ...payload(),
      capturedAt: "2026-06-12T12:00:00.000Z",
    }),
  );
  assert.throws(() =>
    parseRawLocalAnswerTracePayload({
      ...payload(),
      usage: {
        inputTokens: "1200",
      },
    }),
  );
});

test("parseRawLocalAnswerTracePayload rejects arbitrary nested retrieval fields", () => {
  assert.throws(() =>
    parseRawLocalAnswerTracePayload({
      ...payload(),
      retrieval: {
        ...payload().retrieval,
        headers: {
          cookie: "secret",
        },
      },
    }),
  );
  assert.throws(() =>
    parseRawLocalAnswerTracePayload({
      ...payload(),
      retrieval: {
        retrievedSources: [
          {
            documentName: "PACT_Cinema_Summary.pdf",
            pages: ["1"],
            extra: "not allowed",
          },
        ],
      },
    }),
  );
});

test("parseRawLocalAnswerTracePayload removes sensitive nested tool input keys server-side", () => {
  const parsed = parseRawLocalAnswerTracePayload({
    ...payload(),
    retrieval: {
      toolCalls: [
        {
          toolName: "get_page_content",
          input: {
            doc_name: "PACT_Cinema_Summary.pdf",
            pages: "1",
            Authorization: "Bearer secret",
            nested: {
              user_id: "user-123",
              contact: "person@example.com",
              allowed: "kept",
            },
          },
        },
      ],
    },
  });

  assert.deepEqual(parsed.retrieval?.toolCalls?.[0].input, {
    doc_name: "PACT_Cinema_Summary.pdf",
    pages: "1",
    nested: {
      contact: "[redacted-email]",
      allowed: "kept",
    },
  });
});

test("writeRawLocalAnswerTrace generates server timestamp and contained non-overwriting path", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "answer-traces-"));

  try {
    const result = await writeRawLocalAnswerTrace({
      cwd: process.cwd(),
      traceRoot: tempDir,
      payload: payload(),
      now: new Date("2026-06-12T12:00:00.000Z"),
      randomId: "trace-test",
    });
    const parsed = JSON.parse(await readFile(result.filePath, "utf8"));

    assert.equal(result.filePath.startsWith(`${tempDir}${path.sep}`), true);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.capturedAt, "2026-06-12T12:00:00.000Z");
    assert.equal(
      parsed.observedCost.calculatedAt,
      "2026-06-12T12:00:00.000Z",
    );
    assert.equal(typeof parsed.git.branch === "string" || parsed.git.branch === null, true);
    await assert.rejects(
      writeRawLocalAnswerTrace({
        cwd: process.cwd(),
        traceRoot: tempDir,
        payload: payload(),
        now: new Date("2026-06-12T12:00:00.000Z"),
        randomId: "trace-test",
      }),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("local trace endpoint enforces gates, size, and schema controls", async () => {
  const previousEnabled = process.env.ENABLE_LOCAL_TRACE_CAPTURE;
  const previousAllowed = process.env.LOCAL_TRACE_CAPTURE_ALLOWED;
  const previousConsoleError = console.error;

  try {
    console.error = () => {};
    delete process.env.ENABLE_LOCAL_TRACE_CAPTURE;
    delete process.env.LOCAL_TRACE_CAPTURE_ALLOWED;

    assert.equal(
      (
        await POST(
          new Request("http://localhost/api/local-traces", {
            method: "POST",
            body: JSON.stringify(payload()),
          }),
        )
      ).status,
      403,
    );

    process.env.ENABLE_LOCAL_TRACE_CAPTURE = "true";
    process.env.LOCAL_TRACE_CAPTURE_ALLOWED = "true";

    assert.equal(
      (
        await POST(
          new Request("http://localhost/api/local-traces", {
            method: "POST",
            headers: {
              "content-length": "1000001",
            },
            body: "{}",
          }),
        )
      ).status,
      413,
    );
    assert.equal(
      (
        await POST(
          new Request("http://localhost/api/local-traces", {
            method: "POST",
            body: JSON.stringify({
              ...payload(),
              git: {
                branch: "bad",
                commit: "bad",
              },
            }),
          }),
        )
      ).status,
      400,
    );
  } finally {
    console.error = previousConsoleError;

    if (previousEnabled == null) {
      delete process.env.ENABLE_LOCAL_TRACE_CAPTURE;
    } else {
      process.env.ENABLE_LOCAL_TRACE_CAPTURE = previousEnabled;
    }

    if (previousAllowed == null) {
      delete process.env.LOCAL_TRACE_CAPTURE_ALLOWED;
    } else {
      process.env.LOCAL_TRACE_CAPTURE_ALLOWED = previousAllowed;
    }
  }
});

import {
  parseRawLocalAnswerTracePayload,
  writeRawLocalAnswerTrace,
} from "@/lib/evidence/local-trace-file-writer";
import { isLocalTraceCaptureEnabled } from "@/lib/evidence/local-answer-trace";

export const runtime = "nodejs";

const MAX_TRACE_BODY_BYTES = 1_000_000;

function getContentLength(request: Request) {
  const header = request.headers.get("content-length");

  if (!header) {
    return null;
  }

  const value = Number(header);

  return Number.isFinite(value) ? value : null;
}

export async function POST(request: Request) {
  if (!isLocalTraceCaptureEnabled()) {
    return Response.json({ error: "Trace capture disabled" }, { status: 403 });
  }

  const contentLength = getContentLength(request);

  if (contentLength != null && contentLength > MAX_TRACE_BODY_BYTES) {
    return Response.json({ error: "Trace payload too large" }, { status: 413 });
  }

  const body = await request.text();

  if (body.length > MAX_TRACE_BODY_BYTES) {
    return Response.json({ error: "Trace payload too large" }, { status: 413 });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const parsedPayload = parseRawLocalAnswerTracePayload(payload);
    const result = await writeRawLocalAnswerTrace({ payload: parsedPayload });

    return Response.json({
      status: "captured",
      filePath: result.filePath,
    });
  } catch (error) {
    console.error("[chat] local-trace-capture:error", error);

    return Response.json({ error: "Invalid trace payload" }, { status: 400 });
  }
}

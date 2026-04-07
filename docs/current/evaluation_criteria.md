# Evaluation Criteria

This document defines how to evaluate the current implementation as it exists today. It separates hard guarantees enforced by code from soft expectations that depend on model behavior and prompt compliance.

## Evaluation Model

The current system cannot be evaluated as a hard-grounded system in the strict sense, because the route does not verify final answers against retrieved evidence.

The current system can only be evaluated at three levels:

- hard guarantees: behaviors enforced directly by repo code
- observed grounding: behaviors visible in answers and server logs, but not independently verified
- unsupported expectations: behaviors described in the prompt but not enforced

## Hard Guarantees

The following are currently enforced by code and can be treated as implementation guarantees:

- Chat requests go through `/api/chat`.
- The route runs on the Edge runtime.
- The route uses DeepSeek `deepseek-chat` for generation.
- The route uses PageIndex MCP as the retrieval interface.
- The model only sees five PageIndex tools:
  - `recent_documents`
  - `find_relevant_documents`
  - `get_document`
  - `get_document_structure`
  - `get_page_content`
- The first AI SDK step must be a tool call.
- The AI SDK step count is capped at five.
- The route logs request lifecycle events, tool events, and final answer text.
- The UI renders only text parts from messages.

If one of these conditions is not true at runtime, that is a repo-level regression.

## Observed Grounding Checks

The following checks can be performed, but they are not guaranteed by code.

### In-scope document question

Current success condition:

- the model uses PageIndex tools
- the answer is concise
- the answer can be traced to retrieved page text or logged snippets
- the answer does not obviously exceed the retrieved evidence

Current failure condition:

- the answer cannot be matched to retrieved material
- the answer appears to rely on outside knowledge
- the answer references the wrong document
- the answer is broader than the evidence returned

### Out-of-scope general-knowledge question

The prompt asks for the exact refusal:

`I can only answer questions about the provided documents.`

Current evaluation note:

- because the first step is forced to use a tool, an out-of-scope request may still trigger PageIndex retrieval before the refusal
- refusal wording is prompt-driven, not server-validated

### Missing-answer case

The prompt asks for the exact fallback:

`I cannot find this information in the provided documents.`

Current evaluation note:

- this is a soft expectation only
- the route does not verify that the model used the fallback when evidence was insufficient

### Reuse of prior evidence

The prompt prefers reusing previously retrieved document content when it is already in the conversation.

Current evaluation note:

- this depends on AI SDK message round-tripping
- the repo has no independent evidence cache
- the first-step forced tool call can conflict with the no-extra-search instruction

### Citation or source reference

The prompt asks for exact wording or a brief clause/page reference when available.

Current evaluation note:

- the current UI has no dedicated citation surface
- any source reference must appear in plain text to be visible
- the route does not require citation presence

## Unsupported Expectations

The following behaviors are described by the prompt but are not enforced by code:

- refusing unrelated questions before any retrieval
- reusing prior evidence without another tool call
- limiting retrieval to the minimum necessary
- making at most one additional targeted retrieval
- avoiding `get_document_structure` unless necessary
- ensuring every factual statement is traceable to retrieved wording

A failure on one of these points is currently a model-orchestration failure, not a broken server invariant.

## Evidence to Inspect During Evaluation

A current evaluation needs both user-visible output and server logs.

### User-visible evidence

Inspect:

- final assistant answer text
- whether the answer is concise
- whether the answer includes any source wording or page reference in text

### Server-side evidence

Inspect:

- tool metadata logs
- tool event logs
- retrieval traces
- final answer trace

Current logging is stronger for:

- `find_relevant_documents`
- `get_document`
- `get_document_structure`
- `get_page_content`

`recent_documents` is allow-listed but does not receive the same retrieval-trace parsing treatment.

## Interpretation

### Hard failure

A hard failure is a violation of code-enforced behavior, such as:

- a non-allow-listed tool being exposed
- step 0 not using a tool
- the route not streaming a response
- the route failing to close MCP on finish or error

### Soft failure

A soft failure is a model-output problem inside the current architecture, such as:

- answering without adequate evidence
- failing to refuse when the prompt says to refuse
- using the wrong document
- retrieving more broadly than needed

### Current known limit

The current architecture can demonstrate grounded behavior, but it cannot prove grounded behavior for every answer.

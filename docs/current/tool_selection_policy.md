# Tool Selection Policy

This document records the tool-selection policy that is currently implemented in `src/app/api/chat/route.ts`.

## Summary

The current tool-selection policy is hybrid:

- partly enforced in server code
- partly described in the system prompt
- largely executed by the AI SDK and the model at runtime

The result is not a strict deterministic policy. It is a constrained model-driven policy.

## Server-Enforced Policy

The route enforces the following rules directly:

- only five PageIndex MCP tools are exposed to the model
- the first model step must use a tool
- the total AI SDK step count is capped at five

### Allow-listed tools

The current allow-list is:

- `recent_documents`
- `find_relevant_documents`
- `get_document`
- `get_document_structure`
- `get_page_content`

All other PageIndex tools are filtered out before the model sees them.

### First-step rule

The route uses `prepareStep` to return `toolChoice: "required"` on step 0.

This means:

- every request starts with a tool call
- the model cannot immediately answer on step 0
- the model cannot immediately refuse on step 0 without first touching a tool

### Step limit

The route uses `stopWhen: stepCountIs(5)`.

This limits the overall tool-and-answer loop, but it does not enforce a specific retrieval sequence.

## Prompt-Declared Policy

The system prompt tells the model to follow this policy:

- refuse unrelated general-knowledge questions
- answer directly from previously retrieved document content when sufficient
- otherwise retrieve the minimum evidence needed
- make at most one more targeted retrieval if the first retrieval is insufficient
- avoid `get_document_structure` unless structure is needed
- stop searching as soon as enough evidence exists

These rules are advisory to the model. They are not checked after the fact.

## Observed Mismatches Between Code and Prompt

The current code and prompt do not fully agree.

### Mismatch 1: forced initial tool call

The prompt says unrelated questions should be refused directly.

The code says step 0 must use a tool.

Current effect:

- even obvious out-of-scope questions can trigger PageIndex tool usage before refusal

### Mismatch 2: reuse-without-search

The prompt says to answer directly from already retrieved conversation content when possible.

The code still forces a tool on step 0 for every request.

Current effect:

- the route can re-search even when the prompt says it should reuse prior evidence

### Mismatch 3: retrieval count

The prompt allows the first retrieval plus at most one more targeted retrieval.

The code allows up to five AI SDK steps.

Current effect:

- the route can exceed the prompt's intended retrieval budget

### Mismatch 4: no enforcement of evidence sufficiency

The prompt requires evidence-only answers.

The code does not validate final answer content against tool outputs.

Current effect:

- the system can produce an answer that appears grounded without the server proving it

## Per-Tool Role in the Current Policy

### `recent_documents`

Current role:

- broad discovery of accessible documents

Current limitations:

- not tied to user intent
- can be used simply because the first step must call a tool
- does not receive the same retrieval-trace parsing as the other main retrieval tools

### `find_relevant_documents`

Current role:

- search across accessible documents

Current limitations:

- search scope is not narrowed by repo-owned contract or document state
- it is useful for discovery, but not a stable evidence guarantee by itself

### `get_document`

Current role:

- lookup by document name

Current limitations:

- it helps identity resolution, but it is not the strongest evidence source for clause text
- the repo does not validate the chosen document name

### `get_document_structure`

Current role:

- outline or table-of-contents style navigation

Current limitations:

- the prompt discourages using it unless needed
- it is a navigation tool, not final textual evidence

### `get_page_content`

Current role:

- retrieve actual page text

Current limitations:

- this is the strongest evidence-bearing tool currently available, but the route still does not verify that the final answer stayed within that evidence

## Responsibility Boundaries

### Repo

The repo currently owns:

- which tools exist for the model
- the first-step forced tool policy
- the step cap
- the prompt text

### AI SDK

The AI SDK currently owns:

- automatic tool execution
- passing tool results back into the loop
- the multi-step agent behavior

### Model

The model currently owns:

- choosing which allow-listed tool to call
- choosing tool arguments
- deciding when to stop
- deciding how to summarize retrieved information

### PageIndex

PageIndex currently owns:

- what each tool does
- what each tool returns
- how document search and content retrieval behave

## Current Practical Reading

The current policy is best described as:

- server-constrained tool access
- model-driven retrieval decisions
- prompt-requested grounding
- no server-side evidence verification

That is the actual tool-selection policy in the repo today.

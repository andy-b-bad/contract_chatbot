# Current Architecture

This document records the architecture that is implemented in the repo today. It does not describe the target architecture in `docs/target_architecture.md`.

## System Shape

The application is currently a small Next.js 16 App Router project with:

- one client chat page at `src/app/page.tsx`
- one chat API route at `src/app/api/chat/route.ts`
- no database
- no server-side session store
- no repo-owned document catalogue
- no contract-selection UI
- no repo-owned caching, FAQ, analytics, or rate limiting layer

The current chat stack depends on two external services:

- DeepSeek for model inference, configured through `@ai-sdk/deepseek` and `DEEPSEEK_API_KEY`
- PageIndex for document retrieval, accessed through MCP over HTTP and `PI_API`

## Request Flow

1. The browser renders a client component chat UI from `src/app/page.tsx`.
2. The UI uses `useChat` from `@ai-sdk/react` with `DefaultChatTransport` pointed at `/api/chat`.
3. On submit, the UI trims the input, ignores empty strings, clears the input box, and sends a text-only user message.
4. `useChat` owns client-side message state. The repo does not implement its own browser persistence or session storage.
5. The API route receives `request.json()` and assumes it contains `{ messages: UIMessage[] }`. There is no runtime schema validation, authentication, or message provenance check.
6. The route runs on the Edge runtime.
7. The route creates a PageIndex MCP client against `https://api.pageindex.ai/mcp` and loads the available tools for the configured API key.
8. The route filters the PageIndex tool list down to five allow-listed tools:
   - `recent_documents`
   - `find_relevant_documents`
   - `get_document`
   - `get_document_structure`
   - `get_page_content`
9. The route converts incoming UI messages into model messages using `convertToModelMessages(messages)`.
10. The route calls `streamText` with:
    - model: `deepseek("deepseek-chat")`
    - system prompt: a long document-grounding prompt
    - tools: the filtered PageIndex MCP tools
    - stop condition: `stepCountIs(5)`
11. On step 0, the route forces `toolChoice: "required"`. This means the model must call a tool before it can produce a final answer.
12. The model is operating in an agentic tool loop controlled by the AI SDK, not a single-pass completion.
13. On later steps, tool choice is delegated to the model.
14. Tool execution is handled by the AI SDK. The repo does not manually execute tool calls or manually reinsert tool results into the model context.
15. The route returns `result.toUIMessageStreamResponse(...)` back to the browser.
16. The browser renders only text parts from each message. Tool metadata, citations as structured data, and other non-text parts are not rendered by the current UI.

## Grounding Model

Grounding is currently a mix of code constraints and prompt instructions.

### Code-enforced grounding constraints

- The model can only access the five allow-listed PageIndex tools.
- The first model step must use a tool.
- The total number of AI SDK steps is capped at five.

### Prompt-only grounding rules

The system prompt tells the model to:

- answer only from provided documents or previously retrieved document content
- refuse unrelated general-knowledge questions
- reuse prior retrieved content when sufficient
- retrieve the minimum evidence needed
- make at most one more targeted retrieval if the first retrieval is insufficient
- avoid `get_document_structure` unless it is genuinely needed
- quote or closely cite exact wording where possible

These rules are not independently enforced by server code.

### Where grounding currently succeeds

Grounding can succeed when:

- the model uses discovery tools to identify a relevant document
- the model fetches page text with `get_page_content`
- the final answer stays close to the retrieved wording

### Where grounding currently fails or remains unverified

Grounding is not guaranteed because:

- there is no server-side check that the final answer is supported by retrieved text
- there is no server-side citation requirement
- there is no explicit document-scope enforcement
- the route trusts client-supplied message history
- the first-step forced tool call can conflict with prompt instructions to refuse immediately or reuse prior evidence without another search
- the step limit of five does not enforce the prompt's "one more targeted retrieval" rule

## Responsibility Boundaries

### Next.js application

The repo currently owns:

- the browser chat UI
- the `/api/chat` route
- the Edge runtime host
- the system prompt text
- the PageIndex tool allow-list
- the first-step forced tool-call rule
- server-side logging

The repo does not currently own:

- document identity
- document scope enforcement
- retrieval planning beyond prompt text and tool allow-list
- answer verification
- persistent chat history
- analytics or rate limiting

### Vercel AI SDK

The AI SDK currently owns:

- client chat transport behavior
- conversion from UI messages to model messages
- the multi-step tool-calling loop
- automatic execution of tool calls
- passing tool results back into the model loop
- streaming the final response back to the UI

### DeepSeek model

The model currently owns:

- deciding which allow-listed tool to call after the route exposes them
- deciding how to interpret tool results
- deciding when the retrieved evidence is sufficient
- deciding final answer wording
- following or failing to follow the prompt rules

### PageIndex

PageIndex currently owns:

- document storage reachable via the configured API key
- MCP tool behavior and result shapes
- search, lookup, structure retrieval, and page-content retrieval semantics

## State and Persistence

There is no repo-owned persistence for:

- selected document or contract
- document metadata
- prior approved answers
- cached responses
- user sessions
- analytics
- rate-limit state

Any conversation continuity depends on the client resending message history. Any reuse of prior retrieved evidence depends on AI SDK message serialization rather than a repo-owned evidence store.

## Observability

The route logs:

- request start
- loaded tool metadata
- a truncated model-context trace
- tool streaming events
- retrieval traces for `find_relevant_documents`, `get_document`, `get_page_content`, and `get_document_structure`
- the final answer text
- MCP close events and errors

These logs are server-side only. The current UI does not expose tool traces, intermediate retrieval state, or structured provenance to the user.

## Error Handling

If the route throws, it logs the error, closes the MCP client, and rethrows. The repo does not provide a custom user-facing error response format.

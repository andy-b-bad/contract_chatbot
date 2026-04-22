# Architecture

## Overview
This repository is a small Next.js 16 App Router application that delivers a contract-scoped chat interface for stunt performer agreements. The app has a thin frontend, optional Supabase-backed auth, per-user chat persistence, and retrieval-audit persistence behind a feature flag, plus a single chat integration endpoint. Its core behavior is PageIndex-grounded answer generation: the model can answer only from contract material exposed through PageIndex MCP tools.

The main runtime split is:

- optional page-level auth/session gating in `proxy.ts`
- server page entry in `src/app/page.tsx`
- client UI in `src/app/chat-client.tsx`
- scope and document rules in `src/app/contracts.ts`
- auth/session and turn-persistence orchestration in `src/lib/chat-session.ts`
- low-level chat persistence helpers in `src/lib/chat-persistence.ts`
- retrieval audit collection in `src/lib/retrieval-audit.ts`
- excerpt-packet shaping in `src/lib/audit/excerpt-packet.ts`
- usage and estimated-cost mapping in `src/lib/audit/usage-cost.ts`
- streaming chat orchestration in `src/app/api/chat/route.ts`

## Runtime Components

### App Shell and UI
`src/app/layout.tsx` provides the global HTML shell and font setup. `src/app/page.tsx` is a server component that:

- renders the original anonymous chat flow when `ENABLE_AUTH=false`
- loads the authenticated user's persisted thread only when `ENABLE_AUTH=true`

It then renders `src/app/chat-client.tsx`, which remains a thin presentation layer for:

- contract scope selector
- message list
- pending retrieval status
- chat input form

The UI uses `useChat` from `@ai-sdk/react` with `DefaultChatTransport`, posting requests to `/api/chat`. Each user message carries `scope` metadata, and the selected scope plus an optional `chatId` are sent in the request body.

### Auth and Persistence
Supabase is used only for authentication, session cookies, per-user thread resolution, chat persistence, retrieval audit persistence, and diagnostic/admin data. It is not a retrieval source. This integration is inactive by default and only becomes active when `ENABLE_AUTH=true`.

- `proxy.ts` refreshes the Supabase session and redirects unauthenticated users only when `ENABLE_AUTH=true`
- `src/app/login/page.tsx` starts an email magic-link flow
- `src/app/auth/callback/route.ts` exchanges the Supabase auth code for a session
- `src/lib/chat-session.ts` resolves the authenticated user, resolves or validates the current thread, and orchestrates user-turn and assistant-turn persistence
- `src/lib/chat-persistence.ts` performs low-level reads and writes for `chat_threads`, `chat_messages`, `retrieval_audits`, and `retrieval_audit_sources`
- `src/lib/retrieval-audit.ts` collects bounded metadata from retrieval traces for later persistence with the final assistant turn
- `src/lib/audit/excerpt-packet.ts` derives bounded excerpt packets from filtered tool results
- `src/lib/audit/usage-cost.ts` maps model usage metadata into persisted usage and estimated-cost fields
- `src/app/api/health/supabase/route.ts` verifies Supabase connectivity without exposing chat content

When auth is enabled, the data model is still intentionally narrow:

- one chat thread is resolved per signed-in user
- user and assistant turns are persisted to `chat_messages`
- one `retrieval_audits` row is persisted per assistant answer and linked to the persisted assistant message and thread
- each `retrieval_audits` row can have at most one linked `retrieval_audit_sources` row storing bounded `excerpt_packet_json`

`retrieval_audits` stores bounded metadata only, including selected scope, normalized user query, tool/document/page trace fields, provider/model identifiers, token-usage fields, provider usage JSON, and estimated cost. `retrieval_audit_sources` stores only bounded derived excerpt packets. These records are for debugging and traceability, and they are not read back into retrieval or answer generation.

### Contract Scope Rules
`src/app/contracts.ts` is the app’s policy layer. It defines:

- allowed contract scopes such as `pact-cinema`, `bbc-tv`, and `mocap`
- document identity hints used to constrain eligible documents when discovery is needed, without ranking pages or changing the substantive query
- document name hints used to allow or reject retrieved documents
- shared summary page ranges allowed for each scope

This file is the source of truth for scope parsing, document filtering, and page-range validation.

### Chat API Route
`src/app/api/chat/route.ts` runs on the Edge runtime and owns chat orchestration, product guardrails, PageIndex MCP integration, streaming, and observability. PageIndex remains the retrieval/navigation authority. It:

- parses the incoming request and normalizes `selectedScope`
- filters prior messages so only messages from the same scope are reused
- builds a scope-aware system prompt
- creates an MCP client for `https://api.pageindex.ai/mcp`
- filters the MCP toolset to a small allow-list
- wraps tools with scope enforcement and trace logging
- resolves authenticated session context through `src/lib/chat-session.ts` only when auth is enabled
- persists the latest user message before model execution only when auth is enabled
- persists the final assistant response plus linked retrieval observability records after streaming completes only when auth is enabled
- streams the final answer back to the UI

The route remains the HTTP and streaming orchestration entrypoint. It does not directly own every persistence detail:

- `src/lib/chat-session.ts` owns auth/session/thread resolution and turn-persistence orchestration
- `src/lib/chat-persistence.ts` owns the low-level Supabase write primitives
- `src/lib/retrieval-audit.ts` owns retrieval-audit state, bounds, dedupe, and conversion to a persisted audit record
- `src/lib/audit/excerpt-packet.ts` owns bounded excerpt shaping from tool outputs
- `src/lib/audit/usage-cost.ts` owns usage and estimated-cost normalization

## Request Lifecycle
1. When `ENABLE_AUTH=true`, `proxy.ts` refreshes the Supabase session for `/` and redirects unauthenticated requests to `/login`.
2. `src/app/page.tsx` either renders the original anonymous chat flow or, when auth is enabled, loads the user's single persisted chat thread and messages from Supabase before rendering `src/app/chat-client.tsx`.
3. The user selects a contract scope and submits a message in the client UI.
4. The browser sends the full message list plus `selectedScope` and, when auth is enabled, `chatId` to `POST /api/chat`.
5. `src/lib/chat-session.ts` resolves the authenticated user context when auth is enabled, creates or validates the thread, and returns `401` or `403` if the session or thread ownership check fails.
6. The route normalizes scope, filters prior messages by scope, builds the system prompt, and persists the latest user message through `src/lib/chat-session.ts` when auth is enabled.
7. The route loads PageIndex MCP tools, wraps them so out-of-scope documents are rejected and shared summary page access is constrained, and attaches trace logging plus retrieval-audit collection.
8. `streamText` calls DeepSeek through the AI SDK. The first model step is forced to use tools, which makes retrieval the default path.
9. Tool activity is mirrored into transient `retrievalStatus` data parts so the client can display “Retrieving contract content...”.
10. Retrieval trace data is logged to the console and also accumulated as bounded audit metadata during tool execution. During wrapped tool execution, bounded excerpt packets are derived from filtered tool results and added to the in-memory audit collector.
11. The final assistant text is streamed back to the page.
12. In `streamText.onFinish`, usage and estimated-cost fields are captured from the model event and added to the in-memory audit collector.
13. After the response completes, the assistant message is persisted and, when auth is enabled, a linked `retrieval_audits` row is written for that answer, followed by an optional `retrieval_audit_sources` row when bounded excerpt packets were captured.

## Retrieval Guardrails
The main protection against hallucination is not the UI; it is the server wrapper around model/tool access.

Key guardrails:

- only a fixed set of PageIndex tools is exposed
- document discovery, when needed, is constrained to eligible scope documents without changing the substantive user query or ranking pages app-side
- recent/search results are filtered to allowed documents only
- shared summary documents are limited to scope-approved pages
- `get_document_structure` is blocked for shared summary documents
- out-of-scope document requests return structured tool errors instead of content
- conversation history is filtered by message scope before reuse

These controls make scope isolation a server-side guarantee rather than a prompt-only convention.

## Observability and Audit
The app has two retrieval-observability paths:

- console traces emitted by `src/app/api/chat/route.ts`
- authenticated retrieval audit persistence built from the same trace path

When auth is enabled, each assistant answer can persist bounded retrieval metadata including:

- selected scope
- normalized latest user query text
- tool names used during the answer
- retrieved document names
- retrieved page refs
- short trace snippets
- provider and model identifiers
- token-usage fields and provider usage JSON
- estimated cost
- bounded derived excerpt packets stored separately in `retrieval_audit_sources`

This audit data is intended for debugging and traceability only. It is not exposed as a retrieval source, conversation-memory source, analytics pipeline, or secondary answer path. Excerpt packets are bounded and derived from filtered tool results, and the app does not persist raw tool payloads for retrieval observability.

## External Integrations and Configuration
The app depends on two external services:

- DeepSeek, accessed through `@ai-sdk/deepseek` with `DEEPSEEK_API_KEY`
- PageIndex MCP, accessed over HTTP with `PI_API`
- Supabase Auth and PostgREST, accessed with `NEXT_PUBLIC_SUPABASE_URL` plus the project's publishable or anon key

Supabase-backed auth, thread/message persistence, and retrieval audit persistence exist in the repo behind `ENABLE_AUTH`, but Supabase is not used as a second answer source. There is still no background queue or analytics store.

## Non-Runtime Files
`docs/` contains local reference notes about PageIndex and Vercel AI SDK usage. These files are for development context and are not parsed or served as part of the live retrieval path. `public/` contains static assets only.

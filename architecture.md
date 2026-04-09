# Architecture

## Overview
This repository is a small Next.js 16 App Router application that delivers a contract-scoped chat interface for stunt performer agreements. The app has a thin frontend, a single server entry point, and no database. Its core behavior is retrieval-augmented generation: the model can answer only from contract material exposed through PageIndex MCP tools.

The main runtime split is:

- client UI in `src/app/page.tsx`
- scope and document rules in `src/app/contracts.ts`
- streaming chat orchestration in `src/app/api/chat/route.ts`

## Runtime Components

### App Shell and UI
`src/app/layout.tsx` provides the global HTML shell and font setup. `src/app/page.tsx` is a client component that renders:

- contract scope selector
- message list
- pending retrieval status
- chat input form

The UI uses `useChat` from `@ai-sdk/react` with `DefaultChatTransport`, posting requests to `/api/chat`. Each user message carries `scope` metadata, and the selected scope is also sent in the request body.

### Contract Scope Rules
`src/app/contracts.ts` is the app’s policy layer. It defines:

- allowed contract scopes such as `pact-cinema`, `bbc-tv`, and `mocap`
- search hints used to bias retrieval toward the selected contract
- document name hints used to allow or reject retrieved documents
- shared summary page ranges allowed for each scope

This file is the source of truth for scope parsing, document filtering, and page-range validation.

### Chat API Route
`src/app/api/chat/route.ts` runs on the Edge runtime and owns the retrieval workflow. It:

- parses the incoming request and normalizes `selectedScope`
- filters prior messages so only messages from the same scope are reused
- builds a scope-aware system prompt
- creates an MCP client for `https://api.pageindex.ai/mcp`
- filters the MCP toolset to a small allow-list
- wraps tools with scope enforcement and trace logging
- streams the final answer back to the UI

## Request Lifecycle
1. The user selects a contract scope and submits a message in `src/app/page.tsx`.
2. The browser sends the message to `POST /api/chat`.
3. The route builds a system prompt that forbids outside knowledge and limits retrieval to the selected scope.
4. The route loads PageIndex MCP tools, then wraps them so out-of-scope documents are rejected and shared summary page access is constrained.
5. `streamText` calls DeepSeek through the AI SDK. The first model step is forced to use tools, which makes retrieval the default path.
6. Tool activity is mirrored into transient `retrievalStatus` data parts so the client can display “Retrieving contract content...”.
7. The final assistant text is streamed back to the page and rendered alongside the existing conversation.

## Retrieval Guardrails
The main protection against hallucination is not the UI; it is the server wrapper around model/tool access.

Key guardrails:

- only a fixed set of PageIndex tools is exposed
- search queries are rewritten with scope-specific hints
- recent/search results are filtered to allowed documents only
- shared summary documents are limited to scope-approved pages
- `get_document_structure` is blocked for shared summary documents
- out-of-scope document requests return structured tool errors instead of content
- conversation history is filtered by message scope before reuse

These controls make scope isolation a server-side guarantee rather than a prompt-only convention.

## External Integrations and Configuration
The app depends on two external services:

- DeepSeek, accessed through `@ai-sdk/deepseek` with `DEEPSEEK_API_KEY`
- PageIndex MCP, accessed over HTTP with `PI_API`

There is currently no authentication, persistence layer, background queue, or analytics store in the repo.

## Non-Runtime Files
`docs/` contains local reference notes about PageIndex and Vercel AI SDK usage. These files are for development context and are not parsed or served as part of the live retrieval path. `public/` contains static assets only.

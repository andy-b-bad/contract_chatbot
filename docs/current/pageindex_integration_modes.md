# PageIndex Integration Modes

This document records the PageIndex integration modes that are visible from the current repo and the checked-in docs. It distinguishes what is implemented from what is only documented elsewhere.

## Summary

Only one PageIndex integration mode is implemented in this repo today:

- AI SDK `streamText` plus PageIndex MCP tools plus DeepSeek as the model

The current mode delegates both retrieval planning and answer synthesis to the model, rather than to PageIndex or repo-owned logic.

The docs in `docs/pageindex/` describe additional modes that are not currently used in code.

## Mode 1: Current Implemented Mode

### Shape

The current route in `src/app/api/chat/route.ts` does the following:

- opens a PageIndex MCP connection with `createMCPClient`
- loads PageIndex tools dynamically
- filters them to a five-tool allow-list
- passes those tools into AI SDK `streamText`
- uses DeepSeek `deepseek-chat` as the decision-making model
- lets the AI SDK execute tool calls and feed results back into the loop

### Ownership

In this mode:

- Next.js owns the route, UI, system prompt, and tool allow-list
- the AI SDK owns the multi-step tool loop and response streaming
- DeepSeek owns tool selection and final answer wording
- PageIndex owns document retrieval behavior and tool result contents

### What this mode gives the repo

- direct control over which PageIndex tools are exposed
- direct control over the system prompt
- server-side access to tool traces and custom logging
- the ability to combine PageIndex tools with other tools in the future

### What this mode does not guarantee

- explicit document scope
- answer correctness
- citation presence
- final-answer verification against retrieved text
- minimal tool use
- compliance with the prompt's retrieval policy

## Mode 2: PageIndex Chat API

The docs in `docs/pageindex/api-endpoints.md` describe a PageIndex Chat API at `POST https://api.pageindex.ai/chat/completions`.

### Shape described in docs

This mode can:

- accept `messages`
- accept optional `doc_id`
- stream the answer directly from PageIndex
- emit intermediate metadata such as `mcp_tool_use_start` and `mcp_tool_result_start`

### Current repo status

This mode is not implemented in the repo.

The repo does not currently:

- call `/chat/completions`
- pass `doc_id`
- consume PageIndex block metadata from the response stream
- let PageIndex own the end-to-end answer generation path

### Boundary difference from current mode

Compared with the current MCP-tool mode, this documented mode would move more retrieval-and-answer orchestration into PageIndex rather than keeping the tool loop in AI SDK plus DeepSeek.

That shift is described by docs, not implemented by current code.

## Mode 3: PageIndex JS SDK Tool Wrapper

The docs in `docs/pageindex/js-sdk-mcp-tools.md` describe using PageIndex client tools through a JS SDK wrapper and then exposing them to an agent framework such as the Vercel AI SDK.

### Shape described in docs

This mode would:

- instantiate a PageIndex SDK client locally
- wrap PageIndex methods such as `findRelevantDocuments`, `getDocumentStructure`, and `getPageContent`
- expose those wrapped methods as locally defined AI SDK tools

### Current repo status

This mode is not implemented in the repo.

The repo does not currently:

- import `@pageindex/sdk`
- define its own PageIndex tool schemas
- normalize PageIndex inputs or outputs locally
- add repo-owned validation around PageIndex tool parameters

### Boundary difference from current mode

Compared with raw MCP tool exposure, this documented mode would keep the AI SDK tool loop but move more tool-definition responsibility into repo code.

Again, that is documented elsewhere, not implemented here.

## Other PageIndex APIs Present in Docs but Not Used Here

The checked-in docs also describe APIs that are not part of the current runtime path:

- Document Processing API
- Markdown Processing API
- Retrieval API (legacy)

The current repo does not upload documents, process documents, or call the legacy retrieval endpoints.

## Current Practical Reading

As of the current codebase:

- the repo is using PageIndex as a retrieval tool provider, not as the end-to-end chat engine
- the AI SDK plus DeepSeek path currently owns the orchestration loop
- PageIndex Chat API and PageIndex JS SDK wrapper modes are documented reference points only

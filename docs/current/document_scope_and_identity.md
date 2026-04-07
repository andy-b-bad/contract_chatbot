# Document Scope and Identity

This document records how document scope and document identity work in the repo today.

## Current Reality

The repo does not currently define its own document model.

There is no repo-owned:

- contract ID
- document ID
- document catalogue
- mapping from product contract names to PageIndex documents
- selected-document state
- folder-scope configuration
- cross-request document pinning

The application assumes that documents already exist in PageIndex and are reachable through the API key configured in `PI_API`.

## Effective Document Universe

The effective document universe is whatever PageIndex documents are visible to the configured API key at request time.

The repo does not narrow that universe by:

- `doc_id`
- `folderId`
- contract type
- product selection
- user account
- session state

If PageIndex account scope changes outside the repo, the set of searchable documents changes with it.

## How Document Identity Appears Today

Document identity currently reaches the app only through tool calls and tool results.

The allow-listed tools expose identity in different ways:

- `recent_documents` lists recent documents visible to the API key
- `find_relevant_documents` searches across accessible documents
- `get_document` looks up a document by name
- `get_document_structure` takes a document name
- `get_page_content` takes a document name and page selection

This means the current working identity is primarily a human-readable document name chosen during the tool-calling loop.

The repo does not currently persist or validate:

- PageIndex `doc_id`
- stable contract IDs
- version IDs
- duplicate-name handling
- rename handling

## Current Scope Resolution

Current scope resolution is model-driven.

A typical request has this shape:

1. The user asks a question without selecting a document.
2. The route forces the model to use a tool on step 0.
3. The model uses one of the discovery or lookup tools to find candidate documents.
4. The model decides which document name to use in later retrieval calls.
5. The model answers from whatever retrieved material it considers sufficient.

No server-side code checks that the chosen document is the intended one.

## Current Scope Boundaries

There is currently no explicit boundary between:

- one contract and another
- one guide and another
- one version of a document and another
- one user's intended document and another accessible document

If multiple documents are accessible through the API key, the current route can search across all of them.

There is no guarantee that two consecutive turns operate on the same document.

The repo also does not prevent accidental cross-document drift across turns. If the model changes documents in a later turn, there is no repo-owned state that rejects that switch.

## Conversation Scope

Conversation scope is weakly defined.

The frontend keeps message history in browser state through `useChat`. The backend does not keep its own conversation record. Any continuity across turns depends on the client resending prior messages.

The system prompt refers to "previously retrieved document content in this conversation", but the repo does not implement its own evidence store. Reuse of prior retrieval depends on AI SDK message serialization and whatever message parts are returned to the server on the next request.

## Where Identity Is Reliable

Identity is relatively reliable only when:

- the accessible PageIndex document set is very small
- document names are unique and stable
- the model chooses the correct document name
- the answer is supported by `get_page_content` from that document

## Where Identity Is Weak or Fails

Identity is weak because:

- the user cannot explicitly select a document in the current UI
- the route does not pin a document or contract
- the route does not pass `doc_id` or `folderId`
- document names are chosen inside model tool calls rather than by repo-owned state
- the route does not verify that the answer came from the intended document
- the current UI does not expose a stable source-of-truth document identifier to the user

## Responsibility Boundaries

### Repo

The repo currently owns almost none of document identity. It only exposes a chat route and a tool allow-list.

### Model and AI SDK

The model plus AI SDK currently decide which document to search and which document name to use, within the allowed tool set.

### PageIndex

PageIndex currently owns the actual document inventory, the meaning of document names, and the retrieval results returned for those names.

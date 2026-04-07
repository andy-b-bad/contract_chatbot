# Target Architecture

This product should be architected as a PageIndex application wrapped in a Vercel application shell, not as a Vercel RAG app with PageIndex bolted on.

## Architectural Primacy

PageIndex is the primary retrieval system for this product.

Retrieval quality, document navigation, and grounded answer generation should be designed around PageIndex’s retrieval model and recommended usage patterns. This application is not intended to use a generic Vercel-style RAG architecture as its source of retrieval truth.

Vercel’s role is secondary and infrastructural. Vercel is used for:

- chat interface
- frontend delivery
- streaming response UX
- app hosting and deployment
- observability and operational support where appropriate

PageIndex’s role is primary in the document-answering core. It should own:

- document indexing
- retrieval and navigation over document structure
- document-grounded evidence access
- retrieval patterns that produce high-quality grounded answers

Where Vercel guidance and PageIndex guidance differ on retrieval architecture, PageIndex should be treated as authoritative.

A major architectural risk is drifting back into a generic app-led or framework-led RAG pattern that does not reflect how PageIndex is intended to be used.

## Priority Order

When trade-offs arise, the architecture should prioritise:

1. retrieval correctness and document grounding
2. contract-scope correctness
3. maintainability and auditability
4. speed and user experience
5. cost optimisation

## Purpose

This application is a document-grounded question-answering system for UK stunt performers.

Its purpose is to let users ask practical questions about stunt contracts, rates, definitions, clauses, entitlements, obligations, and related working terms, and receive answers grounded only in the selected source documents.

The system is not a general chatbot. It is a contract and document assistant.

---

## Product Goal

The end-state product should provide a clean, fast, trustworthy interface where a stunt performer can:

1. choose the relevant contract or guide
2. ask a question in plain English
3. receive a concise answer grounded in the chosen document set, with a citation or reference where possible
4. see which contract or guide the answer came from
5. avoid repeated inference cost for common or repeated questions where possible

The product should feel quick, clear, and professional.

---

## Current MVP State

The current MVP supports a single contract document and a basic chat flow.

This is acceptable for the MVP, but the architecture must support expansion to multiple contract types without requiring a fundamental redesign later.

---

## Intended End State

The application should support multiple predefined contract and guide selections.

Initial target document set:

- ITV TV
- BBC TV
- PACT TV and SVOD
- PACT Cinema
- Commercials (guide)
- Motion Capture (guide)

The user must be able to pre-select the relevant contract or guide before asking a question.

Retrieval and answering must respect that selection.

The system must not silently mix answers across contracts unless a future version explicitly introduces a cross-contract comparison mode.

---

## Core User Experience

### Contract Selection

The interface must include a prominent pre-select control for contract or guide selection.

For MVP, this may default to the single available contract. For multi-contract production, the selection must be explicit and treated as part of retrieval scope and answer context.

### Query and Answer Flow

The user asks a question in natural language.

The system retrieves only from the selected contract or guide, unless a later feature explicitly enables cross-contract comparison.

Answers must be:

- concise
- grounded in retrieved source material
- phrased for a UK audience
- limited to what the selected documents support

If the answer is not explicitly supported by the selected document set, the system should clearly say so.

### Front End and Responsiveness

The UI should be attractive, clear, modern, and trustworthy. It should feel like a professional member-facing product rather than a developer demo.

The product should also feel fast and interactive. This may be achieved through:

- lower retrieval and generation latency
- streaming output early so the user sees visible progress quickly
- caching common question and answer pairs
- optimising the retrieval path and runtime stack

Perceived speed is an important product requirement.

---

## Retrieval and Answering Requirements

The system must remain document-grounded.

It should answer only from:

- the selected contract or guide documents
- any approved FAQ or answer-reference materials that are explicitly part of the system

It must not rely on general knowledge for contract answers.

The retrieval layer should ensure that:

- document scope is explicit
- answer provenance is preserved
- answers can be audited against source content
- the system can scale from one document to several without brittle prompt hacks

---

## Additional Knowledge Layers

### FAQ / Ideal Answers Layer

The system should support a curated FAQ or ideal-answer layer for common high-value questions.

Its purpose is to improve consistency, reduce model cost, and provide higher-quality answers for recurring questions.

This layer should be treated as controlled internal reference material, not as unmanaged chat history.

Possible uses include:

- canonical answers for common questions
- approved wording for sensitive contract topics
- clarified phrasing for known ambiguous clauses
- fallback answers where a known good answer has already been prepared and approved

This FAQ layer must remain auditable and editable.

### Previous Questions / Low-Cost Reuse Layer

The system should support storage of previous questions and answers so repeated or near-repeated queries can be served without full model cost where appropriate.

This may include:

- exact-match caching
- normalized-question lookup
- FAQ hit before full retrieval or inference
- query history with reusable approved answers

This layer must not introduce incorrect cross-contract reuse. An answer for one contract must not be reused for another unless it is explicitly marked as valid for both.

---

## Data and Persistence Requirements

The target architecture should include a persistence layer for at least:

1. document catalogue
2. contract selection metadata
3. FAQ / ideal answers
4. previous user questions and stored responses
5. analytics events
6. cost and usage records
7. abuse- or rate-limit-relevant metadata

This does not need to be over-designed in MVP, but the architecture should assume these concerns will exist.

---

## Analytics and Operational Visibility

The system should track usage and cost.

Desired visibility includes:

- number of queries
- query types or categories
- selected contract or guide
- cache hit versus full retrieval/generation
- model and tool usage
- response latency
- token usage and estimated cost
- failure rate
- refusal rate
- abuse patterns

Vercel-provided analytics may cover some of this, but the architecture should not assume Vercel alone is sufficient without verification.

The design should leave room for app-level analytics if required.

---

## Rate Limiting and Abuse Prevention

The production system should include rate limiting and abuse prevention.

Goals include:

- preventing excessive automated usage
- controlling cost exposure
- protecting performance for legitimate users
- reducing prompt abuse or spam

Vercel-provided protections may cover some of this, but the architecture should not assume they are sufficient without verification.

The design should allow app-level controls if required.

---

## Performance Goals

The target system should improve both actual and perceived responsiveness.

Desired characteristics include:

- faster first visible response
- faster end-to-end answer time
- efficient retrieval scope
- minimal unnecessary tool calls
- effective reuse of repeated answers
- smooth streaming in the UI

The user should feel that the app responds promptly, even when full answer generation takes longer behind the scenes.

---

## Scope Boundaries

### In Scope

- contract and guide selection
- document-grounded question answering
- multiple contract support
- FAQ / ideal-answer support
- reuse of previous answers where safe
- analytics and cost visibility
- rate limiting and abuse prevention
- improved UI and perceived speed

### Out of Scope for MVP

- broad legal advice beyond source documents
- free-form general knowledge chat
- automatic cross-contract comparison unless explicitly added
- replacing source documents with model memory alone
- complex back-office editorial tooling unless required later

---

## Architectural Direction

The architecture should evolve from a single-document MVP into a multi-contract document QA system with:

- explicit contract selection
- reliable document-scoped retrieval
- controlled answer reuse for common questions
- curated FAQ support
- observable cost and usage
- abuse controls
- a polished front end
- fast, streaming-first interaction

It should favour clarity, auditability, and maintainability over clever but brittle prompt-only behaviour.

Architecture and refactor decisions must be grounded in the provided project documentation in `docs/`. Where retrieval design is concerned, PageIndex documentation is authoritative. Where application-shell, UI delivery, and deployment behavior are concerned, Vercel documentation is authoritative.

Future refactors should compare the implementation against PageIndex documentation and examples first, then determine how Vercel should wrap that behaviour.

---

## Non-Negotiable Requirements

- Answers must remain document-grounded.
- Contract selection must be explicit once multiple contracts are present.
- The system must not mix contract answers accidentally.
- Reused answers must respect contract scope.
- Retrieval architecture must be PageIndex-led, not generic Vercel-RAG-led.
- The product must feel fast and professional.
- The architecture must support expansion beyond the current single-contract MVP.

---

## Open Questions

These items are important but not yet fixed:

- whether the current Vercel AI SDK + DeepSeek path is the correct runtime for a PageIndex-first architecture
- whether a PageIndex-provided SDK or runtime pattern should replace or bypass parts of the current Vercel tool-calling path
- which parts of the stack should remain Vercel-owned versus PageIndex-owned
- what persistence layer should store FAQ, cache, analytics, and question history
- whether Vercel-native analytics is sufficient or app-level analytics is required
- whether Vercel-native protections are sufficient for rate limiting and abuse prevention
- how answer caching should be keyed to avoid incorrect reuse across contracts
- whether future versions should support cross-contract comparison mode
# Target Architecture

This product should be architected as a Vercel application shell around a PageIndex document engine, using policy-constrained agentic retrieval over PageIndex MCP.

## Architectural Primacy

PageIndex is the primary document engine for this product.

In this architecture, PageIndex-led means that PageIndex owns:

- document ingestion
- document processing or transformation
- retrieval over document content
- document structure access and navigation primitives
- document-grounded evidence access

PageIndex-led does not require PageIndex to own end-to-end chat orchestration.

This architecture explicitly allows policy-constrained agentic retrieval over PageIndex MCP. The model may use PageIndex tools, but only within repo-defined product policy and scope boundaries.

Vercel’s role is secondary and infrastructural. Vercel is used for:

- chat interface
- frontend delivery
- streaming response UX
- app hosting and deployment
- observability and operational support where appropriate

The repo owns the product control layer. It must own:

- contract and document identity
- explicit contract or guide selection
- scope control
- reuse boundaries
- provenance policy

The architectural problem to solve is not agentic tool use itself. The problem is leaving contract scope, document identity, reuse policy, and provenance policy to unconstrained model behavior.

Where Vercel guidance and PageIndex guidance differ on document-engine concerns, PageIndex should be treated as authoritative. Where application-shell, UI delivery, and deployment concerns arise, Vercel should be treated as authoritative.

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

If no valid contract or guide scope is selected, the system must refuse to answer.

### Query and Answer Flow

The user asks a question in natural language.

The system retrieves only from the selected contract or guide, unless a later feature explicitly enables cross-contract comparison.

Answers must be:

- concise
- grounded in retrieved source material
- phrased for a UK audience
- limited to what the selected documents support

If sufficient evidence is not available within the selected scope, the system must clearly say so.

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

### Policy-Constrained Agentic Retrieval

The approved retrieval pattern is policy-constrained agentic retrieval over PageIndex MCP.

In this pattern:

- PageIndex remains the document engine
- the repo defines contract scope, document identity, provenance policy, and reuse boundaries
- the model may use PageIndex tools only within the repo-approved scope
- the model must not be exposed to any tool surface that allows it to bypass or reconstruct scope outside these constraints

The model may:

- choose tools within approved scope
- sequence retrieval within approved scope
- navigate document structure within approved scope
- synthesize the final answer from retrieved evidence

The model must not:

- choose contract scope
- widen scope beyond repo-approved boundaries
- switch contracts or documents without repo approval
- own reuse policy or cross-contract behaviour

The system must refuse to answer when:

- no valid contract or guide scope is selected
- sufficient evidence cannot be retrieved within the selected scope

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
3. FAQ or ideal answers
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
- cache hit versus full retrieval or generation
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
- FAQ or ideal-answer support
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

The target runtime shape is policy-constrained agentic retrieval over PageIndex MCP, wrapped by a Vercel application shell. This architecture keeps PageIndex as the document engine, keeps Vercel as the application shell, and moves product-policy ownership into the repo.

Future refactors should compare the implementation against PageIndex documentation and examples first for document-engine capabilities, then determine how the repo should apply product policy and how Vercel should wrap that behaviour.

---

## Non-Negotiable Requirements

- Answers must remain document-grounded.
- Contract selection must be explicit once multiple contracts are present.
- The system must not mix contract answers accidentally.
- Reused answers must respect contract scope.
- Retrieval architecture must remain PageIndex-based through policy-constrained agentic retrieval on PageIndex MCP.
- The repo must own contract and document identity, explicit selection, scope control, reuse boundaries, and provenance policy.
- The system must refuse when no valid scope is selected or when sufficient evidence is not available within scope.
- The product must feel fast and professional.
- The architecture must support expansion beyond the current single-contract MVP.

---

## Open Questions

These items are important but not yet fixed:

- how product-level contract and guide selections should map to PageIndex document or folder scope
- what persistence layer should store FAQ, cache, analytics, and question history
- whether Vercel-native analytics is sufficient or app-level analytics is required
- whether Vercel-native protections are sufficient for rate limiting and abuse prevention
- how answer caching should be keyed to avoid incorrect reuse across contracts
- whether future versions should support cross-contract comparison mode

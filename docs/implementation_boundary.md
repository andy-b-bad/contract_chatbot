# Implementation Boundary

## 1. Title and purpose

This document defines the concrete architecture and interface boundary between the repo, the model, and PageIndex MCP for the approved policy-constrained agentic retrieval design.

Its purpose is to make the control boundary explicit:

- PageIndex remains the document engine
- Vercel remains the application shell
- the repo owns product policy and scope control
- the model retains agentic retrieval behavior only inside repo-approved boundaries

This is a standing architecture reference for how retrieval should be shaped and governed.

---

## 2. Boundary summary

The system uses PageIndex MCP through a repo-owned control layer.

The model does not receive the raw PageIndex MCP inventory as an ungoverned tool surface. Instead, the repo exposes a scoped retrieval facade that represents only the retrieval actions allowed for the selected contract or guide scope.

The boundary works as follows:

- the repo resolves the selected contract or guide
- the repo maps that selection to the approved PageIndex scope
- the repo applies scope policy and tool-surface policy
- the repo admits new PageIndex capabilities only through explicit review and policy approval
- the model performs agentic retrieval only within that approved surface
- the repo captures provenance and enforces final scope and evidence rules
- PageIndex provides the underlying document retrieval, structure, and evidence capabilities

This boundary preserves agentic flexibility while moving product-policy ownership out of the model.

---

## 3. Model-facing tool surface

The model-facing tool surface must be a small repo-owned scoped tool facade, not the raw PageIndex MCP inventory.

The surface should expose only in-scope retrieval actions:

- search or discover within the selected contract or guide scope, where policy permits
- inspect document structure within the selected scope
- fetch page or section evidence within the selected scope

Scope identity should not be a model-controlled input. The model should supply retrieval intent and navigation choices; the repo should bind the selected scope.

Tool outputs should be normalized into evidence-bearing results with stable source identity and provenance, not raw ungoverned MCP payloads.

The purpose of this surface is to preserve model-led tool choice and retrieval sequencing inside the approved boundary, while preventing the model from owning contract scope, scope expansion, or cross-contract behavior.

---

## 4. Control layer responsibilities

The repo-owned control layer sits between the model and PageIndex MCP.

It is responsible for:

- resolving contract or guide selection into a valid product scope
- binding each request or session to that scope
- mapping product-level scope to the corresponding PageIndex scope
- exposing only the retrieval actions allowed for that scope
- ensuring the model cannot supply or replace scope identity directly
- validating tool inputs against scope and policy
- controlling allowed retrieval transitions within scope
- normalizing tool outputs into evidence-bearing results
- attaching stable source identity and provenance to retrieved evidence
- applying reuse boundaries for prior evidence or cached answers
- enforcing final answer rules for scope compliance and evidence sufficiency

This control layer is the architectural owner of product policy at the retrieval boundary.

---

## 5. Scope enforcement points

Scope constraints must be applied at multiple points in the boundary.

### Before tool exposure

Before the model receives any tool surface, the repo must:

- determine whether a valid contract or guide scope is selected
- resolve that selection into repo-owned scope identity
- map that selection to the allowed PageIndex scope
- determine which retrieval actions are permitted for that scope

If no valid scope exists, the system must refuse rather than expose an open retrieval surface.

### At tool input level

Each model tool call must be checked against the selected scope and scope policy.

This includes:

- binding scope from repo-owned state rather than model-supplied inputs
- rejecting attempts to widen scope beyond the approved boundary
- rejecting document references that are not members of the selected scope
- rejecting retrieval actions that are not allowed for the current scope policy

### At tool output level

Tool outputs must be filtered and normalized before they become model-visible evidence.

This includes:

- ensuring results belong to the approved scope
- attaching stable source identity
- attaching page or section provenance
- discarding or withholding out-of-scope results
- converting raw tool results into evidence-bearing normalized outputs

### After answer generation

The final answer must be checked against scope and evidence rules.

This includes:

- ensuring the answer remains within the selected scope
- ensuring the answer is grounded in retrieved evidence
- ensuring refusal behavior when evidence is insufficient within scope
- ensuring reuse does not cross scope boundaries

---

## 6. Provenance and evidence handling

Provenance is a required part of the retrieval boundary, not a presentation detail.

The system must preserve enough information to show and audit:

- which selected contract or guide the answer belongs to
- which source document within that scope supplied evidence
- which page or section supplied evidence
- which retrieval action produced the evidence
- which evidence records were used to support the final answer or refusal

Evidence passed to the model should be normalized, scoped, and attributable.

The model may synthesize the final answer from retrieved evidence, but it must not become the owner of provenance policy. Provenance policy remains repo-owned.

The boundary must support:

- stable evidence identity
- stable document identity
- traceable linkage from answer to evidence
- refusal when the available evidence is insufficient within scope

This supports auditability, safe reuse, and contract-scope correctness.

---

## 7. Required data structures

### Contract/Guide Registry

- product-level contract or guide key
- display label
- status and availability
- stable repo-owned identity

### Selection State

- selected contract or guide key
- request or session binding
- validity state
- comparison mode state, if ever introduced

### Scope Mapping

- selected product key -> approved PageIndex scope
- allowed PageIndex references for that scope, such as single document, document set, or folder scope
- allowed retrieval boundary for the selection

### Scope Policy

- selected product key or scope class
- which retrieval actions are allowed
- whether discovery is allowed or direct lookup only
- whether structure inspection is allowed
- reuse permissions for cached answers or prior evidence
- refusal conditions specific to that scope

### Document Identity Map

- repo-owned document identity
- corresponding PageIndex reference data needed by the MCP boundary
- membership of each document within a contract or guide scope

### Provenance Ledger

- evidence record id
- selected scope id
- source document identity
- page or section locator
- retrieval action that produced the evidence
- stored evidence excerpt or evidence reference

### Answer Provenance Record

- final answer id
- selected scope id
- linked evidence record ids
- refusal status when scope is invalid or evidence is insufficient

These structures are required because contract selection, scope mapping, provenance, and reuse boundaries cannot remain implicit in model behavior.

---

## 8. Refusal conditions

The system must refuse to answer when:

- no valid contract or guide scope is selected
- sufficient evidence cannot be retrieved within the selected scope

The system must also refuse when scope policy requires refusal for the selected scope.

Examples of policy-driven refusal include:

- a retrieval action required by the request is not allowed for that scope
- the available evidence cannot satisfy the provenance or grounding requirements for that scope
- reuse is not permitted for the current scope and sufficient fresh evidence cannot be established within scope

Refusal is a control-layer outcome, not only a prompt preference.

---

## 9. Non-goals / what this boundary does not do

This boundary does not:

- expose the raw PageIndex MCP tool inventory directly to the model
- allow the model to choose contract or guide scope
- allow the model to widen scope beyond repo-approved boundaries
- allow cross-contract mixing unless a future architecture explicitly introduces a comparison mode
- replace document-grounded retrieval with model memory alone
- make PageIndex responsible for end-to-end chat orchestration
- remove agentic retrieval behavior from the model
- automatically expose newly available PageIndex tools or capabilities to the model
- define UI presentation details beyond the provenance and scope data the UI must be able to surface

The purpose of the boundary is not to eliminate model agency. It is to constrain model agency to the approved document scope and policy envelope.

---

## 10. Relationship to other docs in the repo

This document should be read together with:

- `docs/decisions.md`
  - records the approved decision to remain on PageIndex MCP and use policy-constrained agentic retrieval
- `docs/target_architecture.md`
  - defines the target architecture, product goals, and non-negotiable requirements
- `docs/current/current_architecture.md`
  - records the current implemented system
- `docs/current/document_scope_and_identity.md`
  - records the current weaknesses in document identity and scope
- `docs/current/pageindex_integration_modes.md`
  - records the currently implemented PageIndex integration mode and other documented modes
- `docs/current/tool_selection_policy.md`
  - records the current tool-selection behavior that this boundary is intended to replace at the control level
- `docs/current/evaluation_criteria.md`
  - records the current evaluation model and current limits of grounding guarantees

This document is the standing reference for the intended implementation boundary. It should be used whenever retrieval orchestration, scope control, provenance handling, or model-tool responsibilities are changed.

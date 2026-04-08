# Decisions

## Policy-Constrained Agentic Retrieval on PageIndex MCP

Status: Approved

The architecture will remain on PageIndex MCP.

The system will retain agentic tool-based retrieval. PageIndex remains the document engine for document ingestion, processing or transformation, retrieval, structure access, and evidence access. Vercel remains the application shell for UI, streaming UX, hosting, deployment, and operational delivery.

The repo owns:

- product policy
- contract and document identity
- explicit contract or guide selection per request or session
- scope control
- reuse boundaries
- provenance policy

The model may:

- choose tools within approved scope
- sequence retrieval within approved scope
- navigate structure within approved scope
- synthesize the final answer from retrieved evidence

The model may not:

- choose contract scope
- widen scope beyond repo-approved boundaries
- switch contracts or documents without repo approval
- own reuse policy or cross-contract behavior

The system must refuse to answer when:

- no valid contract or guide scope is selected
- sufficient evidence cannot be retrieved within the selected scope

This decision supersedes any implication that PageIndex Chat API or non-agentic retrieval is the default target path.

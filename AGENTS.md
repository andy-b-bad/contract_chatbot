# Repository Guidelines

## Project Structure & Module Organization
This is a small Next.js 16 App Router project. Application code lives under `src/app/`.

- `src/app/page.tsx`: server page entry point and authenticated thread loader
- `src/app/chat-client.tsx`: thin chat UI client
- `src/app/layout.tsx`: shared app shell
- `src/app/globals.css`: global styles
- `src/app/contracts.ts`: local contract content/helpers
- `src/app/api/chat/route.ts`: chat API route and retrieval logic
- `src/app/api/health/supabase/route.ts`: Supabase connectivity health check
- `src/app/login/page.tsx`: login entry point when auth is enabled
- `src/app/auth/callback/route.ts`: Supabase auth callback
- `src/lib/chat-session.ts`: auth/session/thread resolution and turn-persistence orchestration
- `src/lib/chat-persistence.ts`: low-level chat and audit persistence helpers
- `src/lib/retrieval-audit.ts`: retrieval audit collection helpers
- `public/`: static assets such as SVGs
- `docs/`: local reference material used during retrieval work
- Root config: `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`

There is currently no dedicated `test/` or `__tests__/` directory.

---

## Protected Architecture Rules

See `architecture.md` for the full system design. The rules below define which parts of that design are protected from silent change.

### 1. Scope enforcement is server-owned
- Contract scope isolation must be enforced in `src/app/api/chat/route.ts`, not delegated to prompt wording or client-side logic.
- The client may collect and send scope, but the server must remain the final authority on scope validation, message reuse, tool access, and document/page filtering.
- Do not move scope enforcement into `src/app/page.tsx` or rely on the model to self-police scope boundaries.

### 2. `src/app/contracts.ts` is the scope policy source of truth
- `src/app/contracts.ts` remains the canonical location for:
  - allowed scopes
  - scope parsing/normalization
  - search hints
  - document allow rules
  - shared summary page-range rules
- Do not duplicate or redefine scope-policy logic elsewhere unless explicitly approved.
- If a change affects scope identity or retrieval permissions, update `src/app/contracts.ts` first and keep other files consuming that policy rather than re-encoding it.

### 3. No prompt-only safety substitutions
- Do not replace server-side retrieval guardrails with stronger prompt wording.
- Prompts may support the architecture, but they are not a substitute for:
  - tool allow-lists
  - document filtering
  - page-range validation
  - same-scope conversation filtering
  - out-of-scope rejection behavior

### 4. PageIndex access must remain constrained
- Exposed PageIndex MCP tools must stay on an explicit allow-list.
- Broad tool exposure is not allowed by default.
- Shared summary access must remain page-range constrained by selected scope.
- `get_document_structure` for shared summary documents must remain blocked unless explicitly approved.
- Out-of-scope document access must fail closed with structured errors rather than silently returning content.

### 5. Same-scope conversation reuse must be preserved
- Prior messages reused for retrieval or answer generation must be filtered to the currently selected scope.
- Do not reintroduce cross-scope conversational memory within a chat session unless explicitly approved.

### 6. UI is presentation, not policy
- `src/app/chat-client.tsx` should remain a thin UI layer responsible for:
  - scope selection
  - rendering messages
  - rendering retrieval status
  - submitting chat requests
- `src/app/page.tsx` should remain a server entry point responsible for rendering the anonymous flow or loading authenticated thread state before rendering the client UI.
- Do not embed retrieval policy, document permission rules, or safety-critical filtering into the UI.

### 7. Preserve document-grounded answer behavior
- The live answer path must remain grounded in contract material exposed through PageIndex tools.
- Do not introduce fallback answers from general model knowledge.
- Do not add hidden secondary retrieval sources, embeddings stores, databases, or caches that affect answer content unless explicitly approved.

### 8. No silent architecture expansion
The repository currently has:
- optional Supabase-backed auth behind `ENABLE_AUTH`
- a database-backed persistence layer for `chat_threads`, `chat_messages`, and retrieval audit records
- no analytics store
- no background jobs/queues
- no hidden secondary retrieval or answer source
- no broader cross-session memory beyond the persisted same-thread chat history already reused under the existing same-scope rules

Supabase must not become a retrieval source, and retrieval audit records must remain metadata-only rather than a new answer-generation memory source.

Do not add new databases, new auth providers, analytics stores, background jobs/queues, hidden answer sources, or broader memory semantics without explicit approval. If proposed, call it out as an architectural expansion, not a routine refactor.

### 9. Stable user-visible retrieval feedback
- Preserve the transient retrieval-status mechanism that allows the UI to show live retrieval activity such as “Retrieving contract content...”.
- Do not remove or materially degrade this feedback during streaming or refactor work without explicit discussion.

### 10. Logging and trace stability
- Keep API-route logging and trace behavior stable unless the task specifically requires changing it.
- Do not remove useful retrieval/scope diagnostics casually during cleanup or refactor work.
- If log wording must change, mention it explicitly in the summary because downstream debugging may depend on it.

### 11. Prefer local changes over structural rewrites
- Prefer targeted edits and small helpers over broad rewrites, especially in `src/app/api/chat/route.ts`.
- Do not collapse working server-side control logic into abstractions that make retrieval behavior harder to inspect.
- Explicit code is preferred over “cleaner” but more opaque patterns in retrieval and scope enforcement paths.

### 12. Escalation rule for protected changes
If a requested change touches any protected rule above, do not silently implement the behavioural change as a harmless refactor. Instead:
- identify the rule being changed
- explain the behavioural impact
- describe the proposed override clearly in the summary

---

## Build, Test, and Development Commands
- `npm run dev`: start the local Next.js dev server at `http://localhost:3000`
- `npm run build`: create the production build and run TypeScript checks
- `npm run start`: serve the production build
- `npm run lint`: run ESLint with the Next.js config

Run `npm run build` before submitting changes to typed runtime code, especially `src/app/api/chat/route.ts`.

---

## Coding Style & Naming Conventions
Use TypeScript and React function components. Follow the existing style in the repo:

- 2-space indentation
- `camelCase` for variables and functions
- `PascalCase` for React components and type-like entities
- `SCREAMING_SNAKE_CASE` for shared constants such as prompts and allow-lists

Prefer small, local helpers over broad refactors. Keep API-route behavior explicit and log messages stable unless the change requires otherwise.

For retrieval and scope-enforcement code, prefer explicit readable control flow over abstraction. Do not hide document filtering, scope checks, or tool gating behind generic helpers unless there is a clear benefit and no loss of inspectability.

Use ESLint as the baseline style guard.

---

## Testing Guidelines
There is no formal test framework configured yet. For now:

- run `npm run lint`
- run `npm run build`
- manually smoke-test `/api/chat` after route changes

When adding tests later, place them beside the feature or under a top-level `tests/` folder, and name files `*.test.ts` or `*.test.tsx`.

---

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit subjects, for example `Fix chat route tool tracing types` and `Refactor chat route to PageIndex-led MCP retrieval`.

Keep commits focused and descriptive. PRs should include a short summary, affected paths or features, validation performed (`npm run build`, smoke tests, `npm run lint`), and screenshots or SSE/log excerpts when UI or streaming behavior changes.

---

## Security & Configuration Tips
Store secrets in local environment files such as `.env.local`; do not commit API keys.

Changes to `src/app/api/chat/route.ts` must preserve server-enforced document grounding, scope isolation, tool allow-listing, and shared-summary page constraints. These protections must not be weakened into client-side checks or prompt-only instructions.

Avoid exposing raw credentials or unnecessary tool output.

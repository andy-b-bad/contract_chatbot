# Contract Chatbot

This is a Next.js 16 App Router project for contract-scoped, PageIndex-grounded chat over stunt performer agreements. The answer path remains document-grounded through PageIndex MCP tools. Supabase is used only for auth, chat persistence, retrieval observability persistence, and diagnostics.

## Local Setup
Required env vars are expected in `.env.local` and in Vercel:

```bash
DEEPSEEK_API_KEY=
PI_API=
ENABLE_AUTH=false
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is also supported as a fallback if the publishable key is not present.
`ENABLE_AUTH=false` keeps the app in its original anonymous mode. Set `ENABLE_AUTH=true` to activate Supabase auth gating and chat persistence.

Apply the Supabase schema migrations before using persistence:

```sql
\i supabase/migrations/20260409_initial_chat_auth.sql
\i supabase/migrations/20260409_add_retrieval_audits.sql
\i supabase/migrations/20260413_add_audit_observability.sql
\i supabase/migrations/20260414_rename_retrieval_audit_rating_columns.sql
```

## Development
Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

- When `ENABLE_AUTH=false`, the app behaves like the original anonymous chat UI.
- When `ENABLE_AUTH=true`, unauthenticated users are redirected to `/login`, where Supabase email magic-link sign-in is used to create a session.

## Validation
Before submitting changes, run:

```bash
npm run lint
npm run build
```

Manual checks:

- confirm `/` does not redirect and `/api/chat` remains anonymous when `ENABLE_AUTH=false`
- confirm `/login` and magic-link auth only matter when `ENABLE_AUTH=true`
- confirm `/` redirects to `/login` and `/api/chat` returns `401` when signed out and `ENABLE_AUTH=true`
- confirm `/api/health/supabase` reports connectivity and authenticated table access
- confirm chat history survives a page refresh after sending messages

## Structure
Relevant paths:

- `src/app/chat-client.tsx`: authenticated client chat UI
- `src/app/page.tsx`: server page that either renders anonymous chat or loads the current user's persisted chat
- `src/app/api/chat/route.ts`: PageIndex-grounded chat route with optional auth and persistence wrapping
- `src/app/login/page.tsx`: Supabase email sign-in
- `src/lib/chat-persistence.ts`: single-thread chat persistence helpers
- `src/lib/retrieval-audit.ts`: bounded retrieval audit collection for persisted observability records
- `src/lib/audit/excerpt-packet.ts`: shapes bounded excerpt packets from filtered tool results
- `src/lib/audit/usage-cost.ts`: maps provider usage metadata into persisted usage and estimated cost fields
- `proxy.ts`: page-level auth/session gate

## Notes
- Scope enforcement and PageIndex integration remain server-owned in `src/app/api/chat/route.ts` and `src/app/contracts.ts`; document navigation and retrieval semantics remain PageIndex-led.
- Supabase is not queried as a retrieval source.
- Retrieval observability persists bounded audit metadata including usage, estimated cost, and excerpt packets when auth is enabled.
- The live answer path still depends on PageIndex MCP and DeepSeek only.
- Auth and persistence stay dormant until `ENABLE_AUTH=true`.

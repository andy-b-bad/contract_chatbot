# Feature Flags

Current application feature flags found in the codebase:

| Flag | Default | Environment | Purpose |
| --- | --- | --- | --- |
| `ENABLE_AUTH` | disabled | local `.env.local`, Vercel | Turn on Supabase-backed auth gating and per-user chat persistence paths. |
| `ENABLE_ANSWER_VALIDATION_LOGGING` | disabled | local `.env.local`, Vercel | Emit offline validation logs for the final candidate answer. |
| `ENABLE_LOCAL_TRACE_CAPTURE` | disabled | local `.env.local` only | First required gate for local raw answer trace capture. |
| `LOCAL_TRACE_CAPTURE_ALLOWED` | disabled | local `.env.local` only | Second required gate for local raw answer trace capture. |
| `LOCAL_TRACE_CAPTURE_ENDPOINT` | unset | local `.env.local` only | Required loopback POST target for local raw answer trace capture. |

All enabling checks in current code are exact string comparisons to `"true"`. Any other value, including `TRUE`, `1`, `yes`, or an unset variable, is treated as disabled.

## `ENABLE_AUTH`

1. Exact variable name: `ENABLE_AUTH`
2. Accepted enabling value: exactly `"true"` in [`isAuthEnabled()`](../src/lib/supabase/config.ts:7)
3. Default when absent: disabled
4. What enabling changes:
   - `/` stops rendering the anonymous chat directly and requires a Supabase user session before loading the app shell and persisted thread state in [`Home`](../src/app/page.tsx:9)
   - `proxy.ts` starts refreshing Supabase session cookies and redirects signed-out requests from `/` to `/login` in [`proxy()`](../proxy.ts:9)
   - `/api/chat` resolves the caller through Supabase, returns `401` when signed out, and binds chat access to the authenticated user's thread in [`resolveChatSession()`](../src/lib/chat-session.ts:50) and [`POST`](../src/app/api/chat/route.ts:1469)
   - user and assistant messages, plus retrieval audit metadata, are persisted for the authenticated user in [`persistUserTurnIfNeeded()`](../src/lib/chat-session.ts:112) and [`persistAssistantTurnWithAuditIfNeeded()`](../src/lib/chat-session.ts:128)
   - `/login` starts Google OAuth through Supabase via [`LoginForm`](../src/app/login/login-form.tsx:10), and [`/auth/callback`](../src/app/auth/callback/route.ts:4) exchanges the returned auth code for a session
5. What enabling does not change:
   - it does not change retrieval scope enforcement or document grounding; those stay server-owned in `/api/chat`
   - it does not turn Vercel deployment protection on or off; Vercel protection is external platform access control, not app authentication
   - it does not make Supabase a retrieval source
   - it does not leave anonymous chat available on `/` or `/api/chat`; with auth enabled, anonymous users are redirected from `/` and get `401` from `/api/chat`
6. Where to configure:
   - local: `.env.local`
   - deployable: Vercel environment variables
   - this is deployable, not local-only
7. Restart/redeploy required:
   - local: restart the Next.js server after changing it
   - Vercel: redeploy after changing environment variables
8. Dependencies on other flags:
   - no other feature-flag dependency
   - operational dependency: when enabled, Supabase config must also be valid through `NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` in [`getSupabaseUrl()`](../src/lib/supabase/config.ts:11) and [`getSupabasePublishableKey()`](../src/lib/supabase/config.ts:19)
9. Security or operational warnings:
   - this is application auth, not network perimeter protection
   - enabling it without valid Supabase configuration will break auth-dependent paths at runtime
   - current visible sign-in flow is Supabase Google OAuth; the login page remains reachable, but anonymous use of the main chat does not remain available
10. Exact source files/symbols that read it:
   - [`src/lib/supabase/config.ts` `ENABLE_AUTH`, `isAuthEnabled()`](../src/lib/supabase/config.ts:5)
   - [`src/app/page.tsx` `Home`](../src/app/page.tsx:9)
   - [`proxy.ts` `proxy()`](../proxy.ts:9)
   - [`src/lib/chat-session.ts` `resolveChatSession()`](../src/lib/chat-session.ts:50)

## `ENABLE_ANSWER_VALIDATION_LOGGING`

1. Exact variable name: `ENABLE_ANSWER_VALIDATION_LOGGING`
2. Accepted enabling value: exactly `"true"` in [`isAnswerValidationLoggingEnabled()`](../src/lib/evidence/answer-validation-logging.ts:48)
3. Default when absent: disabled
4. What enabling changes:
   - after the candidate answer already exists, `/api/chat` runs the offline validator against the final answer plus canonical evidence in [`POST` on stream finish](../src/app/api/chat/route.ts:1791)
   - when validation reaches a `validated` result, the server emits a log line starting with `[chat] answer-validation ` in [`logAnswerValidationResult()`](../src/lib/evidence/answer-validation-logging.ts:132)
5. What enabling does not change:
   - it is log-only and offline
   - it runs after the candidate answer exists
   - it cannot block, retry, rewrite, suppress, or alter user-visible output
   - it does not change retrieval, scope checks, persistence rules, or model selection
6. Where to configure:
   - local: `.env.local`
   - deployable: Vercel environment variables
   - this is deployable, not local-only
7. Restart/redeploy required:
   - local: restart the Next.js server after changing it
   - Vercel: redeploy after changing environment variables
8. Dependencies on other flags:
   - none
9. Security or operational warnings:
   - logs may contain structured defect metadata derived from user prompts, answers, and cited evidence
   - use normal log retention and access controls
10. Exact source files/symbols that read it:
   - [`src/lib/evidence/answer-validation-logging.ts` `isAnswerValidationLoggingEnabled()`](../src/lib/evidence/answer-validation-logging.ts:48)
   - [`src/app/api/chat/route.ts` stream `onFinish`](../src/app/api/chat/route.ts:1791)

To turn it off cleanly, remove the variable or set `ENABLE_ANSWER_VALIDATION_LOGGING=false`, then restart locally or redeploy on Vercel.

## Local trace capture

All three trace variables are required in practice:

- `ENABLE_LOCAL_TRACE_CAPTURE` must be exactly `"true"`
- `LOCAL_TRACE_CAPTURE_ALLOWED` must be exactly `"true"`
- `LOCAL_TRACE_CAPTURE_ENDPOINT` must be set to a valid permitted loopback URL such as `http://127.0.0.1:3000/api/local-traces`

If any one of those conditions is missing, trace capture is skipped.

### `ENABLE_LOCAL_TRACE_CAPTURE`

1. Exact variable name: `ENABLE_LOCAL_TRACE_CAPTURE`
2. Accepted enabling value: exactly `"true"` in [`isLocalTraceCaptureEnabled()`](../src/lib/evidence/local-answer-trace.ts:94)
3. Default when absent: disabled
4. What enabling changes:
   - nothing by itself; it is only one of the required gates for local trace capture
5. What enabling does not change:
   - it does not capture traces unless `LOCAL_TRACE_CAPTURE_ALLOWED` is also exactly `"true"` and the endpoint is valid
   - it does not affect user-visible answers, retrieval, or persistence
6. Where to configure:
   - local: `.env.local`
   - Vercel: do not use
   - local-only, not deployable
7. Restart/redeploy required:
   - local: restart the Next.js server after changing it
   - Vercel: not applicable; do not deploy this flag
8. Dependencies on other flags:
   - requires `LOCAL_TRACE_CAPTURE_ALLOWED`
   - requires `LOCAL_TRACE_CAPTURE_ENDPOINT`
9. Security or operational warnings:
   - do not enable this on an externally reachable deployment
10. Exact source files/symbols that read it:
   - [`src/lib/evidence/local-answer-trace.ts` `isLocalTraceCaptureEnabled()`](../src/lib/evidence/local-answer-trace.ts:94)

### `LOCAL_TRACE_CAPTURE_ALLOWED`

1. Exact variable name: `LOCAL_TRACE_CAPTURE_ALLOWED`
2. Accepted enabling value: exactly `"true"` in [`isLocalTraceCaptureEnabled()`](../src/lib/evidence/local-answer-trace.ts:94)
3. Default when absent: disabled
4. What enabling changes:
   - nothing by itself; it is the second required gate for local trace capture
5. What enabling does not change:
   - it does not capture traces unless `ENABLE_LOCAL_TRACE_CAPTURE` is also exactly `"true"` and the endpoint is valid
   - it does not affect user-visible answers, retrieval, or persistence
6. Where to configure:
   - local: `.env.local`
   - Vercel: do not use
   - local-only, not deployable
7. Restart/redeploy required:
   - local: restart the Next.js server after changing it
   - Vercel: not applicable; do not deploy this flag
8. Dependencies on other flags:
   - requires `ENABLE_LOCAL_TRACE_CAPTURE`
   - requires `LOCAL_TRACE_CAPTURE_ENDPOINT`
9. Security or operational warnings:
   - treat this as an explicit local safety acknowledgement
   - do not enable this on an externally reachable deployment
10. Exact source files/symbols that read it:
   - [`src/lib/evidence/local-answer-trace.ts` `isLocalTraceCaptureEnabled()`](../src/lib/evidence/local-answer-trace.ts:94)

### `LOCAL_TRACE_CAPTURE_ENDPOINT`

1. Exact variable name: `LOCAL_TRACE_CAPTURE_ENDPOINT`
2. Accepted enabling value: not a boolean; it must parse to an allowed loopback `http` URL in [`getLocalTraceCaptureEndpoint()`](../src/lib/evidence/local-answer-trace.ts:103)
3. Default when absent: unset, therefore invalid and skipped
4. What enabling changes:
   - when the two boolean gates are also enabled, `/api/chat` POSTs the raw local trace payload to this endpoint in [`sendLocalAnswerTrace()`](../src/lib/evidence/local-answer-trace.ts:286)
   - the receiving route validates and writes trace files beneath `.local/traces/` in [`writeRawLocalAnswerTrace()`](../src/lib/evidence/local-trace-file-writer.ts:319)
5. What enabling does not change:
   - it does not allow non-loopback hosts
   - it does not make capture synchronous with user-visible output generation; it runs after the answer exists during completion handling
   - it does not change the answer contents
6. Where to configure:
   - local: `.env.local`
   - Vercel: do not use
   - local-only, not deployable
7. Restart/redeploy required:
   - local: restart the Next.js server after changing it
   - Vercel: not applicable; do not deploy this flag
8. Dependencies on other flags:
   - requires `ENABLE_LOCAL_TRACE_CAPTURE`
   - requires `LOCAL_TRACE_CAPTURE_ALLOWED`
9. Security or operational warnings:
   - the endpoint must be an exact permitted loopback URL, for example `http://127.0.0.1:3000/api/local-traces`
   - accepted forms are restricted to `http`, a non-empty port, no username, no password, no query string, no hash, path exactly `/api/local-traces`, and hostname limited to `127.0.0.1`, `localhost`, or `::1` in [`getLocalTraceCaptureEndpoint()`](../src/lib/evidence/local-answer-trace.ts:120)
   - do not enable this on an externally reachable deployment
10. Exact source files/symbols that read it:
   - [`src/lib/evidence/local-answer-trace.ts` `getLocalTraceCaptureEndpoint()`](../src/lib/evidence/local-answer-trace.ts:103)

Operational notes for local trace capture:

- raw traces are written beneath `.local/traces/` in [`src/lib/evidence/local-trace-file-writer.ts`](../src/lib/evidence/local-trace-file-writer.ts:11)
- raw traces may contain user query and answer text in the `request.userQuery` and `response.finalAnswer` fields
- `.local/traces/` is gitignored in [`.gitignore`](../.gitignore:44)
- raw traces must be manually reviewed before fixture promotion
- this must not be enabled on an externally reachable deployment
- trace capture happens after the candidate answer exists and may add up to the bounded sender timeout to completion handling; the current bound is `1200ms` in [`LOCAL_TRACE_SENDER_TIMEOUT_MS`](../src/lib/evidence/local-answer-trace.ts:13)
- send failures remain log-only because `/api/chat` catches them and logs `[chat] local-trace-capture:error` in [`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts:1844)
- invalid endpoint config is skipped with the log line `[chat] local-trace-capture:skipped invalid-endpoint-config` in [`sendLocalAnswerTrace()`](../src/lib/evidence/local-answer-trace.ts:299)

To disable trace capture cleanly, remove all three trace variables or set:

```bash
ENABLE_LOCAL_TRACE_CAPTURE=false
LOCAL_TRACE_CAPTURE_ALLOWED=false
LOCAL_TRACE_CAPTURE_ENDPOINT=
```

## Local development

Example `.env.local` with non-secret values only:

```bash
ENABLE_AUTH=false
ENABLE_ANSWER_VALIDATION_LOGGING=false
ENABLE_LOCAL_TRACE_CAPTURE=false
LOCAL_TRACE_CAPTURE_ALLOWED=false
LOCAL_TRACE_CAPTURE_ENDPOINT=http://127.0.0.1:3000/api/local-traces
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-placeholder
```

Notes:

- keep the trace endpoint unset or false-gated unless you are intentionally capturing local traces
- enabling auth locally also requires valid Supabase project configuration; placeholder values are not sufficient for a working auth flow

## Vercel

Add or remove deployable flags in the Vercel project environment settings, then redeploy the application.

Suitable for Vercel:

- `ENABLE_AUTH`
- `ENABLE_ANSWER_VALIDATION_LOGGING`
- required Supabase connection variables when auth is enabled

Do not set on Vercel:

- `ENABLE_LOCAL_TRACE_CAPTURE`
- `LOCAL_TRACE_CAPTURE_ALLOWED`
- `LOCAL_TRACE_CAPTURE_ENDPOINT`

Those three trace settings are local-only and unsuitable for any externally reachable deployment.

Vercel deployment protection, if used, is separate from `ENABLE_AUTH`. Deployment protection controls access to the deployment itself. `ENABLE_AUTH` controls the application's own Supabase sign-in and authenticated chat behavior.

## Safe reset

Minimal disabled configuration:

```bash
ENABLE_AUTH=false
ENABLE_ANSWER_VALIDATION_LOGGING=false
ENABLE_LOCAL_TRACE_CAPTURE=false
LOCAL_TRACE_CAPTURE_ALLOWED=false
LOCAL_TRACE_CAPTURE_ENDPOINT=
```

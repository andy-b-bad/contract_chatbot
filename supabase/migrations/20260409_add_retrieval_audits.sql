create table if not exists public.retrieval_audits (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  chat_message_id uuid not null references public.chat_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (
    scope in (
      'pact-cinema',
      'pact-tv-svod',
      'bbc-tv',
      'itv-tv',
      'commercial',
      'mocap'
    )
  ),
  normalized_user_query text not null,
  tool_names text[] not null default '{}'::text[],
  document_names text[] not null default '{}'::text[],
  page_refs text[] not null default '{}'::text[],
  trace_snippets text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  unique (chat_message_id)
);

create index if not exists retrieval_audits_thread_created_idx
  on public.retrieval_audits (thread_id, created_at, id);

create index if not exists retrieval_audits_user_created_idx
  on public.retrieval_audits (user_id, created_at);

alter table public.retrieval_audits enable row level security;

create policy "retrieval_audits_select_own"
  on public.retrieval_audits
  for select
  using (auth.uid() = user_id);

create policy "retrieval_audits_insert_own"
  on public.retrieval_audits
  for insert
  with check (auth.uid() = user_id);

create policy "retrieval_audits_update_own"
  on public.retrieval_audits
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "retrieval_audits_delete_own"
  on public.retrieval_audits
  for delete
  using (auth.uid() = user_id);

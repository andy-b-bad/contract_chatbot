create extension if not exists pgcrypto;

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists chat_threads_user_id_idx
  on public.chat_threads (user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ui_message_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
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
  created_at timestamptz not null default now(),
  unique (thread_id, ui_message_id)
);

create index if not exists chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at, id);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at);

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

create policy "chat_threads_select_own"
  on public.chat_threads
  for select
  using (auth.uid() = user_id);

create policy "chat_threads_insert_own"
  on public.chat_threads
  for insert
  with check (auth.uid() = user_id);

create policy "chat_threads_update_own"
  on public.chat_threads
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "chat_threads_delete_own"
  on public.chat_threads
  for delete
  using (auth.uid() = user_id);

create policy "chat_messages_select_own"
  on public.chat_messages
  for select
  using (auth.uid() = user_id);

create policy "chat_messages_insert_own"
  on public.chat_messages
  for insert
  with check (auth.uid() = user_id);

create policy "chat_messages_update_own"
  on public.chat_messages
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "chat_messages_delete_own"
  on public.chat_messages
  for delete
  using (auth.uid() = user_id);

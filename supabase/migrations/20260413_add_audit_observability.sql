alter table public.retrieval_audits
  add column quality_score smallint,
  add column rated_at timestamptz,
  add column provider text,
  add column model text,
  add column provider_request_id text,
  add column provider_response_id text,
  add column prompt_tokens integer,
  add column completion_tokens integer,
  add column total_tokens integer,
  add column prompt_cache_hit_tokens integer,
  add column prompt_cache_miss_tokens integer,
  add column reasoning_tokens integer,
  add column provider_usage_json jsonb,
  add column estimated_cost_usd numeric,
  add column pricing_version text;

alter table public.retrieval_audits
  add constraint retrieval_audits_quality_score_check
  check (quality_score between 1 and 3);

create table public.retrieval_audit_sources (
  id uuid primary key default gen_random_uuid(),
  retrieval_audit_id uuid not null references public.retrieval_audits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  excerpt_packet_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (retrieval_audit_id)
);

alter table public.retrieval_audit_sources enable row level security;

create policy "retrieval_audit_sources_select_own"
  on public.retrieval_audit_sources
  for select
  using (auth.uid() = user_id);

create policy "retrieval_audit_sources_insert_own"
  on public.retrieval_audit_sources
  for insert
  with check (auth.uid() = user_id);

create policy "retrieval_audit_sources_update_own"
  on public.retrieval_audit_sources
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "retrieval_audit_sources_delete_own"
  on public.retrieval_audit_sources
  for delete
  using (auth.uid() = user_id);

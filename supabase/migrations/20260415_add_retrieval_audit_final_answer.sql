alter table public.retrieval_audits
  add column if not exists final_answer text;

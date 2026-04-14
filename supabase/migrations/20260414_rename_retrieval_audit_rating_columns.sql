alter table public.retrieval_audits
  rename column quality_score to user_rating;

alter table public.retrieval_audits
  rename column rated_at to user_rated_at;

alter table public.retrieval_audits
  rename constraint retrieval_audits_quality_score_check
  to retrieval_audits_user_rating_check;

-- Jarvis: allow the "create" kind in user_lexicon (appointment/task preference learning)
-- Run once in the Supabase SQL editor. Safe to re-run.
alter table user_lexicon drop constraint if exists user_lexicon_kind_check;
alter table user_lexicon add constraint user_lexicon_kind_check
  check (kind in ('category','reminder','location','create'));

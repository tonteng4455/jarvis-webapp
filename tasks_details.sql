-- Task details (run once in the Supabase SQL editor — safe to run again)
--   details  free text under the task name; same format as a note body ("- ", "[ ] ", "1. " lines)
alter table tasks add column if not exists details text;

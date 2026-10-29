-- file_rename.sql — rename a file / describe it, so it can be found by typing (in the LINE bot and on the Files page).
-- Run once in Supabase → SQL editor (safe to run again).
alter table user_files add column if not exists original_name text;   -- the very first name (kept, still searchable after a rename)
alter table user_files add column if not exists description   text;   -- an optional description (searchable too)

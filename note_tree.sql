-- note_tree.sql — notes inside notes (like Notion): every note may have sub-notes, to any depth.
-- Run once per Supabase project (Jarvis and Friday each have their own). Safe to run again.
-- Existing notes are untouched: parent_id stays empty, so they are all top-level notes.
alter table notes add column if not exists parent_id bigint references notes(id) on delete set null;   -- the note this one sits under (null = top level)
create index if not exists notes_parent_idx on notes (user_id, parent_id);
-- If a note is deleted for good by anything that does not know about sub-notes (the LINE bot), its sub-notes simply move to the top level.

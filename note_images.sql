-- note_images.sql — the "image library": every picture of a note (photo or drawing) gets a row in user_files, so the Files page and
-- the LINE bot can find it, and it can be kept after it leaves a note.
-- Run once in Supabase → SQL editor (safe to run again).
alter table user_files add column if not exists source  text not null default 'chat';   -- 'chat' (sent to the bot) | 'note' (made in a note)
alter table user_files add column if not exists note_id uuid;                            -- the note it is in now (null = in the library only)
create index if not exists user_files_note on user_files (note_id) where note_id is not null;
create index if not exists user_files_user_source on user_files (user_id, source);

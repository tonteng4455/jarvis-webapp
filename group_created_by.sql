-- Group spaces in the web app show WHO added a note / task / appointment.
-- Run once in the Supabase SQL editor (the bot and the web app keep working without it, they just do not show names).
alter table public.notes           add column if not exists created_by text;
alter table public.tasks           add column if not exists created_by text;
alter table public.calendar_events add column if not exists created_by text;

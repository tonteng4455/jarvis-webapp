-- tasks_done_at.sql — remember WHEN a task was marked done (shown as "เสร็จเมื่อ …" in the web app).
-- Run once per Supabase project (Jarvis and Friday each have their own). Safe to run again.
-- A trigger sets the time whenever is_done turns true — whoever does it (web app, LINE bot, LIFF) — and clears it when the task is re-opened.
alter table tasks add column if not exists done_at timestamptz;

create or replace function touch_done_at() returns trigger language plpgsql as $$
begin
  if new.is_done is true and coalesce(old.is_done, false) is not true then
    new.done_at := now();
  elsif new.is_done is not true then
    new.done_at := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_touch_done_at on tasks;
create trigger tasks_touch_done_at before update on tasks for each row execute function touch_done_at();

-- tasks that are already done keep an empty done_at (nobody recorded when); only new completions get a time.

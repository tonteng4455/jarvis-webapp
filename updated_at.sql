-- updated_at.sql — "last changed" time for tasks, appointments, expenses and files, so the web app can list the
-- most recently edited first (notes already have it). Run once in the Supabase SQL editor (safe to run again).
-- Until it has been run the web app simply uses the time each item was made.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  -- only a change a person would call an edit moves the stamp: the bot's own bookkeeping columns (Google ids, reminder state) do not
  if (to_jsonb(new) - 'updated_at' - 'google_event_id' - 'calendar_id' - 'remind_state' - 'reminded_at' - 'reminder_sent')
     is distinct from (to_jsonb(old) - 'updated_at' - 'google_event_id' - 'calendar_id' - 'remind_state' - 'reminded_at' - 'reminder_sent') then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tasks', 'calendar_events', 'expenses', 'user_files'] loop
    execute format('alter table %I add column if not exists updated_at timestamptz', t);
    execute format('update %I set updated_at = created_at where updated_at is null', t);          -- (before the trigger exists, so it keeps the original time)
    execute format('alter table %I alter column updated_at set default now()', t);
    execute format('drop trigger if exists %I on %I', t || '_touch_updated_at', t);
    execute format('create trigger %I before update on %I for each row execute function touch_updated_at()', t || '_touch_updated_at', t);
  end loop;
end $$;

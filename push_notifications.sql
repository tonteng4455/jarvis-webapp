-- Web Push reminders (run once in the Supabase SQL editor — safe to run again)

-- one row per browser/phone that turned notifications on
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

-- per-user settings: {"lead":30,"atDue":true,"morning":true,"morningTime":"08:00","quietFrom":"22:00","quietTo":"07:00"}
alter table users add column if not exists push_prefs jsonb;
-- the last day the morning summary push was sent
alter table users add column if not exists last_push_morning date;
-- what was already announced for a task: {"lead":"<due_at>","due":"<due_at>","day":"YYYY-MM-DD"}
alter table tasks add column if not exists remind_state jsonb;

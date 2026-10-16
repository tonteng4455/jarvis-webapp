-- Task due date/time  (run once in the Supabase SQL editor — safe to run again)
--   due_at       the moment the task is due (timestamptz). With no time of day: 23:59 Thai time.
--   due_all_day  true when only a date was given (shown without a time)
alter table tasks add column if not exists due_at timestamptz;
alter table tasks add column if not exists due_all_day boolean not null default false;
create index if not exists tasks_user_due_idx on tasks (user_id, due_at) where is_done = false and due_at is not null;

-- Once a day the LINE bot adds "งานครบกำหนด" to its FIRST reply; this remembers the last day it did so.
alter table users add column if not exists last_digest_date date;

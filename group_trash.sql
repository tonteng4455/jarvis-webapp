-- Group spaces in the web app (run once in the Supabase SQL editor — safe to run again; all of it is optional)

-- 1) Trash: a deleted note / task / appointment of a group is kept here for 30 days and can be restored from the web app
create table if not exists group_trash (
  id          uuid primary key default gen_random_uuid(),
  group_id    text not null,
  table_name  text not null,                 -- notes | tasks | calendar_events
  row_id      text not null,
  row_data    jsonb not null,                -- the whole row as it was
  deleted_by  text,                          -- LINE id of the person who deleted it (when known)
  deleted_at  timestamptz not null default now()
);
create index if not exists group_trash_group_idx on group_trash (group_id, deleted_at desc);

-- 2) Group reminders (Web Push): who in which group switched them on, and what was already sent
create table if not exists group_push_optin (
  group_id    text not null,
  user_id     text not null,
  created_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists group_push_log (
  key         text primary key,              -- "<item>|<person>": claimed before sending, so nothing is sent twice
  created_at  timestamptz not null default now()
);

-- 3) "Someone else edited this note": the web app remembers who saved a note last, so two people editing at once are told instead of one overwriting the other
alter table notes add column if not exists updated_by text;

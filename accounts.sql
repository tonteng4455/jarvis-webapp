-- accounts.sql — sign in with LINE *or* Google as the same person, without losing data.
-- Run once in Supabase → SQL editor (safe to run again).
--
-- Every table keeps using ONE key per person (users.line_user_id / <table>.user_id), exactly as now:
--   · a LINE person's key is their LINE user id (so the LINE bot keeps working untouched),
--   · a person who only ever signed in with Google gets the key  google:<google id>.
-- user_identities says which sign-in belongs to which key (a Google sign-in can point at a LINE key).

create table if not exists user_identities (
  provider    text not null,                 -- 'google'
  subject     text not null,                 -- the provider's own id for the person
  user_id     text not null,                 -- the key above
  label       text,                          -- what to show (e-mail address)
  created_at  timestamptz not null default now(),
  primary key (provider, subject)
);
create index if not exists user_identities_user on user_identities (user_id);

-- Move everything of account p_from into account p_to (one transaction: all or nothing).
-- Rows that would collide (the same taught word, the same Google connection …) keep p_to's copy.
create or replace function merge_accounts(p_from text, p_to text) returns void
language plpgsql as $$
declare
  t text;
  r record;
  c record;
  tables text[] := array['notes','tasks','calendar_events','expenses','user_files','user_lexicon','google_accounts','contacts',
                         'push_subscriptions','user_states','undo_snapshots','pending_texts','ai_usage','bot_messages','intent_logs'];
begin
  if p_from is null or p_to is null or p_from = p_to then return; end if;

  -- the person row of p_to must exist first (other tables may point at it)
  if not exists (select 1 from users where line_user_id = p_to) then
    insert into users select (jsonb_populate_record(null::users, to_jsonb(f) || jsonb_build_object('line_user_id', p_to))).*
      from users f where f.line_user_id = p_from;
  end if;

  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'user_id') then continue; end if;
    begin
      execute format('update %I set user_id = $1 where user_id = $2', t) using p_to, p_from;
    exception when unique_violation then
      for r in execute format('select ctid::text as c from %I where user_id = $1', t) using p_from loop
        begin
          execute format('update %I set user_id = $1 where ctid = $2::tid', t) using p_to, r.c;
        exception when unique_violation then
          execute format('delete from %I where ctid = $1::tid', t) using r.c;
        end;
      end loop;
    end;
  end loop;

  -- the person row: fill what p_to is missing from p_from, add up the storage used
  for c in select column_name from information_schema.columns
            where table_schema = 'public' and table_name = 'users' and column_name not in ('line_user_id', 'used_storage_bytes', 'created_at') loop
    execute format('update users t set %1$I = f.%1$I from users f where t.line_user_id = $1 and f.line_user_id = $2 and t.%1$I is null and f.%1$I is not null', c.column_name) using p_to, p_from;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'used_storage_bytes') then
    update users t set used_storage_bytes = coalesce(t.used_storage_bytes, 0) + coalesce(f.used_storage_bytes, 0)
      from users f where t.line_user_id = p_to and f.line_user_id = p_from;
  end if;
  delete from users where line_user_id = p_from;

  update user_identities set user_id = p_to where user_id = p_from;
end $$;

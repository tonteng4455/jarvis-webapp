-- Card colour of the LINE bot's replies, chosen per user (run once in the Supabase SQL editor — safe to run again)
--   card_theme  a preset key (teal, ocean, sunset, rose, violet, forest, slate) or a custom colour like '#FF6600'; null = default
alter table users add column if not exists card_theme text;

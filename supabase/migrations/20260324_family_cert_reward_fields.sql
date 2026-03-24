alter table if exists public.family_certifications
  add column if not exists reward_points integer not null default 0,
  add column if not exists rewarded_at timestamptz,
  add column if not exists reward_message text;

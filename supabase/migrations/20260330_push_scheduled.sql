-- 예약 푸시 알림 테이블
create table if not exists public.push_scheduled (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  url text not null default './index.html#community',
  target_type text not null default 'all', -- 'all' | 'no_workout'
  scheduled_at timestamptz not null,
  status text not null default 'pending', -- 'pending' | 'sent' | 'cancelled'
  sent_at timestamptz,
  sent_count integer,
  failed_count integer,
  created_at timestamptz not null default now()
);

create index if not exists push_scheduled_status_idx
  on public.push_scheduled (status)
  where status = 'pending';

create index if not exists push_scheduled_scheduled_at_idx
  on public.push_scheduled (scheduled_at);

alter table public.push_scheduled disable row level security;

grant select, insert, update, delete on public.push_scheduled to anon, authenticated, service_role;

-- pg_cron 확장 활성화 (Supabase에서 이미 활성화되어 있을 수 있음)
create extension if not exists pg_cron;

-- 1분마다 예약 발송 Edge Function 호출
-- (Supabase 대시보드 > Database > Cron Jobs 에서 직접 등록하거나 아래 SQL 실행)
-- select cron.schedule(
--   'send-scheduled-push',
--   '* * * * *',
--   $$
--   select net.http_post(
--     url := current_setting('app.supabase_url') || '/functions/v1/send-push-scheduled',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || current_setting('app.service_role_key')
--     ),
--     body := '{}'::jsonb
--   ) as request_id;
--   $$
-- );

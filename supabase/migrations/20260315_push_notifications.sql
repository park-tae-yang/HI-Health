create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  device_id text,
  emp_id text,
  user_name text,
  subscription jsonb not null,
  enabled boolean not null default true,
  permission text default 'default',
  platform text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists push_subscriptions_endpoint_key
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_device_id_idx
  on public.push_subscriptions (device_id);

create index if not exists push_subscriptions_emp_id_idx
  on public.push_subscriptions (emp_id);

create index if not exists push_subscriptions_enabled_idx
  on public.push_subscriptions (enabled)
  where enabled = true;

alter table public.push_subscriptions disable row level security;

grant select, insert, update on public.push_subscriptions to anon, authenticated, service_role;

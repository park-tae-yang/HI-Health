create table if not exists public.user_client_settings (
  emp_id text primary key,
  settings jsonb not null default '{}'::jsonb,
  last_device_id text,
  updated_at timestamptz not null default now()
);

alter table public.user_client_settings
  add column if not exists emp_id text,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists last_device_id text,
  add column if not exists updated_at timestamptz not null default now();

update public.user_client_settings
set settings = '{}'::jsonb
where settings is null;

update public.user_client_settings
set updated_at = now()
where updated_at is null;

alter table public.user_client_settings
  alter column emp_id set not null,
  alter column settings set default '{}'::jsonb,
  alter column settings set not null;

delete from public.user_client_settings a
using public.user_client_settings b
where a.emp_id = b.emp_id
  and a.ctid < b.ctid;

create unique index if not exists user_client_settings_emp_id_key
  on public.user_client_settings (emp_id);

alter table public.user_client_settings disable row level security;

grant select, insert, update, delete on public.user_client_settings to anon, authenticated, service_role;

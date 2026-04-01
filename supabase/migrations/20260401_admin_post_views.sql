create table if not exists public.admin_post_views (
  id text primary key,
  content_id text not null,
  device_id text not null,
  emp_id text null,
  viewed_at timestamptz not null default now()
);

create index if not exists admin_post_views_content_id_idx
  on public.admin_post_views (content_id, viewed_at desc);

create index if not exists admin_post_views_device_id_idx
  on public.admin_post_views (device_id);

create index if not exists admin_post_views_emp_id_idx
  on public.admin_post_views (emp_id);

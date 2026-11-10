alter table public.hdj_leads add column if not exists status_admin text not null default 'novo';
alter table public.hdj_leads add column if not exists notas text;

create table if not exists public.hdj_config (
  id smallint primary key default 1 check (id = 1),
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
insert into public.hdj_config (id) values (1) on conflict (id) do nothing;

alter table public.hdj_config enable row level security;
revoke all on public.hdj_config from anon, authenticated;

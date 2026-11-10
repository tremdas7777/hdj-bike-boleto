create table if not exists public.hdj_sessoes (
  sessao text primary key,
  criado_em timestamptz not null default now(),
  visto_em timestamptz not null default now(),
  path text,
  referrer text,
  device text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  src text,
  sck text,
  chat boolean not null default false,
  lead_id uuid
);
create index if not exists hdj_sessoes_visto_idx on public.hdj_sessoes (visto_em desc);
create index if not exists hdj_sessoes_criado_idx on public.hdj_sessoes (criado_em desc);

alter table public.hdj_leads add column if not exists utm_source text;
alter table public.hdj_leads add column if not exists utm_medium text;
alter table public.hdj_leads add column if not exists utm_campaign text;
alter table public.hdj_leads add column if not exists utm_content text;

create table if not exists public.hdj_private (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.hdj_sessoes enable row level security;
alter table public.hdj_private enable row level security;
revoke all on public.hdj_sessoes, public.hdj_private from anon, authenticated;

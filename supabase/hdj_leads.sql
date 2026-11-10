create table if not exists public.hdj_leads (
  id uuid primary key,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  etapa text not null default 'iniciado',
  primeiro_nome text,
  nome text,
  cpf text,
  email text,
  telefone text,
  entrada numeric(10,2),
  parcela numeric(10,2),
  dia_vencimento smallint,
  cidade text,
  uf text,
  pedido text,
  dados jsonb not null default '{}'::jsonb
);

create index if not exists hdj_leads_criado_em_idx on public.hdj_leads (criado_em desc);
create index if not exists hdj_leads_etapa_idx on public.hdj_leads (etapa);
create index if not exists hdj_leads_cpf_idx on public.hdj_leads (cpf);

alter table public.hdj_leads enable row level security;
revoke all on public.hdj_leads from anon, authenticated;

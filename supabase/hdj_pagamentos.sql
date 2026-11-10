-- Cobranças de Pix da adesão (uma por pedido).
create table if not exists public.hdj_pagamentos (
  pedido text primary key,
  lead_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  valor numeric(10,2) not null,
  mp_id text,
  status text not null default 'pendente',
  copiaecola text,
  qr text,
  ticket text,
  expira_em timestamptz,
  pago_em timestamptz,
  avisado boolean not null default false
);

create index if not exists hdj_pagamentos_status_idx on public.hdj_pagamentos (status);
create index if not exists hdj_pagamentos_mp_id_idx on public.hdj_pagamentos (mp_id);

alter table public.hdj_pagamentos enable row level security;
revoke all on public.hdj_pagamentos from anon, authenticated;

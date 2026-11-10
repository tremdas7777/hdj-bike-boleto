-- Cobranças de Pix da adesão (uma por pedido).
-- gateway_id = hash da transação na IronPay.
create table if not exists public.hdj_pagamentos (
  pedido text primary key,
  lead_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  valor numeric(10,2) not null,
  gateway text not null default 'ironpay',
  gateway_id text,
  status text not null default 'pendente',
  copiaecola text,
  qr text,
  ticket text,
  expira_em timestamptz,
  pago_em timestamptz,
  avisado boolean not null default false
);

-- Quem já rodou a versão anterior (com mp_id) só precisa renomear a coluna:
-- alter table public.hdj_pagamentos rename column mp_id to gateway_id;
-- alter table public.hdj_pagamentos add column if not exists gateway text not null default 'ironpay';

create index if not exists hdj_pagamentos_status_idx on public.hdj_pagamentos (status);
create index if not exists hdj_pagamentos_gateway_id_idx on public.hdj_pagamentos (gateway_id);
alter table public.hdj_pagamentos enable row level security;
revoke all on public.hdj_pagamentos from anon, authenticated;

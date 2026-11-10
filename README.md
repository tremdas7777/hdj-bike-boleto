# Rastro · HDJ GT-V8

Loja de página única para vender a moto elétrica HDJ GT-V8 com entrada no Pix e saldo em boletos mensais. O pedido é fechado dentro de um chat com a atendente virtual: condições, cadastro, contrato com aceite, endereço e pagamento da adesão.

Site estático (`index.html`, `app.js`, `style.css`) + funções serverless em `/api` + Supabase como banco. Deploy na Vercel.

## Como rodar

Site puro, sem build:

```bash
python3 -m http.server 5199
# http://localhost:5199
```

Para o fluxo completo (chat, banco, Pix) é preciso publicar na Vercel com as variáveis de ambiente abaixo, ou rodar `vercel dev`.

## Variáveis de ambiente (Vercel › Settings › Environment Variables)

| Variável | Obrigatória | Para que serve |
| --- | --- | --- |
| `SUPABASE_URL` | sim | Endereço do projeto Supabase (`https://xxxx.supabase.co`). |
| `SUPABASE_SECRET_KEY` | sim | Chave `service_role` (só no servidor, nunca no navegador). |
| `ADMIN_PASSWORD` | sim | Senha de entrada do painel `/admin`. |
| `MP_ACCESS_TOKEN` | não | Access token do Mercado Pago. Sem ele, o Pix automático fica desligado e o pedido cai no atendimento manual. |
| `PUBLIC_URL` | não | URL pública do site (`https://seusite.com`), usada no webhook do Pix. Se vazio, usa o host da requisição. |
| `PIX_ATIVO` | não | Legado: use `1` apenas para forçar o envio de “aguardando pagamento” à UTMify sem token do Mercado Pago. |

O token do Mercado Pago também pode ser colado pelo painel (`/admin › Configurações › Pagamento no Pix`), sem variável de ambiente.

## Banco (Supabase › SQL Editor)

Rode os arquivos, nesta ordem:

1. `supabase/hdj_admin.sql` — configuração da loja e segredos do painel
2. `supabase/hdj_leads.sql` — pedidos e clientes
3. `supabase/hdj_live.sql` — visitas ao vivo
4. `supabase/hdj_pagamentos.sql` — cobranças de Pix da adesão

## Painel `/admin`

Senha definida em `ADMIN_PASSWORD`. Seções: visão geral, clientes, abandonos, tráfego ao vivo e configurações.

Em **Configurações** ficam:

- **Condições da oferta** — preço, boletos, entradas, vencimentos, frete, prazo e juros.
- **Loja e moto** — nome da loja, atendente, WhatsApp da loja e ficha técnica.
- **Dados da empresa** — razão social, CNPJ, endereço, e-mail e telefone. Vão para o contrato e o rodapé.
- **Pagamento no Pix** — access token do Mercado Pago e teste de conexão.
- **UTMify** e **Avisos no Telegram** — pixels, conversões e alertas de cadastro/Pix.

## Pagamento no Pix

1. Gere o access token de produção em Mercado Pago › Seu negócio › Configurações › Credenciais.
2. Cole em `/admin › Configurações › Pagamento no Pix` e clique em **Testar conexão**.
3. Cadastre o webhook no Mercado Pago apontando para `https://SEU-SITE/api/webhook` (evento `payment`).

Fluxo: o cliente confirma o endereço → `POST /api/pix` cria a cobrança e devolve QR Code + copia e cola (vale por 1 hora) → o site consulta `GET /api/pix?pedido=...` a cada 5 segundos → quando o Mercado Pago aprova, o pedido vira `pago` (também pelo webhook, que funciona mesmo com a aba fechada).

**Sem token configurado** a loja não trava: o pedido é registrado, o cliente recebe o resumo e um botão de WhatsApp para a equipe mandar o Pix manualmente.

## Estrutura

```
index.html          página de vendas
app.js              chat, funil, contrato, Pix
style.css           estilos do site
config.js           valores padrão (o /admin sobrescreve via /api/config.js)
store.js            cópia local do pedido + envio para /api/lead
admin/              painel (index.html, admin.js, admin.css)
api/config.js       configuração pública da loja
api/lead.js         gravação do pedido + avisos (Telegram, UTMify)
api/sessao.js       visitas ao vivo
api/admin.js        API do painel
api/pix.js          cria e consulta a cobrança Pix
api/_pix.js         integração com o Mercado Pago
api/webhook.js      confirmação de pagamento
supabase/           scripts SQL
```

## Checklist para entrar no ar

- [ ] SQL das quatro tabelas rodado no Supabase
- [ ] `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e `ADMIN_PASSWORD` cadastradas na Vercel
- [ ] Dados da empresa (CNPJ, razão social, endereço) preenchidos no painel
- [ ] WhatsApp da loja preenchido no painel
- [ ] Token do Mercado Pago salvo e webhook apontando para `/api/webhook`
- [ ] Contrato revisado por advogado (versão atual: `v1`, em `app.js › CONTRATO_VERSAO`)
- [ ] Teste de ponta a ponta com um Pix de valor baixo antes de ligar o tráfego

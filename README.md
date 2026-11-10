# Rastro · HDJ GT-V8

Loja de página única para vender a moto elétrica HDJ GT-V8 com entrada no Pix e saldo em boletos mensais. O pedido é fechado dentro de um chat com a atendente virtual: condições, cadastro, contrato com aceite, endereço e pagamento da adesão.

Site estático (`index.html`, `app.js`, `style.css`) + funções serverless em `/api` + Supabase como banco. Deploy na Vercel. O Pix da adesão é gerado pela [IronPay](https://docs.ironpayapp.com.br/).

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
| `IRONPAY_TOKEN` | não | Token de API da IronPay. Sem ele, o Pix automático fica desligado e o pedido cai no atendimento manual. |
| `IRONPAY_OFFER` | não | Hash da oferta da moto no painel da IronPay. A API exige uma oferta em cada transação. |
| `IRONPAY_PRODUCT` | não | Hash do produto na IronPay. Se vazio, uso o hash da oferta. |
| `PUBLIC_URL` | não | URL pública do site (`https://seusite.com`), usada no postback do Pix. Se vazio, usa o host da requisição. |
| `PIX_ATIVO` | não | Use `1` apenas para forçar o envio de “aguardando pagamento” à UTMify sem gateway ligado. |

Token, oferta e produto também podem ser colados pelo painel (`/admin › Configurações › Pagamento no Pix`), sem variável de ambiente.

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
- **Pagamento no Pix** — token da IronPay, hash da oferta, hash do produto e teste de conexão.
- **UTMify** e **Avisos no Telegram** — pixels, conversões e alertas de cadastro/Pix.

## Pagamento no Pix (IronPay)

1. No painel da IronPay, cadastre o produto e a oferta da moto (Produtos › Oferta) e copie os dois hashes.
2. Gere o token em IronPay › Configurações › API.
3. Cole token, hash da oferta e hash do produto em `/admin › Configurações › Pagamento no Pix` e clique em **Testar conexão** (a chamada usa `GET /balance`).
4. Não é preciso cadastrar webhook no painel: cada transação já nasce com `postback_url` apontando para `https://SEU-SITE/api/webhook`.

Fluxo: o cliente confirma o endereço → `POST /api/pix` chama `POST /transactions` na IronPay e devolve o código copia e cola (o QR é desenhado no navegador) → o site consulta `GET /api/pix?pedido=...` a cada 5 segundos, que por sua vez chama `GET /transactions/{hash}` → quando a IronPay marca `paid`, o pedido vira `pago`. O postback (`transaction_hash`, `status`, `amount`, `payment_method`, `paid_at`) faz o mesmo caminho mesmo com a aba fechada, conferindo o status na API antes de fechar o pedido.

Valores vão em centavos, como a IronPay exige. A cobrança vale 24 horas (`expire_in_days: 1`) e é reaproveitada se o cliente voltar ao mesmo pedido.

**Sem token ou sem oferta configurada** a loja não trava: o pedido é registrado, o cliente recebe o resumo e um botão de WhatsApp para a equipe mandar o Pix manualmente.

## Estrutura

```
index.html          página de vendas
app.js              chat, funil, contrato, Pix
style.css           estilos do site
config.js           valores padrão (o /admin sobrescreve via /api/config.js)
store.js            cópia local do pedido + envio para /api/lead
admin/              painel (index.html, admin.js, admin.css)
vendor/qrcode.min.js  QR Code desenhado no navegador (qrcodejs, MIT)
api/config.js       configuração pública da loja
api/lead.js         gravação do pedido + avisos (Telegram, UTMify)
api/sessao.js       visitas ao vivo
api/admin.js        API do painel
api/pix.js          cria e consulta a cobrança Pix
api/_pix.js         integração com a IronPay
api/webhook.js      confirmação de pagamento (postback)
supabase/           scripts SQL
```

## Checklist para entrar no ar

- [ ] SQL das quatro tabelas rodado no Supabase
- [ ] `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e `ADMIN_PASSWORD` cadastradas na Vercel
- [ ] Dados da empresa (CNPJ, razão social, endereço) preenchidos no painel
- [ ] WhatsApp da loja preenchido no painel
- [ ] Token, hash da oferta e hash do produto da IronPay salvos e testados
- [ ] `PUBLIC_URL` apontando para o domínio final (para o postback voltar certo)
- [ ] Contrato revisado por advogado (versão atual: `v1`, em `app.js › CONTRATO_VERSAO`)
- [ ] Teste de ponta a ponta com um Pix de valor baixo antes de ligar o tráfego

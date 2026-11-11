
## Pix Black como gateway principal

O gateway principal agora é a Pix Black. No painel `/admin`, em **Integrações → Pagamento no Pix**, informe a chave `pxb_live_...` e o segredo `whsec_...` do webhook. A loja cria cobranças em `POST /api/v1/charges`, usa idempotência por número do pedido e confirma o pagamento consultando a cobrança antes de liberar o pedido.

No painel Pix Black, cadastre o webhook `https://rastromotovolt.website/api/webhook` para os eventos `charge.paid` e `charge.expired`. O webhook valida a assinatura HMAC com tolerância de cinco minutos. O Pix Black expira em 30 minutos; QR Code e copia e cola são exibidos dentro do chat.

Também é possível usar as variáveis de ambiente `PIXBLACK_API_KEY` e `PIXBLACK_WEBHOOK_SECRET` na Vercel. Elas têm prioridade sobre os valores salvos no painel. A IronPay continua no código apenas para consultar ou concluir cobranças antigas e como fallback enquanto a Pix Black não estiver configurada.

## Configuração automática da IronPay

A IronPay exige `offer_hash` e `product_hash` em cada transação. Para não precisar procurar ou copiar esses hashes manualmente, o painel agora tem o botão **Configurar automaticamente** em `/admin › Configurações › Pagamento no Pix`.

Cole somente o token da IronPay e clique nesse botão. O sistema chama `POST /products` e depois `POST /products/{hash}/offers`, usando o nome e o preço configurados da moto, salva os hashes na tabela segura `hdj_private` e deixa o Pix pronto. Se o produto já tiver sido criado e apenas a oferta faltar, a próxima tentativa reaproveita o produto e cria somente a oferta.

O token ainda pode ser definido por `IRONPAY_TOKEN`. Nesse caso, basta preencher `IRONPAY_OFFER` e `IRONPAY_PRODUCT`, ou usar o botão no painel para provisionar os recursos na conta.

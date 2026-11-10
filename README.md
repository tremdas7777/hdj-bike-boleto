
## Configuração automática da IronPay

A IronPay exige `offer_hash` e `product_hash` em cada transação. Para não precisar procurar ou copiar esses hashes manualmente, o painel agora tem o botão **Configurar automaticamente** em `/admin › Configurações › Pagamento no Pix`.

Cole somente o token da IronPay e clique nesse botão. O sistema chama `POST /products` e depois `POST /products/{hash}/offers`, usando o nome e o preço configurados da moto, salva os hashes na tabela segura `hdj_private` e deixa o Pix pronto. Se o produto já tiver sido criado e apenas a oferta faltar, a próxima tentativa reaproveita o produto e cria somente a oferta.

O token ainda pode ser definido por `IRONPAY_TOKEN`. Nesse caso, basta preencher `IRONPAY_OFFER` e `IRONPAY_PRODUCT`, ou usar o botão no painel para provisionar os recursos na conta.

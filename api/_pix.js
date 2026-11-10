// Pix via IronPay: cria a cobrança da adesão, consulta o status e propaga para o lead.
// API: https://docs.ironpayapp.com.br/ (base https://api.ironpayapp.com.br/api/public/v1)
import { db, lerPrivado } from "./_lib.js";

const BASE = "https://api.ironpayapp.com.br/api/public/v1";
const digits = (v) => String(v || "").replace(/\D/g, "");
const uuid = /^[0-9a-f-]{36}$/i;
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || ""));

// Recursos criados na conta IronPay usada pela loja. O painel/variáveis de ambiente
// continuam tendo prioridade; estes valores evitam que um deploy sem configuração
// volte a exibir “Falta o hash da oferta”.
const PRODUTO_PADRAO = "3oolsookfk";
const OFERTA_PADRAO = "yp7kympp3s";

// Credenciais: variável de ambiente tem prioridade; o painel salva em hdj_private.
// A IronPay exige uma oferta (offer_hash) e um produto (product_hash) criados no painel dela.
export async function credenciais() {
  const p = await lerPrivado(["iron_token", "iron_oferta", "iron_produto"]).catch(() => ({}));
  const oferta = process.env.IRONPAY_OFFER || p.iron_oferta || OFERTA_PADRAO;
  return {
    token: process.env.IRONPAY_TOKEN || p.iron_token || null,
    oferta,
    produto: process.env.IRONPAY_PRODUCT || p.iron_produto || PRODUTO_PADRAO,
  };
}

export async function pixAtivo() {
  const c = await credenciais();
  return !!(c.token && c.oferta);
}

export async function criarCobranca({ pedido, valor, nome, cpf, email, telefone, endereco, utm, base }) {
  const c = await credenciais();
  if (!c.token || !c.oferta) throw new Error("pix_indisponivel");

  const centavos = Math.round(Number(valor) * 100);
  if (!(centavos > 0)) throw new Error("valor");

  const end = endereco || {};
  const cliente = {
    name: String(nome || "Cliente").slice(0, 120),
    email: emailOk(email) ? email : "cliente@rastro.com.br",
    phone_number: digits(telefone),
    document: digits(cpf),
  };
  if (end.rua) {
    Object.assign(cliente, {
      street_name: String(end.rua).slice(0, 120),
      number: String(end.numero || "").slice(0, 20),
      complement: String(end.complemento || "").slice(0, 80),
      neighborhood: String(end.bairro || "").slice(0, 80),
      city: String(end.cidade || "").slice(0, 80),
      state: String(end.uf || "").slice(0, 2).toUpperCase(),
      zip_code: digits(end.cep),
    });
  }

  const corpo = {
    amount: centavos,
    offer_hash: c.oferta,
    payment_method: "pix",
    customer: cliente,
    cart: [{
      product_hash: c.produto,
      title: `Adesão ${pedido} · Moto elétrica HDJ GT-V8`,
      cover: null,
      price: centavos,
      quantity: 1,
      operation_type: 1,
      tangible: true,
    }],
    installments: 1,
    expire_in_days: 1,
    transaction_origin: "api",
    tracking: {
      src: "",
      utm_source: utm?.utm_source || "",
      utm_medium: utm?.utm_medium || "",
      utm_campaign: utm?.utm_campaign || "",
      utm_term: utm?.utm_term || "",
      utm_content: utm?.utm_content || "",
    },
  };
  if (base) corpo.postback_url = `${base}/api/webhook`;

  const r = await fetch(`${BASE}/transactions?api_token=${encodeURIComponent(c.token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const motivo = j?.message || j?.error || (j?.errors && JSON.stringify(j.errors)) || `ironpay ${r.status}`;
    throw new Error(String(motivo).slice(0, 160));
  }

  const dados = j.data || j;
  const pix = dados.pix || {};
  const codigo = pix.pix_qr_code || pix.qr_code || pix.emv || null;
  if (!codigo) throw new Error("pix_sem_codigo");
  const id = String(dados.hash || dados.id || "");
  if (!id) throw new Error("pix_sem_hash");

  const url = pix.pix_url || null;
  const ehImagem = !!url && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url);

  return {
    id,
    status: dados.payment_status || dados.status || "pending",
    copiaECola: codigo,
    qr: ehImagem ? url : null, // imagem pronta, quando a IronPay devolver uma
    ticket: ehImagem ? null : url, // link de pagamento, quando for o caso
    expiraEm: dados.expires_at || dados.expiration_date || null,
  };
}

export async function consultar(id) {
  const c = await credenciais();
  if (!c.token || !id) return null;
  const r = await fetch(`${BASE}/transactions/${encodeURIComponent(id)}?api_token=${encodeURIComponent(c.token)}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const d = j?.data || j;
  if (!d) return null;
  return { id: String(d.hash || id), status: d.status || d.payment_status || "pending" };
}

// pending | pago | cancelado | recusado | devolvido
export function traduzir(status) {
  switch (String(status || "").toLowerCase()) {
    case "paid":
    case "approved":
    case "completed":
      return "pago";
    case "canceled":
    case "cancelled":
    case "expired":
      return "cancelado";
    case "refunded":
    case "chargeback":
    case "charged_back":
      return "devolvido";
    case "failed":
    case "refused":
    case "declined":
      return "recusado";
    default:
      return "pendente";
  }
}

export async function gravar(pedido, dados) {
  await db("hdj_pagamentos?on_conflict=pedido", {
    method: "POST",
    body: { pedido, gateway: "ironpay", atualizado_em: new Date().toISOString(), ...dados },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

// Atualiza a cobrança e, quando pago, marca o lead como pago.
export async function aplicar(pedido, pagamento) {
  const status = traduzir(pagamento.status);
  const linha = { status, atualizado_em: new Date().toISOString() };
  if (pagamento.id) linha.gateway_id = String(pagamento.id);
  if (status === "pago") linha.pago_em = new Date().toISOString();
  await gravar(pedido, linha);
  if (status !== "pago") return status;

  const [cobranca] = await db(`hdj_pagamentos?pedido=eq.${encodeURIComponent(pedido)}&select=lead_id,valor,avisado`).catch(() => [null]);
  if (!cobranca || cobranca.avisado) return status;
  if (uuid.test(cobranca.lead_id || "")) {
    await db(`hdj_leads?id=eq.${cobranca.lead_id}`, {
      method: "PATCH",
      body: { etapa: "pago", atualizado_em: new Date().toISOString() },
      prefer: "return=minimal",
    }).catch(() => {});
  }
  await gravar(pedido, { avisado: true }).catch(() => {});
  return status;
}

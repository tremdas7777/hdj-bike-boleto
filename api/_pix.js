// Pix via Pix Black (prioritário) ou IronPay (compatibilidade legada): cria, consulta e confirma cobranças.
// Pix Black: https://pixxblack.com/docs/api
import { db, lerPrivado } from "./_lib.js";
import crypto from "node:crypto";

const PIXBLACK_BASE = "https://pixxblack.com/api/v1";
const IRONPAY_BASE = "https://api.ironpayapp.com.br/api/public/v1";
const digits = (v) => String(v || "").replace(/\D/g, "");
const uuid = /^[0-9a-f-]{36}$/i;
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || ""));
const PRODUTO_PADRAO = "3oolsookfk";
const OFERTA_PADRAO = "yp7kympp3s";

export async function credenciais() {
  const p = await lerPrivado(["pixblack_api_key", "pixblack_webhook_secret", "iron_token", "iron_oferta", "iron_produto"]).catch(() => ({}));
  return {
    pixblackKey: process.env.PIXBLACK_API_KEY || p.pixblack_api_key || null,
    pixblackSecret: process.env.PIXBLACK_WEBHOOK_SECRET || p.pixblack_webhook_secret || null,
    iron: {
      token: process.env.IRONPAY_TOKEN || p.iron_token || null,
      oferta: process.env.IRONPAY_OFFER || p.iron_oferta || OFERTA_PADRAO,
      produto: process.env.IRONPAY_PRODUCT || p.iron_produto || PRODUTO_PADRAO,
    },
  };
}

export async function gatewayAtivo() {
  const c = await credenciais();
  return c.pixblackKey ? "pixblack" : c.iron.token && c.iron.oferta ? "ironpay" : null;
}

export async function pixAtivo() {
  return !!(await gatewayAtivo());
}

function clientePixBlack({ nome, cpf, email }) {
  return {
    name: String(nome || "Cliente").slice(0, 120),
    document: digits(cpf),
    email: emailOk(email) ? email : "cliente@rastro.com.br",
  };
}

async function criarPixBlack({ pedido, valor, nome, cpf, email }) {
  const c = await credenciais();
  const centavos = Math.round(Number(valor) * 100);
  const corpo = {
    amount_cents: centavos,
    description: `Adesão ${pedido} · Moto elétrica HDJ GT-V8`.slice(0, 140),
    external_reference: String(pedido).slice(0, 100),
    payer: clientePixBlack({ nome, cpf, email }),
  };
  const r = await fetch(`${PIXBLACK_BASE}/charges`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.pixblackKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Idempotency-Key": String(pedido).slice(0, 100),
    },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const motivo = j?.message || j?.error || (j?.issues && JSON.stringify(j.issues)) || `pixblack ${r.status}`;
    throw new Error(String(motivo).slice(0, 160));
  }
  const codigo = j?.pix?.copy_paste;
  if (!codigo || !j.id) throw new Error("pix_sem_codigo");
  return {
    gateway: "pixblack",
    id: String(j.id),
    status: j.status || "pending",
    copiaECola: codigo,
    qr: null,
    ticket: null,
    expiraEm: j.pix?.expires_at || null,
  };
}

async function criarIronPay({ pedido, valor, nome, cpf, email, telefone, endereco, utm, base }) {
  const c = await credenciais();
  if (!c.iron.token || !c.iron.oferta) throw new Error("pix_indisponivel");
  const centavos = Math.round(Number(valor) * 100);
  const end = endereco || {};
  const cliente = {
    name: String(nome || "Cliente").slice(0, 120),
    email: emailOk(email) ? email : "cliente@rastro.com.br",
    phone_number: digits(telefone),
    document: digits(cpf),
  };
  if (end.rua) Object.assign(cliente, {
    street_name: String(end.rua).slice(0, 120), number: String(end.numero || "").slice(0, 20),
    complement: String(end.complemento || "").slice(0, 80), neighborhood: String(end.bairro || "").slice(0, 80),
    city: String(end.cidade || "").slice(0, 80), state: String(end.uf || "").slice(0, 2).toUpperCase(), zip_code: digits(end.cep),
  });
  const corpo = {
    amount: centavos, offer_hash: c.iron.oferta, payment_method: "pix", customer: cliente,
    cart: [{ product_hash: c.iron.produto, title: `Adesão ${pedido} · Moto elétrica HDJ GT-V8`, cover: null, price: centavos, quantity: 1, operation_type: 1, tangible: true }],
    installments: 1, expire_in_days: 1, transaction_origin: "api",
    tracking: { src: "", utm_source: utm?.utm_source || "", utm_medium: utm?.utm_medium || "", utm_campaign: utm?.utm_campaign || "", utm_term: utm?.utm_term || "", utm_content: utm?.utm_content || "" },
  };
  if (base) corpo.postback_url = `${base}/api/webhook`;
  const r = await fetch(`${IRONPAY_BASE}/transactions?api_token=${encodeURIComponent(c.iron.token)}`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String(j?.message || j?.error || (j?.errors && JSON.stringify(j.errors)) || `ironpay ${r.status}`).slice(0, 160));
  const dados = j.data || j;
  const pix = dados.pix || {};
  const codigo = pix.pix_qr_code || pix.qr_code || pix.emv || null;
  const id = String(dados.hash || dados.id || "");
  if (!codigo) throw new Error("pix_sem_codigo");
  if (!id) throw new Error("pix_sem_hash");
  const url = pix.pix_url || null;
  const ehImagem = !!url && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url);
  return { gateway: "ironpay", id, status: dados.payment_status || dados.status || "pending", copiaECola: codigo, qr: ehImagem ? url : null, ticket: ehImagem ? null : url, expiraEm: dados.expires_at || dados.expiration_date || null };
}

export async function criarCobranca(dados) {
  const c = await credenciais();
  const centavos = Math.round(Number(dados.valor) * 100);
  if (!(centavos >= 500 && centavos <= 100000000)) throw new Error("valor_invalido");
  return c.pixblackKey ? criarPixBlack(dados) : criarIronPay(dados);
}

export async function consultar(id, gateway = "ironpay") {
  const c = await credenciais();
  if (!id) return null;
  if (gateway === "pixblack") {
    if (!c.pixblackKey) return null;
    const r = await fetch(`${PIXBLACK_BASE}/charges/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${c.pixblackKey}`, Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return j ? { id: String(j.id || id), gateway: "pixblack", status: j.status || "pending", amountCents: j.amount_cents } : null;
  }
  if (!c.iron.token) return null;
  const r = await fetch(`${IRONPAY_BASE}/transactions/${encodeURIComponent(id)}?api_token=${encodeURIComponent(c.iron.token)}`, { headers: { Accept: "application/json" } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const d = j?.data || j;
  return d ? { id: String(d.hash || id), gateway: "ironpay", status: d.status || d.payment_status || "pending" } : null;
}

export function traduzir(status) {
  switch (String(status || "").toLowerCase()) {
    case "paid": case "approved": case "completed": return "pago";
    case "canceled": case "cancelled": case "expired": return "cancelado";
    case "refunded": case "chargeback": case "charged_back": return "devolvido";
    case "failed": case "refused": case "declined": return "recusado";
    default: return "pendente";
  }
}

export async function gravar(pedido, dados) {
  await db("hdj_pagamentos?on_conflict=pedido", {
    method: "POST",
    body: { pedido, ...dados, gateway: dados.gateway || "ironpay", atualizado_em: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

export async function aplicar(pedido, pagamento) {
  const status = traduzir(pagamento.status);
  const linha = { status, atualizado_em: new Date().toISOString() };
  if (pagamento.id) linha.gateway_id = String(pagamento.id);
  if (pagamento.gateway) linha.gateway = pagamento.gateway;
  if (status === "pago") linha.pago_em = new Date().toISOString();
  await gravar(pedido, linha);
  if (status !== "pago") return status;
  const [cobranca] = await db(`hdj_pagamentos?pedido=eq.${encodeURIComponent(pedido)}&select=lead_id,valor,avisado`).catch(() => [null]);
  if (!cobranca || cobranca.avisado) return status;
  if (uuid.test(cobranca.lead_id || "")) await db(`hdj_leads?id=eq.${cobranca.lead_id}`, { method: "PATCH", body: { etapa: "pago", atualizado_em: new Date().toISOString() }, prefer: "return=minimal" }).catch(() => {});
  await gravar(pedido, { avisado: true }).catch(() => {});
  return status;
}

export function assinaturaPixBlackValida(rawBody, header, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || typeof header !== "string") return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2)));
  const t = Number(parts.t);
  const v1 = String(parts.v1 || "");
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/i.test(v1) || Math.abs(Math.floor(Date.now() / 1000) - t) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest();
  const recebido = Buffer.from(v1, "hex");
  return recebido.length === expected.length && crypto.timingSafeEqual(expected, recebido);
}

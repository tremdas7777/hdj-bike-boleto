// Pix via Mercado Pago: cria a cobrança da adesão, consulta o status e propaga para o lead.
import { db, lerPrivado } from "./_lib.js";

const MP = "https://api.mercadopago.com";
const digits = (v) => String(v || "").replace(/\D/g, "");
const uuid = /^[0-9a-f-]{36}$/i;

// Token: variável de ambiente tem prioridade; o painel salva em hdj_private (mp_token).
export async function tokenMp() {
  if (process.env.MP_ACCESS_TOKEN) return process.env.MP_ACCESS_TOKEN;
  const p = await lerPrivado(["mp_token"]).catch(() => ({}));
  return p.mp_token || null;
}

export async function criarCobranca({ pedido, valor, nome, cpf, email, telefone, base }) {
  const token = await tokenMp();
  if (!token) throw new Error("pix_indisponivel");
  const centavos = Math.round(Number(valor) * 100) / 100;
  if (!(centavos > 0)) throw new Error("valor");
  const partes = String(nome || "").trim().split(/\s+/);
  const primeiro = partes.slice(0, 1).join(" ") || "Cliente";
  const resto = partes.slice(1).join(" ") || primeiro;
  const doc = digits(cpf);
  const expira = new Date(Date.now() + 60 * 60_000);
  const expiraIso = new Date(expira.getTime() - 180 * 60_000).toISOString().replace("Z", "-03:00");

  const corpo = {
    transaction_amount: centavos,
    description: `Adesão ${pedido} · Moto elétrica HDJ GT-V8`,
    payment_method_id: "pix",
    external_reference: String(pedido).slice(0, 60),
    date_of_expiration: expiraIso,
    payer: {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email || "") ? email : "cliente@rastro.com.br",
      first_name: primeiro.slice(0, 60),
      last_name: resto.slice(0, 60),
      ...(doc.length === 11 ? { identification: { type: "CPF", number: doc } } : {}),
    },
  };
  if (base) corpo.notification_url = `${base}/api/webhook`;

  const r = await fetch(`${MP}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `${pedido}-${Date.now()}`,
    },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const motivo = j?.message || j?.error || `mercadopago ${r.status}`;
    throw new Error(String(motivo).slice(0, 160));
  }
  const qr = j.point_of_interaction?.transaction_data || {};
  if (!qr.qr_code) throw new Error("pix_sem_codigo");
  return {
    mpId: String(j.id),
    status: j.status || "pending",
    copiaECola: qr.qr_code,
    qr: qr.qr_code_base64 || null,
    expiraEm: j.date_of_expiration || expira.toISOString(),
    ticket: qr.ticket_url || null,
  };
}

export async function consultar(mpId) {
  const token = await tokenMp();
  if (!token || !mpId) return null;
  const r = await fetch(`${MP}/v1/payments/${encodeURIComponent(mpId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

// pending | aprovado | pago | cancelado | recusado | devolvido
export function traduzir(statusMp) {
  switch (statusMp) {
    case "approved":
    case "authorized":
      return "pago";
    case "cancelled":
    case "expired":
      return "cancelado";
    case "rejected":
      return "recusado";
    case "refunded":
    case "charged_back":
      return "devolvido";
    default:
      return "pendente";
  }
}

export async function gravar(pedido, dados) {
  await db("hdj_pagamentos?on_conflict=pedido", {
    method: "POST",
    body: { pedido, atualizado_em: new Date().toISOString(), ...dados },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

// Atualiza a cobrança e, quando pago, marca o lead como pago.
export async function aplicar(pedido, pagamento) {
  const status = traduzir(pagamento.status);
  const linha = { status, mp_id: String(pagamento.id), atualizado_em: new Date().toISOString() };
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

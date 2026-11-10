import { db } from "./_lib.js";
import { criarCobranca, consultar, aplicar, gravar, tokenMp } from "./_pix.js";

const PEDIDO = /^[A-Za-z0-9._-]{4,32}$/;
const UUID = /^[0-9a-f-]{36}$/i;

function base(req) {
  if (process.env.PUBLIC_URL) return String(process.env.PUBLIC_URL).replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  return host ? `${proto}://${host}` : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const pedido = String(req.query?.pedido || "").trim();
    if (!PEDIDO.test(pedido)) return res.status(400).json({ ok: false, erro: "pedido" });
    let linha = null;
    try {
      [linha] = await db(`hdj_pagamentos?pedido=eq.${encodeURIComponent(pedido)}&select=pedido,mp_id,status,criado_em`);
    } catch {
      return res.status(200).json({ ok: true, status: null });
    }
    if (!linha) return res.status(200).json({ ok: true, status: null });
    if (linha.status === "pendente" && linha.mp_id) {
      const velho = Date.now() - new Date(linha.criado_em).getTime() > 36 * 3600_000;
      if (velho) return res.status(200).json({ ok: true, status: "cancelado" });
      const pagamento = await consultar(linha.mp_id);
      if (pagamento) {
        const status = await aplicar(pedido, pagamento).catch(() => linha.status);
        return res.status(200).json({ ok: true, status });
      }
    }
    return res.status(200).json({ ok: true, status: linha.status });
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, erro: "método" });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== "object") return res.status(400).json({ ok: false, erro: "json" });

  const pedido = String(b.pedido || "").trim();
  const valor = Math.round(Number(b.valor) * 100) / 100;
  if (!PEDIDO.test(pedido)) return res.status(400).json({ ok: false, erro: "pedido" });
  if (!(valor >= 1 && valor <= 100000)) return res.status(400).json({ ok: false, erro: "valor" });
  if (!(await tokenMp().catch(() => null))) return res.status(503).json({ ok: false, erro: "pix_indisponivel" });

  // Reaproveita uma cobrança pendente e ainda válida para o mesmo pedido.
  try {
    const [existente] = await db(`hdj_pagamentos?pedido=eq.${encodeURIComponent(pedido)}&select=pedido,status,copiaecola,qr,expira_em,valor`);
    if (existente && existente.status === "pendente" && existente.copiaecola && new Date(existente.expira_em || 0) > new Date()) {
      return res.status(200).json({ ok: true, status: existente.status, copiaECola: existente.copiaecola, qr: existente.qr, expiraEm: existente.expira_em });
    }
  } catch {
    // tabela ausente ou banco fora: segue para criar a cobrança e avisar depois
  }

  try {
    const cobranca = await criarCobranca({
      pedido, valor,
      nome: b.nome, cpf: b.cpf, email: b.email, telefone: b.telefone,
      base: base(req),
    });
    await gravar(pedido, {
      lead_id: UUID.test(b.lead_id || "") ? b.lead_id : null,
      valor,
      mp_id: cobranca.mpId,
      status: "pendente",
      copiaecola: cobranca.copiaECola,
      qr: cobranca.qr,
      ticket: cobranca.ticket,
      expira_em: cobranca.expiraEm,
      criado_em: new Date().toISOString(),
    }).catch(() => {});
    return res.status(200).json({
      ok: true, status: "pendente", copiaECola: cobranca.copiaECola, qr: cobranca.qr, expiraEm: cobranca.expiraEm,
    });
  } catch (e) {
    const msg = String(e?.message || "erro");
    if (msg === "pix_indisponivel") return res.status(503).json({ ok: false, erro: "pix_indisponivel" });
    return res.status(502).json({ ok: false, erro: msg.slice(0, 160) });
  }
}

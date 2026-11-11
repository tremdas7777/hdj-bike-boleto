// Webhook compatível com Pix Black e IronPay legado.
import { db } from "./_lib.js";
import { consultar, aplicar, assinaturaPixBlackValida, credenciais } from "./_pix.js";

export const config = { api: { bodyParser: false } };

async function corpoBruto(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (!req.readable) return null;
  const partes = [];
  for await (const parte of req) partes.push(Buffer.isBuffer(parte) ? parte : Buffer.from(parte));
  return Buffer.concat(partes);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).end();

  const c = await credenciais();
  const eventoPixBlack = !!(req.headers["x-pixblack-event"] || req.headers["x-pixblack-signature"]);
  const raw = req.method === "POST" ? await corpoBruto(req) : null;
  if (eventoPixBlack && !assinaturaPixBlackValida(raw, req.headers["x-pixblack-signature"], c.pixblackSecret)) {
    return res.status(400).json({ ok: false, erro: "assinatura_invalida" });
  }

  const q = req.query || {};
  let b = raw;
  if (Buffer.isBuffer(b)) { try { b = JSON.parse(b.toString("utf8")); } catch { b = null; } }
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  b = b && typeof b === "object" ? b : {};

  const dados = b.data && typeof b.data === "object" ? b.data : b;
  const id = String(
    dados.charge_id || dados.transaction_hash || dados.hash || dados.transaction_id || dados.id ||
    b.transaction_hash || q.transaction_hash || q.hash || ""
  ).trim();
  if (!id) return res.status(200).json({ ok: true, ignorado: true });

  let linha = null;
  try {
    [linha] = await db(`hdj_pagamentos?gateway_id=eq.${encodeURIComponent(id)}&select=pedido,gateway,status`);
  } catch {
    return res.status(200).json({ ok: true, banco: false });
  }
  if (!linha) return res.status(200).json({ ok: true, ignorado: true });
  const pedido = String(linha.pedido || "").trim();
  if (!pedido) return res.status(200).json({ ok: true, ignorado: true });

  // O corpo do postback nunca é prova de pagamento: somente a consulta oficial autoriza a confirmação.
  const oficial = await consultar(id, linha.gateway || (eventoPixBlack ? "pixblack" : "ironpay")).catch(() => null);
  if (!oficial) return res.status(200).json({ ok: true, ignorado: true, motivo: "consulta_oficial_indisponivel" });
  const status = await aplicar(pedido, oficial).catch(() => null);
  return res.status(200).json({ ok: true, pedido, status });
}

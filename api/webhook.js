// Postback da IronPay: { transaction_hash, status, amount, payment_method, paid_at }
// Também confere o status na API antes de fechar o pedido, para não confiar só no corpo do aviso.
import { db } from "./_lib.js";
import { consultar, aplicar } from "./_pix.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).end();

  const q = req.query || {};
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  b = b && typeof b === "object" ? b : {};

  const dados = b.data && typeof b.data === "object" ? b.data : b;
  const id = String(
    dados.transaction_hash || dados.hash || dados.transaction_id || dados.id ||
    b.transaction_hash || q.transaction_hash || q.hash || ""
  ).trim();
  if (!id) return res.status(200).json({ ok: true, ignorado: true });

  let linha = null;
  try {
    [linha] = await db(`hdj_pagamentos?gateway_id=eq.${encodeURIComponent(id)}&select=pedido,status`);
  } catch {
    return res.status(200).json({ ok: true, banco: false });
  }
  if (!linha) return res.status(200).json({ ok: true, ignorado: true });
  const pedido = String(linha.pedido || "").trim();
  if (!pedido) return res.status(200).json({ ok: true, ignorado: true });

  // O status oficial vem da consulta; o corpo do postback serve de atalho.
  const oficial = await consultar(id).catch(() => null);
  const status = await aplicar(pedido, oficial || { id, status: dados.status || b.status || linha.status }).catch(() => null);
  return res.status(200).json({ ok: true, pedido, status });
}

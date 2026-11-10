// Aviso do Mercado Pago quando o Pix muda de status.
import { db } from "./_lib.js";
import { consultar, aplicar } from "./_pix.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).end();

  const q = req.query || {};
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  b = b && typeof b === "object" ? b : {};

  const tipo = b.type || b.topic || q.type || q.topic || "";
  const id = b?.data?.id || b["data.id"] || q["data.id"] || q.id || "";
  if (tipo !== "payment" || !id) return res.status(200).json({ ok: true, ignorado: true });

  const pagamento = await consultar(String(id)).catch(() => null);
  if (!pagamento) return res.status(200).json({ ok: true, ignorado: true });

  const pedido = String(pagamento.external_reference || "").trim();
  if (!pedido) return res.status(200).json({ ok: true, ignorado: true });

  // Só age em cobranças que nasceram no site.
  let existe = null;
  try {
    [existe] = await db(`hdj_pagamentos?pedido=eq.${encodeURIComponent(pedido)}&select=pedido`);
  } catch {
    return res.status(200).json({ ok: true, banco: false });
  }
  if (!existe) return res.status(200).json({ ok: true, ignorado: true });

  const status = await aplicar(pedido, pagamento).catch(() => null);
  return res.status(200).json({ ok: true, pedido, status });
}

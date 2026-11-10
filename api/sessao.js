import { db } from "./_lib.js";

// Visita ao vivo: "page" ao abrir, "ping" a cada 30 s com a aba visível, "chat" ao abrir a conversa.
const ID = /^[0-9a-f-]{36}$/i;
const t = (v, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { return res.status(400).end(); } }
  if (!b || !ID.test(b.sessao || "") || !["page", "ping", "chat"].includes(b.tipo)) return res.status(400).end();

  const linha = { sessao: b.sessao, visto_em: new Date().toISOString(), path: t(b.path, 120) };
  if (b.tipo === "page") {
    const u = b.utm && typeof b.utm === "object" ? b.utm : {};
    Object.assign(linha, {
      referrer: t(b.referrer, 300),
      device: b.device === "mobile" ? "mobile" : "desktop",
      utm_source: t(u.utm_source), utm_medium: t(u.utm_medium), utm_campaign: t(u.utm_campaign),
      utm_content: t(u.utm_content), utm_term: t(u.utm_term), src: t(u.src), sck: t(u.sck),
    });
  }
  if (b.tipo === "chat") linha.chat = true;
  if (ID.test(b.lead_id || "")) linha.lead_id = b.lead_id;

  try {
    await db("hdj_sessoes?on_conflict=sessao", { method: "POST", body: linha, prefer: "resolution=merge-duplicates,return=minimal" });
  } catch {}
  return res.status(204).end();
}

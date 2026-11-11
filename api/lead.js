import { db, lerPrivado, enviarTelegram, enviarUtmify } from "./_lib.js";

const ETAPAS = [
  "iniciado", "produto_apresentado", "condicoes_aceitas", "cadastro_confirmado", "vencimento_escolhido",
  "proposta_aceita", "contrato_aceito", "endereco_confirmado", "aguardando_pagamento", "pago",
];
const ORD = Object.fromEntries(ETAPAS.map((e, i) => [e, i]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const txt = (v, max = 160) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v) => (Number.isFinite(+v) && v !== null && v !== "" ? Math.round(+v * 100) / 100 : null);
const brl = (n) => (+n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "método" });
  let l = req.body;
  if (typeof l === "string") { try { l = JSON.parse(l); } catch { return res.status(400).json({ erro: "json" }); } }
  if (!l || typeof l !== "object" || !UUID.test(l.id || "")) return res.status(400).json({ erro: "id" });
  if (JSON.stringify(l).length > 120_000) return res.status(413).json({ erro: "grande" });

  const etapa = l.etapa === "sem_interesse" || ORD[l.etapa] !== undefined ? l.etapa : "iniciado";
  const end = l.endereco && typeof l.endereco === "object" ? l.endereco : {};
  const o = l.origem && typeof l.origem === "object" ? l.origem : {};
  const utm = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "src", "sck"]) utm[k] = txt(o[k], 300);

  let anterior = null;
  try { [anterior] = await db(`hdj_leads?id=eq.${l.id}&select=avisos:dados->avisos`); } catch {}
  const avisos = (anterior && anterior.avisos) || {};

  const linha = {
    id: l.id,
    atualizado_em: new Date().toISOString(),
    etapa,
    primeiro_nome: txt(l.primeiro, 60),
    nome: txt(l.nomeCompleto),
    cpf: txt(l.cpf, 14),
    email: txt(l.email),
    telefone: txt(l.telefone, 20),
    entrada: num(l.entrada),
    parcela: num(l.parcela),
    dia_vencimento: Number.isInteger(l.diaVencimento) ? l.diaVencimento : null,
    cidade: txt(end.cidade, 80),
    uf: txt(end.uf, 2),
    pedido: txt(l.pedido, 20),
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_content: utm.utm_content,
    dados: {
      criadoEm: txt(l.criadoEm, 40),
      endereco: end,
      origem: { ...utm, referrer: txt(o.referrer, 300), landing: txt(o.landing, 300) },
      primeiroVencimento: txt(l.primeiroVencimento, 12),
      aceiteContrato: l.aceiteContrato || null,
      cadastroConfirmadoEm: txt(l.cadastroConfirmadoEm, 40),
      historico: Array.isArray(l.historico) ? l.historico.slice(-200) : [],
      eventos: Array.isArray(l.eventos) ? l.eventos.slice(-200) : [],
      avisos,
    },
  };

  const chegou = (e) => etapa !== "sem_interesse" && ORD[etapa] >= ORD[e];
  const novos = [];
  if (chegou("cadastro_confirmado") && !avisos.cadastro) novos.push("cadastro");
  if (chegou("aguardando_pagamento") && !avisos.pix) novos.push("pix");

  if (novos.length) {
    let cfg = {};
    try { cfg = await lerPrivado(["telegram_token", "telegram_chat", "utmify_token", "pixblack_api_key", "iron_token", "iron_oferta"]); } catch {}
    const origemTxt = [utm.utm_source, utm.utm_campaign].filter(Boolean).join(" / ") || "direto";
    for (const tipo of novos) {
      const titulo = tipo === "pix" ? "💰 Cliente chegou ao Pix" : "🆕 Novo cadastro";
      const msg = [
        titulo,
        `${linha.nome || linha.primeiro_nome || "Sem nome"} · ${linha.telefone || "sem telefone"}`,
        linha.entrada ? `Entrada ${brl(linha.entrada)} + parcelas de ${brl(linha.parcela)}` : null,
        linha.cidade ? `${linha.cidade}/${linha.uf}` : null,
        `Origem: ${origemTxt}`,
      ].filter(Boolean).join("\n");
      if (cfg.telegram_token && cfg.telegram_chat) await enviarTelegram(cfg.telegram_token, cfg.telegram_chat, msg);
      const pixLigado = !!cfg.pixblack_api_key || !!process.env.PIXBLACK_API_KEY || !!(cfg.iron_token && cfg.iron_oferta) || (!!process.env.IRONPAY_TOKEN && !!process.env.IRONPAY_OFFER);
      if (tipo === "pix" && (process.env.PIX_ATIVO === "1" || pixLigado) && cfg.utmify_token && linha.entrada) {
        const r = await enviarUtmify(cfg.utmify_token, {
          orderId: linha.pedido || linha.id, status: "waiting_payment", createdAt: Date.now(),
          nome: linha.nome || linha.primeiro_nome || "Cliente", email: linha.email, telefone: linha.telefone, cpf: linha.cpf,
          ip: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim(),
          produto: "Entrada · Moto elétrica HDJ GT-V8", centavos: Math.round(linha.entrada * 100), utm,
        });
        avisos.utmify = { ok: r.ok, em: new Date().toISOString() };
      }
      avisos[tipo] = new Date().toISOString();
    }
  }

  try {
    await db("hdj_leads?on_conflict=id", { method: "POST", body: linha, prefer: "resolution=merge-duplicates,return=minimal" });
  } catch {
    return res.status(502).json({ erro: "banco" });
  }
  return res.status(204).end();
}

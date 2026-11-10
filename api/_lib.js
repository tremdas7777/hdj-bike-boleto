// Senha do /admin (mesma regra das lojas) e acesso ao banco.
const LIMITE = 10;
const JANELA_MS = 15 * 60_000;
const falhas = new Map();

const ip = (req) =>
  req.headers["x-real-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";

function iguais(a, b) {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

function impressao(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// Depois de 10 senhas erradas diferentes do mesmo IP em 15 min, recusa esse IP até a janela vencer.
export function senhaOk(req) {
  const esperada = process.env.ADMIN_PASSWORD;
  const pwd = String(req.headers["x-admin-senha"] || "");
  if (!esperada || !pwd) return false;
  const quem = ip(req);
  const agora = Date.now();
  const doIp = falhas.get(quem) || new Map();
  for (const [k, t] of doIp) if (agora - t >= JANELA_MS) doIp.delete(k);
  if (doIp.size >= LIMITE) return false;
  if (iguais(pwd, esperada)) return true;
  doIp.set(impressao(pwd), agora);
  if (falhas.size > 5000) falhas.clear();
  falhas.set(quem, doIp);
  return false;
}

export async function db(caminho, { method = "GET", body, prefer } = {}) {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error("banco não configurado");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    method,
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`banco ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// Campos da oferta que o /admin pode mudar e o site lê.
export function limparConfig(c) {
  const n = (v, min, max) => (Number.isFinite(+v) && +v >= min && +v <= max ? Math.round(+v * 100) / 100 : undefined);
  const t = (v, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
  const lista = (v, min, max) =>
    Array.isArray(v) ? [...new Set(v.map((x) => n(x, min, max)).filter((x) => x !== undefined))].sort((a, b) => a - b).slice(0, 8) : undefined;
  const p = c.produto && typeof c.produto === "object" ? c.produto : {};
  const out = {
    loja: t(c.loja, 40),
    atendente: t(c.atendente, 40),
    precoTotal: n(c.precoTotal, 100, 100000),
    adesao: n(c.adesao, 0, 100000),
    entradas: lista(c.entradas, 0, 100000),
    entradaMaxima: n(c.entradaMaxima, 0, 100000),
    parcelas: n(c.parcelas, 1, 60),
    vencimentos: lista(c.vencimentos, 1, 28),
    frete: t(c.frete),
    prazoEntrega: t(c.prazoEntrega),
    juros: t(c.juros, 200),
    produto: { garantia: t(p.garantia), carregamento: t(p.carregamento), cor: t(p.cor, 40) },
  };
  for (const k of Object.keys(out.produto)) if (out.produto[k] === undefined) delete out.produto[k];
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  if (out.parcelas) out.parcelas = Math.round(out.parcelas);
  return out;
}

export async function lerPrivado(chaves) {
  const lista = chaves.map((c) => `"${c}"`).join(",");
  const linhas = await db(`hdj_private?chave=in.(${encodeURIComponent(lista)})&select=chave,valor`);
  return Object.fromEntries((linhas || []).map((l) => [l.chave, l.valor]));
}

export async function gravarPrivado(chave, valor) {
  await db("hdj_private?on_conflict=chave", {
    method: "POST",
    body: { chave, valor, atualizado_em: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

export async function apagarPrivado(chave) {
  await db(`hdj_private?chave=eq.${encodeURIComponent(chave)}`, { method: "DELETE", prefer: "return=minimal" });
}

export const mascarar = (v) => (v ? `${v.slice(0, 4)}…${v.slice(-4)}` : null);

const fmtUtc = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

// Nunca lança: falha na UTMify não pode quebrar o chat.
export async function enviarUtmify(token, o) {
  if (!token) return { ok: false, erro: "Token não configurado" };
  const u = o.utm || {};
  try {
    const r = await fetch("https://api.utmify.com.br/api-credentials/orders", {
      method: "POST",
      headers: { "x-api-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: o.orderId,
        platform: "CheckoutProprio",
        paymentMethod: "pix",
        status: o.status,
        createdAt: fmtUtc(o.createdAt),
        approvedDate: o.status === "paid" ? fmtUtc(o.approvedAt || Date.now()) : null,
        refundedAt: null,
        customer: { name: o.nome, email: o.email || "sem-email@exemplo.com", phone: o.telefone || null, document: o.cpf || null, country: "BR", ip: o.ip || "0.0.0.0" },
        products: [{ id: "hdj-gt-v8", name: o.produto, planId: null, planName: null, quantity: 1, priceInCents: o.centavos }],
        trackingParameters: {
          src: u.src || null, sck: u.sck || null, utm_source: u.utm_source || null, utm_campaign: u.utm_campaign || null,
          utm_medium: u.utm_medium || null, utm_content: u.utm_content || null, utm_term: u.utm_term || null,
        },
        commission: { totalPriceInCents: o.centavos, gatewayFeeInCents: 0, userCommissionInCents: o.centavos },
        isTest: !!o.teste,
      }),
    });
    if (!r.ok) return { ok: false, status: r.status, erro: (await r.text().catch(() => "")).slice(0, 200) };
    return { ok: true, status: r.status };
  } catch {
    return { ok: false, erro: "Falha de conexão com a UTMify" };
  }
}

export async function enviarTelegram(token, chatId, texto) {
  if (!token || !chatId) return { ok: false, erro: "Telegram não configurado" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto, disable_web_page_preview: true }),
    });
    const j = await r.json().catch(() => ({}));
    return j.ok ? { ok: true } : { ok: false, erro: j.description || `Telegram ${r.status}` };
  } catch {
    return { ok: false, erro: "Falha de conexão com o Telegram" };
  }
}

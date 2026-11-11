import { senhaOk, db, limparConfig, lerPrivado, gravarPrivado, apagarPrivado, mascarar, enviarUtmify, enviarTelegram } from "./_lib.js";

const STATUS = new Set(["novo", "em_contato", "aprovado", "recusado", "vendido"]);
const UUID = /^[0-9a-f-]{36}$/i;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ erro: "método" });
  if (!senhaOk(req)) return res.status(401).json({ erro: "Senha incorreta." });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  try {
    if (b.acao === "entrar") return res.json({ ok: true });

    if (b.acao === "listar") {
      const dias = Math.min(Math.max(parseInt(b.dias, 10) || 30, 1), 365);
      const desde = new Date(Date.now() - dias * 864e5).toISOString();
      const linhas = await db(
        `hdj_leads?select=*&atualizado_em=gte.${encodeURIComponent(desde)}&order=atualizado_em.desc&limit=1000`,
      );
      return res.json({ clientes: linhas });
    }

    if (b.acao === "atualizar") {
      if (!UUID.test(b.id || "")) return res.status(400).json({ erro: "id" });
      const patch = {};
      if (STATUS.has(b.status_admin)) patch.status_admin = b.status_admin;
      if (typeof b.notas === "string") patch.notas = b.notas.slice(0, 4000);
      if (!Object.keys(patch).length) return res.status(400).json({ erro: "nada para salvar" });
      await db(`hdj_leads?id=eq.${b.id}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
      return res.json({ ok: true });
    }

    if (b.acao === "config_ler") {
      const [linha] = await db("hdj_config?id=eq.1&select=dados,atualizado_em");
      return res.json({ config: linha?.dados || {}, atualizado_em: linha?.atualizado_em });
    }

    if (b.acao === "config_salvar") {
      // Mescla com o que já está salvo: salvar a oferta não pode apagar os dados da empresa.
      const [atual] = await db("hdj_config?id=eq.1&select=dados");
      const base = atual?.dados || {};
      const novo = b.config || {};
      const dados = limparConfig({
        ...base,
        ...novo,
        produto: { ...(base.produto || {}), ...(novo.produto || {}) },
        empresa: { ...(base.empresa || {}), ...(novo.empresa || {}) },
      });
      if (dados.entradas && dados.adesao) dados.entradas = dados.entradas.filter((v) => v >= dados.adesao);
      await db("hdj_config?id=eq.1", { method: "PATCH", body: { dados, atualizado_em: new Date().toISOString() }, prefer: "return=minimal" });
      return res.json({ ok: true, config: dados });
    }

    if (b.acao === "ao_vivo") {
      const agora = Date.now();
      const ini = new Date(); ini.setHours(0, 0, 0, 0);
      const desde = new Date(Math.min(ini.getTime(), agora - 30 * 60000)).toISOString();
      const sessoes = await db(`hdj_sessoes?criado_em=gte.${encodeURIComponent(desde)}&order=visto_em.desc&limit=2000&select=sessao,criado_em,visto_em,path,referrer,device,utm_source,utm_medium,utm_campaign,utm_content,utm_term,src,sck,chat,lead_id`);
      return res.json({ sessoes, agora: new Date(agora).toISOString(), inicioDia: ini.toISOString() });
    }

    if (b.acao === "integ_status") {
      const p = await lerPrivado(["utmify_token", "utmify_pixel", "utmify_pixel_tiktok", "telegram_token", "telegram_chat", "pix_gateway", "pixblack_api_key", "pixblack_webhook_secret", "iron_token", "iron_oferta", "iron_produto"]);
      const pixblackKey = process.env.PIXBLACK_API_KEY || p.pixblack_api_key || "";
      const pixblackSecret = process.env.PIXBLACK_WEBHOOK_SECRET || p.pixblack_webhook_secret || "";
      const token = process.env.IRONPAY_TOKEN || p.iron_token;
      const oferta = process.env.IRONPAY_OFFER || p.iron_oferta || "";
      const produto = process.env.IRONPAY_PRODUCT || p.iron_produto || "";
      const pixAtivo = !!pixblackKey || process.env.PIX_ATIVO === "1" || !!(token && oferta);
      return res.json({
        utmify: { token: mascarar(process.env.UTMIFY_TOKEN || p.utmify_token), pixel: p.utmify_pixel || "", pixelTiktok: p.utmify_pixel_tiktok || "", pixAtivo },
        telegram: { token: mascarar(p.telegram_token), chat: p.telegram_chat || "" },
        pix: { gateway: p.pix_gateway || null, gatewayDisponivel: pixblackKey ? "pixblack" : token && oferta ? "ironpay" : null, pixblackToken: mascarar(pixblackKey), pixblackSecret: mascarar(pixblackSecret), token: mascarar(token), oferta, produto, ativo: pixAtivo },
      });
    }

    const CHAVES = { utmify_token: /^[A-Za-z0-9_\-]{10,200}$/, utmify_pixel: /^[A-Za-z0-9]{5,40}$/, utmify_pixel_tiktok: /^[A-Za-z0-9]{5,40}$/, telegram_token: /^[0-9]{5,15}:[A-Za-z0-9_\-]{20,60}$/, telegram_chat: /^-?[0-9]{3,20}$/, pix_gateway: /^(pixblack|ironpay)$/, pixblack_api_key: /^pxb_[A-Za-z0-9_.\-]{10,200}$/, pixblack_webhook_secret: /^whsec_[A-Za-z0-9_.\-]{10,200}$/, iron_token: /^[A-Za-z0-9_.\-]{10,200}$/, iron_oferta: /^[A-Za-z0-9_\-]{3,64}$/, iron_produto: /^[A-Za-z0-9_\-]{3,64}$/ };

    if (b.acao === "integ_salvar") {
      const salvos = [];
      for (const [k, re] of Object.entries(CHAVES)) {
        if (typeof b[k] !== "string" || !b[k].trim()) continue;
        const v = b[k].trim();
        if (!re.test(v)) return res.status(400).json({ erro: `Valor inválido em ${k.replace(/_/g, " ")}.` });
        await gravarPrivado(k, v);
        salvos.push(k);
      }
      return res.json({ ok: true, salvos });
    }

    if (b.acao === "integ_remover") {
      const grupos = { utmify: ["utmify_token", "utmify_pixel", "utmify_pixel_tiktok"], telegram: ["telegram_token", "telegram_chat"], pix: ["pix_gateway", "pixblack_api_key", "pixblack_webhook_secret", "iron_token", "iron_oferta", "iron_produto"] };
      for (const k of grupos[b.grupo] || []) await apagarPrivado(k);
      return res.json({ ok: true });
    }

    if (b.acao === "ironpay_configurar") {
      const p = await lerPrivado(["iron_token", "iron_oferta", "iron_produto"]);
      const token = process.env.IRONPAY_TOKEN || p.iron_token;
      if (!token) return res.status(400).json({ erro: "Cole primeiro o token de API da IronPay." });
      if (p.iron_oferta && p.iron_produto) return res.json({ ok: true, oferta: p.iron_oferta, produto: p.iron_produto, existente: true });

      const [cfg] = await db("hdj_config?id=eq.1&select=dados").catch(() => [null]);
      const dados = cfg?.dados || {};
      const nome = dados?.produto?.nome || "Moto elétrica HDJ";
      const modelo = dados?.produto?.modelo || "GT-V8 1000W";
      const total = Math.round(Number(dados.precoTotal || 7243) * 100);
      const headers = { "Content-Type": "application/json", Accept: "application/json" };
      const api = (path) => `https://api.ironpayapp.com.br/api/public/v1${path}?api_token=${encodeURIComponent(token)}`;
      let produto = p.iron_produto;

      if (!produto) {
        const r = await fetch(api("/products"), { method: "POST", headers, body: JSON.stringify({
          title: `${nome} · ${modelo}`.slice(0, 120),
          cover: null,
          sale_page: process.env.PUBLIC_URL || null,
          payment_type: 1,
          product_type: "digital",
          delivery_type: 1,
          id_category: 1,
          amount: total,
        }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return res.status(400).json({ erro: `IronPay não criou o produto (${r.status}): ${String(j.message || j.error || "dados inválidos").slice(0, 180)}` });
        const d = j.data || j;
        produto = String(d.hash || d.product_hash || "");
        if (!produto) return res.status(400).json({ erro: "A IronPay criou o produto, mas não devolveu o hash." });
        await gravarPrivado("iron_produto", produto);
      }

      let oferta = p.iron_oferta;
      if (!oferta) {
        const r = await fetch(api(`/products/${encodeURIComponent(produto)}/offers`), { method: "POST", headers, body: JSON.stringify({
          title: `${nome} · Entrada no Pix`.slice(0, 120),
          cover: null,
          amount: total,
        }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return res.status(400).json({ erro: `IronPay não criou a oferta (${r.status}): ${String(j.message || j.error || "dados inválidos").slice(0, 180)}` });
        const d = j.data || j;
        oferta = String(d.hash || d.offer_hash || "");
        if (!oferta) return res.status(400).json({ erro: "A IronPay criou a oferta, mas não devolveu o hash." });
        await gravarPrivado("iron_oferta", oferta);
      }
      return res.json({ ok: true, produto, oferta, criado: true });
    }

    if (b.acao === "integ_teste") {
      if (b.grupo === "telegram") {
        const p = await lerPrivado(["telegram_token", "telegram_chat"]);
        const r = await enviarTelegram(p.telegram_token, p.telegram_chat, "✅ Teste do painel: os avisos de novos clientes vão chegar aqui.");
        return r.ok ? res.json({ ok: true }) : res.status(400).json({ erro: r.erro });
      }
      if (b.grupo === "pix") {
        const sel = await lerPrivado(["pix_gateway"]);
        const gateway = process.env.PIX_GATEWAY || sel.pix_gateway || null;
        if (gateway !== "ironpay") {
          const pb = await lerPrivado(["pixblack_api_key"]);
          if (process.env.PIXBLACK_API_KEY || pb.pixblack_api_key) return res.json({ ok: true, conta: "Pix Black conectado" });
        }
        const p = await lerPrivado(["iron_token", "iron_oferta"]);
        const token = process.env.IRONPAY_TOKEN || p.iron_token;
        const oferta = process.env.IRONPAY_OFFER || p.iron_oferta;
        if (!token) return res.status(400).json({ erro: "Cole o token de API da IronPay." });
        try {
          const r = await fetch(`https://api.ironpayapp.com.br/api/public/v1/balance?api_token=${encodeURIComponent(token)}`, { headers: { Accept: "application/json" } });
          if (!r.ok) return res.status(400).json({ erro: `IronPay recusou o token (${r.status}).` });
          const j = await r.json().catch(() => ({}));
          const d = j.data || j;
          const saldo = Number(d.available || 0) / 100;
          const conta = Number.isFinite(saldo) && saldo > 0
            ? `saldo ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
            : "conta conectada";
          if (!oferta) return res.json({ ok: true, conta, aviso: "Falta o hash da oferta para gerar o Pix." });
          return res.json({ ok: true, conta });
        } catch {
          return res.status(400).json({ erro: "Não consegui falar com a IronPay." });
        }
      }
      if (b.grupo === "utmify") {
        const p = await lerPrivado(["utmify_token"]);
        const r = await enviarUtmify(process.env.UTMIFY_TOKEN || p.utmify_token, {
          orderId: `teste-${Date.now()}`, status: "waiting_payment", createdAt: Date.now(), teste: true,
          nome: "Teste do painel", email: "teste@exemplo.com", telefone: "11999999999", cpf: null,
          produto: "Teste · Moto elétrica HDJ GT-V8", centavos: 100, utm: { utm_source: "teste_painel" },
        });
        return r.ok ? res.json({ ok: true }) : res.status(400).json({ erro: r.erro || `UTMify ${r.status || "recusou o pedido"}` });
      }
    }

    return res.status(400).json({ erro: "ação desconhecida" });
  } catch {
    return res.status(502).json({ erro: "Não consegui falar com o banco. Tente de novo." });
  }
}

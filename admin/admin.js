const PADRAO = window.CONFIG_PADRAO;
const CHAVE = "rastro_admin_pwd";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const brl = (n) => (n == null || n === "" ? "—" : (+n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const digits = (v) => String(v || "").replace(/\D/g, "");
const lerSenha = () => { try { return sessionStorage.getItem(CHAVE) || ""; } catch { return ""; } };
const gravarSenha = (v) => { try { v ? sessionStorage.setItem(CHAVE, v) : sessionStorage.removeItem(CHAVE); } catch {} };

const ETAPAS = [
  ["iniciado", "Abriu o chat"],
  ["produto_apresentado", "Viu a moto"],
  ["condicoes_aceitas", "Aceitou condições"],
  ["cadastro_confirmado", "Cadastro feito"],
  ["vencimento_escolhido", "Escolheu vencimento"],
  ["proposta_aceita", "Aceitou proposta"],
  ["contrato_aceito", "Aceitou contrato"],
  ["endereco_confirmado", "Endereço confirmado"],
  ["aguardando_pagamento", "Chegou ao Pix"],
  ["pago", "Pago"],
];
const ORDEM = Object.fromEntries(ETAPAS.map(([k], i) => [k, i]));
const NOME_ETAPA = Object.fromEntries(ETAPAS);
NOME_ETAPA.sem_interesse = "Sem interesse";
const ord = (e) => (e === "sem_interesse" ? -1 : ORDEM[e] ?? 0);
const tomEtapa = (e) => (e === "sem_interesse" ? "bad" : ord(e) >= ORDEM.aguardando_pagamento ? "ok" : ord(e) >= ORDEM.contrato_aceito ? "amb" : ord(e) >= ORDEM.cadastro_confirmado ? "info" : "");
const STATUS = [["novo", "Novo", ""], ["em_contato", "Em contato", "info"], ["aprovado", "Aprovado", "ok"], ["recusado", "Recusado", "bad"], ["vendido", "Vendido", "amb"]];
const NOME_STATUS = Object.fromEntries(STATUS.map(([k, n]) => [k, n]));
const TOM_STATUS = Object.fromEntries(STATUS.map(([k, , t]) => [k, t]));
const pill = (txt, tom) => `<span class="pill ${tom || ""}">${esc(txt)}</span>`;

const SECOES = [
  { id: "inicio", label: "Visão geral", curto: "Início", grupo: "Vendas" },
  { id: "clientes", label: "Clientes", curto: "Clientes", grupo: "Vendas" },
  { id: "abandonos", label: "Abandonos", curto: "Abandonos", grupo: "Vendas" },
  { id: "aovivo", label: "Tráfego ao vivo", curto: "Ao vivo", grupo: "Loja" },
  { id: "ajustes", label: "Configurações", curto: "Ajustes", grupo: "Loja" },
];

const st = { clientes: [], dias: 7, filtro: "todos", status: "todos", busca: "", carregado: false };

document.querySelectorAll("[data-loja]").forEach((el) => (el.textContent = PADRAO.loja));

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2600);
}

async function api(acao, dados = {}, senha = lerSenha()) {
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-senha": senha },
    body: JSON.stringify({ acao, ...dados }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { gravarSenha(""); mostrarLogin("Senha incorreta ou sessão expirada."); throw new Error("401"); }
  if (!r.ok) throw new Error(j.erro || "Algo deu errado. Tente de novo.");
  return j;
}

function mostrarLogin(erro = "") {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#login-err").textContent = erro;
  $("#senha").focus();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const senha = $("#senha").value;
  $("#login-btn").disabled = true;
  $("#login-err").textContent = "";
  try {
    await api("entrar", {}, senha);
    gravarSenha(senha);
    iniciar();
  } catch (err) {
    if (err.message !== "401") $("#login-err").textContent = err.message;
  } finally {
    $("#login-btn").disabled = false;
  }
});

$("#sair").onclick = () => { gravarSenha(""); location.hash = ""; mostrarLogin(); };

function navHtml(classe) {
  if (classe === "tabs") return SECOES.map((s) => `<a href="#${s.id}" data-sec="${s.id}"><svg><use href="#i-${s.id}"/></svg>${s.curto}</a>`).join("");
  const grupos = [...new Set(SECOES.map((s) => s.grupo))];
  return grupos.map((g) => `<div class="nav-grupo"><span>${g}</span>${SECOES.filter((s) => s.grupo === g)
    .map((s) => `<a href="#${s.id}" data-sec="${s.id}"><svg><use href="#i-${s.id}"/></svg>${s.label}${s.id === "abandonos" ? '<em class="count" id="cnt-ab"></em>' : ""}</a>`).join("")}</div>`).join("");
}

async function iniciar() {
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#nav").innerHTML = navHtml("nav");
  $("#tabs").innerHTML = navHtml("tabs");
  await carregar();
  render();
}

async function carregar() {
  try {
    const { clientes } = await api("listar", { dias: 90 });
    st.clientes = clientes || [];
    st.carregado = true;
    const n = abandonos().length;
    const c = $("#cnt-ab");
    if (c) { c.textContent = n || ""; c.hidden = !n; }
  } catch (e) {
    if (e.message !== "401") toast(e.message);
  }
}

addEventListener("hashchange", render);
let timerVivo = null;

function secaoAtual() {
  const h = location.hash.slice(1);
  return SECOES.some((s) => s.id === h) ? h : "inicio";
}

function render() {
  if ($("#app").hidden) return;
  const sec = secaoAtual();
  document.querySelectorAll("[data-sec]").forEach((a) => (a.dataset.sec === sec ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  $("#titulo").textContent = SECOES.find((s) => s.id === sec).label;
  $("#bar-r").innerHTML = "";
  clearInterval(timerVivo);
  ({ inicio: renderInicio, clientes: renderClientes, abandonos: renderAbandonos, aovivo: renderAoVivo, ajustes: renderAjustes })[sec]();
}

const noPeriodo = (dias) => {
  const desde = dias === 1 ? new Date(new Date().setHours(0, 0, 0, 0)) : new Date(Date.now() - dias * 864e5);
  return st.clientes.filter((c) => new Date(c.criado_em) >= desde);
};

function segmentado(opcoes, atual, onPick) {
  const wrap = document.createElement("div");
  wrap.className = "seg";
  opcoes.forEach(([v, rot]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = rot;
    b.setAttribute("aria-pressed", String(v === atual));
    b.onclick = () => onPick(v);
    wrap.appendChild(b);
  });
  return wrap;
}

function botaoAtualizar() {
  const b = document.createElement("button");
  b.className = "btn ghost sm";
  b.textContent = "Atualizar";
  b.onclick = async () => { b.disabled = true; await carregar(); render(); toast("Lista atualizada"); };
  return b;
}

function renderInicio() {
  const bar = $("#bar-r");
  bar.append(segmentado([[1, "Hoje"], [7, "7 dias"], [30, "30 dias"]], st.dias, (v) => { st.dias = v; render(); }), botaoAtualizar());
  const lista = noPeriodo(st.dias);
  const nivel = (c) => (c.etapa === "sem_interesse" ? ORDEM.produto_apresentado : ord(c.etapa));
  const chegou = (e) => lista.filter((c) => nivel(c) >= ORDEM[e]).length;
  const pix = lista.filter((c) => ord(c.etapa) >= ORDEM.aguardando_pagamento);
  const entradas = pix.reduce((s, c) => s + (+c.entrada || 0), 0);
  const conv = lista.length ? Math.round((pix.length / lista.length) * 1000) / 10 : 0;
  const passos = ["iniciado", "condicoes_aceitas", "cadastro_confirmado", "contrato_aceito", "aguardando_pagamento"];
  const total = lista.length || 1;

  const porDia = {};
  const nDias = st.dias === 1 ? 1 : Math.min(st.dias, 14);
  for (let i = nDias - 1; i >= 0; i--) porDia[new Date(Date.now() - i * 864e5).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })] = 0;
  lista.forEach((c) => { const k = new Date(c.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); if (k in porDia) porDia[k]++; });
  const maxDia = Math.max(1, ...Object.values(porDia));

  $("#view").innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Conversas iniciadas</span><b>${lista.length}</b><small>abriram o chat</small></div>
      <div class="kpi"><span>Cadastros feitos</span><b>${chegou("cadastro_confirmado")}</b><small>com CPF e telefone</small></div>
      <div class="kpi"><span>Chegaram ao Pix</span><b>${pix.length}</b><small>${conv.toLocaleString("pt-BR")}% das conversas</small></div>
      <div class="kpi"><span>Entradas desses pedidos</span><b class="num">${brl(entradas)}</b><small>soma das entradas escolhidas</small></div>
    </div>
    <div class="two">
      <section class="panel"><div class="panel-h"><div><h3>Funil do chat</h3><p>Quantos chegaram até cada etapa</p></div></div>
        <div class="panel-b funil">${passos.map((e) => { const n = chegou(e); return `<div class="funil-row"><span>${esc(NOME_ETAPA[e])}</span><div class="funil-bar"><i style="width:${(n / total) * 100}%"></i></div><b>${n}<small>${Math.round((n / total) * 100)}%</small></b></div>`; }).join("")}</div>
      </section>
      <section class="panel"><div class="panel-h"><div><h3>Conversas por dia</h3><p>${nDias === 1 ? "Hoje" : `Últimos ${nDias} dias`}</p></div></div>
        <div class="panel-b"><div class="dias">${Object.entries(porDia).map(([d, n]) => `<div class="dia" title="${d}: ${n}"><i style="height:${(n / maxDia) * 100}%"></i><span>${nDias > 7 ? d.slice(0, 2) : d}</span></div>`).join("")}</div></div>
      </section>
    </div>
    <section class="panel" style="margin-bottom:14px"><div class="panel-h"><div><h3>De onde vêm os clientes</h3><p>Pela UTM do anúncio (ou de onde a pessoa chegou, quando não tem UTM)</p></div></div>
      ${(() => {
        const g = {};
        lista.forEach((c) => { const k = rotuloOrigem(origemLead(c)); const x = (g[k] ||= { n: 0, cad: 0, pix: 0, ent: 0 }); x.n++; if (nivel(c) >= ORDEM.cadastro_confirmado) x.cad++; if (nivel(c) >= ORDEM.aguardando_pagamento) { x.pix++; x.ent += +c.entrada || 0; } });
        const linhas = Object.entries(g).sort((a, b) => b[1].n - a[1].n);
        return linhas.length ? `<div class="table-wrap" style="display:block"><table class="t"><thead><tr><th>Origem · campanha</th><th>Conversas</th><th>Cadastros</th><th>Chegaram ao Pix</th><th>Entradas</th></tr></thead><tbody>${linhas.map(([k, x]) => `<tr style="cursor:default"><td>${esc(k)}</td><td class="num">${x.n}</td><td class="num">${x.cad}</td><td class="num">${x.pix}</td><td class="num">${brl(x.ent)}</td></tr>`).join("")}</tbody></table></div>` : vazio("Sem dados de origem ainda", "Use UTMs nos links dos anúncios para ver cada campanha aqui.");
      })()}
    </section>
    <section class="panel"><div class="panel-h"><div><h3>Últimos clientes</h3><p>Toque para ver os detalhes</p></div><a class="btn ghost sm" href="#clientes">Ver todos</a></div>
      ${lista.length ? `<div class="recent">${lista.slice(0, 8).map((c) => `<button type="button" data-id="${c.id}"><div><b>${esc(c.nome || c.primeiro_nome || "Sem nome")}</b><span>${esc(c.telefone || "sem telefone")} · ${quando(c.atualizado_em)}</span></div>${pill(NOME_ETAPA[c.etapa] || c.etapa, tomEtapa(c.etapa))}</button>`).join("")}</div>`
        : vazio("Nenhuma conversa nesse período", "Quando alguém abrir o chat do site, aparece aqui.")}
    </section>`;
  ligarAbrir();
}

function hostDe(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } }
function origemDe(o) {
  o = o || {};
  if (o.utm_source) return { fonte: o.utm_source, campanha: o.utm_campaign || "", criativo: o.utm_content || "" };
  const h = hostDe(o.referrer);
  if (!h || h.includes("vercel.app") || h === location.hostname) return { fonte: "Direto", campanha: "", criativo: "" };
  if (/google\./.test(h)) return { fonte: "Google orgânico", campanha: "", criativo: "" };
  if (/facebook|instagram|fb\.|l\.instagram/.test(h)) return { fonte: "Meta sem UTM", campanha: "", criativo: "" };
  if (/tiktok/.test(h)) return { fonte: "TikTok sem UTM", campanha: "", criativo: "" };
  return { fonte: h, campanha: "", criativo: "" };
}
const origemLead = (c) => origemDe({ ...((c.dados || {}).origem || {}), utm_source: c.utm_source || ((c.dados || {}).origem || {}).utm_source, utm_campaign: c.utm_campaign || ((c.dados || {}).origem || {}).utm_campaign, utm_content: c.utm_content || ((c.dados || {}).origem || {}).utm_content });
const rotuloOrigem = (o) => [o.fonte, o.campanha].filter(Boolean).join(" · ");

function vazio(t, s) { return `<div class="vazio"><b>${esc(t)}</b>${esc(s)}</div>`; }

function quando(iso) {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function filtrados() {
  const q = st.busca.trim().toLowerCase();
  const qd = digits(q);
  return st.clientes.filter((c) => {
    if (st.filtro === "pix" && ord(c.etapa) < ORDEM.aguardando_pagamento) return false;
    if (st.filtro === "contrato" && ord(c.etapa) < ORDEM.contrato_aceito) return false;
    if (st.filtro === "cadastro" && ord(c.etapa) < ORDEM.cadastro_confirmado) return false;
    if (st.filtro === "sem_interesse" && c.etapa !== "sem_interesse") return false;
    if (st.status !== "todos" && (c.status_admin || "novo") !== st.status) return false;
    if (!q) return true;
    return [c.nome, c.primeiro_nome, c.email, c.cidade, c.pedido].some((v) => String(v || "").toLowerCase().includes(q)) ||
      (qd.length >= 3 && [c.cpf, c.telefone].some((v) => digits(v).includes(qd)));
  });
}

function renderClientes() {
  const bar = $("#bar-r");
  const csv = document.createElement("button");
  csv.className = "btn ghost sm";
  csv.textContent = "Exportar CSV";
  csv.onclick = exportarCsv;
  bar.append(csv, botaoAtualizar());

  const chipsEtapa = [["todos", "Todos"], ["cadastro", "Com cadastro"], ["contrato", "Aceitaram contrato"], ["pix", "Chegaram ao Pix"], ["sem_interesse", "Sem interesse"]];
  const chipsStatus = [["todos", "Qualquer status"], ...STATUS.map(([k, n]) => [k, n])];
  $("#view").innerHTML = `
    <div class="toolbar"><input class="search" id="busca" type="search" placeholder="Buscar por nome, CPF, telefone, cidade ou pedido" value="${esc(st.busca)}" aria-label="Buscar clientes"></div>
    <div class="toolbar"><div class="chips" id="ch-etapa">${chipsEtapa.map(([v, n]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${st.filtro === v}">${n}</button>`).join("")}</div></div>
    <div class="toolbar"><div class="chips" id="ch-status">${chipsStatus.map(([v, n]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${st.status === v}">${n}</button>`).join("")}</div></div>
    <section class="panel" id="lista"></section>`;
  $("#busca").addEventListener("input", (e) => { st.busca = e.target.value; pintarLista(); });
  $("#ch-etapa").onclick = (e) => { const b = e.target.closest(".chip"); if (b) { st.filtro = b.dataset.v; renderClientes(); } };
  $("#ch-status").onclick = (e) => { const b = e.target.closest(".chip"); if (b) { st.status = b.dataset.v; renderClientes(); } };
  pintarLista();
}

function pintarLista() {
  const l = filtrados();
  const el = $("#lista");
  if (!l.length) { el.innerHTML = vazio(st.clientes.length ? "Ninguém com esse filtro" : "Ainda não há clientes", st.clientes.length ? "Tente outro filtro ou limpe a busca." : "Quando alguém abrir o chat do site, aparece aqui."); return; }
  el.innerHTML = `
    <div class="table-wrap"><table class="t"><thead><tr><th>Cliente</th><th>Telefone</th><th>Entrada · parcela</th><th>Etapa</th><th>Status</th><th>Atualizado</th></tr></thead><tbody>
    ${l.map((c) => `<tr data-id="${c.id}"><td class="who"><b>${esc(c.nome || c.primeiro_nome || "Sem nome")}</b><span>${esc([c.cidade, c.uf].filter(Boolean).join("/") || c.email || "")}</span></td>
      <td class="num">${esc(c.telefone || "—")}</td>
      <td class="num">${c.entrada ? `${brl(c.entrada)}<div class="sub">${PADRAO.parcelas}× ${brl(c.parcela)}</div>` : "—"}</td>
      <td>${pill(NOME_ETAPA[c.etapa] || c.etapa, tomEtapa(c.etapa))}</td>
      <td>${pill(NOME_STATUS[c.status_admin || "novo"], TOM_STATUS[c.status_admin || "novo"])}</td>
      <td class="sub">${quando(c.atualizado_em)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="cards">${l.map((c) => `<button type="button" data-id="${c.id}"><div class="l1"><b>${esc(c.nome || c.primeiro_nome || "Sem nome")}</b>${pill(NOME_ETAPA[c.etapa] || c.etapa, tomEtapa(c.etapa))}</div>
      <div class="l2"><span class="num">${esc(c.telefone || "sem telefone")}</span>${c.entrada ? `<span>· entrada ${brl(c.entrada)}</span>` : ""}<span>· ${quando(c.atualizado_em)}</span>${pill(NOME_STATUS[c.status_admin || "novo"], TOM_STATUS[c.status_admin || "novo"])}</div></button>`).join("")}</div>`;
  ligarAbrir();
}

function abandonos() {
  const limite = Date.now() - 30 * 60000;
  return st.clientes.filter((c) => c.etapa !== "sem_interesse" && ord(c.etapa) < ORDEM.aguardando_pagamento && new Date(c.atualizado_em) < limite && c.primeiro_nome);
}

function msgRecuperacao(c) {
  const nome = c.primeiro_nome || (c.nome || "").split(" ")[0] || "";
  if (ord(c.etapa) >= ORDEM.contrato_aceito) return `Olá, ${nome}! Aqui é da ${PADRAO.loja}. Seu pedido da moto elétrica HDJ GT-V8 ficou quase pronto, só faltou concluir. Quer que eu te ajude a terminar?`;
  if (ord(c.etapa) >= ORDEM.condicoes_aceitas) return `Oi, ${nome}! Aqui é da ${PADRAO.loja}. Vi que você começou seu pedido da HDJ GT-V8. Ficou alguma dúvida sobre as condições ou o cadastro? Posso te ajudar.`;
  return `Olá, ${nome}! Tudo bem? Aqui é da ${PADRAO.loja}. Você demonstrou interesse na moto elétrica HDJ GT-V8. Ficou alguma dúvida sobre a moto ou as condições de pagamento?`;
}

const waLink = (tel, txt) => { const d = digits(tel); return d.length >= 10 ? `https://wa.me/55${d}${txt ? `?text=${encodeURIComponent(txt)}` : ""}` : null; };

function renderAbandonos() {
  $("#bar-r").append(botaoAtualizar());
  const l = abandonos();
  $("#view").innerHTML = `<section class="panel"><div class="panel-h"><div><h3>Pararam no meio do pedido</h3><p>Sem resposta há mais de 30 minutos e antes do Pix. A mensagem de recuperação já vem escrita.</p></div></div>
    ${l.length ? `<div class="recent">${l.map((c) => {
      const wa = waLink(c.telefone, msgRecuperacao(c));
      return `<div class="recent-row" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)">
        <button type="button" data-id="${c.id}" style="padding:0;border:0;flex:1;min-width:0"><div><b>${esc(c.nome || c.primeiro_nome)}</b><span>Parou em: ${esc(NOME_ETAPA[c.etapa] || c.etapa)} · ${quando(c.atualizado_em)}${c.telefone ? ` · ${esc(c.telefone)}` : ""}</span></div></button>
        ${wa ? `<a class="btn wa sm" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : '<span class="sub">sem telefone</span>'}</div>`;
    }).join("")}</div>` : vazio("Nenhum abandono agora", "Quem parar no meio do chat por mais de 30 minutos aparece aqui.")}</section>`;
  ligarAbrir();
}

async function renderAoVivo() {
  $("#bar-r").innerHTML = `<span class="pill ok" id="vivo-pill">Ao vivo</span>`;
  $("#view").innerHTML = `<section class="panel"><div class="panel-b">Carregando…</div></section>`;
  const pintar = async () => {
    if (secaoAtual() !== "aovivo") return clearInterval(timerVivo);
    let r;
    try { r = await api("ao_vivo"); } catch (e) { if (e.message !== "401") toast(e.message); return; }
    const agora = new Date(r.agora).getTime();
    const ses = r.sessoes || [];
    const online = ses.filter((x) => agora - new Date(x.visto_em) < 75000);
    const hoje = ses.filter((x) => new Date(x.criado_em) >= new Date(r.inicioDia));
    const porLead = Object.fromEntries(st.clientes.map((c) => [c.id, c]));
    const etapaDe = (x) => (x.lead_id && porLead[x.lead_id] ? porLead[x.lead_id].etapa : null);
    const recentes = ses.filter((x) => agora - new Date(x.visto_em) < 30 * 60000).slice(0, 60);
    const g = {};
    hoje.forEach((x) => { const k = rotuloOrigem(origemDe(x)); const y = (g[k] ||= { v: 0, chat: 0, cad: 0, pix: 0 }); y.v++; if (x.chat) y.chat++; const e = etapaDe(x); if (e && ord(e) >= ORDEM.cadastro_confirmado) y.cad++; if (e && ord(e) >= ORDEM.aguardando_pagamento) y.pix++; });
    $("#vivo-pill").textContent = `${online.length} no site agora`;
    $("#view").innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>No site agora</span><b>${online.length}</b><small>visto no último minuto</small></div>
        <div class="kpi"><span>No chat agora</span><b>${online.filter((x) => x.chat).length}</b><small>com a conversa aberta</small></div>
        <div class="kpi"><span>Visitas hoje</span><b>${hoje.length}</b><small>${hoje.filter((x) => x.device === "mobile").length} pelo celular</small></div>
        <div class="kpi"><span>Abriram o chat hoje</span><b>${hoje.filter((x) => x.chat).length}</b><small>${hoje.length ? Math.round((hoje.filter((x) => x.chat).length / hoje.length) * 100) : 0}% das visitas</small></div>
      </div>
      <section class="panel" style="margin-bottom:14px"><div class="panel-h"><div><h3>Visitantes nos últimos 30 minutos</h3><p>Atualiza sozinho a cada 10 segundos</p></div></div>
        ${recentes.length ? `<div class="table-wrap" style="display:block"><table class="t"><thead><tr><th>Origem</th><th>Criativo</th><th>Aparelho</th><th>Chat</th><th>Visto</th></tr></thead><tbody>${recentes.map((x) => { const o = origemDe(x); const e = etapaDe(x); const on = agora - new Date(x.visto_em) < 75000;
          return `<tr ${x.lead_id && porLead[x.lead_id] ? `data-id="${x.lead_id}"` : 'style="cursor:default"'}><td class="who"><b>${on ? '<span class="pill ok" style="margin-right:6px">agora</span>' : ""}${esc(o.fonte)}</b><span>${esc(o.campanha || "")}</span></td><td class="sub">${esc(o.criativo || "—")}</td><td>${x.device === "mobile" ? "Celular" : "Computador"}</td><td>${e ? pill(NOME_ETAPA[e] || e, tomEtapa(e)) : x.chat ? pill("Abriu o chat", "") : '<span class="sub">—</span>'}</td><td class="sub">${quando(x.visto_em)}</td></tr>`; }).join("")}</tbody></table></div>` : vazio("Ninguém no site nos últimos 30 minutos", "Quando alguém entrar, aparece aqui com a origem do anúncio.")}
      </section>
      <section class="panel"><div class="panel-h"><div><h3>Origem das visitas de hoje</h3><p>Visitas, conversas, cadastros e Pix por UTM</p></div></div>
        ${Object.keys(g).length ? `<div class="table-wrap" style="display:block"><table class="t"><thead><tr><th>Origem · campanha</th><th>Visitas</th><th>Abriram o chat</th><th>Cadastros</th><th>Pix</th></tr></thead><tbody>${Object.entries(g).sort((a, b) => b[1].v - a[1].v).map(([k, y]) => `<tr style="cursor:default"><td>${esc(k)}</td><td class="num">${y.v}</td><td class="num">${y.chat}</td><td class="num">${y.cad}</td><td class="num">${y.pix}</td></tr>`).join("")}</tbody></table></div>` : vazio("Sem visitas hoje", "")}
      </section>`;
    ligarAbrir();
  };
  await pintar();
  timerVivo = setInterval(pintar, 10000);
}

function ligarAbrir() {
  document.querySelectorAll("#view [data-id]").forEach((el) => (el.onclick = () => abrirCliente(el.dataset.id)));
}

function abrirCliente(id) {
  const c = st.clientes.find((x) => x.id === id);
  if (!c) return;
  const d = c.dados || {};
  const end = d.endereco || {};
  const tel = c.telefone;
  const wa = waLink(tel, `Olá, ${c.primeiro_nome || ""}! Aqui é da ${PADRAO.loja}, sobre o seu pedido da moto elétrica HDJ GT-V8.`);
  const cpfMask = c.cpf ? c.cpf.replace(/^(\d{3})\.\d{3}\.(\d{3})-\d{2}$/, "$1.***.$2-**") : "—";
  $("#dw-titulo").textContent = c.nome || c.primeiro_nome || "Sem nome";
  $("#dw-sub").innerHTML = `${pill(NOME_ETAPA[c.etapa] || c.etapa, tomEtapa(c.etapa))} &nbsp;${c.pedido ? `Pedido ${esc(c.pedido)} · ` : ""}desde ${new Date(c.criado_em).toLocaleString("pt-BR")}`;
  const hist = (d.historico || []).map((h) => h.html ? `<p class="card">[cartão enviado pela atendente]</p>` : `<p class="${h.quem === "cliente" ? "me" : ""}">${esc(h.texto)}</p>`).join("");
  const ev = (d.eventos || []).map((e) => `<li>${esc(NOME_ETAPA[e.evento] || e.evento.replace(/_/g, " "))}${e.valor ? ` (${brl(e.valor)})` : ""}<span>${new Date(e.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></li>`).join("");
  $("#dw-body").innerHTML = `
    <div class="acoes">
      ${wa ? `<a class="btn wa" href="${wa}" target="_blank" rel="noopener">Chamar no WhatsApp</a>` : ""}
      ${tel ? `<button type="button" class="btn ghost" id="dw-copiar">Copiar telefone</button>` : ""}
    </div>
    <div class="sec"><h4>Dados</h4><dl class="dl">
      <dt>Nome</dt><dd>${esc(c.nome || c.primeiro_nome || "—")}</dd>
      <dt>CPF</dt><dd><span id="dw-cpf" class="num">${esc(cpfMask)}</span>${c.cpf ? '<button type="button" class="linkbtn" id="dw-vercpf">mostrar</button>' : ""}</dd>
      <dt>Telefone</dt><dd class="num">${esc(tel || "—")}</dd>
      <dt>E-mail</dt><dd>${esc(c.email || "—")}</dd>
      <dt>Entrada</dt><dd class="num">${brl(c.entrada)}</dd>
      <dt>Parcelas</dt><dd class="num">${c.parcela ? `${PADRAO.parcelas}× ${brl(c.parcela)}` : "—"}</dd>
      <dt>Vencimento</dt><dd>${c.dia_vencimento ? `Dia ${c.dia_vencimento}${d.primeiroVencimento ? ` · 1º boleto ${esc(d.primeiroVencimento)}` : ""}` : "—"}</dd>
      <dt>Endereço</dt><dd>${end.rua ? `${esc(end.rua)}, ${esc(end.numero)}${end.complemento ? ` · ${esc(end.complemento)}` : ""}<br>${esc(end.bairro)} · ${esc(end.cidade)}/${esc(end.uf)} · ${esc(end.cep)}` : "—"}</dd>
      <dt>Origem</dt><dd>${(() => { const o = origemLead(c); const og = d.origem || {}; return `${esc(o.fonte)}${o.campanha ? `<br><span class="sub">Campanha: ${esc(o.campanha)}</span>` : ""}${o.criativo ? `<br><span class="sub">Criativo: ${esc(o.criativo)}</span>` : ""}${og.utm_medium ? `<br><span class="sub">Meio: ${esc(og.utm_medium)}</span>` : ""}${og.utm_term ? `<br><span class="sub">Termo: ${esc(og.utm_term)}</span>` : ""}`; })()}</dd>
      <dt>Contrato</dt><dd>${d.aceiteContrato ? `Aceito em ${new Date(d.aceiteContrato.em).toLocaleString("pt-BR")} (${esc(d.aceiteContrato.versao)})` : "Não aceito"}</dd>
    </dl></div>
    <div class="sec"><h4>Acompanhamento</h4>
      <div class="form-row"><label for="dw-status">Status</label><select id="dw-status">${STATUS.map(([k, n]) => `<option value="${k}" ${k === (c.status_admin || "novo") ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="form-row" style="margin-top:10px"><label for="dw-notas">Anotações</label><textarea id="dw-notas" placeholder="Ex.: liguei dia 08, pediu para retornar à tarde">${esc(c.notas || "")}</textarea></div>
      <button type="button" class="btn" id="dw-salvar" style="margin-top:10px">Salvar</button>
    </div>
    ${ev ? `<div class="sec"><h4>Etapas</h4><ul class="timeline">${ev}</ul></div>` : ""}
    <div class="sec"><h4>Conversa no chat</h4><div class="conversa">${hist || "<p>Sem mensagens.</p>"}</div></div>`;
  const cp = $("#dw-copiar");
  if (cp) cp.onclick = () => navigator.clipboard.writeText(tel).then(() => toast("Telefone copiado"), () => toast(tel));
  const vc = $("#dw-vercpf");
  if (vc) vc.onclick = () => { $("#dw-cpf").textContent = c.cpf; vc.remove(); };
  $("#dw-salvar").onclick = async (e) => {
    e.target.disabled = true;
    try {
      const status_admin = $("#dw-status").value;
      const notas = $("#dw-notas").value;
      await api("atualizar", { id: c.id, status_admin, notas });
      Object.assign(c, { status_admin, notas });
      toast("Salvo");
      render();
    } catch (err) { if (err.message !== "401") toast(err.message); }
    e.target.disabled = false;
  };
  $("#drawer").hidden = false;
  document.body.style.overflow = "hidden";
}

function fecharGaveta() { $("#drawer").hidden = true; document.body.style.overflow = ""; }
$("#drawer").addEventListener("click", (e) => { if (e.target.closest("[data-fechar]")) fecharGaveta(); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#drawer").hidden) fecharGaveta(); });

function exportarCsv() {
  const cel = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const cab = ["Criado em", "Nome", "CPF", "Telefone", "E-mail", "Cidade", "UF", "Entrada", "Parcela", "Vencimento", "Etapa", "Status", "Pedido", "Anotações"];
  const linhas = filtrados().map((c) => [new Date(c.criado_em).toLocaleString("pt-BR"), c.nome || c.primeiro_nome, c.cpf, c.telefone, c.email, c.cidade, c.uf, c.entrada, c.parcela, c.dia_vencimento, NOME_ETAPA[c.etapa] || c.etapa, NOME_STATUS[c.status_admin || "novo"], c.pedido, c.notas]);
  const csv = "﻿" + [cab, ...linhas].map((l) => l.map(cel).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function renderAjustes() {
  $("#view").innerHTML = `<section class="panel"><div class="panel-b">Carregando…</div></section>`;
  let salvo = {};
  try { salvo = (await api("config_ler")).config || {}; } catch (e) { if (e.message === "401") return; toast(e.message); }
  const v = { ...PADRAO, ...salvo, produto: { ...PADRAO.produto, ...(salvo.produto || {}) }, empresa: { ...PADRAO.empresa, ...(salvo.empresa || {}) } };
  const campo = (id, rot, valor, extra = "", ajuda = "") => `<div class="form-row ${extra.includes("full") ? "full" : ""}"><label for="${id}">${rot}</label><input id="${id}" value="${esc(valor ?? "")}" ${extra.replace("full", "")}>${ajuda ? `<small>${ajuda}</small>` : ""}</div>`;
  $("#view").innerHTML = `
    <section class="panel"><div class="panel-h"><div><h3>Condições da oferta</h3><p>O que aparece no site e no chat. Muda em até 1 minuto depois de salvar.</p></div></div>
      <div class="panel-b"><div class="cfg">
        ${campo("c-preco", "Valor total da moto (R$)", v.precoTotal, 'inputmode="decimal"')}
        ${campo("c-parcelas", "Quantidade de boletos", v.parcelas, 'inputmode="numeric"')}
        ${campo("c-min", "Entrada mínima (R$)", v.adesao, 'inputmode="decimal"')}
        ${campo("c-max", "Entrada máxima (R$)", v.entradaMaxima, 'inputmode="decimal"', "Limite do campo “Outro valor”.")}
        ${campo("c-entradas", "Opções de entrada (R$)", (v.entradas || []).join(", "), 'class="full"', "Separe por vírgula. Ex.: 397, 700, 1000, 1500, 2000")}
        ${campo("c-venc", "Dias de vencimento", (v.vencimentos || []).join(", "), "", "Separe por vírgula. De 1 a 28.")}
        ${campo("c-frete", "Frete", v.frete)}
        ${campo("c-prazo", "Prazo de entrega", v.prazoEntrega, "", "Ex.: 7 a 15 dias úteis. Vazio = informado depois.")}
        ${campo("c-juros", "Juros (se cobrar)", v.juros, "", "Ex.: 2,5% a.m. · total parcelado R$ 8.900. Vazio = sem juros.")}
        <div class="cfg-prev full" id="c-prev"></div>
      </div></div>
    </section>
    <section class="panel" style="margin-top:14px"><div class="panel-h"><div><h3>Loja e moto</h3><p>Nome da loja, da atendente e dados que faltam na ficha técnica.</p></div></div>
      <div class="panel-b"><div class="cfg">
        ${campo("c-loja", "Nome da loja", v.loja)}
        ${campo("c-atendente", "Nome da atendente virtual", v.atendente)}
        ${campo("c-garantia", "Garantia", v.produto.garantia, "", "Ex.: 1 ano no motor e na bateria. Vazio = garantia legal de 90 dias.")}
        ${campo("c-carga", "Tempo de carregamento", v.produto.carregamento, "", "Ex.: 6 a 8 horas")}
        ${campo("c-cor", "Cor", v.produto.cor)}
        ${campo("c-whats", "WhatsApp da loja", v.whatsapp, 'inputmode="tel"', "Com DDD. Ex.: 71999990000. Usado quando o cliente fecha o pedido.")}
      </div>
      <div class="cfg-acoes"><button type="button" class="btn" id="c-salvar">Salvar configurações</button><span class="sub" id="c-quando"></span></div></div>
    </section>
    <section class="panel" style="margin-top:14px"><div class="panel-h"><div><h3>Dados da empresa</h3><p>Aparecem no contrato e no rodapé do site.</p></div></div>
      <div class="panel-b"><div class="cfg">
        ${campo("e-razao", "Razão social", v.empresa.razaoSocial, 'class="full"')}
        ${campo("e-cnpj", "CNPJ", v.empresa.cnpj, 'inputmode="numeric"', "Sem CNPJ o contrato sai com o campo em branco.")}
        ${campo("e-tel", "Telefone", v.empresa.telefone, 'inputmode="tel"')}
        ${campo("e-end", "Endereço", v.empresa.endereco, 'class="full"', "Rua, número, cidade e UF.")}
        ${campo("e-email", "E-mail de atendimento", v.empresa.email, 'inputmode="email"')}
      </div>
      <div class="cfg-acoes"><button type="button" class="btn" id="e-salvar">Salvar empresa</button><span class="sub" id="e-quando"></span></div></div>
    </section>
    <h2 style="font-size:16px;margin:26px 0 12px">Integrações</h2>
    <section class="panel" id="int-utmify"><div class="panel-h"><div><h3>UTMify</h3><p>Rastreia as vendas por campanha e envia as conversões para o Meta e o TikTok.</p></div><span id="u-pill"></span></div>
      <div class="panel-b"><div class="cfg">
        <div class="form-row full"><label for="u-token">Token da API</label><input id="u-token" autocomplete="off" placeholder="Cole o token da UTMify"><small id="u-token-atual">UTMify › Integrações › Webhooks › Credenciais de API.</small></div>
        <div class="form-row"><label for="u-pixel">Pixel UTMify (Meta)</label><input id="u-pixel" autocomplete="off" placeholder="ID do pixel na UTMify"></div>
        <div class="form-row"><label for="u-pixel-tt">Pixel UTMify (TikTok)</label><input id="u-pixel-tt" autocomplete="off" placeholder="Opcional"></div>
        <div class="cfg-prev full" id="u-aviso"></div>
      </div>
      <div class="cfg-acoes"><button type="button" class="btn" id="u-salvar">Salvar</button><button type="button" class="btn ghost" id="u-teste">Enviar venda de teste</button><button type="button" class="btn ghost" id="u-remover">Remover</button></div></div>
    </section>
    <section class="panel" id="int-pix" style="margin-top:14px"><div class="panel-h"><div><h3>Pagamento no Pix</h3><p>Gera o QR Code da adesão e confirma o pagamento sozinho, pelo Mercado Pago.</p></div><span id="p-pill"></span></div>
      <div class="panel-b"><div class="cfg">
        <div class="form-row full"><label for="p-token">Access token do Mercado Pago</label><input id="p-token" autocomplete="off" placeholder="APP_USR-..."><small id="p-token-atual">Mercado Pago › Seu negócio › Configurações › Credenciais › Access token de produção.</small></div>
        <div class="cfg-prev full" id="p-aviso"></div>
      </div>
      <div class="cfg-acoes"><button type="button" class="btn" id="p-salvar">Salvar</button><button type="button" class="btn ghost" id="p-teste">Testar conexão</button><button type="button" class="btn ghost" id="p-remover">Remover</button></div></div>
    </section>
    <section class="panel" id="int-tg" style="margin-top:14px"><div class="panel-h"><div><h3>Avisos no Telegram</h3><p>Uma mensagem a cada cadastro novo e a cada cliente que chega ao Pix.</p></div><span id="t-pill"></span></div>
      <div class="panel-b"><div class="cfg">
        <div class="form-row"><label for="t-token">Token do bot</label><input id="t-token" autocomplete="off" placeholder="123456789:ABC..."><small id="t-token-atual">Crie o bot no @BotFather e copie o token.</small></div>
        <div class="form-row"><label for="t-chat">ID do chat</label><input id="t-chat" autocomplete="off" inputmode="numeric" placeholder="Ex.: 123456789"><small>Mande “oi” para o seu bot e pegue o ID no @userinfobot.</small></div>
      </div>
      <div class="cfg-acoes"><button type="button" class="btn" id="t-salvar">Salvar</button><button type="button" class="btn ghost" id="t-teste">Enviar teste</button><button type="button" class="btn ghost" id="t-remover">Remover</button></div></div>
    </section>`;
  ligarIntegracoes();
  const num = (id) => { const s = $(id).value.replace(/\./g, "").replace(",", "."); return s.trim() === "" ? undefined : +s; };
  const lista = (id) => $(id).value.split(/[,;\s]+/).map((x) => +x.replace(/\./g, "")).filter((x) => Number.isFinite(x) && x > 0);
  const prev = () => {
    const p = num("#c-preco"), n = num("#c-parcelas"), m = num("#c-min");
    $("#c-prev").textContent = p && n && m != null ? `Com a entrada mínima: ${brl(m)} + ${n}× ${brl((p - m) / n)} no boleto. Total ${brl(p)}.` : "Preencha valor, boletos e entrada mínima para ver a prévia.";
  };
  ["#c-preco", "#c-parcelas", "#c-min"].forEach((id) => $(id).addEventListener("input", prev));
  prev();
  $("#c-salvar").onclick = async (e) => {
    const config = {
      precoTotal: num("#c-preco"), parcelas: num("#c-parcelas"), adesao: num("#c-min"), entradaMaxima: num("#c-max"),
      entradas: lista("#c-entradas"), vencimentos: lista("#c-venc"),
      frete: $("#c-frete").value, prazoEntrega: $("#c-prazo").value, juros: $("#c-juros").value,
      loja: $("#c-loja").value, atendente: $("#c-atendente").value, whatsapp: $("#c-whats").value,
      produto: { garantia: $("#c-garantia").value, carregamento: $("#c-carga").value, cor: $("#c-cor").value },
    };
    if (!config.precoTotal || !config.parcelas || config.adesao == null) return toast("Preencha valor total, boletos e entrada mínima.");
    if (config.adesao >= config.precoTotal) return toast("A entrada mínima precisa ser menor que o valor total.");
    e.target.disabled = true;
    try { await api("config_salvar", { config }); toast("Configurações salvas"); $("#c-quando").textContent = "Salvo agora. O site atualiza em até 1 minuto."; }
    catch (err) { if (err.message !== "401") toast(err.message); }
    e.target.disabled = false;
  };
  $("#e-salvar").onclick = async (e) => {
    const empresa = {
      razaoSocial: $("#e-razao").value, cnpj: $("#e-cnpj").value, telefone: $("#e-tel").value,
      endereco: $("#e-end").value, email: $("#e-email").value,
    };
    e.target.disabled = true;
    try {
      const base = { ...salvo, precoTotal: num("#c-preco"), parcelas: num("#c-parcelas"), adesao: num("#c-min") };
      await api("config_salvar", { config: { ...base, empresa } });
      toast("Dados da empresa salvos");
      $("#e-quando").textContent = "Salvo agora. O site atualiza em até 1 minuto.";
    } catch (err) { if (err.message !== "401") toast(err.message); }
    e.target.disabled = false;
  };
}

async function ligarIntegracoes() {
  const pintar = async () => {
    let s;
    try { s = await api("integ_status"); } catch (e) { if (e.message !== "401") toast(e.message); return; }
    $("#u-pill").innerHTML = s.utmify?.token ? pill("Conectada", "ok") : pill("Não configurada", "");
    $("#u-token-atual").textContent = s.utmify?.token ? `Token salvo: ${s.utmify.token}. Cole outro para trocar.` : "UTMify › Integrações › Webhooks › Credenciais de API.";
    $("#u-pixel").value = s.utmify?.pixel || "";
    $("#u-pixel-tt").value = s.utmify?.pixelTiktok || "";
    $("#u-aviso").textContent = s.utmify?.pixAtivo
      ? "Os pedidos que chegam ao Pix são enviados para a UTMify como “aguardando pagamento”."
      : "O pixel já roda no site. Os pedidos só são enviados para a UTMify quando o Pix real estiver ligado, para não contar venda que não existe.";
    $("#p-pill").innerHTML = s.pix && s.pix.token ? pill("Conectado", "ok") : pill("Não configurado", "");
    $("#p-token-atual").textContent = s.pix && s.pix.token ? `Token salvo: ${s.pix.token}. Cole outro para trocar.` : "Mercado Pago › Seu negócio › Configurações › Credenciais › Access token de produção.";
    $("#p-aviso").textContent = s.pix && s.pix.token
      ? "O cliente paga a adesão no Pix dentro do chat e o pedido é confirmado automaticamente. Cadastre o webhook no Mercado Pago apontando para /api/webhook."
      : "Sem o token, o cliente fecha o pedido e recebe o Pix pelo WhatsApp da loja.";
    $("#t-pill").innerHTML = s.telegram?.token && s.telegram?.chat ? pill("Conectado", "ok") : pill("Não configurado", "");
    $("#t-token-atual").textContent = s.telegram?.token ? `Token salvo: ${s.telegram.token}. Cole outro para trocar.` : "Crie o bot no @BotFather e copie o token.";
    $("#t-chat").value = s.telegram?.chat || "";
  };
  const acao = (btn, fn) => ($(btn).onclick = async (e) => { e.target.disabled = true; try { await fn(); } catch (err) { if (err.message !== "401") toast(err.message); } e.target.disabled = false; });
  acao("#u-salvar", async () => { await api("integ_salvar", { utmify_token: $("#u-token").value, utmify_pixel: $("#u-pixel").value, utmify_pixel_tiktok: $("#u-pixel-tt").value }); $("#u-token").value = ""; toast("UTMify salva"); pintar(); });
  acao("#u-teste", async () => { await api("integ_teste", { grupo: "utmify" }); toast("Venda de teste enviada para a UTMify"); });
  acao("#u-remover", async () => { await api("integ_remover", { grupo: "utmify" }); toast("UTMify removida"); pintar(); });
  acao("#p-salvar", async () => { await api("integ_salvar", { mp_token: $("#p-token").value }); $("#p-token").value = ""; toast("Mercado Pago salvo"); pintar(); });
  acao("#p-teste", async () => { const r = await api("integ_teste", { grupo: "pix" }); toast(`Conectado: ${r.conta || "ok"}`); });
  acao("#p-remover", async () => { await api("integ_remover", { grupo: "pix" }); toast("Mercado Pago removido"); pintar(); });
  acao("#t-salvar", async () => { await api("integ_salvar", { telegram_token: $("#t-token").value, telegram_chat: $("#t-chat").value }); $("#t-token").value = ""; toast("Telegram salvo"); pintar(); });
  acao("#t-teste", async () => { await api("integ_teste", { grupo: "telegram" }); toast("Mensagem de teste enviada"); });
  acao("#t-remover", async () => { await api("integ_remover", { grupo: "telegram" }); toast("Telegram removido"); pintar(); });
  pintar();
}

if (lerSenha()) iniciar(); else mostrarLogin();


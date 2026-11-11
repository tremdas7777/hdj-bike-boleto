const C = window.CONFIG;
const P = C.produto;
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ENTRADA_MIN = C.adesao;
const ENTRADA_MAX = C.entradaMaxima || Math.floor(C.precoTotal * 0.6);
const calcParcela = (e) => Math.round(((C.precoTotal - e) / C.parcelas) * 100) / 100;
let entrada = ENTRADA_MIN;
let saldo = C.precoTotal - entrada;
let parcela = calcParcela(entrada);
let entradaDaPagina = null;
function definirEntrada(v) {
  entrada = v;
  saldo = C.precoTotal - v;
  parcela = calcParcela(v);
}
const CONTRATO_VERSAO = "v1";

const set = (attr, text) => document.querySelectorAll(`[${attr}]`).forEach((el) => (el.textContent = text));
set("data-marca", C.loja);
set("data-atendente", C.atendente);
set("data-entrada", brl(C.adesao));
set("data-parc-txt", `${C.parcelas}x de ${brl(calcParcela(ENTRADA_MIN))} no boleto`);
set("data-juros", C.juros || "");
set("data-n", String(C.parcelas));
set("data-entrada-curta", brl(C.adesao).replace(/,00$/, ""));
set("data-parcela", brl(parcela));
set("data-total", brl(C.precoTotal));
set("data-saldo", brl(saldo));
set("data-frete", C.frete || "A calcular");
if (C.juros) set("data-juros-txt", `${C.juros}. Sujeito a análise de crédito.`);
set("data-empresa", C.empresa.cnpj ? `${C.empresa.razaoSocial} · CNPJ ${C.empresa.cnpj}` : "");
const msgs = document.getElementById("msgs");
const foot = document.getElementById("foot");
window.__rapido = new URLSearchParams(location.search).has("rapido");
const sleep = (ms) => new Promise((r) => setTimeout(r, window.__rapido ? 10 : ms));
const digits = (v) => v.replace(/\D/g, "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const novoLead = () => ({ id: crypto.randomUUID(), criadoEm: new Date().toISOString(), etapa: "iniciado", historico: [], eventos: [] });
const lerAtual = () => { try { return localStorage.getItem("hdj_lead_atual"); } catch { return null; } };
const gravarAtual = (id) => { try { localStorage.setItem("hdj_lead_atual", id); } catch {} };
let lead = Store.all().find((l) => l.id === lerAtual()) || null;
const retomavel = (l) => l && l.primeiro && !["sem_interesse", "iniciado"].includes(l.etapa);
if (!retomavel(lead)) lead = novoLead();
lead.eventos = lead.eventos || [];
// Migração: versões antigas gravavam uma mensagem que bloqueava o mesmo CPF.
// Ela não deve reaparecer quando o cliente retoma a conversa pelo navegador.
if (Array.isArray(lead.historico)) {
  const antes = lead.historico.length;
  lead.historico = lead.historico.filter((h) => !String(h?.texto || "").includes("Já existe um pedido com esse CPF"));
  if (lead.historico.length !== antes) Store.save(lead);
}

const UTM_CHAVES = ["src", "sck", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
function origemDaVisita() {
  const p = new URLSearchParams(location.search);
  const daUrl = {};
  UTM_CHAVES.forEach((k) => { const v = p.get(k); if (v) daUrl[k] = v.slice(0, 300); });
  try {
    if (Object.keys(daUrl).length) {
      const o = { ...daUrl, referrer: document.referrer.slice(0, 300) || null, landing: location.href.slice(0, 300) };
      localStorage.setItem("rastro_utms", JSON.stringify(o));
      return o;
    }
    const salvo = JSON.parse(localStorage.getItem("rastro_utms") || "null");
    if (salvo) return salvo;
  } catch {}
  return { referrer: document.referrer.slice(0, 300) || null, landing: location.href.slice(0, 300) };
}
const ORIGEM = origemDaVisita();
if (!lead.origem) lead.origem = ORIGEM;

const SESSAO = (() => {
  try {
    let s = sessionStorage.getItem("rastro_sessao");
    if (!s) { s = crypto.randomUUID(); sessionStorage.setItem("rastro_sessao", s); }
    return s;
  } catch { return crypto.randomUUID(); }
})();
function sinal(tipo, extra = {}) {
  const corpo = JSON.stringify({ sessao: SESSAO, tipo, path: location.pathname + location.hash, ...extra });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon("/api/sessao", new Blob([corpo], { type: "application/json" }))) return;
  } catch {}
  fetch("/api/sessao", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo, keepalive: true }).catch(() => {});
}
sinal("page", { referrer: document.referrer, device: matchMedia("(max-width: 820px)").matches ? "mobile" : "desktop", utm: ORIGEM });
setInterval(() => { if (document.visibilityState === "visible") sinal("ping"); }, 30000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sinal("ping"); });

(function pixels() {
  const px = C.pixels || {};
  const carregar = (src, global, id) => { if (window[global]) return; window[global] = id; const s = document.createElement("script"); s.src = src; s.async = true; s.defer = true; document.head.appendChild(s); };
  if (px.meta) carregar("https://cdn.utmify.com.br/scripts/pixel/pixel.js", "pixelId", px.meta);
  if (px.tiktok) carregar("https://cdn.utmify.com.br/scripts/pixel/pixel-tiktok.js", "tikTokPixelId", px.tiktok);
})();
gravarAtual(lead.id);
if (lead.entrada) definirEntrada(lead.entrada);

window.dataLayer = window.dataLayer || [];
function track(evento, dados = {}) {
  const ev = { evento, em: new Date().toISOString(), ...dados };
  lead.eventos.push(ev);
  Store.save(lead);
  window.dataLayer.push({ event: `funil_${evento}`, pedido: lead.pedido, ...dados });
  if (typeof C.onEvento === "function") { try { C.onEvento(evento, dados, lead); } catch {} }
}

const ETAPA_PASSO = { iniciado: 0, produto_apresentado: 0, condicoes_aceitas: 1, cadastro_confirmado: 2, vencimento_escolhido: 2, proposta_aceita: 2, contrato_aceito: 3, endereco_confirmado: 4, aguardando_pagamento: 4, pago: 5 };
function pintarPassos() {
  const atual = ETAPA_PASSO[lead.etapa] ?? 0;
  document.querySelectorAll("#chat-steps li").forEach((li, i) => {
    li.classList.toggle("feito", i < atual);
    li.classList.toggle("atual", i === atual);
  });
}
const log = (quem, item) => { lead.historico.push({ quem, ...item, em: new Date().toISOString() }); Store.save(lead); };
const etapa = (e) => { lead.etapa = e; Store.save(lead); pintarPassos(); track(e); };

function scroll() { msgs.scrollTop = msgs.scrollHeight; }

function bubble(text, who, silencioso) {
  const el = document.createElement("div");
  el.className = `msg ${who}`;
  el.textContent = text;
  msgs.appendChild(el);
  scroll();
  if (!silencioso) log(who === "me" ? "cliente" : "atendente", { texto: text });
}

function card(html, silencioso) {
  const el = document.createElement("div");
  el.className = "msg bot card-msg";
  el.innerHTML = html;
  msgs.appendChild(el);
  scroll();
  if (!silencioso) log("atendente", { html });
  return el;
}
msgs.addEventListener("click", (e) => {
  if (e.target.closest("[data-open]")) return abrirContrato();
  const copiar = e.target.closest("[data-copiar]");
  if (copiar) copiarCodigo(copiar.dataset.copiar, copiar);
});

async function typing(ms) {
  const t = document.createElement("div");
  t.className = "msg bot typing";
  t.innerHTML = "<i></i><i></i><i></i>";
  msgs.appendChild(t);
  scroll();
  await sleep(ms);
  t.remove();
}

async function bot(...lines) {
  for (const l of lines) {
    await typing(Math.min(500 + l.length * 14, 1600));
    bubble(l, "bot");
  }
}

async function botCard(html) { await typing(700); return card(html); }

function choose(options) {
  return new Promise((resolve) => {
    foot.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "chips";
    options.forEach((o) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = o;
      b.onclick = () => { foot.innerHTML = ""; bubble(o, "me"); resolve(o); };
      wrap.appendChild(b);
    });
    foot.appendChild(wrap);
  });
}

function ask(placeholder, { validate, mask, inputmode, autocomplete, error, optional, show, auto }) {
  return new Promise((resolve) => {
    foot.innerHTML = `<form class="ask"><input><button class="btn sm">Enviar</button></form>${optional ? '<button type="button" class="link skip">Não tenho</button>' : ""}<p class="err"></p>`;
    const form = foot.querySelector("form");
    const input = form.querySelector("input");
    Object.assign(input, { placeholder, inputMode: inputmode || "text", autocomplete: autocomplete || "off" });
    if (mask) input.addEventListener("input", () => (input.value = mask(input.value)));
    if (auto) input.addEventListener("input", () => { if (auto(input.value)) form.requestSubmit(); });
    input.focus({ preventScroll: true });
    if (optional) foot.querySelector(".skip").onclick = () => { foot.innerHTML = ""; bubble("Não tenho", "me"); resolve(""); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const v = input.value.trim();
      const res = await validate(v);
      if (res !== true) return (foot.querySelector(".err").textContent = typeof res === "string" ? res : error);
      foot.innerHTML = "";
      bubble(show ? show(v) : v, "me");
      resolve(v);
    };
  });
}

const maskCep = (v) => { const d = digits(v).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
const maskTel = (v) => { const d = digits(v).slice(0, 11); if (d.length <= 2) return d; if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`; return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; };
const maskCpf = (v) => digits(v).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const cpfOculto = (cpf) => `***.${cpf.slice(4, 7)}.***-**`;

function cpfValido(v) {
  const c = digits(v);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +c[9] && dv(10) === +c[10];
}
const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

function proximaData(dia) {
  const h = new Date();
  let d = new Date(h.getFullYear(), h.getMonth() + 1, dia);
  if ((d - h) / 864e5 < 20) d = new Date(h.getFullYear(), h.getMonth() + 2, dia);
  return d;
}
const fmtData = (d) => d.toLocaleDateString("pt-BR");

function specsHtml() {
  const linhas = [["Modelo", P.modelo], ["Cor", P.cor], ["Motor", P.potencia], ["Bateria", P.bateria], ["Autonomia", P.autonomia], ["Velocidade máx.", P.velocidade], ["Carregamento", P.carregamento], ["Peso suportado", P.peso], ["Garantia", P.garantia]].filter(([, v]) => v);
  return `<table class="kv">${linhas.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>`;
}

function condicoesHtml(extra = "") {
  return `<div class="sum"><h4>${esc(C.loja)} · Condições</h4>
  <table class="kv">
    <tr><td>Produto</td><td>${esc(P.nome)}</td></tr>
    <tr><td>Modelo</td><td>${esc(P.modelo)}</td></tr>
    <tr><td>Valor total</td><td><b>${brl(C.precoTotal)}</b></td></tr>
    <tr><td>1ª parcela (adesão)</td><td>${brl(entrada)} via Pix</td></tr>
    <tr><td>Saldo restante</td><td>${brl(saldo)}</td></tr>
    <tr><td>Parcelas restantes</td><td>${C.parcelas}x de ${brl(parcela)} no boleto</td></tr>
    ${extra}
    <tr><td>Entrega</td><td>${esc(C.frete || "a calcular")}</td></tr>
  </table>${C.juros ? `<p class="mini">${esc(C.juros)}</p>` : ""}
  <p class="mini">A adesão é a primeira parcela do preço da moto, e não uma taxa. Ela é descontada do valor total.</p></div>`;
}

async function cadastro() {
  let pedidoRetomado = false;
  if (!lead.nomeCompleto) {
    await bot("Vou pedir uma informação de cada vez. Qual é o seu nome completo?");
    lead.nomeCompleto = await ask("Nome completo", { validate: (v) => v.split(" ").filter(Boolean).length >= 2 || "Digite nome e sobrenome.", autocomplete: "name" });
    Store.save(lead);
  }
  if (!lead.cpf) {
  await bot("Qual é o seu CPF? Ele é usado só para emitir a nota fiscal e formalizar o contrato.");
  lead.cpf = await ask("000.000.000-00", {
    mask: maskCpf, inputmode: "numeric",
    validate: (v) => {
      if (!cpfValido(v)) return "CPF inválido. Confira os números.";
      return true;
    },
    show: (v) => cpfOculto(maskCpf(v)),
    auto: (v) => digits(v).length === 11,
  });
  lead.cpf = maskCpf(lead.cpf);
  Store.save(lead);
  const anterior = Store.all().find((item) => item.id !== lead.id && item.cpf === lead.cpf && item.pedido && ["aguardando_pagamento", "pago"].includes(item.etapa));
  if (anterior) {
    await bot(`Encontrei um pedido anterior com este CPF: ${anterior.pedido}.`);
    const escolha = await choose(["Acompanhar pedido anterior", "Fazer novo pedido"]);
    if (escolha === "Acompanhar pedido anterior") {
      lead = anterior;
      gravarAtual(lead.id);
      msgs.innerHTML = "";
      if (lead.etapa === "pago" && await pagamentoAindaConfirmado()) {
        await pedidoPago();
      } else {
        lead.etapa = "aguardando_pagamento";
        delete lead.pagoEm;
        Store.save(lead);
        await pagamento();
      }
      pedidoRetomado = true;
    }
  }
  if (pedidoRetomado) return "acompanhado";
  }
  if (!lead.email) {
    await bot("Seu e-mail? Vamos mandar a cópia do contrato para ele.");
    lead.email = await ask("seuemail@exemplo.com", { validate: (v) => emailValido(v) || "E-mail inválido.", inputmode: "email", autocomplete: "email" });
    Store.save(lead);
  }
  if (!lead.telefone) {
    await bot("E um telefone com DDD para contato?");
    lead.telefone = await ask("(00) 00000-0000", { mask: maskTel, inputmode: "tel", autocomplete: "tel", validate: (v) => digits(v).length >= 10 || "Digite o telefone com DDD.", auto: (v) => digits(v).length === 11 });
    Store.save(lead);
  }
}

async function confirmarCadastro() {
  while (true) {
    await botCard(`<div class="sum"><h4>Confirmação do cadastro</h4><table class="kv">
      <tr><td>Nome</td><td>${esc(lead.nomeCompleto)}</td></tr>
      <tr><td>CPF</td><td>${cpfOculto(lead.cpf)}</td></tr>
      <tr><td>E-mail</td><td>${esc(lead.email)}</td></tr>
      <tr><td>Telefone</td><td>${esc(lead.telefone)}</td></tr></table></div>`);
    await bot(`${lead.primeiro}, confere se está tudo certo? Esses dados vão no seu contrato.`);
    const r = await choose(["Sim, confirmo", "Quero corrigir"]);
    if (r.startsWith("Sim")) { lead.cadastroConfirmadoEm = new Date().toISOString(); etapa("cadastro_confirmado"); return; }
    await bot("Qual dado você quer corrigir?");
    const c = await choose(["Nome", "CPF", "E-mail", "Telefone"]);
    if (c === "Nome") { await bot("Digite o nome completo correto:"); lead.nomeCompleto = await ask("Nome completo", { validate: (v) => v.split(" ").filter(Boolean).length >= 2 || "Digite nome e sobrenome." }); }
    if (c === "CPF") { await bot("Digite o CPF correto:"); lead.cpf = maskCpf(await ask("000.000.000-00", { mask: maskCpf, inputmode: "numeric", validate: (v) => cpfValido(v) || "CPF inválido.", show: (v) => cpfOculto(maskCpf(v)) })); }
    if (c === "E-mail") { await bot("Digite o e-mail correto:"); lead.email = await ask("seuemail@exemplo.com", { validate: (v) => emailValido(v) || "E-mail inválido.", inputmode: "email" }); }
    if (c === "Telefone") { await bot("Digite o telefone correto:"); lead.telefone = await ask("(00) 00000-0000", { mask: maskTel, inputmode: "tel", validate: (v) => digits(v).length >= 10 || "Digite com DDD." }); }
  }
}

async function vencimento() {
  await bot("Agora vamos escolher o dia de vencimento das próximas parcelas.", "Uma dica: escolha um dia perto de quando você recebe seu salário. Fica mais fácil de se planejar.");
  const r = await choose(C.vencimentos.map((d) => `Dia ${d}`));
  lead.diaVencimento = +digits(r);
  lead.primeiroVencimento = fmtData(proximaData(lead.diaVencimento));
  await bot(`Perfeito, ${lead.primeiro}! Sua programação fica assim:`);
  await botCard(`<div class="sum"><table class="kv">
    <tr><td>Adesão (Pix)</td><td>${brl(entrada)} agora</td></tr>
    <tr><td>1º boleto</td><td>${lead.primeiroVencimento}</td></tr>
    <tr><td>Demais boletos</td><td>${brl(parcela)} todo dia ${lead.diaVencimento}</td></tr></table>
    <p class="mini">A adesão é paga via Pix. As outras parcelas são pagas no boleto, como fica no contrato.</p></div>`);
  etapa("vencimento_escolhido");
}

const brlCurto = (n) => brl(n).replace(/,00$/, "");
const maskReais = (v) => { const d = digits(v).slice(0, 6); return d ? `R$ ${(+d).toLocaleString("pt-BR")}` : ""; };

async function escolherEntrada() {
  const ops = [...new Set([entradaDaPagina, ...(C.entradas || [ENTRADA_MIN])].filter((v) => v && v >= ENTRADA_MIN && v <= ENTRADA_MAX))];
  await bot(`Quanto você quer dar de entrada? O mínimo é ${brlCurto(ENTRADA_MIN)}. Quanto maior a entrada, menor a parcela.`);
  const rotulo = (v) => `${brlCurto(v)} · ${C.parcelas}× ${brl(calcParcela(v))}`;
  const r = await choose([...ops.map(rotulo), "Outro valor"]);
  let v;
  if (r === "Outro valor") {
    await bot(`Digite o valor da entrada, entre ${brlCurto(ENTRADA_MIN)} e ${brlCurto(ENTRADA_MAX)}:`);
    v = +digits(await ask("R$ 0", {
      mask: maskReais, inputmode: "numeric",
      validate: (x) => { const n = +digits(x); if (n < ENTRADA_MIN) return `A entrada mínima é ${brlCurto(ENTRADA_MIN)}.`; if (n > ENTRADA_MAX) return `A entrada máxima é ${brlCurto(ENTRADA_MAX)}.`; return true; },
    }));
  } else v = ops[[...ops.map(rotulo)].indexOf(r)];
  definirEntrada(v);
  lead.entrada = v;
  lead.parcela = parcela;
  Store.save(lead);
  track("entrada_escolhida", { valor: v, parcela });
}

async function resumoFinanceiro() {
  while (true) {
    await bot("Antes do contrato, aqui está a proposta completa:");
    await botCard(condicoesHtml(`<tr><td>1º vencimento</td><td>${lead.primeiroVencimento}</td></tr><tr><td>Demais</td><td>dia ${lead.diaVencimento} de cada mês</td></tr><tr><td>Total da contratação</td><td><b>${brl(entrada + parcela * C.parcelas)}</b></td></tr>`));
    await bot("Você está de acordo com os valores e as condições?");
    const r = await choose(["Confirmar condições", "Mudar a entrada", "Mudar o vencimento"]);
    if (r === "Confirmar condições") { etapa("proposta_aceita"); return; }
    if (r === "Mudar a entrada") await escolherEntrada();
    else if (r === "Mudar o vencimento") await vencimento();
  }
}

function contratoHtml() {
  const E = C.empresa;
  const vend = E.cnpj ? `${esc(E.razaoSocial)}, CNPJ ${esc(E.cnpj)}, ${esc(E.endereco)}` : `<mark>[DADOS DA EMPRESA VENDEDORA — PENDENTE: CNPJ ATIVO]</mark>`;
  return `<h3>Contrato de compra e venda a prazo</h3>
  <p><b>Vendedora:</b> ${vend}.</p>
  <p><b>Comprador(a):</b> ${esc(lead.nomeCompleto)}, CPF ${esc(lead.cpf)}, e-mail ${esc(lead.email)}, telefone ${esc(lead.telefone)}.</p>
  <p><b>1. Objeto.</b> ${esc(P.nome)}, modelo ${esc(P.modelo)}, cor ${esc(P.cor)}, nova, com nota fiscal.</p>
  <p><b>2. Preço.</b> ${brl(C.precoTotal)}. A primeira parcela, de adesão, é de ${brl(entrada)}, paga via Pix, e integra o preço. O saldo de ${brl(saldo)} será pago em ${C.parcelas} parcelas mensais de ${brl(parcela)} por boleto, com vencimento todo dia ${lead.diaVencimento}, sendo a primeira em ${lead.primeiroVencimento}.${C.juros ? ` ${esc(C.juros)}.` : ""}</p>
  <p><b>3. Entrega.</b> ${esc(C.frete || "Frete conforme cotação")}. ${C.prazoEntrega ? `Prazo: ${esc(C.prazoEntrega)}, contado da confirmação da adesão.` : "O prazo é informado depois da confirmação da adesão."}</p>
  <p><b>4. Garantia.</b> ${P.garantia ? esc(P.garantia) : "Garantia legal de 90 dias (art. 26 do CDC)"}, sem prejuízo da garantia do fabricante.</p>
  <p><b>5. Arrependimento.</b> Por se tratar de compra fora do estabelecimento, o(a) comprador(a) pode desistir em até 7 dias do recebimento, com devolução integral dos valores pagos (art. 49 do CDC).</p>
  <p><b>6. Atraso.</b> Atraso sujeita a multa de 2% e juros de 1% ao mês sobre a parcela (art. 52 do CDC). O produto possui rastreador e bloqueio remoto. Após aviso prévio e sem acordo, o funcionamento pode ser bloqueado até a regularização, sem cobrança de qualquer valor extra pelo desbloqueio.</p>
  <p><b>7. Quitação antecipada.</b> O(a) comprador(a) pode antecipar parcelas com redução proporcional de eventuais juros (art. 52, §2º, do CDC).</p>
  <p><b>8. Atendimento.</b> ${esc(E.email || "[e-mail]")} · ${esc(E.telefone || "[telefone]")}.</p>
  <p><b>9. Dados pessoais.</b> Usados só para executar este contrato, conforme a LGPD.</p>
  <p class="mini">Versão ${CONTRATO_VERSAO} · gerado em ${new Date().toLocaleString("pt-BR")}</p>`;
}

function abrirContrato() {
  const dlg = document.getElementById("contrato");
  dlg.querySelector(".doc").innerHTML = contratoHtml();
  dlg.showModal();
}
document.getElementById("contrato-fechar").onclick = () => document.getElementById("contrato").close();
document.getElementById("contrato-baixar").onclick = () => window.print();

async function contrato() {
  await bot(`${lead.primeiro}, seu contrato está pronto!`, "Leia com calma as condições de pagamento, entrega e garantia. Você pode baixar o contrato em PDF.");
  const c = await botCard(`<div class="sum"><h4>Contrato de compra e venda</h4><p class="mini">${esc(P.nome)} · ${brl(C.precoTotal)} · versão ${CONTRATO_VERSAO}</p><button type="button" class="btn sm" data-open>Abrir e ler o contrato</button></div>`);
  const dlg = document.getElementById("contrato");
  const aceitar = document.getElementById("contrato-aceitar");
  let aceito = null;
  aceitar.onclick = () => { dlg.close(); aceito?.(); };
  while (true) {
    const r = await Promise.race([
      choose(["Li e aceito o contrato", "Abrir o contrato"]),
      new Promise((res) => (aceito = () => { foot.innerHTML = ""; bubble("Li e concordo com o contrato", "me"); res("ok"); })),
    ]);
    if (r === "ok" || r === "Li e aceito o contrato") break;
    if (r === "Abrir o contrato") abrirContrato();
  }
  aceito = null;
  aceitar.onclick = null;
  lead.aceiteContrato = { em: new Date().toISOString(), versao: CONTRATO_VERSAO, userAgent: navigator.userAgent };
  etapa("contrato_aceito");
  await bot(`Aceite registrado com sucesso, ${lead.primeiro}! ✅`, `Uma cópia do contrato fica salva no seu pedido e vai para ${lead.email}.`);
}

async function endereco() {
  await bot("Agora vamos confirmar onde você quer receber sua moto. Qual é o CEP?");
  while (true) {
    let end;
    const cep = await ask("00000-000", {
      mask: maskCep, inputmode: "numeric", autocomplete: "postal-code",
      auto: (v) => digits(v).length === 8,
      validate: async (v) => {
        if (digits(v).length !== 8) return "O CEP precisa ter 8 números.";
        try {
          const r = await fetch(`https://viacep.com.br/ws/${digits(v)}/json/`).then((x) => x.json());
          if (r.erro) return "CEP não encontrado. Confira os números.";
          end = r; return true;
        } catch { return "Não consegui consultar o CEP agora. Tente de novo."; }
      },
    });
    await botCard(`<div class="sum"><table class="kv">
      <tr><td>Rua</td><td>${esc(end.logradouro || "—")}</td></tr>
      <tr><td>Bairro</td><td>${esc(end.bairro || "—")}</td></tr>
      <tr><td>Cidade</td><td>${esc(end.localidade)}/${esc(end.uf)}</td></tr>
      <tr><td>CEP</td><td>${esc(cep)}</td></tr></table></div>`);
    let rua = end.logradouro;
    if (!rua) { await bot("Esse CEP não traz o nome da rua. Qual é a rua?"); rua = await ask("Rua / avenida", { validate: (v) => v.length > 2 || "Digite a rua." }); }
    await bot("Qual é o número?");
    const numero = await ask("Número", { validate: (v) => v.length > 0 || "Digite o número.", inputmode: "numeric" });
    await bot("Tem complemento? (apto, bloco, casa…)");
    const comp = await ask("Complemento", { validate: () => true, optional: true });
    lead.endereco = { cep, rua, numero, complemento: comp, bairro: end.bairro, cidade: end.localidade, uf: end.uf };
    await botCard(`<div class="sum"><h4>Endereço de entrega</h4><p>${esc(rua)}, nº ${esc(numero)}${comp ? ` · ${esc(comp)}` : ""}<br>${esc(end.bairro)}<br>${esc(end.localidade)}/${esc(end.uf)} · CEP ${esc(cep)}</p></div>`);
    await bot("Esse é o endereço certo para a entrega?");
    const r = await choose(["Sim, endereço correto", "Quero corrigir"]);
    if (r.startsWith("Sim")) { etapa("endereco_confirmado"); return; }
    await bot("Sem problemas. Me passa o CEP de novo:");
  }
}

function enderecoTxt() {
  const e = lead.endereco;
  return `${e.rua}, nº ${e.numero}${e.complemento ? ` · ${e.complemento}` : ""} · ${e.bairro} · ${e.cidade}/${e.uf} · ${e.cep}`;
}

async function resumoFinal() {
  lead.pedido = lead.pedido || `HDJ-${Date.now().toString().slice(-6)}`;
  while (true) {
    await botCard(`<div class="sum"><h4>Pedido ${esc(lead.pedido)}</h4><table class="kv">
      <tr><td>Cliente</td><td>${esc(lead.nomeCompleto)}</td></tr>
      <tr><td>Produto</td><td>${esc(P.nome)} · ${esc(P.modelo)} · ${esc(P.cor)}</td></tr>
      <tr><td>Valor total</td><td>${brl(C.precoTotal)}</td></tr>
      <tr><td>Adesão (Pix)</td><td>${brl(entrada)}</td></tr>
      <tr><td>Saldo</td><td>${C.parcelas}x de ${brl(parcela)} · 1º em ${lead.primeiroVencimento}</td></tr>
      <tr><td>Entrega</td><td>${esc(enderecoTxt())}</td></tr>
      <tr><td>Contrato</td><td>Aceito em ${new Date(lead.aceiteContrato.em).toLocaleString("pt-BR")}</td></tr>
      <tr><td>Status</td><td>Aguardando pagamento da adesão</td></tr></table></div>`);
    await bot(`${lead.primeiro}, está tudo certo? Podemos seguir para o pagamento da adesão?`);
    const r = await choose(["Sim, continuar", "Corrigir endereço"]);
    if (r === "Sim, continuar") { etapa("aguardando_pagamento"); return true; }
    await endereco();
  }
}

let pixTimer = null;
const PIX_STATUS_FIM = ["cancelado", "expirado", "recusado", "rejeitado", "devolvido"];

async function abrirPix() {
  try {
    const r = await fetch("/api/pix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pedido: lead.pedido, lead_id: lead.id, valor: entrada,
        nome: lead.nomeCompleto, cpf: lead.cpf, email: lead.email, telefone: lead.telefone,
        endereco: lead.endereco || null,
        utm: lead.origem || {},
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.ok || !j.copiaECola) return null;
    return j;
  } catch { return null; }
}

function linkWhatsApp() {
  const num = digits(String(C.whatsapp || ""));
  if (num.length < 10) return null;
  const texto = `Olá! Sou ${lead.nomeCompleto}. Acabei de fazer o pedido ${lead.pedido} no site: ${P.nome} ${P.modelo}, entrada de ${brl(entrada)} e ${C.parcelas}x de ${brl(parcela)} no boleto. Quero pagar a adesão de ${brl(entrada)} no Pix.`;
  return `https://wa.me/${num.length <= 11 ? `55${num}` : num}?text=${encodeURIComponent(texto)}`;
}

function linkPosVenda() {
  const num = digits(String(C.whatsapp || ""));
  if (num.length < 10) return null;
  const texto = `Olá! Sou ${lead.nomeCompleto}, pedido ${lead.pedido}. Minha adesão da ${P.nome} foi confirmada e preciso falar com o pós-venda.`;
  return `https://wa.me/${num.length <= 11 ? `55${num}` : num}?text=${encodeURIComponent(texto)}`;
}

function pixQr(pix) {
  const img = String(pix.qr || "");
  if (/^data:image\//i.test(img)) return `<img class="pix-qr" src="${img}" alt="QR Code do Pix da adesão" width="232" height="232">`;
  if (/^https?:\/\//i.test(img)) return `<img class="pix-qr" src="${esc(img)}" alt="QR Code do Pix da adesão" width="232" height="232">`;
  // Sem imagem do gateway: desenha o QR a partir do código copia e cola.
  return `<div class="pix-qr" data-qr="${esc(pix.copiaECola)}" aria-label="QR Code do Pix da adesão"></div>`;
}

function desenharQr(raiz) {
  if (!raiz || typeof QRCode === "undefined") return;
  raiz.querySelectorAll("[data-qr]").forEach((el) => {
    if (el.dataset.pronto) return;
    el.dataset.pronto = "1";
    try {
      new QRCode(el, { text: el.dataset.qr, width: 232, height: 232, correctLevel: QRCode.CorrectLevel.M });
    } catch {
      el.textContent = "Use o código copia e cola abaixo.";
    }
  });
}

function pixCard(pix) {
  const qr = pixQr(pix);
  const expira = pix.expiraEm
    ? `<tr><td>Vale até</td><td>${new Date(pix.expiraEm).toLocaleString("pt-BR")}</td></tr>`
    : `<tr><td>Validade</td><td>24 horas</td></tr>`;
  return `<div class="sum pix"><h4>Adesão no Pix</h4><table class="kv">
    <tr><td>Pedido</td><td>${esc(lead.pedido)}</td></tr>
    <tr><td>Adesão</td><td><b>${brl(entrada)}</b></td></tr>${expira}</table>
    <div class="pix-box">${qr}
      <p class="pix-instr">Abra o app do seu banco e escolha <b>Pix › Ler QR Code</b>. Ou copie o código abaixo e cole em <b>Pix Copia e Cola</b>.</p>
      <button type="button" class="btn sm" data-copiar="${esc(pix.copiaECola)}">Copiar código Pix</button>
      <details class="pix-cod"><summary>Ver o código copia e cola</summary><code>${esc(pix.copiaECola)}</code></details>
    </div>
    <p class="pix-status" data-status>Aguardando o pagamento…</p></div>`;
}

async function copiarCodigo(codigo, botao) {
  const rotulo = botao.textContent;
  let copiou = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(codigo);
      copiou = true;
    }
  } catch {}
  if (!copiou) {
    try {
      const t = document.createElement("textarea");
      t.value = codigo; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select(); copiou = document.execCommand("copy"); t.remove();
    } catch { copiou = false; }
  }
  if (copiou) botao.textContent = "Código copiado ✓";
  else {
    // Sem permissão de área de transferência: abre o código e deixa selecionado para copiar à mão.
    const det = botao.closest(".pix-box")?.querySelector(".pix-cod");
    if (det) {
      det.open = true;
      const c = det.querySelector("code");
      if (c) {
        const r = document.createRange();
        r.selectNodeContents(c);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
    botao.textContent = "Código selecionado · copie com Ctrl+C";
  }
  setTimeout(() => (botao.textContent = rotulo), 4000);
}

async function pixConfirmado(cardEl) {
  clearInterval(pixTimer);
  const el = cardEl ? cardEl.querySelector("[data-status]") : document.querySelector("[data-status]");
  if (el) el.innerHTML = "<b>Pagamento confirmado ✓</b>";
  if (lead.etapa !== "pago") {
    lead.pagoEm = new Date().toISOString();
    etapa("pago");
    track("pix_pago", { valor: entrada });
  }
  await bot(`Pagamento confirmado, ${lead.primeiro}! ✅`, `A adesão de ${brl(entrada)} caiu e o pedido ${lead.pedido} está confirmado.`);
  await botCard(`<div class="sum"><h4>Pedido confirmado</h4><table class="kv">
    <tr><td>Cliente</td><td>${esc(lead.nomeCompleto)}</td></tr>
    <tr><td>Produto</td><td>${esc(P.nome)} · ${esc(P.modelo)} · ${esc(P.cor)}</td></tr>
    <tr><td>Adesão paga</td><td>${brl(entrada)}</td></tr>
    <tr><td>Boletos</td><td>${C.parcelas}x de ${brl(parcela)} · 1º em ${lead.primeiroVencimento}</td></tr>
    <tr><td>Entrega</td><td>${esc(enderecoTxt())}</td></tr></table></div>`);
  await bot(`Os ${C.parcelas} boletos de ${brl(parcela)} começam em ${lead.primeiroVencimento}. A equipe envia as instruções para ${lead.email} antes do vencimento.`, `Qualquer dúvida, é só chamar aqui. Obrigada pela compra, ${lead.primeiro}!`);
  await botCard(posVendaCard());
}

function posVendaCard() {
  const zap = linkPosVenda();
  const pagoEm = lead.pagoEm ? new Date(lead.pagoEm) : new Date();
  const diasPassados = Math.max(0, Math.floor((Date.now() - pagoEm.getTime()) / 86400000));
  const dia = Math.min(10, diasPassados + 1);
  const restantes = Math.max(0, 10 - diasPassados);
  const status = dia <= 2 ? "Pedido em separação" : dia <= 5 ? "Conferência e preparação" : dia <= 8 ? "Despacho e transporte" : "Acompanhamento da entrega";
  return `<div class="sum pos-venda">
    <div class="pos-venda-top"><span class="pos-venda-check">✓</span><div><p class="label">Pós-venda HDJ</p><h4>Agora a gente acompanha você</h4></div></div>
    <p class="pos-venda-lead">Sua adesão foi confirmada. A equipe acompanha o pedido por até <b>10 dias</b>, desde a separação até a chegada da moto.</p>
    <div class="pos-progress"><div><b>Dia ${dia} de 10</b><span>${restantes ? `Faltam até ${restantes} dias para a previsão de chegada.` : "Estamos na janela final de entrega."}</span></div><i style="width:${dia * 10}%"></i></div>
    <p class="pos-current"><b>Status atual:</b> ${status}</p>
    <ol class="pos-timeline">
      <li class="done"><b>Adesão confirmada</b><span>Pagamento recebido e pedido reservado.</span></li>
      <li class="${dia >= 2 ? "done" : ""}"><b>Separação da moto</b><span>Conferência do modelo, cor e acessórios.</span></li>
      <li class="${dia >= 5 ? "done" : ""}"><b>Despacho e transporte</b><span>A equipe atualiza você sobre o envio e a rota.</span></li>
      <li class="${dia >= 9 ? "done" : ""}"><b>Entrega combinada</b><span>Confirmação da chegada no endereço cadastrado.</span></li>
    </ol>
    <div class="pos-venda-info"><b>Guarde estas informações</b><span>Pedido ${esc(lead.pedido)} · Boletos: ${C.parcelas}x de ${brl(parcela)} · 1º vencimento: ${esc(lead.primeiroVencimento)}</span></div>
    ${zap ? `<a class="btn sm" href="${zap}" target="_blank" rel="noopener">Falar com o pós-venda no WhatsApp</a>` : ""}
    <p class="mini">Precisa atualizar endereço, telefone ou tirar uma dúvida? Informe sempre o número do pedido.</p>
  </div>`;
}

function acompanharPix(cardEl) {
  clearInterval(pixTimer);
  const status = cardEl.querySelector("[data-status]");
  let tentativas = 0;
  pixTimer = setInterval(async () => {
    if (++tentativas > 360) { clearInterval(pixTimer); return; }
    let j = null;
    try {
      const r = await fetch(`/api/pix?pedido=${encodeURIComponent(lead.pedido)}`, { cache: "no-store" });
      j = await r.json().catch(() => null);
    } catch {}
    if (!j || !j.status) return;
    if (j.status === "pago") return pixConfirmado(cardEl);
    if (PIX_STATUS_FIM.includes(j.status)) {
      clearInterval(pixTimer);
      if (status) status.textContent = "Esse código não vale mais.";
      await bot("Esse código Pix expirou. Quer que eu gere outro?");
      const r = await choose(["Gerar outro código Pix", "Falar com a equipe"]);
      if (r.startsWith("Gerar")) return pagamento();
      return finalizarSemPix("O código anterior expirou. ");
    }
  }, 5000);
}

async function finalizarSemPix(motivo = "") {
  const zap = linkWhatsApp();
  const canal = zap ? "no seu WhatsApp" : "pelo telefone que você cadastrou";
  await botCard(`<div class="sum pix"><h4>Pedido ${esc(lead.pedido)} registrado</h4><table class="kv">
    <tr><td>Adesão</td><td><b>${brl(entrada)}</b></td></tr>
    <tr><td>Saldo</td><td>${C.parcelas}x de ${brl(parcela)} no boleto</td></tr>
    <tr><td>Entrega</td><td>${esc(enderecoTxt())}</td></tr></table>
    <p class="pix-instr">${esc(motivo)}Nossa equipe gera o Pix da adesão e envia ${canal} em instantes.</p>
    ${zap ? `<a class="btn sm" href="${zap}" target="_blank" rel="noopener">Enviar meu pedido no WhatsApp</a>` : ""}
    <p class="pix-status" data-status>Aguardando o pagamento da adesão</p></div>`);
  await bot(`Pronto, ${lead.primeiro}! Seu pedido está registrado.`, zap
    ? "Toque no botão acima para falar com a equipe no WhatsApp e receber o Pix da adesão. O pedido fica reservado no seu nome."
    : "A equipe entra em contato pelo telefone que você cadastrou para enviar o Pix da adesão. O pedido fica reservado no seu nome.");
}

async function pagamento() {
  track("pix_iniciado", { valor: entrada });
  await bot(`Perfeito, ${lead.primeiro}!`, `A primeira parcela, de adesão, é de ${brl(entrada)}. Ela já faz parte do valor total da sua moto, como está no contrato.`);
  const pix = await abrirPix();
  if (!pix) return finalizarSemPix();
  await bot("Gerando o Pix da adesão…");
  const el = await botCard(pixCard(pix));
  desenharQr(el);
  await bot("Assim que o pagamento cair, eu confirmo o pedido aqui na hora. 🙂");
  acompanharPix(el);
}

async function inicio() {
  await bot(`Olá! Tudo bem? 😊`, `Aqui é a ${C.atendente}, atendente virtual da ${C.loja}. Antes de tudo, como posso te chamar?`);
  lead.primeiro = (await ask("Seu primeiro nome", { validate: (v) => v.length > 1 || "Digite seu nome.", autocomplete: "given-name" })).split(" ")[0];
  Store.save(lead);
  await bot(`Seja bem-vindo(a), ${lead.primeiro}! Vou te mostrar a HDJ GT-V8, as condições e como funciona a compra.`);
  await botCard(`<div class="prod-card">
    <video autoplay muted loop playsinline poster="video/estudio.jpg"><source src="video/estudio.mp4" type="video/mp4"></video>
    <div class="prod-info"><b>HDJ GT-V8 1000W</b><span>Moto elétrica off-road · ${esc(P.cor)}</span>
    <p class="prod-price">Entrada a partir de <b>${brlCurto(ENTRADA_MIN)}</b></p>
    <ul class="prod-tags"><li>1.000 W</li><li>60 km/h</li><li>48 V 23 Ah</li></ul></div></div>`);
  await bot("Quer conhecer melhor o modelo e as condições?");
  await choose(["Sim, quero conhecer"]);

  await bot(`A GT-V8 tem motor de ${P.potencia}, bateria de lítio removível e até ${P.velocidade}. Veja os detalhes:`);
  await botCard(`<div class="chat-gal">${P.fotos.slice(1).map((f) => `<img src="${esc(f)}" alt="">`).join("")}</div>`);
  await botCard(`<div class="sum"><h4>Ficha técnica</h4>${specsHtml()}</div>`);
  await bot(`${lead.primeiro}, quer que eu te mostre as condições de pagamento?`);
  await choose(["Quero ver as condições"]);
  etapa("produto_apresentado");
}

async function condicoes() {
  await escolherEntrada();
  while (true) {
    await bot(`Com essa entrada, as condições para levar sua ${P.nome} ficam assim:`);
    await botCard(condicoesHtml());
    await bot(`${lead.primeiro}, essas condições fazem sentido para você? Posso iniciar seu pedido?`);
    const r = await choose(["Quero continuar", "Mudar a entrada", "Não tenho interesse"]);
    if (r === "Quero continuar") break;
    if (r === "Mudar a entrada") { await escolherEntrada(); continue; }
    if (r === "Não tenho interesse") { etapa("sem_interesse"); await bot("Tudo bem! Obrigada pela atenção. Se mudar de ideia, é só voltar aqui. 😊"); return false; }
  }
  etapa("condicoes_aceitas");
  await bot(`Ótimo, ${lead.primeiro}! 😊 Para preparar seu pedido, preciso fazer seu cadastro.`);
}

const PASSOS = [
  ["iniciado", inicio],
  ["produto_apresentado", condicoes],
  ["condicoes_aceitas", async () => { if ((await cadastro()) === "acompanhado") return false; await confirmarCadastro(); }],
  ["cadastro_confirmado", vencimento],
  ["vencimento_escolhido", resumoFinanceiro],
  ["proposta_aceita", contrato],
  ["contrato_aceito", endereco],
  ["endereco_confirmado", resumoFinal],
  ["aguardando_pagamento", pagamento],
  ["pago", pedidoPago],
];

async function pedidoPago() {
  await bot(`Que bom te ver de novo, ${lead.primeiro}!`, `Seu pedido ${lead.pedido} já está com a adesão paga. ✅`);
  await botCard(`<div class="sum"><h4>Pedido ${esc(lead.pedido)}</h4><table class="kv">
    <tr><td>Produto</td><td>${esc(P.nome)} · ${esc(P.modelo)} · ${esc(P.cor)}</td></tr>
    <tr><td>Adesão</td><td>Paga${lead.pagoEm ? ` em ${new Date(lead.pagoEm).toLocaleDateString("pt-BR")}` : ""}</td></tr>
    <tr><td>Boletos</td><td>${C.parcelas}x de ${brl(parcela)} · 1º em ${lead.primeiroVencimento}</td></tr>
    <tr><td>Entrega</td><td>${lead.endereco ? esc(enderecoTxt()) : "—"}</td></tr></table></div>`);
  await bot(`Estamos preparando o envio. Se precisar de algo, é só falar aqui ou chamar no WhatsApp da loja.`);
  await botCard(posVendaCard());
}

async function seguirDe(et) {
  const i = Math.max(0, PASSOS.findIndex(([e]) => e === et));
  for (const [, fn] of PASSOS.slice(i)) if ((await fn()) === false) return;
}

async function pagamentoAindaConfirmado() {
  if (!lead.pedido) return false;
  try {
    const r = await fetch(`/api/pix?pedido=${encodeURIComponent(lead.pedido)}`, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    return j?.status === "pago";
  } catch {
    return false;
  }
}

async function run() {
  // O estado salvo no navegador nunca é prova de pagamento. Confirme no backend antes do pós-venda.
  if (lead.etapa === "pago" && !(await pagamentoAindaConfirmado())) {
    lead.etapa = "aguardando_pagamento";
    delete lead.pagoEm;
    lead.historico = [];
    Store.save(lead);
  }
  pintarPassos();
  if (retomavel(lead) && lead.historico.length) {
    for (const h of lead.historico) h.html ? card(h.html, true) : bubble(h.texto, h.quem === "cliente" ? "me" : "bot", true);
    await bot(`Que bom te ver de novo, ${lead.primeiro}! Quer continuar de onde parou?`);
    const r = await choose(["Continuar de onde parei", "Começar de novo"]);
    if (r.startsWith("Começar")) {
      lead = novoLead();
      lead.origem = ORIGEM;
      gravarAtual(lead.id);
      definirEntrada(ENTRADA_MIN);
      msgs.innerHTML = "";
      pintarPassos();
      return seguirDe("iniciado");
    }
    track("retomou", { etapa: lead.etapa });
    return seguirDe(lead.etapa);
  }
  return seguirDe("iniciado");
}

const sim = document.getElementById("sim");
if (sim) {
  const big = document.querySelector(".plan-big");
  const out = { entrada: document.getElementById("sim-entrada"), saldo: document.getElementById("sim-saldo") };
  const pintar = (v) => {
    big.textContent = brl(calcParcela(v));
    out.entrada.textContent = brl(v);
    out.saldo.textContent = brl(C.precoTotal - v);
    entradaDaPagina = v;
    sim.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.v === v)));
  };
  (C.entradas || [ENTRADA_MIN]).forEach((v) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.v = v;
    b.innerHTML = `<b>${brlCurto(v)}</b><span>${C.parcelas}× ${brl(calcParcela(v))}</span>`;
    b.onclick = () => pintar(v);
    sim.appendChild(b);
  });
  const outro = document.getElementById("sim-outro");
  outro.addEventListener("input", () => {
    outro.value = maskReais(outro.value);
    const n = +digits(outro.value);
    const ok = n >= ENTRADA_MIN && n <= ENTRADA_MAX;
    document.getElementById("sim-msg").textContent = n && !ok ? `Entre ${brlCurto(ENTRADA_MIN)} e ${brlCurto(ENTRADA_MAX)}.` : "";
    if (ok) pintar(n);
  });
  pintar(ENTRADA_MIN);
}

const sticky = document.getElementById("sticky");
const fab = document.getElementById("fab");
const topBar = document.getElementById("top");
const layer = document.getElementById("chat-layer");
const hero = document.querySelector(".hero");
let heroVisivel = true;
let started = false;

function barras() {
  const aberto = !layer.hidden;
  sticky.classList.toggle("hide", heroVisivel || aberto);
  fab.hidden = heroVisivel || aberto;
}
new IntersectionObserver(([x]) => { heroVisivel = x.isIntersecting; barras(); }, { rootMargin: "-40% 0px 0px 0px" }).observe(hero);

function abrirChat() {
  layer.hidden = false;
  document.documentElement.classList.add("chat-aberto");
  void layer.offsetWidth;
  layer.classList.add("on");
  barras();
  track("chat_aberto");
  sinal("chat", { lead_id: lead.id });
  if (!started) { started = true; run(); }
  else setTimeout(() => foot.querySelector("input, .chip")?.focus({ preventScroll: true }), 300);
}
function fecharChat() {
  layer.classList.remove("on");
  document.documentElement.classList.remove("chat-aberto");
  setTimeout(() => { layer.hidden = true; barras(); }, 260);
  if (started) {
    fab.querySelector(".fab-txt").textContent = "Continuar meu pedido";
    sticky.querySelector(".btn").textContent = "Continuar pedido";
  }
}
document.addEventListener("click", (e) => {
  const abrir = e.target.closest("[data-abrir]");
  if (abrir) { e.preventDefault(); abrirChat(); return; }
  if (e.target.closest("[data-fechar]")) fecharChat();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !layer.hidden && !document.getElementById("contrato").open) fecharChat();
});

if (retomavel(lead)) {
  fab.querySelector(".fab-txt").textContent = "Continuar meu pedido";
  sticky.querySelector(".btn").textContent = "Continuar pedido";
}

const reelObs = new IntersectionObserver((es) => es.forEach((x) => {
  const v = x.target;
  if (x.isIntersecting) { v.preload = "auto"; v.play().catch(() => {}); } else v.pause();
}), { threshold: 0.35 });
document.querySelectorAll(".reel video").forEach((v) => reelObs.observe(v));

const solid = () => topBar.classList.toggle("solid", scrollY > 40);
addEventListener("scroll", solid, { passive: true });
solid();

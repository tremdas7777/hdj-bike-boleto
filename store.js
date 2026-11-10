// Cópia local no navegador + envio para o banco pela função /api/lead.
window.Store = {
  timers: {},
  all() {
    try { return JSON.parse(localStorage.getItem("hdj_leads") || "[]"); } catch { return []; }
  },
  save(lead) {
    const list = this.all();
    const i = list.findIndex((l) => l.id === lead.id);
    lead.atualizadoEm = new Date().toISOString();
    if (i >= 0) list[i] = lead; else list.unshift(lead);
    try { localStorage.setItem("hdj_leads", JSON.stringify(list)); } catch {}
    this.enviar(lead);
    return lead;
  },
  enviar(lead) {
    clearTimeout(this.timers[lead.id]);
    this.timers[lead.id] = setTimeout(() => {
      fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
        keepalive: true,
      }).catch(() => {});
    }, 600);
  },
  byCpf(cpf) { return this.all().find((l) => l.cpf === cpf); },
};

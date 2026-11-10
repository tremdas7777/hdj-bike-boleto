// Valores padrão. O que for salvo em /admin › Configurações (tabela hdj_config) vem por /api/config.js e tem prioridade.
window.CONFIG_PADRAO = {
  loja: "Rastro",
  atendente: "Maria Vitória",
  // WhatsApp com DDD, só números (ex.: 5511999999999). Usado no fim do pedido quando o Pix automático não está ligado.
  whatsapp: "",
  empresa: { razaoSocial: "", cnpj: "", endereco: "", email: "", telefone: "" },
  produto: {
    nome: "Moto elétrica HDJ",
    modelo: "GT-V8 1000W",
    cor: "Preto",
    potencia: "1.000 W",
    bateria: "Lítio 48V 23Ah, removível",
    autonomia: "até ~50 km",
    velocidade: "60 km/h",
    carregamento: "",
    peso: "até 150 kg",
    garantia: "",
    fotos: ["img/pordosol.webp", "img/frente.webp", "img/farol.webp", "img/freio.webp"],
  },
  precoTotal: 7243,
  adesao: 397, // entrada mínima
  entradas: [397, 700, 1000, 1500, 2000],
  entradaMaxima: 3500,
  parcelas: 18,
  vencimentos: [1, 5, 10, 15, 20, 25],
  frete: "Grátis para todo o Brasil",
  prazoEntrega: "",
  juros: "",
};

window.CONFIG = (() => {
  const P = window.CONFIG_PADRAO;
  const R = window.CONFIG_REMOTO || {};
  return { ...P, ...R, produto: { ...P.produto, ...(R.produto || {}) }, empresa: { ...P.empresa, ...(R.empresa || {}) } };
})();

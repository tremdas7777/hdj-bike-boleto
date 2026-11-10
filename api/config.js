import { db, limparConfig, lerPrivado } from "./_lib.js";

// Carregado como <script> antes do config.js: o que o /admin salvou sobrescreve os padrões.
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
  try {
    const [linha] = await db("hdj_config?id=eq.1&select=dados");
    const dados = limparConfig(linha?.dados || {});
    const p = await lerPrivado(["utmify_pixel", "utmify_pixel_tiktok"]).catch(() => ({}));
    dados.pixels = { meta: /^[A-Za-z0-9]{5,40}$/.test(p.utmify_pixel || "") ? p.utmify_pixel : null, tiktok: /^[A-Za-z0-9]{5,40}$/.test(p.utmify_pixel_tiktok || "") ? p.utmify_pixel_tiktok : null };
    return res.send(`window.CONFIG_REMOTO=${JSON.stringify(dados).replace(/</g, "\\u003c")};`);
  } catch {
    return res.send("window.CONFIG_REMOTO={};");
  }
}

// /api/manual-prices.js
// GET /api/manual-prices -> { prices: { capsulas: {price, original_price, available}, ... } }
//
// Endpoint PÚBLICO, sem senha — é o que o produtos.html chama pra exibir
// os preços pra qualquer visitante. Só leitura. Quem atualiza os valores
// é o /admin.html, através do endpoint protegido /api/admin/prices.

import { getRedisClient, PRICES_KEY } from './_lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método não suportado.' });
    return;
  }

  try {
    const redis = getRedisClient();
    const prices = (await redis.get(PRICES_KEY)) || {};

    // Cache curto na CDN da Vercel: reduz chamadas ao Redis sem deixar o
    // site desatualizado por muito tempo depois de você editar um preço.
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({ prices });
  } catch (err) {
    console.error(err);
    const status = err?.code === 'REDIS_NOT_CONFIGURED' ? 503 : 500;
    res.status(status).json({ error: String(err?.message || err), prices: {} });
  }
}

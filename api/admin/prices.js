// /api/admin/prices.js
// GET  /api/admin/prices?password=...                            -> lista os preços atuais
// POST /api/admin/prices  { password, id, price, original_price, available } -> atualiza um produto
//
// Protegido por senha (variável de ambiente ADMIN_PASSWORD). Usado só pela
// página /admin.html — não tem nenhum link pra ela em lugar nenhum do site
// público, mas o segredo de verdade é a senha, não a "invisibilidade" da
// URL.

import { getRedisClient, PRICES_KEY } from '../_lib/redis.js';

function checkPassword(req) {
  if (!process.env.ADMIN_PASSWORD) {
    const err = new Error('ADMIN_PASSWORD não configurada nas variáveis de ambiente da Vercel.');
    err.status = 500;
    throw err;
  }

  const provided = req.method === 'GET' ? req.query.password : req.body && req.body.password;

  if (!provided || provided !== process.env.ADMIN_PASSWORD) {
    const err = new Error('Senha incorreta.');
    err.status = 401;
    throw err;
  }
}

export default async function handler(req, res) {
  try {
    checkPassword(req);
    const redis = getRedisClient();

    if (req.method === 'GET') {
      const all = (await redis.get(PRICES_KEY)) || {};
      res.status(200).json({ prices: all });
      return;
    }

    if (req.method === 'POST') {
      const { id, price, original_price, available } = req.body || {};

      if (!id || typeof price !== 'number' || Number.isNaN(price)) {
        res.status(400).json({ error: 'Informe "id" e "price" (número).' });
        return;
      }

      const all = (await redis.get(PRICES_KEY)) || {};
      all[id] = {
        price,
        original_price: typeof original_price === 'number' && !Number.isNaN(original_price) ? original_price : null,
        available: available !== false,
        updated_at: new Date().toISOString(),
      };
      await redis.set(PRICES_KEY, all);

      res.status(200).json({ ok: true, id, saved: all[id] });
      return;
    }

    res.status(405).json({ error: 'Método não suportado.' });
  } catch (err) {
    console.error(err);
    const status = err?.status || (err?.code === 'REDIS_NOT_CONFIGURED' ? 503 : 500);
    res.status(status).json({ error: String(err?.message || err) });
  }
}

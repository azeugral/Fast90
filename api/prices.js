// /api/prices.js
// Endpoint: GET /api/prices?ids=MLB123456789,MLB987654321
//
// Busca o preço atualizado de um ou mais anúncios/produtos do Mercado Livre
// e devolve em JSON pro front-end consumir. As credenciais ficam SEMPRE
// aqui no servidor — nunca no HTML/JS do site.
//
// Antes de usar, é preciso autorizar o app uma vez visitando
// /api/auth/mercadolivre (veja o LEIA-ME-CONFIGURACAO.md). Depois disso,
// o token se renova sozinho pra sempre — sem manutenção manual.

import { getStoredTokens, saveTokens } from './_lib/mercadolivre-tokens.js';

async function requestNewTokens(refreshToken) {
  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Falha ao renovar token do Mercado Livre (${res.status}): ${body}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

async function getAccessToken(allowRetry = true) {
  const tokens = await getStoredTokens();

  if (!tokens || !tokens.refresh_token) {
    const err = new Error(
      'Nenhuma autorização do Mercado Livre configurada. Acesse /api/auth/mercadolivre uma vez pra autorizar o app.'
    );
    err.status = 401;
    throw err;
  }

  const now = Date.now();
  if (tokens.access_token && now < tokens.expires_at) {
    return tokens.access_token;
  }

  try {
    const data = await requestNewTokens(tokens.refresh_token);
    const newTokens = {
      access_token: data.access_token,
      // O Mercado Livre sempre devolve um refresh_token novo — é
      // fundamental guardar ele, senão a próxima renovação falha.
      refresh_token: data.refresh_token,
      expires_at: now + (data.expires_in - 120) * 1000,
    };
    await saveTokens(newTokens);
    return newTokens.access_token;
  } catch (err) {
    // Se falhar com 400, pode ser que outra chamada concorrente já tenha
    // rotacionado o token um instante antes. Espera um pouco e tenta de
    // novo lendo o valor mais recente do Redis, só uma vez.
    if (allowRetry && err.status === 400) {
      await new Promise((r) => setTimeout(r, 500));
      return getAccessToken(false);
    }
    throw err;
  }
}

/** Aceita um ID puro (MLB123456) ou uma URL colada inteira do Mercado Livre. */
function normalizeMercadoLivreId(value) {
  if (!value) return null;
  const str = decodeURIComponent(String(value)).trim();

  const wid = str.match(/[?&]wid=(MLB\d+)/i);
  if (wid) return wid[1];

  const listing = str.match(/MLB-(\d+)/i);
  if (listing) return `MLB${listing[1]}`;

  const mlb = str.match(/MLB\d+/i);
  if (mlb) return mlb[0];

  return null;
}

async function fetchItemPrice(rawId, accessToken) {
  const itemId = normalizeMercadoLivreId(rawId) || rawId;

  // 1) Tenta primeiro como ID de anúncio (item) — caso mais comum.
  const itemRes = await fetch(
    `https://api.mercadolibre.com/items/${itemId}?attributes=id,title,price,original_price,available_quantity,status,permalink`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (itemRes.ok) {
    return buildResult(rawId, await itemRes.json());
  }

  // 2) Se não for um item válido, pode ser um ID de página de CATÁLOGO
  // (ex: URLs com "/p/MLB..."). Nesse caso, busca o produto e pega o
  // preço de quem está ganhando o "buy box" (a oferta em destaque).
  const productRes = await fetch(`https://api.mercadolibre.com/products/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!productRes.ok) {
    return { id: rawId, error: true, status: itemRes.status };
  }

  const product = await productRes.json();
  const winnerId =
    (product?.buy_box_winner && (product.buy_box_winner.item_id || product.buy_box_winner)) || null;

  if (!winnerId) {
    return { id: rawId, error: true, status: 404 };
  }

  const winnerRes = await fetch(
    `https://api.mercadolibre.com/items/${winnerId}?attributes=id,title,price,original_price,available_quantity,status,permalink`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!winnerRes.ok) {
    return { id: rawId, error: true, status: winnerRes.status };
  }

  return buildResult(rawId, await winnerRes.json());
}

function buildResult(requestedId, item) {
  return {
    id: requestedId,
    title: item.title ?? null,
    price: typeof item.price === 'number' ? item.price : null,
    original_price: typeof item.original_price === 'number' ? item.original_price : null,
    available: item.status === 'active' && (item.available_quantity ?? 0) > 0,
    permalink: item.permalink ?? null,
  };
}

export default async function handler(req, res) {
  try {
    const idsParam = req.query.ids;
    if (!idsParam) {
      res.status(400).json({
        error: 'Informe os IDs dos itens. Ex: /api/prices?ids=MLB123456789,MLB987654321',
      });
      return;
    }

    // Limite de segurança: no máximo 20 itens por chamada
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

    const accessToken = await getAccessToken();
    const results = await Promise.all(ids.map((id) => fetchItemPrice(id, accessToken)));

    const prices = {};
    for (const r of results) prices[r.id] = r;

    // Cache de 1h na CDN da Vercel: todos os visitantes dentro dessa janela
    // recebem a resposta já cacheada, sem gerar uma chamada nova pro ML a
    // cada visita. Ajuste s-maxage se quiser atualizar com mais frequência.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ updated_at: new Date().toISOString(), prices });
  } catch (err) {
    console.error(err);
    const status = err?.status === 401 ? 401 : 500;
    res.status(status).json({ error: 'Erro ao buscar preços', detail: String(err?.message || err) });
  }
}

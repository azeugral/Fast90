// /api/prices.js
// Endpoint: GET /api/prices?ids=MLB4555189589,MLB4324797875
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
  const diagnostics = {};

  // Usa o endpoint de "multiget" (/items?ids=...) em vez de /items/{id}.
  // O Mercado Livre passou a bloquear com 403 o endpoint de item único
  // pra itens que não pertencem ao dono do token, mesmo sendo dados
  // públicos — mas o multiget (pensado pra consultar vários itens de
  // uma vez) costuma continuar funcionando pra esse caso.
  const itemRes = await fetch(
    `https://api.mercadolibre.com/items?ids=${itemId}&attributes=id,title,price,original_price,available_quantity,status,permalink`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (itemRes.ok) {
    const multiget = await itemRes.json();
    const entry = Array.isArray(multiget) ? multiget[0] : null;
    if (entry && entry.code === 200 && entry.body) {
      return buildResult(rawId, entry.body);
    }
    diagnostics.item_multiget = entry ? { code: entry.code, body: entry.body } : { raw: multiget };
  } else {
    diagnostics.item_multiget = { http_status: itemRes.status, body: await safeText(itemRes) };
  }

  // Se não for um item válido, pode ser um ID de página de CATÁLOGO
  // (ex: URLs com "/p/MLB..."). Nesse caso, busca o produto e pega o
  // preço de quem está ganhando o "buy box" (a oferta em destaque).
  const productRes = await fetch(`https://api.mercadolibre.com/products/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!productRes.ok) {
    diagnostics.product_lookup = { http_status: productRes.status, body: await safeText(productRes) };
    return { id: rawId, error: true, diagnostics };
  }

  const product = await productRes.json();
  const winnerId =
    (product?.buy_box_winner && (product.buy_box_winner.item_id || product.buy_box_winner)) || null;

  if (!winnerId) {
    diagnostics.product_lookup = { note: 'sem buy_box_winner nessa página de catálogo', product };
    return { id: rawId, error: true, diagnostics };
  }

  const winnerRes = await fetch(
    `https://api.mercadolibre.com/items?ids=${winnerId}&attributes=id,title,price,original_price,available_quantity,status,permalink`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (winnerRes.ok) {
    const winnerMultiget = await winnerRes.json();
    const winnerEntry = Array.isArray(winnerMultiget) ? winnerMultiget[0] : null;
    if (winnerEntry && winnerEntry.code === 200 && winnerEntry.body) {
      return buildResult(rawId, winnerEntry.body);
    }
    diagnostics.winner_multiget = winnerEntry
      ? { code: winnerEntry.code, body: winnerEntry.body }
      : { raw: winnerMultiget };
  } else {
    diagnostics.winner_multiget = { http_status: winnerRes.status, body: await safeText(winnerRes) };
  }

  return { id: rawId, error: true, diagnostics };
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return null;
  }
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
    let status = 500;
    if (err?.status === 401) status = 401;
    if (err?.code === 'REDIS_NOT_CONFIGURED') status = 503;
    res.status(status).json({ error: 'Erro ao buscar preços', detail: String(err?.message || err) });
  }
}

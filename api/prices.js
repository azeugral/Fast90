// /api/prices.js
// Endpoint: GET /api/prices?ids=MLB66637233, MLB4555189589
//
// Busca o preço atualizado de um ou mais anúncios do Mercado Livre e devolve
// em JSON pro front-end consumir. As credenciais (Client ID/Secret/Refresh
// Token) ficam SEMPRE aqui no servidor, em variáveis de ambiente — nunca no
// HTML/JS do site. Isso evita expor suas chaves no navegador do visitante.
//
// Variáveis de ambiente necessárias (configurar no painel da Vercel):
//   ML_CLIENT_ID       -> App ID do seu aplicativo no Mercado Livre Developers
//   ML_CLIENT_SECRET   -> Secret Key do mesmo aplicativo
//   ML_REFRESH_TOKEN   -> gerado uma única vez (veja LEIA-ME-CONFIGURACAO.md)

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();

  // Reaproveita o token em memória enquanto ele ainda for válido
  // (evita bater no /oauth/token toda hora dentro da mesma execução).
  if (cachedToken && now < cachedTokenExpiresAt) {
    return cachedToken;
  }

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
      refresh_token: process.env.ML_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao renovar token do Mercado Livre (${res.status}): ${body}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // expires_in normalmente é 21600s (6h) — renovamos 2min antes de vencer
  cachedTokenExpiresAt = now + (data.expires_in - 120) * 1000;
  return cachedToken;
}

function normalizeMercadoLivreId(value) {
  if (!value) return null;

  value = decodeURIComponent(String(value)).trim();

  // URL contendo wid=MLB4555189589
  const wid = value.match(/[?&]wid=(MLB\d+)/i);
  if (wid) return wid[1];

  // URL de anúncio
  const listing = value.match(/MLB-(\d+)/i);
  if (listing) return `MLB${listing[1]}`;

  // Item ou Product ID informado diretamente
  const mlb = value.match(/MLB\d+/i);
  if (mlb) return mlb[0];

  return null;
}

async function fetchItemPrice(itemId, accessToken) {
  const res = await fetch(
    `https://api.mercadolibre.com/items/${itemId}?attributes=id,title,price,original_price,available_quantity,status,permalink`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    return {
      id: itemId,
      error: true,
      status: res.status,
    };
  }

  const item = await res.json();

  return {
    id: item.id,
    title: item.title,
    price: item.price,
    original_price: item.original_price,
    available:
      item.status === "active" &&
      (item.available_quantity ?? 0) > 0,
    permalink: item.permalink,
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
    .map((s) => normalizeMercadoLivreId(s))
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
    res.status(500).json({ error: 'Erro ao buscar preços', detail: String(err?.message || err) });
  }
}

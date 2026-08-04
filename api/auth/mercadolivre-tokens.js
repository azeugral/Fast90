// api/_lib/mercadolivre-tokens.js
//
// Funções compartilhadas pra ler/gravar os tokens do Mercado Livre no
// Redis (Upstash). Usado tanto por /api/prices quanto pelo fluxo de
// autorização em /api/auth/mercadolivre/callback — assim os dois lugares
// leem e gravam sempre do mesmo jeito, sem duplicar lógica.
//
// Por que Redis? O Mercado Livre invalida o refresh_token toda vez que ele
// é usado, devolvendo um novo no lugar. Guardar isso numa variável de
// ambiente fixa não funciona, porque ela nunca se atualiza sozinha. O Redis
// guarda o valor atual e o código sempre sobrescreve com o mais recente.
//
// Pastas/arquivos que começam com "_" dentro de /api não viram rotas na
// Vercel — isso aqui é só um módulo interno, não é acessível por URL.

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const TOKEN_KEY = 'ml_oauth_tokens';

/**
 * Lê os tokens guardados no Redis. Se ainda não existir nada lá (primeiro
 * uso), cai de volta pra uma ML_REFRESH_TOKEN configurada manualmente nas
 * variáveis de ambiente, se houver — só por compatibilidade com quem ainda
 * não visitou /api/auth/mercadolivre. Se não houver nada em lugar nenhum,
 * retorna null.
 */
export async function getStoredTokens() {
  const stored = await redis.get(TOKEN_KEY);
  if (stored) return stored;

  if (process.env.ML_REFRESH_TOKEN) {
    return { access_token: null, refresh_token: process.env.ML_REFRESH_TOKEN, expires_at: 0 };
  }

  return null;
}

/** Grava os tokens atuais (access_token, refresh_token, expires_at) no Redis. */
export async function saveTokens(tokens) {
  await redis.set(TOKEN_KEY, tokens);
}

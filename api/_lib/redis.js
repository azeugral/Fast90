// api/_lib/redis.js
//
// Cliente Redis compartilhado (Upstash), usado tanto pra ler os preços
// (api/prices.js, público) quanto pra atualizá-los (api/admin/prices.js,
// protegido por senha).

import { Redis } from '@upstash/redis';

let redis = null;

export function getRedisClient() {
  if (redis) return redis;

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    const err = new Error(
      'Redis não configurado: conecte um banco Upstash Redis ao projeto na Vercel (aba Storage) e faça um novo deploy.'
    );
    err.code = 'REDIS_NOT_CONFIGURED';
    throw err;
  }

  redis = new Redis({ url, token });
  return redis;
}

// Todos os preços ficam guardados juntos numa única chave, como um objeto
// { capsulas: {price, original_price, available, updated_at}, whey: {...}, ... }
export const PRICES_KEY = 'product_prices';

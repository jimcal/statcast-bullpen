import type { Env, Player, PlayerDetail } from "./types";

async function fetchCached<T>(env: Env, path: string): Promise<T> {
  const url = `${env.DATA_BASE_URL}/${path}`;
  const ttl = parseInt(env.DATA_TTL_SECONDS, 10) || 3600;
  const cacheKey = new Request(url, { method: "GET" });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached.json() as Promise<T>;
  }

  const res = await fetch(url, { cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!res.ok) {
    throw new Error(`fetch ${path} failed: ${res.status}`);
  }
  const body = await res.text();
  const toCache = new Response(body, {
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${ttl}`,
    },
  });
  // Don't await — let cache write happen in background
  await cache.put(cacheKey, toCache.clone());
  return JSON.parse(body) as T;
}

export function loadIndex(env: Env): Promise<Player[]> {
  return fetchCached<Player[]>(env, "index.json");
}

export function loadPlayer(env: Env, id: number): Promise<PlayerDetail> {
  return fetchCached<PlayerDetail>(env, `players/${id}.json`);
}

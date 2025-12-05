import Redis from 'ioredis';

// Redis client singleton
// Uses REDIS_URL from environment (Railway auto-provides this)
const redisUrl = process.env.REDIS_URL;

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!redisUrl) {
    console.warn('REDIS_URL not set - caching disabled');
    return null;
  }

  if (!redis) {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });

    redis.on('connect', () => {
      console.log('Redis connected');
    });
  }

  return redis;
}

// Cache keys
export const CACHE_KEYS = {
  metrics: (tenantId: string) => `metrics:${tenantId}`,
  rateLimit: (identifier: string) => `ratelimit:${identifier}`,
};

// Cache TTL in seconds
export const CACHE_TTL = {
  metrics: 120, // 2 minutes
};

// Helper to get cached data
export async function getCache<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('Redis get error:', err);
    return null;
  }
}

// Helper to set cached data
export async function setCache(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.set(key, JSON.stringify(data), 'EX', ttlSeconds);
  } catch (err) {
    console.error('Redis set error:', err);
  }
}

// Helper to delete cached data
export async function deleteCache(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.del(key);
  } catch (err) {
    console.error('Redis delete error:', err);
  }
}

export default redis;
